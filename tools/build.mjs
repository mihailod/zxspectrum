// Builds the single-file ZXSpectrum.html from src/ + ROM + the snapshots,
// loading screens and tapes listed in src/games.mjs. Tapes are loaded here, on
// the emulator, and the page gets the machine state at the end of the tape.
// usage: node tools/build.mjs [--rom path/to/48.rom]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineSource } from '../src/machine48.mjs';
import { GAMES } from '../src/games.mjs';
import { loadTapeToEnd } from '../src/tapeboot.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argRom = process.argv.indexOf('--rom');
const romPath = argRom > 0 ? process.argv[argRom + 1]
  : fs.existsSync(path.join(root, 'roms/48.rom')) ? path.join(root, 'roms/48.rom')
  : '/Applications/Fuse.app/Contents/Resources/48.rom';

const rom = fs.readFileSync(romPath);
if (rom.length !== 16384) throw new Error(`${romPath}: expected 16384 bytes, got ${rom.length}`);

const b64file = f => f ? fs.readFileSync(path.join(root, f)).toString('base64') : null;
const machine = new Function('rom', machineSource());
function tapeState(file, command, stopAt, keys) {
  const zx = machine(new Uint8Array(rom));
  const frames = loadTapeToEnd(zx, new Uint8Array(fs.readFileSync(path.join(root, file))), command, undefined, stopAt ?? null, keys);
  const st = zx.saveState();
  console.log(`${file}: loaded in ${frames} frames (${(frames / 50.08).toFixed(0)} s of Spectrum time)` +
    (stopAt != null ? `, stopped at ${stopAt.toString(16)}` : ''));
  return { ...st, ram: Buffer.from(st.ram).toString('base64') };
}
const games = GAMES.map(({ file, tape, screen, loadCommand, stopAt, tapeKeys, tapeLater, ...g }) =>
  ({ ...g, snap: b64file(file), state: tape ? tapeState(tape, loadCommand, stopAt, tapeKeys) : null, screen: b64file(screen),
    ...(tapeLater ? { later: b64file(tapeLater.tape), laterAt: tapeLater.at, laterRewind: !!tapeLater.rewind } : {}) }));

let html = fs.readFileSync(path.join(root, 'src/shell.html'), 'utf8');
const put = (marker, text) => {
  if (!html.includes(marker)) throw new Error('missing ' + marker);
  html = html.split(marker).join(text);
};
put('/*MACHINE*/', machineSource());
put('/*ROM*/', rom.toString('base64'));
put('/*GAMES*/', JSON.stringify(games));

const out = path.join(root, 'ZXSpectrum.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB): ${GAMES.map(g => g.name).join(', ')}; ROM ${romPath}`);
