// Helpers for tools/divmmc.mjs: a .z80 writer (v1, compressed), the DivMMC launcher .tap
// (BASIC: LOAD "" SCREEN$ : PAUSE 0 / wait for the key to be let go / .snapload <the snapshot>), and for the
// ZX Spectrum Next the launcher .bas and its loading screen as +3DOS files.
export function compress(ram) {
  const o = []; let i = 0;
  while (i < ram.length) {
    const v = ram[i]; let n = 1;
    while (i + n < ram.length && ram[i + n] === v && n < 255) n++;
    if (n >= 5 || (v === 0xed && n >= 2)) { o.push(0xed, 0xed, n, v); i += n; }
    else { o.push(v); i++; if (v === 0xed && i < ram.length) { o.push(ram[i]); i++; } }   // nothing compressed right after a lone ED
  }
  o.push(0x00, 0xed, 0xed, 0x00);
  return o;
}
export function writeZ80(zx) {
  const s = zx.saveState(), c = s.cpu, h = new Array(30).fill(0);
  Object.assign(h, { 0: c.a, 1: c.f, 2: c.c, 3: c.b, 4: c.l, 5: c.h, 6: c.pc & 255, 7: c.pc >> 8, 8: c.sp & 255, 9: c.sp >> 8,
    10: c.i, 11: c.r & 0x7f, 12: (c.r >> 7) | (s.border << 1) | 0x20, 13: c.e, 14: c.d, 15: c.c_, 16: c.b_, 17: c.e_, 18: c.d_,
    19: c.l_, 20: c.h_, 21: c.a_, 22: c.f_, 23: c.iy & 255, 24: c.iy >> 8, 25: c.ix & 255, 26: c.ix >> 8,
    27: c.iff1, 28: c.iff2, 29: (c.im & 3) | (s.issue2 ? 4 : 0) | (s.kempston ? 0x40 : 0) });
  if (c.pc === 0) throw new Error('PC 0 cannot be stored in a v1 .z80');
  return Buffer.from([...h, ...compress(zx.mem.slice(0x4000))]);
}
const tapBlock = (flag, data) => { let x = flag; for (const b of data) x ^= b; const n = data.length + 2;
  return Buffer.from([n & 255, n >> 8, flag, ...data, x]); };
const header = (type, name, len, p1, p2) => { const nm = name.padEnd(10).slice(0, 10);
  return [type, ...[...nm].map(ch => ch.charCodeAt(0)), len & 255, len >> 8, p1 & 255, p1 >> 8, p2 & 255, p2 >> 8]; };
const line = (n, bytes) => [n >> 8, n & 255, bytes.length & 255, bytes.length >> 8, ...bytes];
// 20 IF INKEY$<>"" THEN GO TO 20
export const WAIT_RELEASE = line(20, [0xfa, 0xa6, 0xc9, 0x22, 0x22, 0xcb, 0xec, 0x32, 0x30, 0x0e, 0, 0, 20, 0, 0, 0x0d]);
const asc = s => [...s].map(ch => ch.charCodeAt(0));
// stem: 8.3 name without extension (also the tape names); path: the snapshot as esxDOS should open it
export function launcherTap(stem, scr, path) {
  if (scr.length !== 6912) throw new Error('screen must be 6912 bytes');
  const prog = [
    ...line(10, [0xef, 0x22, 0x22, 0xaa, 0x3a, 0xf2, 0x30, 0x0e, 0, 0, 0, 0, 0, 0x0d]),    // LOAD "" SCREEN$ : PAUSE 0
    ...WAIT_RELEASE,                                                                       // so the key does not reach the game
    ...line(30, [...asc('.snapload ' + path), 0x0d]),
  ];
  return Buffer.concat([
    tapBlock(0x00, header(0, stem, prog.length, 10, prog.length)), tapBlock(0xff, prog),
    tapBlock(0x00, header(3, stem, 6912, 16384, 32768)), tapBlock(0xff, [...scr]),
  ]);
}

// +3DOS file: 128-byte header ("PLUS3DOS", soft EOF, issue 1, version 0, file size, the +3 BASIC header, checksum)
export function plus3dos(type, data, p1, p2) {
  const h = new Uint8Array(128), size = 128 + data.length;
  h.set([...'PLUS3DOS'].map(ch => ch.charCodeAt(0))); h[8] = 0x1a; h[9] = 1; h[10] = 0;
  h.set([size & 255, size >> 8 & 255, size >> 16 & 255, size >>> 24], 11);
  h.set([type, data.length & 255, data.length >> 8, p1 & 255, p1 >> 8, p2 & 255, p2 >> 8], 15);
  let sum = 0; for (let i = 0; i < 127; i++) sum += h[i]; h[127] = sum & 255;
  return Buffer.concat([Buffer.from(h), Buffer.from(data)]);
}
// Next launcher, run by the NextZXOS browser in NextBASIC (screen and snapshot named by full path, e.g. c:/games/roms/zzz/x.z80):
// 10 LAYER 0: LOAD scr SCREEN$ : PAUSE 0 / 20 IF INKEY$<>"" THEN GO TO 20 / 30 RUN AT 0: SPECTRUM z80
// (LAYER $9c and SPECTRUM $a3 are NextBASIC/128K tokens; RUN AT 0 is 3.5MHz, as NextZXOS's own snapshot loader sets)
export function nextLauncherBas(scrPath, z80Path) {
  const zero = [0x30, 0x0e, 0, 0, 0, 0, 0];
  const prog = [
    ...line(10, [0x9c, ...zero, 0x3a, 0xef, 0x22, ...asc(scrPath), 0x22, 0xaa, 0x3a, 0xf2, ...zero, 0x0d]),
    ...WAIT_RELEASE,
    ...line(30, [0xf7, 0xac, ...zero, 0x3a, 0xa3, 0x22, ...asc(z80Path), 0x22, 0x0d]),
  ];
  return plus3dos(0, prog, 10, prog.length);
}
export const nextScreen = scr => plus3dos(3, scr, 16384, 32768);
