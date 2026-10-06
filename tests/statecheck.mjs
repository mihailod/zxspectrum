// Checks that a saved machine state resumes exactly like the machine it came
// from. A source machine is prepared (a tape loaded to its end, a snapshot, or
// a .scr loading screen), then a copy is made from a JSON round trip of
// saveState() at the start and again every 89 frames; source and copy run with
// the same key presses and must agree on CPU registers, RAM, picture and sound
// every frame.
// usage: node tests/statecheck.mjs [source ...]   (default: the cases below)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createMachine } from './headless.mjs';
import { loadTapeToEnd } from '../src/tapeboot.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => new Uint8Array(fs.readFileSync(path.resolve(root, f)));
const CASES = {
  // tape end mid-frame; then the menu (1), and some play
  'roms/Renegade.tzx': { frames: 1500, keys: ['100:3,0:12', '400:7,0:20', '700:6,1:30'] },
  // title music: the beeper is mid-sample at frame ends
  'roms/ManicMiner.z80': { frames: 600, keys: ['300:6,0:12'] },
  // FLASH on the loading screen
  'roms/ManicMiner.scr': { frames: 200, keys: [] },
};
const sources = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES);
const hash = x => crypto.createHash('md5').update(x).digest('hex');
const clone = zx => {
  const c = createMachine();
  c.loadState(JSON.parse(JSON.stringify(zx.saveState(), (k, v) => v instanceof Uint8Array ? [...v] : v),
    (k, v) => k === 'ram' ? new Uint8Array(v) : v));
  return c;
};
const sig = (zx, audio) => ({
  regs: JSON.stringify(zx.getRegs()), ram: hash(zx.mem.subarray(0x4000)), pic: hash(new Uint8Array(zx.pixels.buffer)),
  snd: hash(new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength)), t: zx.getT(),
});
let failed = 0;
for (const src of sources) {
  const { frames = 600, keys = [] } = CASES[src] || {};
  const script = keys.map(s => {
    const [fr, key, dur] = s.split(':'); const [row, bit] = key.split(',').map(Number);
    return { fr: +fr, row, bit, dur: +dur };
  });
  const a = createMachine();
  let note = '';
  if (/\.(tzx|tap)$/i.test(src)) note = `tape end after ${loadTapeToEnd(a, read(src))} frames; `;
  else if (/\.scr$/i.test(src)) a.showScreen(read(src));
  else a.loadZ80(read(src));
  let b = null, bad = 0;
  for (let f = 0; f < frames && bad < 5; f++) {
    // the copy's first frame draws the picture above the resume point from
    // memory at that moment, so the picture is compared from the next frame on
    let fresh = false;
    if (f % 89 === 0) { b = clone(a); fresh = true; }
    for (const s of script) for (const zx of [a, b]) {
      if (f === s.fr) zx.key(s.row, s.bit, true);
      if (f === s.fr + s.dur) zx.key(s.row, s.bit, false);
    }
    const sa = sig(a, a.runFrame()), sb = sig(b, b.runFrame());
    const diff = Object.keys(sa).filter(k => sa[k] !== sb[k] && !(fresh && f === 0 && k === 'pic'));
    if (diff.length) { bad++; console.log(`${src} frame ${f}: differs in ${diff.join(', ')}`); }
  }
  console.log(bad ? `${src}: MISMATCH` : `${src}: ${note}resumed copies identical for ${frames} frames`);
  failed += bad ? 1 : 0;
}
process.exit(failed ? 1 : 0);
