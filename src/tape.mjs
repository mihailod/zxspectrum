// Tape player (.tzx / .tap) for the 48K machine.
//
// Edge generation follows libspectrum 1.5.0 (tape.c / tape_block.c) and the
// player follows Fuse 1.6.0 (tape.c, loader.c): tape edges are events
// processed between instructions, the EAR bit is XORed into port 0xFE reads,
// and the tape starts and stops itself when a loader is detected polling the
// port (Fuse's "detect loader"). No traps or loader acceleration: every edge
// is played, so custom loaders (Speedlock etc.) work.
//
// This is source text spliced into the machine closure; it uses t, b and FRAME.

export const TAPE_SRC = String.raw`
// ---- tape: parsing ----
const TF_NO_EDGE = 1, TF_STOP = 2, TF_LOW = 4, TF_HIGH = 8, TF_STOP48 = 16, TF_BLOCK = 32, TF_TAPE = 64;
const MS = 3500;                                   // T-states per millisecond
function parseTape(buf) {
  const blocks = [];
  const u16 = i => buf[i] | (buf[i + 1] << 8);
  const u24 = i => buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16);
  const u32 = i => (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24)) >>> 0;
  const sig = String.fromCharCode(...buf.subarray(0, 7));
  if (sig !== 'ZXTape!') {                          // .tap: [len16][data]... all ROM blocks
    for (let i = 0; i + 2 <= buf.length;) {
      const n = u16(i); i += 2;
      blocks.push({ type: 'rom', data: buf.subarray(i, i + n), pause: 1000 * MS });
      i += n;
    }
    return blocks;
  }
  let i = 10;
  while (i < buf.length) {
    const id = buf[i++];
    switch (id) {
      case 0x10: { const p = u16(i), n = u16(i + 2);
        blocks.push({ type: 'rom', pause: p * MS, data: buf.subarray(i + 4, i + 4 + n) }); i += 4 + n; break; }
      case 0x11: { const n = u24(i + 15);
        blocks.push({ type: 'turbo', pilot: u16(i), sync1: u16(i + 2), sync2: u16(i + 4), zero: u16(i + 6),
          one: u16(i + 8), pilotPulses: u16(i + 10), lastBits: buf[i + 12], pause: u16(i + 13) * MS,
          data: buf.subarray(i + 18, i + 18 + n) }); i += 18 + n; break; }
      case 0x12: blocks.push({ type: 'tone', len: u16(i), pulses: u16(i + 2) }); i += 4; break;
      case 0x13: { const c = buf[i], l = [];
        for (let k = 0; k < c; k++) l.push(u16(i + 1 + 2 * k));
        blocks.push({ type: 'pulses', lengths: l }); i += 1 + 2 * c; break; }
      case 0x14: { const n = u24(i + 7);
        blocks.push({ type: 'pure', zero: u16(i), one: u16(i + 2), lastBits: buf[i + 4], pause: u16(i + 5) * MS,
          data: buf.subarray(i + 10, i + 10 + n) }); i += 10 + n; break; }
      case 0x15: { const n = u24(i + 5);
        blocks.push({ type: 'raw', bitLen: u16(i), pause: u16(i + 2) * MS, lastBits: buf[i + 4],
          data: buf.subarray(i + 8, i + 8 + n) }); i += 8 + n; break; }
      case 0x19: { const len = u32(i); blocks.push(parseGeneralised(buf, i + 4)); i += 4 + len; break; }
      case 0x20: { const p = u16(i); blocks.push({ type: 'pause', tstates: p * MS }); i += 2; break; }
      case 0x21: i += 1 + buf[i]; blocks.push({ type: 'info' }); break;       // group start
      case 0x22: blocks.push({ type: 'info' }); break;                        // group end
      case 0x23: blocks.push({ type: 'jump', offset: (u16(i) << 16) >> 16 }); i += 2; break;
      case 0x24: blocks.push({ type: 'loopStart', count: u16(i) }); i += 2; break;
      case 0x25: blocks.push({ type: 'loopEnd' }); break;
      case 0x26: i += 2 + 2 * u16(i); blocks.push({ type: 'info' }); break;   // call sequence (unsupported)
      case 0x27: blocks.push({ type: 'info' }); break;                        // return
      case 0x28: i += 2 + u16(i); blocks.push({ type: 'info' }); break;       // select
      case 0x2a: i += 4; blocks.push({ type: 'stop48' }); break;
      case 0x2b: blocks.push({ type: 'level', level: buf[i + 4] }); i += 5; break;
      case 0x30: i += 1 + buf[i]; blocks.push({ type: 'info' }); break;       // text
      case 0x31: i += 2 + buf[i + 1]; blocks.push({ type: 'info' }); break;   // message
      case 0x32: i += 2 + u16(i); blocks.push({ type: 'info' }); break;       // archive info
      case 0x33: i += 1 + 3 * buf[i]; blocks.push({ type: 'info' }); break;   // hardware
      case 0x35: i += 16 + 4 + u32(i + 16); blocks.push({ type: 'info' }); break; // custom
      case 0x5a: i += 9; break;                                               // glue
      case 0x18: case 0x16: case 0x17: case 0x34: case 0x40:
        throw new Error('Unsupported TZX block 0x' + id.toString(16));
      default:
        throw new Error('Unknown TZX block 0x' + id.toString(16));
    }
  }
  return blocks;
}
function parseGeneralised(buf, i) {
  const u16 = k => buf[k] | (buf[k + 1] << 8);
  const u32 = k => (buf[k] | (buf[k + 1] << 8) | (buf[k + 2] << 16) | (buf[k + 3] << 24)) >>> 0;
  const pause = u16(i) * MS;
  const totp = u32(i + 2), npp = buf[i + 6], asp = buf[i + 7] || 256;
  const totd = u32(i + 8), npd = buf[i + 12], asd = buf[i + 13] || 256;
  let k = i + 14;
  const readTable = (count, np) => {
    const syms = [];
    for (let s = 0; s < count; s++) {
      const flags = buf[k++], lengths = [];
      for (let e = 0; e < np; e++) { lengths.push(u16(k)); k += 2; }
      syms.push({ edge: flags & 3, lengths });
    }
    return syms;
  };
  const pilotSyms = totp ? readTable(asp, npp) : [];
  const pilotRuns = [], pilotRepeats = [];
  for (let r = 0; r < totp; r++) { pilotRuns.push(buf[k]); pilotRepeats.push(u16(k + 1)); k += 3; }
  const dataSyms = totd ? readTable(asd, npd) : [];
  let bits = 0; while ((1 << bits) < asd) bits++;
  const data = buf.subarray(k, k + Math.ceil(bits * totd / 8));
  return { type: 'gen', pause, totp, npp, totd, npd, pilotSyms, pilotRuns, pilotRepeats, dataSyms, bits, data };
}

// ---- tape: edge generation (libspectrum_tape_get_next_edge) ----
let tBlocks = [], tbi = 0, ts = {}, tLoop = null;
function blockInit() {
  const bl = tBlocks[tbi];
  ts = {};
  if (!bl) return;
  switch (bl.type) {
    case 'rom':
      ts.edges = bl.data.length && (bl.data[0] & 0x80) ? 3223 : 8063;
      ts.bytes = -1; ts.bits = 7; ts.state = 'pilot'; break;
    case 'turbo': ts.edges = bl.pilotPulses; ts.bytes = -1; ts.bits = 7; ts.state = 'pilot'; break;
    case 'tone': ts.edges = bl.pulses; break;
    case 'pulses': ts.edges = 0; break;
    case 'pure': ts.bytes = -1; ts.bits = 7; dataNextBit(bl, true); break;
    case 'raw':
      ts.state = 'data1'; ts.bytes = 0; ts.bits = 0; ts.last = (bl.data[0] & 0x80) ^ 0x80;
      rawNextBit(bl); break;
    case 'gen':
      ts.run = 0; ts.symRun = 0; ts.edge = 0; ts.sym = 0; ts.symStream = 0; ts.cur = 0; ts.bits = 0; ts.bytes = 0;
      if (bl.totp) ts.state = 'pilot';
      else if (bl.totd) { ts.state = 'data1'; ts.cur = bl.data[0]; ts.sym = genSymbol(bl); }
      else ts.state = 'pause';
      break;
  }
}
// rom/turbo/pure: advance to the next data bit (lastBits honoured for turbo/pure)
function dataNextBit(bl, partial) {
  if (++ts.bits === 8) {
    if (++ts.bytes === bl.data.length) { ts.state = 'pause'; return; }
    ts.cur = bl.data[ts.bytes];
    ts.bits = (partial && ts.bytes === bl.data.length - 1) ? 8 - bl.lastBits : 0;
  }
  const bit = ts.cur & 0x80;
  ts.cur = (ts.cur << 1) & 0xff;
  ts.len = bl.type === 'rom' ? (bit ? 1710 : 855) : (bit ? bl.one : bl.zero);
  ts.state = 'data1';
}
function rawNextBit(bl) {
  if (ts.bytes === bl.data.length) { ts.state = 'pause'; ts.last ^= 0x80; return; }
  ts.state = 'data1';
  let length = 0;
  do {
    const inByte = ts.bytes === bl.data.length - 1 ? bl.lastBits : 8;
    length++;
    if (++ts.bits === inByte) { ts.bits = 0; if (++ts.bytes === bl.data.length) break; }
  } while (((bl.data[ts.bytes] << ts.bits) & 0x80) !== ts.last);
  ts.len = length * bl.bitLen;
  ts.last ^= 0x80;
}
function genBit(bl) {
  const r = ts.cur & 0x80 ? 1 : 0;
  ts.cur = (ts.cur << 1) & 0xff;
  if (++ts.bits === 8) { ts.bits = 0; ts.bytes++; ts.cur = bl.data[ts.bytes]; }
  return r;
}
function genSymbol(bl) { let s = 0; for (let k = 0; k < bl.bits; k++) s = (s << 1) | genBit(bl); return s; }
function genEdgeFlags(sym, edge) {
  if (edge) return 0;
  return [0, TF_NO_EDGE, TF_LOW, TF_HIGH][sym.edge];
}
// returns [tstates, flags]
function nextEdge() {
  const bl = tBlocks[tbi];
  let d = 0, fl = 0, end = 0, noAdvance = 0;
  const tailPause = () => { d = bl.pause; end = 1; if (!d) fl |= TF_NO_EDGE; };
  if (!bl) end = 1;
  else switch (bl.type) {
    case 'rom': case 'turbo':
      switch (ts.state) {
        case 'pilot':
          if (bl.type === 'rom') {
            d = 2168; if (--ts.edges === 0) ts.state = 'sync1';
            break;
          }
          if (ts.edges-- !== 0) { d = bl.pilot; break; }
          // fall through: turbo block with no (more) pilot pulses
        case 'sync1': d = bl.type === 'rom' ? 667 : bl.sync1; ts.state = 'sync2'; break;
        case 'sync2': d = bl.type === 'rom' ? 735 : bl.sync2; dataNextBit(bl, bl.type !== 'rom'); break;
        case 'data1': d = ts.len; ts.state = 'data2'; break;
        case 'data2': d = ts.len; dataNextBit(bl, bl.type !== 'rom'); break;
        case 'pause': tailPause(); break;
      }
      break;
    case 'tone': d = bl.len; if (--ts.edges === 0) end = 1; break;
    case 'pulses': d = bl.lengths[ts.edges]; if (++ts.edges === bl.lengths.length) end = 1; break;
    case 'pure':
      switch (ts.state) {
        case 'data1': d = ts.len; ts.state = 'data2'; break;
        case 'data2': d = ts.len; dataNextBit(bl, true); break;
        case 'pause': tailPause(); break;
      }
      break;
    case 'raw':
      if (ts.state === 'data1') { d = ts.len; rawNextBit(bl); fl |= ts.last ? TF_LOW : TF_HIGH; }
      else tailPause();
      break;
    case 'gen': {
      if (ts.state === 'pilot') {
        const sym = bl.pilotSyms[bl.pilotRuns[ts.run]];
        d = sym.lengths[ts.edge]; fl |= genEdgeFlags(sym, ts.edge);
        ts.edge++;
        if (ts.edge === bl.npp || sym.lengths[ts.edge] === 0) {
          ts.edge = 0;
          if (++ts.symRun === bl.pilotRepeats[ts.run]) {
            ts.symRun = 0;
            if (++ts.run === bl.totp) {
              ts.state = 'data1'; ts.bits = 0; ts.bytes = 0; ts.symStream = 0;
              ts.cur = bl.data[0]; ts.sym = genSymbol(bl);
            }
          }
        }
      } else if (ts.state === 'data1') {
        const sym = bl.dataSyms[ts.sym];
        d = sym.lengths[ts.edge]; fl |= genEdgeFlags(sym, ts.edge);
        ts.edge++;
        if (ts.edge === bl.npd || sym.lengths[ts.edge] === 0) {
          if (++ts.symStream === bl.totd) ts.state = 'pause';
          else { ts.edge = 0; ts.sym = genSymbol(bl); }
        }
      } else tailPause();
      break;
    }
    case 'pause':
      d = bl.tstates; end = 1;
      if (d === 0) fl |= TF_STOP;              // a zero pause means "stop the tape"
      break;
    case 'jump': tbi += bl.offset; d = 0; fl |= TF_NO_EDGE; end = 1; noAdvance = 1; break;
    case 'loopStart':
      if (tbi + 1 < tBlocks.length && bl.count) tLoop = { start: tbi + 1, count: bl.count };
      d = 0; fl |= TF_NO_EDGE; end = 1; break;
    case 'loopEnd':
      if (tLoop) { if (--tLoop.count) { tbi = tLoop.start; noAdvance = 1; } else tLoop = null; }
      d = 0; fl |= TF_NO_EDGE; end = 1; break;
    case 'stop48': d = 0; fl |= TF_STOP48; end = 1; break;
    case 'level': d = 0; end = 1; fl |= bl.level ? TF_LOW : TF_HIGH; break;   // inverted, as libspectrum
    default: d = 0; fl |= TF_NO_EDGE; end = 1;   // info-only blocks
  }
  if (end) {
    fl |= TF_BLOCK;
    if (!noAdvance) {
      tbi++;
      if (tbi >= tBlocks.length) {
        fl |= TF_STOP | TF_TAPE; fl &= ~TF_NO_EDGE;
        tbi = 0; tapeEnded = 1; tapeEndHit = 1;
      }
    }
    blockInit();
  }
  return [d, fl];
}

// ---- tape: player (Fuse tape.c / loader.c) ----
let tapePlaying = 0, mic = 0, tapeNext = Infinity, savedNext = 0, micOffAt = Infinity, tapeEnded = 0, tapeEndHit = 0;
let lastReadT = -100000, lastReadB = 0, successive = 0;
function tapeEdgeEvent() {
  const last = tapeNext;
  tapeNext = Infinity;
  if (!tapePlaying) return;
  const [d, fl] = nextEdge();
  if (d || !(fl & TF_NO_EDGE) || (fl & (TF_STOP | TF_LOW | TF_HIGH))) {
    if (fl & TF_NO_EDGE) { /* nothing */ }
    else if (fl & TF_LOW) mic = 0;
    else if (fl & TF_HIGH) mic = 1;
    else mic ^= 1;
  }
  if (fl & (TF_STOP | TF_STOP48)) { tapeStop(); return; }
  tapeNext = last + d;
}
function tapePlay() {
  if (!tBlocks.length || tapePlaying) return;
  tapePlaying = 1; mic = 0; micOffAt = Infinity; successive = 0;
  tapeNext = t + savedNext; savedNext = 0;
}
function tapeStop() {
  if (!tapePlaying) return;
  tapePlaying = 0; successive = 0;
  if (tapeNext !== Infinity) savedNext = tapeNext - t;
  tapeNext = Infinity;
  micOffAt = t + FRAME;          // drop a lingering MIC level after a frame
}
// called on every ULA port read (Fuse: loader_detect_loader)
function detectLoader() {
  const dt = t - lastReadT, db = (b - lastReadB) & 0xff;
  lastReadT = t; lastReadB = b;
  if (!tBlocks.length) return;
  if (tapePlaying) {
    if (dt > 1000 || (db !== 1 && db !== 0 && db !== 0xff)) {
      if (++successive >= 2) tapeStop();
    } else successive = 0;
  } else {
    if (dt <= 500 && (db === 1 || db === 0xff)) {
      if (++successive >= 10) tapePlay();
    } else successive = 0;
  }
}
// endAtData: drop what follows the last data block (pauses, info, stop) and
// its own pause, so the tape ends the moment its last edge has been played
function loadTape(buf, endAtData = false) {
  tBlocks = buf ? parseTape(buf) : [];
  if (endAtData) {
    let k = tBlocks.length - 1;
    while (k >= 0 && !/^(rom|turbo|pure|raw|gen|tone|pulses)$/.test(tBlocks[k].type)) k--;
    tBlocks = tBlocks.slice(0, k + 1);
    if (k >= 0 && 'pause' in tBlocks[k]) tBlocks[k] = { ...tBlocks[k], pause: 0 };
  }
  tbi = 0; tLoop = null; blockInit();
  tapePlaying = 0; mic = 0; tapeNext = Infinity; savedNext = 0; micOffAt = Infinity; tapeEnded = 0; tapeEndHit = 0;
  successive = 0;
}
`;
