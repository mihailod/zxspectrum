// Builds the games for a real Spectrum with a DivMMC (esxDOS 0.8, no long file names), from the same
// snapshots, tapes, loading screens and fixes as the page (src/games.mjs). Per game:
//  - a snapshot game: a .Z80 with the page's start/pokes fixes in it; with a separate loading screen, a launcher
//    .TAP too that shows the screen, waits for a key and runs .snapload on the .Z80 (kept in ZZZ)
//  - a tape game: a .TAP of its tape (the loading screen put in front if the tape lacks it), or, when its loader
//    cannot be fed by esxDOS (turbo/Speedlock, or a RAM copy of the ROM loader), a .Z80 of the tape's end
// Layout, made for /GAMES/ROMS on the card: what you start is in letter folders (0-C D-H I-N O-S T-Z), what only
// a launcher or a game loads is in ZZZ (last in the browser). esxDOS lists a directory in the order its entries
// were written, so copy to the card folder by folder in sorted order, into fresh folders, and remove the ._ files
// macOS adds. Check the result with tools/divmmc-check.mjs.
// With --next, the same set for a ZX Spectrum Next (NextZXOS has no .snapload): each launcher is a NextBASIC .BAS
// instead, which the browser runs directly, and its loading screen goes in ZZZ as a +3DOS .SCR; for c:/games/roms.
// usage: node tools/divmmc.mjs <new output folder> [--next] [--rom path/to/48.rom]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineSource } from '../src/machine48.mjs';
import { TAPE_SRC } from '../src/tape.mjs';
import { loadTapeToEnd } from '../src/tapeboot.mjs';
import { GAMES } from '../src/games.mjs';
import { writeZ80, launcherTap, WAIT_RELEASE, nextLauncherBas, nextScreen } from './divmmc-lib.mjs';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
if (!process.argv[2] || process.argv[2].startsWith('--')) { console.error('usage: node tools/divmmc.mjs <new output folder> [--next] [--rom path/to/48.rom]'); process.exit(1); }
const NEXT = process.argv.includes('--next');
const OUT = path.resolve(process.argv[2]) + '/';
// never into a folder that holds anything (it is not cleared first)
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.error(OUT + ' is not empty'); process.exit(1); }
// files only a launcher or a game loads go in ZZZ (last in the esxDOS browser), so the letter folders hold just what you start
const SUB = 'ZZZ/', DIR = (NEXT ? 'c:/games/roms/zzz/' : '/GAMES/ROMS/ZZZ/');
fs.mkdirSync(OUT + SUB, { recursive: true });
const argRom = process.argv.indexOf('--rom');
const rom = new Uint8Array(fs.readFileSync(argRom > 0 ? process.argv[argRom + 1] : '/Applications/Fuse.app/Contents/Resources/48.rom'));
let src = machineSource(); const n0 = src.length;
src = src.replace('function ulaRead(port) {\n', 'function ulaRead(port) {\n  if (globalThis.__ear) globalThis.__ear(pc);\n');
if (src.length === n0) throw new Error('hook not applied');
const mk = () => new Function('rom', src)(rom);
const parseTape = new Function('let t = 0, b = 0; const FRAME = 69888;\n' + TAPE_SRC + '\nreturn parseTape;')();
const read = f => new Uint8Array(fs.readFileSync(R + f));

const RENAME = { pinball3d: 'PINBAL3D', drinker: 'DRINKER', fairlight: 'FAIRLGHT', formula1: 'FORMULA1', hypersports: 'HYPERSPT',
  kontrabant: 'KONTRAB', kontrabant2: 'KONTRAB2', manicminer: 'MANICMIN', robin: 'ROBINOTW', splittingimages: 'SPLITIMG',
  strumpfovi: 'STRUMPF', ukletidvorac: 'UKLETIDV', velikaakcija: 'VELIKAAK', vruceletovanje: 'VRUCELET', artstudio: 'ARTSTUDI',
  ekranskieditor: 'EKRANSKI', multicopy: 'MULTICPY', id: 'ID', neverending1: 'NESTORY1' };
