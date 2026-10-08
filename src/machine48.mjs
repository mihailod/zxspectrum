// ZX Spectrum 48K machine: memory, ULA contention, beam-accurate display,
// ports (keyboard, border, beeper, floating bus) and frame sequencing.
// Timings follow Fuse 1.6.0's 48K model so that runs are comparable.
import { generateCore, CORE_RUNTIME } from './z80gen.mjs';
import { TAPE_SRC } from './tape.mjs';

const PRE = String.raw`
const FRAME = 69888, INT_LEN = 32;
let t = 0;
const mem = new Uint8Array(65536);
mem.set(rom.subarray(0, 16384), 0);

// ---- ULA memory contention (pattern 6,5,4,3,2,1,0,0 from T-state 14335) ----
const cont = new Uint8Array(FRAME + 1024);
for (let y = 0; y < 192; y++)
  for (let x = 0; x < 128; x++) cont[14335 + y * 224 + x] = [6, 5, 4, 3, 2, 1, 0, 0][x & 7];

// ---- display ----
// Visible area: 256x192 paper plus a 16px border on every side.
// Display positions are 8-pixel chunks (bx) on lines (by) in Fuse's display
// coordinates, where the paper occupies by 24..215 and bx 4..35. A chunk shows
// memory/border as they were just before T-state
//   8944 + 224*by + 4*bx + 4
// i.e. writes at or after that time land in the next frame (Fuse semantics).
const BORDER = 16, W = 256 + 2 * BORDER, Hh = 192 + 2 * BORDER;
const BY0 = 24 - BORDER, BY1 = 216 + BORDER, BX0 = 4 - BORDER / 8, BX1 = 36 + BORDER / 8;
const pixels = new Uint32Array(W * Hh);
const PAL = new Uint32Array(16);
{
  const rgb = [[0,0,0],[0,0,192],[192,0,0],[192,0,192],[0,192,0],[0,192,192],[192,192,0],[192,192,192],
               [0,0,0],[0,0,255],[255,0,0],[255,0,255],[0,255,0],[0,255,255],[255,255,0],[255,255,255]];
  // little-endian ABGR for ImageData
  rgb.forEach(([R, G, B], k) => { PAL[k] = (0xff000000 | (B << 16) | (G << 8) | R) >>> 0; });
}
let border = 0, flashCount = 0, flashRev = 0;
let dBy = BY0, dBx = BX0, dNext = 8944 + 224 * BY0 + 4 * BX0 + 4;
function renderChunk(by, bx) {
  let o = (by - BY0) * W + (bx - BX0) * 8;
  if (by >= 24 && by < 216 && bx >= 4 && bx < 36) {
    const y = by - 24, x = bx - 4;
    let bits = mem[0x4000 | ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2) | x];
    const at = mem[0x5800 + ((y >> 3) << 5) + x];
    const br = (at & 0x40) >> 3;
    let ink = PAL[(at & 7) | br], paper = PAL[((at >> 3) & 7) | br];
    if ((at & 0x80) && flashRev) { const s = ink; ink = paper; paper = s; }
    for (let k = 0; k < 8; k++, bits <<= 1) pixels[o++] = (bits & 0x80) ? ink : paper;
  } else {
    const col = PAL[border];
    for (let k = 0; k < 8; k++) pixels[o++] = col;
  }
}
// Draw every chunk whose latch time is <= tt.
function catchup(tt) {
  while (dNext <= tt) {
    renderChunk(dBy, dBx);
    if (++dBx === BX1) { dBx = BX0; if (++dBy === BY1) { dNext = Infinity; return; } }
    dNext = 8944 + 224 * dBy + 4 * dBx + 4;
  }
}

// ---- beeper: level changes integrated into output samples ----
const AMPL = [0, 512 / 12800, 1, 1 + 512 / 12800];   // Fuse's beeper_ampl, normalised
let sampleRate = 48000, tps = 3500000 / sampleRate;
let level = 0, sPos = 0, sEnd = tps, sAcc = 0;
let abuf = new Float32Array(4096), alen = 0;
function audioAdvance(T) {
  while (sEnd <= T) {
    sAcc += level * (sEnd - sPos);
    if (alen < abuf.length) abuf[alen++] = sAcc / tps;
    sAcc = 0; sPos = sEnd; sEnd += tps;
  }
  sAcc += level * (T - sPos); sPos = T;
}

// ---- keyboard / ULA port ----
const keys = new Uint8Array(8).fill(0xff);
let ulaDefault = 0xff, issue2 = 0, lastOut = 0, portHook = null;
// Kempston joystick interface (strict decoding: A5-A7 low), attached when a
// snapshot says it was saved with one. Bits: 0 right, 1 left, 2 down, 3 up, 4 fire.
let kempston = 0, kempVal = 0;
function ulaWrite(v) {
  lastOut = v;
  if (portHook) portHook(t, v);
  catchup(t);
  border = v & 7;
  let on = ((v & 0x10) ? 2 : 0) + ((v & 8) ? 0 : 1);
  if (on === 1) on = 0;              // MIC alone does not drive the speaker
  if (AMPL[on] !== level) { audioAdvance(t); level = AMPL[on]; }
  ulaDefault = issue2 ? ((v & 0x18) ? 0xff : 0xbf) : ((v & 0x10) ? 0xff : 0xbf);
}
function ulaRead(port) {
  detectLoader();
  let r = ulaDefault;
  const hi = port >> 8;
  for (let row = 0; row < 8; row++) if (!(hi & (1 << row))) r &= keys[row];
  if (mic) r ^= 0x40;                     // EAR input from the tape
  return r;
}
// Idle bus value on unattached ports (Fuse's spectrum_unattached_port)
function floatingBus() {
  if (t < 14320) return 0xff;
  const line = ((t - 14320) / 224) | 0;
  if (line >= 192) return 0xff;
  const ttl = t - (14320 + line * 224) + 8;
  if (ttl < 24 || ttl >= 152) return 0xff;
  const col = ((ttl - 24) >> 3) * 2;
  const bm = 0x4000 | ((line & 0xc0) << 5) | ((line & 7) << 8) | ((line & 0x38) << 2);
  const at = 0x5800 + ((line >> 3) << 5);
  switch (ttl & 7) {
    case 2: return mem[bm + col];
    case 3: return mem[at + col];
    case 4: return mem[bm + col + 1];
    case 5: return mem[at + col + 1];
    default: return 0xff;
  }
}

// ---- bus primitives used by the Z80 core ----
function rdi(ad) { return mem[ad]; }
function rd(ad) {
  if ((ad & 0xc000) === 0x4000) t += cont[t];
  t += 3;
  return mem[ad];
}
function wr(ad, v) {
  if (ad < 0x4000) { t += 3; return; }                    // ROM
  if (ad < 0x8000) {
    t += cont[t] + 3;
    if (ad < 0x5b00 && mem[ad] !== v) catchup(t);
  } else t += 3;
  mem[ad] = v;
}
function cn(ad, n) {
  if ((ad & 0xc000) === 0x4000) t += cont[t];
  t += n;
}
function portEarly(p) { if ((p & 0xc000) === 0x4000) t += cont[t]; t++; }
function portLate(p) {
  if (!(p & 1)) { t += cont[t]; t += 2; }
  else if ((p & 0xc000) === 0x4000) { t += cont[t]; t++; t += cont[t]; t++; t += cont[t]; }
  else t += 2;
}
function pin(p) {
  portEarly(p); portLate(p);
  const v = !(p & 1) ? ulaRead(p) : (kempston && !(p & 0xe0)) ? kempVal : floatingBus();
  t++;
  return v;
}
function pout(p, v) {
  portEarly(p);
  if (!(p & 1)) ulaWrite(v);
  portLate(p); t++;
}
`;

