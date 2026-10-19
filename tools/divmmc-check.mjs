// Checks a folder made by tools/divmmc.mjs (or the card's /GAMES/ROMS), with or without --next: 8.3 names, every
// Next launcher (.BAS) is exactly the program it should be and its screen and snapshot are in ZZZ, every launcher shows its
// loading screen, waits for a key and reaches its .snapload line (where the emulator, which has no esxDOS, stops
// with "Nonsense in BASIC"), naming a snapshot that is in ZZZ; and the two tapes with something put in front
// (Ukleti Dvorac, Formula One) end up like their plain tapes.
// usage: node tools/divmmc-check.mjs <folder>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMachine } from '../tests/headless.mjs';
import { loadTapeToEnd, typeScript } from '../src/tapeboot.mjs';
import { GAMES } from '../src/games.mjs';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
if (!process.argv[2]) { console.error('usage: node tools/divmmc-check.mjs <folder>'); process.exit(1); }
const D = path.resolve(process.argv[2]) + '/';
const dirs = fs.readdirSync(D).filter(n => n !== 'ZZZ' && !n.startsWith('.') && fs.statSync(D + n).isDirectory()), sub = fs.readdirSync(D + 'ZZZ');
const where = {}; for (const d of dirs) for (const n of fs.readdirSync(D + d)) where[n] = d + '/';
const names = Object.keys(where);
console.log('folders:', dirs.map(d => `${d} ${fs.readdirSync(D + d).length}`).join(', '), '| loose files in roms:', fs.readdirSync(D).filter(n => !fs.statSync(D + n).isDirectory()).length);
const bad83 = [...names, ...sub].filter(n => !/^[A-Z0-9_\-!#$%&'()@^{}~]{1,8}\.(Z80|TAP|BAS|SCR)$/.test(n));
console.log('names not 8.3:', bad83.length ? bad83 : 'none');
// every launcher: runs LOAD "", shows the right screen, waits, then reaches the .snapload line naming an existing file
let ok = 0, fails = [];
for (const n of names.filter(n => n.endsWith('.TAP'))) {
  const tap = fs.readFileSync(D + where[n] + n);
  const txt = tap.toString('latin1'); const m = txt.match(/\.snapload (\/GAMES\/ROMS\/ZZZ\/([A-Z0-9_\-]+\.Z80))/);
  if (!m) continue;                                                  // a game tape, not a launcher
  if (!sub.includes(m[2])) { fails.push(n + ': target missing ' + m[2]); continue; }
  const zx = createMachine(); loadTapeToEnd(zx, new Uint8Array(tap), 'LOAD ""');
  for (let f = 0; f < 50; f++) zx.runFrame();
  const scr = tap.subarray(tap.length - 6913, tap.length - 1);       // the screen block's data
  let sd = 0; for (let i = 0; i < 6912; i++) if (zx.mem[0x4000 + i] !== scr[i]) sd++;
  const waiting = zx.getRegs().pc < 0x4000;
  zx.key(7, 0, true); for (let f = 0; f < 5; f++) zx.runFrame(); zx.key(7, 0, false); for (let f = 0; f < 30; f++) zx.runFrame();
  const err = zx.mem[0x5c3a], lineNo = zx.mem[0x5c45] | zx.mem[0x5c46] << 8;
  if (sd || !waiting || err !== 11 || lineNo !== 30) fails.push(`${n}: screen diff ${sd}, waiting ${waiting}, err ${err}, line ${lineNo}`); else ok++;
}
// Next launchers (.BAS, made with --next): the emulator has no NextBASIC, so check them as files: +3DOS headers,
// the three lines exactly, and that the screen and snapshot they name are in ZZZ
const p3 = (b, type) => { const h = b.subarray(0, 128); let sum = 0; for (let i = 0; i < 127; i++) sum += h[i];
  return h.toString('latin1', 0, 8) === 'PLUS3DOS' && sum % 256 === h[127] && h.readUInt32LE(11) === b.length && h[15] === type && h.readUInt16LE(16) === b.length - 128; };
let nextOk = 0;
for (const n of names.filter(n => n.endsWith('.BAS'))) {
  const b = fs.readFileSync(D + where[n] + n), stem = n.slice(0, -4), dir = 'c:/games/roms/zzz/';
  const want = (await import('./divmmc-lib.mjs')).nextLauncherBas(dir + stem + '.SCR', dir + stem + '.Z80');
  const scr = sub.includes(stem + '.SCR') && fs.readFileSync(D + 'ZZZ/' + stem + '.SCR');
  const bad = [!p3(b, 0) && 'header', b.readUInt16LE(18) !== 10 && 'autostart', Buffer.compare(b, want) && 'program',
    !scr && 'no .SCR', scr && !(p3(scr, 3) && scr.length === 128 + 6912 && scr.readUInt16LE(18) === 16384) && '.SCR header',
    !sub.includes(stem + '.Z80') && 'no .Z80'].filter(Boolean);
  if (bad.length) fails.push(`${n}: ${bad.join(', ')}`); else nextOk++;
}
if (nextOk) console.log('Next launchers OK:', nextOk);
const zOrphans = sub.filter(z => z.endsWith('.Z80') && !names.includes(z.replace('.Z80', '.TAP')) && !names.includes(z.replace('.Z80', '.BAS')));
console.log('in roms:', names.length, '| in ZZZ:', sub.length, '| ZZZ snapshots without a launcher:', zOrphans.length ? zOrphans : 'none', '| roms snapshots that have a launcher:', names.filter(n => n.endsWith('.Z80') && (names.includes(n.replace('.Z80', '.TAP')) || names.includes(n.replace('.Z80', '.BAS')))).length);
console.log('launchers OK:', ok, 'failures:', fails.length ? fails : 'none');
// the two tapes with something in front: same machine at the end as the plain tape (screen tape: press a key at the pause)
const plain = (g, buf, cmd) => { const zx = createMachine(); const fr = loadTapeToEnd(zx, new Uint8Array(buf), cmd, undefined, g.stopAt ?? null, g.tapeKeys || []); return { zx, fr }; };
for (const [id, file] of [['ukletidvorac', 'UKLETIDV.TAP'], ['formula1', 'FORMULA1.TAP']]) {
  const g = GAMES.find(x => x.id === id);
  const full = fs.readFileSync(D + where[file] + file);
  // the plain tape = the file without what was put in front
  const blocks = []; for (let i = 0; i < full.length;) { const n = full[i] | full[i + 1] << 8; blocks.push(full.subarray(i, i + 2 + n)); i += 2 + n; }
  const skip = id === 'ukletidvorac' ? 4 : 2;
  const A = plain(g, Buffer.concat(blocks.slice(skip)), g.loadCommand || 'LOAD ""');
  const zx = createMachine(); zx.reset(); zx.loadTape(new Uint8Array(full), true); zx.setBreakOnTapeEnd(true);
  const script = typeScript('LOAD ""'); let fr = 0, shown = false, pressed = -1;
  for (; fr < 100000; fr++) {
    for (const k of script) { if (fr === k.at) for (const [r, b] of k.pos) zx.key(r, b, true); if (fr === k.at + 5) for (const [r, b] of k.pos) zx.key(r, b, false); }
    if (pressed > 0 && fr === pressed + 6) zx.key(7, 0, false);
    zx.runFrame();
    if (id === 'ukletidvorac' && pressed < 0 && zx.getRegs().pc < 0x4000 && zx.mem[0x5c3a] === 0xff) {
      const scr = fs.readFileSync(R + g.screen); let sd = 0; for (let i = 0; i < 6912; i++) if (zx.mem[0x4000 + i] !== scr[i]) sd++;
      if (sd === 0 && fr > 300) { shown = true; pressed = fr; zx.key(7, 0, true); }
    }
    if (zx.brokeAtTapeEnd()) break;
  }
  // the screen differs where the loading screen stays on display; a few counters and stack bytes depend on how long it took
  let d = 0, sv = 0, sd = 0; for (let a = 0x4000; a < 0x10000; a++) if (zx.mem[a] !== A.zx.mem[a]) { if (a < 0x5b00) sd++; else if (a >= 0x5c00 && a < 0x5d00) sv++; else d++; }
  console.log(`${file}: ${id === 'ukletidvorac' ? 'loading screen shown and waited: ' + shown + '; ' : ''}tape ended at frame ${fr + 1} (plain tape ${A.fr}); RAM vs plain tape: ${d} bytes differ (+ ${sd} on the screen, ${sv} in sysvars)`);
}
