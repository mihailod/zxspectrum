// Headless runner: loads the snapshot, runs frames with optional scripted key
// presses, and writes PNG screenshots.
// usage: node tests/headless.mjs <frames> <out.png> [frame:key:dur ...]
//   key names are Spectrum matrix positions "row,bit" (e.g. 7,0 = SPACE)
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineSource } from '../src/machine48.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createMachine(romPath = '/Applications/Fuse.app/Contents/Resources/48.rom') {
  const rom = new Uint8Array(fs.readFileSync(romPath));
  return new Function('rom', machineSource())(rom);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function writePNG(file, w, h, rgba32) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const src = Buffer.from(rgba32.buffer, rgba32.byteOffset, w * h * 4);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    src.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const frames = +process.argv[2] || 100;
  const out = process.argv[3] || 'shot.png';
  const script = process.argv.slice(4).map(s => {
    const [fr, key, dur] = s.split(':');
    const [row, bit] = key.split(',').map(Number);
    return { fr: +fr, row, bit, dur: +(dur || 5) };
  });
  const zx = createMachine();
  if (process.env.SNAP === 'none') zx.reset();          // power-on into BASIC
  else zx.loadZ80(new Uint8Array(fs.readFileSync(path.resolve(root, process.env.SNAP || 'roms/BruceLee.z80'))));
  const t0 = Date.now();
  let samples = 0, nonzero = 0;
  for (let f = 0; f < frames; f++) {
    for (const s of script) {
      if (f === s.fr) zx.key(s.row, s.bit, true);
      if (f === s.fr + s.dur) zx.key(s.row, s.bit, false);
    }
    const a = zx.runFrame();
    samples += a.length;
    for (let k = 0; k < a.length; k++) if (a[k] !== 0) { nonzero++; }
  }
  const dt = Date.now() - t0;
  writePNG(out, zx.W, zx.H, zx.pixels);
  const r = zx.getRegs();
  console.log(`${frames} frames in ${dt} ms (${(frames / 50.08 / (dt / 1000)).toFixed(1)}x realtime); ` +
    `pc=${r.pc.toString(16)} audio samples=${samples} nonzero=${nonzero}`);
}
