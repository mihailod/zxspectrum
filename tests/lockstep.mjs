// Lockstep comparison against a reference trace produced by an instrumented
// Fuse 1.6.0 (see tests/fuse-reftrace.patch). Each frame compares T-state,
// all registers, a hash of RAM, a hash of the visible screen and a hash of
// every ULA port write (border/beeper timing).
//
// usage: node tests/lockstep.mjs <ref.trace> <frames> [keyscript]
//   keyscript: "frame:key:dur,..." with key = space|enter|a..z|0..9
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMachine } from './headless.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [refFile, framesArg, keyArg = ''] = process.argv.slice(2);
const frames = +framesArg;

const MATRIX = {
  space: [7, 0], enter: [6, 0], sym: [7, 1], caps: [0, 0],
  z: [0, 1], x: [0, 2], c: [0, 3], v: [0, 4],
  a: [1, 0], s: [1, 1], d: [1, 2], f: [1, 3], g: [1, 4],
  q: [2, 0], w: [2, 1], e: [2, 2], r: [2, 3], t: [2, 4],
  1: [3, 0], 2: [3, 1], 3: [3, 2], 4: [3, 3], 5: [3, 4],
  0: [4, 0], 9: [4, 1], 8: [4, 2], 7: [4, 3], 6: [4, 4],
  p: [5, 0], o: [5, 1], i: [5, 2], u: [5, 3], y: [5, 4],
  l: [6, 1], k: [6, 2], j: [6, 3], h: [6, 4],
  m: [7, 2], n: [7, 3], b: [7, 4],
};
const script = keyArg ? keyArg.split(',').map(s => {
  const [fr, key, dur] = s.split(':');
  return { fr: +fr, pos: MATRIX[key], dur: +dur };
}) : [];

const fnv = (h, v) => Math.imul(h ^ (v & 0xff), 16777619) >>> 0;
const hx = (v, n) => v.toString(16).padStart(n, '0');

const zx = createMachine();
let ph = 2166136261, pcount = 0;
zx.setPortHook((t, v) => { ph = fnv(ph, t); ph = fnv(ph, t >> 8); ph = fnv(ph, t >> 16); ph = fnv(ph, v); pcount++; });
// SNAP=none boots the ROM from power-on (Fuse run without --snapshot)
if (process.env.TAPE) {                 // power on with a tape inserted (Fuse: --tape --no-auto-load)
  zx.reset();
  zx.loadTape(new Uint8Array(fs.readFileSync(path.resolve(root, process.env.TAPE))));
} else if (process.env.SNAP === 'none') zx.reset();
else zx.loadZ80(new Uint8Array(fs.readFileSync(path.resolve(root, process.env.SNAP || 'roms/BruceLee.z80'))));

const ref = fs.readFileSync(refFile, 'utf8').trim().split('\n');
const FIELDS = ['frame', 't', 'pc', 'sp', 'af', 'bc', 'de', 'hl', "af'", "bc'", "de'", "hl'", 'ix', 'iy', 'wz', 'ir',
  'iff1', 'iff2', 'im', 'halted', 'ram', 'screen', 'ports', 'nports'];
if (process.env.KEMPSTON) zx.attachKempston(true);   // Fuse: --kempston
let firstBad = null, compared = 0, breaks = 0;
if (process.env.BREAK) zx.setBreakOnTapeEnd(true);
for (let f = 0; f < frames; f++) {
  for (const s of script) {
    if (f === s.fr) zx.key(s.pos[0], s.pos[1], true);
    if (f === s.fr + s.dur) zx.key(s.pos[0], s.pos[1], false);
  }
  zx.runFrame();
  // BREAK=1: stop at the tape end (as the page does to hold a loading screen),
  // render the preview, then resume; must not change the machine's behaviour
  while (process.env.BREAK && zx.brokeAtTapeEnd()) { zx.previewRest(); breaks++; zx.runFrame(); }
  const r = zx.getRegs();
  let rh = 2166136261;
  for (let a = 0x4000; a < 0x10000; a++) rh = fnv(rh, zx.mem[a]);
  let sh = 2166136261;
  for (const v of zx.pixels) { sh = fnv(sh, v >> 16); sh = fnv(sh, v >> 8); sh = fnv(sh, v); }
  const w = (hi, lo) => hx(hi << 8 | lo, 4);
  const line = [f + 1, zx.getT(), hx(r.pc, 4), hx(r.sp, 4), w(r.a, r.f), w(r.b, r.c), w(r.d, r.e), w(r.h, r.l),
    w(r.a_, r.f_), w(r.b_, r.c_), w(r.d_, r.e_), w(r.h_, r.l_), hx(r.ix, 4), hx(r.iy, 4), hx(r.wz, 4),
    hx(r.i, 2) + hx(r.r, 2), r.iff1, r.iff2, r.im, r.halted, hx(rh, 8), hx(sh, 8), hx(ph, 8), pcount].join(' ');
  ph = 2166136261; pcount = 0;
  const exp = ref[f];
  if (!exp) { console.log(`reference ends at frame ${f}`); break; }
  compared++;
  const a = exp.split(' '), b = line.split(' ');
  // frame 1's port hash includes Fuse's snapshot-load ULA write, made at an unrelated T-state
  const diff = FIELDS.filter((n, k) => a[k] !== b[k] && !(f === 0 && (n === 'ports' || n === 'nports')));
  if (diff.length) {
    firstBad = f + 1;
    console.log(`MISMATCH at frame ${f + 1}: ${diff.join(', ')}`);
    console.log('  fuse: ' + exp);
    console.log('  ours: ' + line);
    break;
  }
}
if (process.env.BREAK) console.log(`tape-end breaks: ${breaks}`);
console.log(firstBad ? `diverged at frame ${firstBad} after ${compared - 1} identical frames`
  : `${compared} frames identical (T-states, registers, RAM, screen, port writes)`);
process.exit(firstBad ? 1 : 0);