// tape-end snapshots that get a launcher: Hyper Sports with the loading screen as it is at the tape's end (intact),
// Renegade with the archive's (World of Spectrum) loading screen, as the one on screen carries Speedlock's countdown timer
const TAPE_END_SCREENS = { hypersports: 'as on screen', renegade: 'roms/Renegade.scr' };
const stemOf = g => RENAME[g.id] || (g.file || g.tape).replace('roms/', '').replace(/\.[^.]+$/, '').toUpperCase();
// NeverEnding Story part 1: the tape's own part-1 loader is a RAM copy of the ROM's, so use the part-1 snapshot,
// saved like parts 2 and 3 as an interrupt was taken (return address 8586 in the same engine loop): same fix as theirs
const NES1 = { file: 'roms/NESTORY1.Z80', start: { pc: 0x8586, sp: 0x5ff4, ei: 0 }, screen: 'roms/NESTORY.scr' };

function tzxToTap(d) {
  if (String.fromCharCode(...d.slice(0, 7)) !== 'ZXTape!') return Buffer.from(d);           // already a .tap
  const u16 = i => d[i] | d[i + 1] << 8, u32 = i => (u16(i) | u16(i + 2) << 16) >>> 0;
  const out = []; let p = 10;
  while (p < d.length) {
    const t = d[p++]; let n;
    switch (t) {
      case 0x10: { const len = u16(p + 2); out.push(Buffer.from([len & 255, len >> 8]), Buffer.from(d.subarray(p + 4, p + 4 + len))); n = 4 + len; break; }
      case 0x20: n = 2; break; case 0x21: n = 1 + d[p]; break; case 0x22: n = 0; break; case 0x2a: n = 4; break;
      case 0x30: n = 1 + d[p]; break; case 0x31: n = 2 + d[p + 1]; break; case 0x32: n = 2 + u16(p); break;
      case 0x33: n = 1 + 3 * d[p]; break; case 0x35: n = 20 + u32(p + 16); break; case 0x5a: n = 9; break;
      default: return null;                                                                   // turbo / custom: no TAP
    }
    p += n;
  }
  return Buffer.concat(out);
}
const tapBlocks = tap => { const b = []; for (let i = 0; i < tap.length;) { const n = tap[i] | tap[i + 1] << 8; b.push(tap.subarray(i + 2, i + 2 + n)); i += 2 + n; } return b; };
const tapHasScreen = (tap, scr) => tapBlocks(tap).some(b => b.length === 6914 && b[0] === 0xff && Buffer.compare(Buffer.from(b.subarray(1, 6913)), Buffer.from(scr)) === 0);
// tape load in the emulator, as the page does; also says whether any tape-reading code ran from RAM
function loadTape(g, tape) {
  const zx = mk(); const pcs = new Set(); globalThis.__ear = pc => { if (pc >= 0x4000) pcs.add(pc); };
  const fr = loadTapeToEnd(zx, new Uint8Array(tape), g.loadCommand, undefined, g.stopAt ?? null, g.tapeKeys || []);
  globalThis.__ear = null; return { zx, fr, ramPcs: [...pcs] };
}
const loaderOnly = (stem, prog) => {               // a TAP of just a BASIC program (autostart line 10)
  const blk = (flag, data) => { let x = flag; for (const v of data) x ^= v; const n = data.length + 2; return Buffer.from([n & 255, n >> 8, flag, ...data, x]); };
  const nm = [...stem.padEnd(10)].map(ch => ch.charCodeAt(0));
  return Buffer.concat([blk(0, [0, ...nm, prog.length & 255, prog.length >> 8, 10, 0, prog.length & 255, prog.length >> 8]), blk(0xff, prog)]);
};
const line = (n, bytes) => [n >> 8, n & 255, bytes.length & 255, bytes.length >> 8, ...bytes];
// LOAD "" SCREEN$ : PAUSE 0 / wait for the key to be let go (a held SPACE would BREAK the next load) / LOAD ""
const LOAD_SCREEN_PAUSE_LOAD = [...line(10, [0xef, 0x22, 0x22, 0xaa, 0x3a, 0xf2, 0x30, 0x0e, 0, 0, 0, 0, 0, 0x0d]), ...WAIT_RELEASE,
  ...line(30, [0xef, 0x22, 0x22, 0x0d])];