const POST = TAPE_SRC + String.raw`
let frames = 0;
function endFrame() {
  catchup(FRAME);
  audioAdvance(Math.max(FRAME, sPos));
  sPos -= FRAME; sEnd -= FRAME;
  t -= FRAME;
  if (eiAt >= 0) eiAt -= FRAME;
  intChk -= FRAME;
  tapeNext -= FRAME; micOffAt -= FRAME;
  if (lastReadT > -100000) lastReadT -= FRAME;
  if (++flashCount === 16) { flashRev ^= 1; flashCount = 0; }
  dBy = BY0; dBx = BX0; dNext = 8944 + 224 * BY0 + 4 * BX0 + 4;
  frames++;
}
// Run until the end of the current frame. Returns the audio samples produced.
// Like Fuse's event queue, everything that is due between two instructions
// (frame interrupt, EI retry, tape edge, MIC-off) is handled in time order.
let frameIntPending = 0, breakOnTapeEnd = 0, broke = 0, breakPc = -1;   // broke: 1 tape end, 2 breakPc
function runFrame() {
  alen = 0; broke = 0;
  // the previous frame's end event: its interrupt comes before anything else due
  if (frameIntPending) { frameIntPending = 0; interrupt(INT_LEN); }
  for (;;) {
    for (;;) {
      let e = FRAME, k = 0;
      if (intChk < e) { e = intChk; k = 1; }
      if (tapeNext < e) { e = tapeNext; k = 2; }
      if (micOffAt < e) { e = micOffAt; k = 3; }
      if (e > t) break;
      if (k === 0) {                        // end of frame; its interrupt runs first next time
        endFrame();
        frameIntPending = 1;
        return abuf.subarray(0, alen);
      }
      if (k === 1) { intChk = Infinity; interrupt(INT_LEN); }
      else if (k === 2) {
        tapeEdgeEvent();
        // optional stop right at the end of the tape (mid-frame); the next
        // runFrame() carries on from the same instruction boundary
        if (tapeEndHit) { tapeEndHit = 0; if (breakOnTapeEnd) { broke = 1; return abuf.subarray(0, alen); } }
      }
      else { micOffAt = Infinity; mic = 0; }
    }
    // optional stop before the instruction at breakPc (the build uses it to save a
    // tape-loaded game at its entry point); it fires once
    if (pc === breakPc) { breakPc = -1; broke = 2; return abuf.subarray(0, alen); }
    step();
  }
}

function loadZ80(buf) {
  const hd = buf;
  let flags1 = hd[12]; if (flags1 === 255) flags1 = 1;
  let pcv = hd[6] | (hd[7] << 8), off = 30, version = 1;
  const ram = new Uint8Array(49152);
  const unpack = (src, end, dst, dlen) => {
    let k = 0, s = src;
    while (s < end && k < dlen) {
      if (buf[s] === 0xed && buf[s + 1] === 0xed) {
        const n = buf[s + 2], v = buf[s + 3];
        for (let j = 0; j < n && k < dlen; j++) dst[k++] = v;
        s += 4;
      } else dst[k++] = buf[s++];
    }
    return k;
  };
  if (pcv !== 0) {
    if (flags1 & 0x20) unpack(off, buf.length, ram, 49152);
    else ram.set(buf.subarray(off, off + 49152));
  } else {
    const xl = hd[30] | (hd[31] << 8);
    version = xl === 23 ? 2 : 3;
    pcv = hd[32] | (hd[33] << 8);
    const hw = hd[34];
    if (!(hw === 0 || hw === 1 || (version === 3 && hw === 3)))
      throw new Error('Not a 48K snapshot (hardware ' + hw + ')');
    off = 32 + xl;
    while (off < buf.length) {
      const len = buf[off] | (buf[off + 1] << 8), page = buf[off + 2];
      off += 3;
      const base = { 4: 0x4000, 5: 0x8000, 8: 0x0000 }[page];
      const pg = new Uint8Array(16384);
      if (len === 0xffff) { pg.set(buf.subarray(off, off + 16384)); off += 16384; }
      else { unpack(off, off + len, pg, 16384); off += len; }
      if (base !== undefined) ram.set(pg, base);
    }
  }
  mem.set(ram, 0x4000);
  loadTape(null); frameIntPending = 0;
  setRegs({
    a: hd[0], f: hd[1], c: hd[2], b: hd[3], l: hd[4], h: hd[5], pc: pcv, sp: hd[8] | (hd[9] << 8),
    i: hd[10], r: (hd[11] & 0x7f) | ((flags1 & 1) << 7),
    e: hd[13], d: hd[14], c_: hd[15], b_: hd[16], e_: hd[17], d_: hd[18], l_: hd[19], h_: hd[20],
    a_: hd[21], f_: hd[22], iy: hd[23] | (hd[24] << 8), ix: hd[25] | (hd[26] << 8),
    iff1: hd[27] ? 1 : 0, iff2: hd[28] ? 1 : 0, im: hd[29] & 3, wz: 0, halted: 0,
    eiAt: -1, intChk: Infinity,
  });
  // Fuse: ula_write(out_ula) then T-state counter (69664 for v1/v2 files)
  issue2 = 0; t = 0;
  ulaWrite((flags1 >> 1) & 7);
  issue2 = (hd[29] & 4) ? 1 : 0;
  // joystick type in bits 6-7 (1 = Kempston), as libspectrum/Fuse read it
  kempston = ((hd[29] >> 6) & 3) === 1 ? 1 : 0; kempVal = 0;
  level = 0; sPos = 0; sEnd = tps; sAcc = 0;
  t = 69664;
  if (version === 3) {
    const q4 = FRAME / 4;
    let ts = (((hd[32 + 25] + 1) % 4) + 1) * q4 - ((hd[32 + 23] | (hd[32 + 24] << 8)) + 1);
    if (ts < 0 || ts >= FRAME) ts = 0;            // libspectrum keeps it unsigned: broken values become 0
    t = ts;
  }
  sPos = t; sEnd = t + tps;
  dBy = BY0; dBx = BX0; dNext = 8944 + 224 * BY0 + 4 * BX0 + 4;
  catchup(t);
}

// Power-on: Fuse's hard reset (z80_reset(1)), empty RAM, T-state 0.
function reset() {
  mem.fill(0, 0x4000);
  setRegs({ a: 0xff, f: 0xff, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0,
    a_: 0xff, f_: 0xff, b_: 0, c_: 0, d_: 0, e_: 0, h_: 0, l_: 0,
    ix: 0, iy: 0, sp: 0xffff, pc: 0, wz: 0, i: 0, r: 0, iff1: 0, iff2: 0, im: 0, halted: 0,
    eiAt: -1, intChk: Infinity });
  t = 0; ulaDefault = 0xff; issue2 = 0; kempston = 0; kempVal = 0; border = 0; lastOut = 0;
  loadTape(null); lastReadT = -100000; lastReadB = 0; frameIntPending = 0;
  level = 0; sPos = 0; sEnd = tps; sAcc = 0;
  dBy = BY0; dBx = BX0; dNext = 8944 + 224 * BY0 + 4 * BX0 + 4;
}

// Show a .scr loading screen on a powered-on machine whose CPU is halted with
// interrupts off, so only the ULA runs: FLASH animates exactly as it would.
function showScreen(scr, borderColour = 0) {
  reset();
  mem.set(scr.subarray(0, 6912), 0x4000);
  mem[0x8000] = 0x76;                                   // HALT
  setRegs({ ...getRegs(), pc: 0x8000, sp: 0xffff, iff1: 0, iff2: 0, im: 1, eiAt: -1, intChk: Infinity });
  border = borderColour & 7;
}
// Whole-machine state between two instructions (RAM, CPU, ULA, keys held,
// beeper level, frame position), e.g. to resume a tape load that was run ahead of time.
// Plain data: survives JSON (Infinity becomes null and is read back as Infinity).
function saveState() {
  return { ram: mem.slice(0x4000), keys: [...keys], cpu: getRegs(), t, border, flashCount, flashRev, frameIntPending,
    issue2, ulaDefault, lastOut, kempston, kempVal, mic, micOffAt, level, sPos, sEnd, sAcc };
}
function loadState(s) {
  reset();
  mem.set(s.ram, 0x4000);
  if (s.keys) keys.set(s.keys);
  setRegs(s.cpu);
  ({ t, border, flashCount, flashRev, frameIntPending, issue2, ulaDefault, lastOut, kempston, kempVal, mic, level } = s);
  micOffAt = s.micOffAt ?? Infinity;
  // the sample being accumulated (its end clamped in case the sample rate differs)
  sPos = s.sPos; sAcc = s.sAcc; sEnd = Math.min(s.sEnd, sPos + tps);
  dBy = BY0; dBx = BX0; dNext = 8944 + 224 * BY0 + 4 * BX0 + 4;
  catchup(t);
}
// draw the whole visible frame from current memory (does not move the beam)
function redraw() {
  for (let by = BY0; by < BY1; by++) for (let bx = BX0; bx < BX1; bx++) renderChunk(by, bx);
}

return {
  W, H: Hh, pixels, mem, runFrame, loadZ80, reset, getRegs, setRegs, showScreen, redraw,
  saveState, loadState,
  // continue a loaded snapshot at another address (a game's own entry point),
  // optionally with a new stack pointer, interrupts enabled (ei 1) or not (0) and interrupt mode (im)
  enter({ pc, sp, ei, im }) {
    const r = getRegs();
    setRegs({ ...r, pc, sp: sp ?? r.sp, iff1: ei ?? r.iff1, iff2: ei ?? r.iff2, im: im ?? r.im, halted: 0, eiAt: -1, intChk: Infinity });
  },
  hasKempston: () => !!kempston,
  // tape: insert a .tzx/.tap image (null ejects); it plays itself when a loader runs
  loadTape, tapePlay, tapeStop,
  tapeState: () => ({ playing: !!tapePlaying, block: tbi, blocks: tBlocks.length, ended: !!tapeEnded }),
  setKempston(v) { kempVal = v & 0x1f; },
  // plug in (or remove) an idle Kempston interface regardless of the snapshot header
  attachKempston(on) { kempston = on ? 1 : 0; kempVal = 0; },
  // Issue 2 board: the EAR bit (6) also follows MIC (OUT bit 3), as some old games need
  setIssue2(on) { issue2 = on ? 1 : 0; ulaDefault = issue2 ? ((lastOut & 0x18) ? 0xff : 0xbf) : ((lastOut & 0x10) ? 0xff : 0xbf); },
  setBreakOnTapeEnd(on) { breakOnTapeEnd = on ? 1 : 0; },
  brokeAtTapeEnd: () => broke === 1,
  setBreakAt(addr) { breakPc = addr ?? -1; },
  brokeAtBreak: () => broke === 2,
  // draw the not-yet-scanned rest of the current frame from memory as it is now
  // (for showing a paused machine); does not move the beam
  previewRest() {
    if (dNext === Infinity) return;
    for (let by = dBy, bx = dBx; ;) {
      renderChunk(by, bx);
      if (++bx === BX1) { bx = BX0; if (++by === BY1) break; }
    }
  },
  getT: () => t, getFrames: () => frames,
  setSampleRate(sr) {
    sampleRate = sr; tps = 3500000 / sr; sEnd = sPos + tps;
    abuf = new Float32Array(Math.ceil(FRAME / tps) + 64);
  },
  key(row, bit, down) { if (down) keys[row] &= ~(1 << bit); else keys[row] |= 1 << bit; },
  releaseAll() { keys.fill(0xff); },
  setPortHook(fn) { portHook = fn; },
};
`;

// Source of a function body taking (rom) and returning the machine API.
export function machineSource() {
  return PRE + CORE_RUNTIME + generateCore() + POST;
}
