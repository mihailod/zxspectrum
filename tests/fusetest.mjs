// Runs Fuse's Z80 core test suite (tests.in / tests.expected) against the
// generated core and compares the full bus-event log, registers, T-states and
// memory diffs byte for byte.
//
// usage: node tests/fusetest.mjs <fuse z80/tests dir> [-v]
import fs from 'node:fs';
import path from 'node:path';
import { generateCore, CORE_RUNTIME } from '../src/z80gen.mjs';

const dir = process.argv[2];
const verbose = process.argv.includes('-v');
const hx = (v, n) => v.toString(16).padStart(n, '0');
const pad5 = v => String(v).padStart(5, ' ');

// Bus primitives mirroring z80/coretest.c (no contention delays, events logged)
const harness = String.raw`
let t = 0;
const mem = new Uint8Array(65536);
let out = [];
const H4 = v => v.toString(16).padStart(4, '0'), H2 = v => v.toString(16).padStart(2, '0');
const P5 = v => String(v).padStart(5, ' ');
function rdi(ad) { out.push(P5(t) + ' MR ' + H4(ad) + ' ' + H2(mem[ad])); return mem[ad]; }
function rd(ad) { out.push(P5(t) + ' MC ' + H4(ad)); t += 3; return rdi(ad); }
function wr(ad, v) {
  out.push(P5(t) + ' MC ' + H4(ad)); t += 3;
  out.push(P5(t) + ' MW ' + H4(ad) + ' ' + H2(v)); mem[ad] = v;
}
function cn(ad, n) { out.push(P5(t) + ' MC ' + H4(ad)); t += n; }
function preio(p) { if ((p & 0xc000) === 0x4000) out.push(P5(t) + ' PC ' + H4(p)); t++; }
function postio(p) {
  if (p & 1) {
    if ((p & 0xc000) === 0x4000) {
      for (let k = 0; k < 3; k++) { out.push(P5(t) + ' PC ' + H4(p)); t++; }
    } else t += 3;
  } else { out.push(P5(t) + ' PC ' + H4(p)); t += 3; }
}
function pin(p) { const v = p >> 8; preio(p); out.push(P5(t) + ' PR ' + H4(p) + ' ' + H2(v)); postio(p); return v; }
function pout(p, v) { preio(p); out.push(P5(t) + ' PW ' + H4(p) + ' ' + H2(v)); postio(p); }
`;

const factory = new Function(harness + CORE_RUNTIME + generateCore() + `
return {
  mem,
  reset() { t = 0; out = []; },
  run(end) { while (t < end) step(); },
  getT: () => t, getOut: () => out, getRegs, setRegs,
};`);
const cpu = factory();

function parseIn(text) {
  const lines = text.split('\n');
  const tests = [];
  let k = 0;
  while (k < lines.length) {
    while (k < lines.length && lines[k].trim() === '') k++;
    if (k >= lines.length) break;
    const name = lines[k++].trim();
    const r1 = lines[k++].trim().split(/\s+/).map(v => parseInt(v, 16));
    const r2 = lines[k++].trim().split(/\s+/);
    const memLines = [];
    for (;;) {
      const ln = lines[k++].trim();
      if (ln === '-1') break;
      memLines.push(ln);
    }
    tests.push({ name, r1, r2, memLines });
  }
  return tests;
}

function parseExpected(text) {
  // name, then indented event lines, then 2 register lines, then memory lines, blank
  const blocks = text.split(/\n\s*\n/).map(b => b.split('\n').filter(x => x.length));
  const out = new Map();
  for (const b of blocks) if (b.length) out.set(b[0].trim(), b.slice(1).map(s => s.trim().replace(/\s+/g, ' ')));
  return out;
}

const tests = parseIn(fs.readFileSync(path.join(dir, 'tests.in'), 'utf8'));
const expected = parseExpected(fs.readFileSync(path.join(dir, 'tests.expected'), 'utf8'));

let pass = 0, fail = 0;
const failures = [];
for (const tc of tests) {
  // memory pattern de ad be ef
  for (let i = 0; i < 0x10000; i += 4) { cpu.mem[i] = 0xde; cpu.mem[i + 1] = 0xad; cpu.mem[i + 2] = 0xbe; cpu.mem[i + 3] = 0xef; }
  for (const ml of tc.memLines) {
    const v = ml.split(/\s+/).map(x => parseInt(x, 16));
    let ad = v[0];
    for (let j = 1; j < v.length && v[j] !== -1 && !isNaN(v[j]) && v[j] < 256; j++) cpu.mem[ad++] = v[j];
  }
  const initial = cpu.mem.slice();
  const [af, bc, de, hl, af_, bc_, de_, hl_, ix, iy, sp, pc, memptr] = tc.r1;
  const [I, R, iff1, iff2, im, halted, endT] = tc.r2;
  cpu.reset();
  cpu.setRegs({
    a: af >> 8, f: af & 255, b: bc >> 8, c: bc & 255, d: de >> 8, e: de & 255, h: hl >> 8, l: hl & 255,
    a_: af_ >> 8, f_: af_ & 255, b_: bc_ >> 8, c_: bc_ & 255, d_: de_ >> 8, e_: de_ & 255, h_: hl_ >> 8, l_: hl_ & 255,
    ix, iy, sp, pc, wz: memptr, i: parseInt(I, 16), r: parseInt(R, 16),
    iff1: +iff1, iff2: +iff2, im: +im, halted: +halted,
  });
  cpu.run(parseInt(endT, 10));
  const s = cpu.getRegs();
  const got = cpu.getOut().map(x => x.trim().replace(/\s+/g, ' '));
  const w = v => hx(v, 4);
  got.push([s.a << 8 | s.f, s.b << 8 | s.c, s.d << 8 | s.e, s.h << 8 | s.l,
    s.a_ << 8 | s.f_, s.b_ << 8 | s.c_, s.d_ << 8 | s.e_, s.h_ << 8 | s.l_,
    s.ix, s.iy, s.sp, s.pc, s.wz].map(w).join(' '));
  got.push(`${hx(s.i, 2)} ${hx(s.r, 2)} ${s.iff1} ${s.iff2} ${s.im} ${s.halted} ${cpu.getT()}`);
  for (let i2 = 0; i2 < 0x10000; i2++) {
    if (cpu.mem[i2] === initial[i2]) continue;
    let ln = hx(i2, 4) + ' ';
    while (i2 < 0x10000 && cpu.mem[i2] !== initial[i2]) ln += hx(cpu.mem[i2++], 2) + ' ';
    got.push((ln + '-1'));
  }
  const exp = expected.get(tc.name);
  const ok = exp && exp.length === got.length && exp.every((v, j) => v === got[j]);
  if (ok) pass++;
  else {
    fail++;
    failures.push(tc.name);
    if (verbose || fail <= 5) {
      console.log(`FAIL ${tc.name}`);
      const n = Math.max(exp ? exp.length : 0, got.length);
      for (let j = 0; j < n; j++) {
        const e1 = exp ? exp[j] : undefined, g1 = got[j];
        console.log(`${e1 === g1 ? '  ' : '!!'} exp: ${e1 ?? ''}\n${e1 === g1 ? '  ' : '!!'} got: ${g1 ?? ''}`);
      }
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed of ${tests.length}`);
if (fail) console.log('failed:', failures.join(' '));
process.exit(fail ? 1 : 0);