const LOAD_CODE = line(10, [0xef, 0x22, 0x22, 0xaf, 0x0d]);
const screenBlocks = (stem, scr) => { const all = launcherTap(stem, scr, 'x'); const b = tapBlocks(all); // reuse the screen header/data blocks
  return Buffer.concat(b.slice(2).map(x => Buffer.concat([Buffer.from([x.length & 255, x.length >> 8]), Buffer.from(x)]))); };

const report = [], files = new Map(), seen = new Set();
const put = (name, buf, note) => { const base = name.replace(SUB, ''); if ([...files.keys()].some(k => k.replace(SUB, '') === base)) throw new Error('name clash ' + name);
  files.set(name, buf); fs.writeFileSync(OUT + name, buf); report.push(`${name.padEnd(17)} ${note}`); };
// the launcher for a snapshot in ZZZ: a .TAP for esxDOS, or for the Next a .BAS plus its screen in ZZZ
function launcher(stem, scr, note) {
  if (!NEXT) return put(stem + '.TAP', launcherTap(stem, scr, DIR + stem + '.Z80'), note);
  put(SUB + stem + '.SCR', nextScreen(scr), 'screen for ' + stem + '.BAS');
  put(stem + '.BAS', nextLauncherBas(DIR + stem + '.SCR', DIR + stem + '.Z80'), note);
}
function snapshotGame(g, stem, label) {
  const zx = mk(); zx.loadZ80(read(g.file));
  if (g.start) zx.enter(g.start); for (const a in g.pokes || {}) zx.mem[a] = g.pokes[a];
  const z = writeZ80(zx); const back = mk(); back.loadZ80(new Uint8Array(z));
  let d = 0; for (let a = 0x4000; a < 0x10000; a++) if (back.mem[a] !== zx.mem[a]) d++;
  const ra = zx.getRegs(), rb = back.getRegs(); const rd = ['a','f','b','c','d','e','h','l','a_','f_','b_','c_','d_','e_','h_','l_','ix','iy','sp','pc','i','r','iff1','iff2','im'].filter(k => ra[k] !== rb[k]);
  if (d || rd.length) throw new Error(`${stem}: reload differs (RAM ${d}, regs ${rd})`);
  put((g.screen ? SUB : '') + stem + '.Z80', z, label + (g.start || g.pokes ? ' (fixed: ' + JSON.stringify({ ...(g.start || {}), ...(g.pokes ? { pokes: Object.keys(g.pokes).length } : {}) }) + ')' : ''));
  if (g.screen) launcher(stem, read(g.screen), 'launcher: ' + g.screen.replace('roms/', ''));
}
for (const g of GAMES) {
  if (!g.file && !g.tape) continue;
  const key = g.file || g.tape; if (seen.has(key)) continue; seen.add(key);
  const stem = stemOf(g);
  if (g.id === 'neverending1') { snapshotGame(NES1, stem, 'neverending1 snapshot'); continue; }
  if (g.file) { if (!/\.z80$/i.test(g.file)) throw new Error('unexpected file ' + g.file); snapshotGame(g, stem, g.id); continue; }
  // tape games
  const raw = read(g.tape), tap = tzxToTap(raw);
  const viaZ80 = () => { const { zx, fr } = loadTape(g, raw);
    // a tape that ends inside the ROM loader (LD-BYTES, which pushed SA/LD-RET 053F): stop where it returns to the game,
    // before the game does anything with the screen; otherwise take the tape end itself (a frame later, Hyper Sports
    // has already started wiping its loading screen)
    const w = a => zx.mem[a] | zx.mem[a + 1] << 8, sp = zx.getRegs().sp; let k = 0, at = '';
    while (k < 8 && w(sp + 2 * k) !== 0x053f) k++;
    if (k < 8) { const ret = w(sp + 2 * k + 2); zx.setBreakAt(ret); let n = 0; while (n++ < 50) { zx.runFrame(); if (zx.brokeAtBreak()) break; }
      zx.setBreakAt(null); if (zx.getRegs().pc !== ret) throw new Error(g.id + ': the loader did not return'); at = `, stopped where the ROM loader returns (${ret.toString(16)})`; }
    // hold the loading screen with a launcher; Renegade's on screen carries Speedlock's countdown timer, so the clean one
    // goes in (checked: nothing outside the screen changes over 1500 frames, and the game wipes the screen itself)
    const clean = TAPE_END_SCREENS[g.id];
    const scr = clean === 'as on screen' ? zx.mem.slice(0x4000, 0x5b00) : clean ? read(clean) : g.screen ? read(g.screen) : null;
    let off = 0; if (clean) { for (let i = 0; i < 6912; i++) if (zx.mem[0x4000 + i] !== scr[i]) off++; zx.mem.set(scr, 0x4000); }
    put((scr ? SUB : '') + stem + '.Z80', writeZ80(zx), `${g.id}: tape end (frame ${fr}) as a snapshot${at}` + (clean ? `, loading screen put in (${off} bytes differed)` : ''));
    if (scr) launcher(stem, scr, 'launcher: ' + (clean || g.screen.replace('roms/', ''))); };
  if (!tap) { viaZ80(); continue; }
  const t = loadTape(g, tap);
  if (t.ramPcs.some(pc => !(g.id === 'buggyboy' && pc === 0x8880))) { viaZ80(); continue; }   // Buggy Boy's is a keyboard scan
  let out = tap, note = `${g.id}: tape as TAP`;
  if (g.loadCommand === 'LOAD "" CODE') { out = Buffer.concat([loaderOnly(stem, LOAD_CODE), tap]); note += ', with a LOAD "" CODE loader in front'; }
  if (g.screen) {
    if (tapHasScreen(tap, read(g.screen))) note += ', its own loading screen';
    else { out = Buffer.concat([loaderOnly(stem, LOAD_SCREEN_PAUSE_LOAD), screenBlocks(stem, read(g.screen)), out]); note += `, ${g.screen.replace('roms/', '')} in front`; }
  }
  put(stem + '.TAP', out, note);
  if (g.tapeLater) { const later = tzxToTap(read(g.tapeLater.tape)); const ls = g.id === 'buggyboy' ? 'BUGGYCRS' : null;
    if (ls) put(SUB + ls + '.TAP', later, 'buggyboy: its courses (loaded later by the game)'); }
}
// what you start goes into letter folders of similar size (esxDOS browser convention); ZZZ stays in roms, so the
// launchers' absolute paths into it do not change
const FOLDERS = [['0-C', /^[0-9A-C]/], ['D-H', /^[D-H]/], ['I-N', /^[I-N]/], ['O-S', /^[O-S]/], ['T-Z', /^[T-Z]/]];
for (const [d] of FOLDERS) fs.mkdirSync(OUT + d);
for (const name of fs.readdirSync(OUT)) {
  if (!/\.(Z80|TAP|BAS)$/.test(name)) continue;
  const f = FOLDERS.find(([, re]) => re.test(name)); if (!f) throw new Error('no folder for ' + name);
  fs.renameSync(OUT + name, OUT + f[0] + '/' + name);
}
console.log(files.size, 'files' + (NEXT ? ' (Next)' : '') + ';', ['Z80', 'TAP', 'BAS', 'SCR'].map(x => [...files.keys()].filter(f => f.endsWith('.' + x)).length + ' ' + x).join(', '));
// everything but the plain snapshots and their launchers
for (const r of report.filter(r => !/\.Z80 +[a-z0-9]+$/.test(r) && !/launcher:/.test(r))) console.log(' ', r);
