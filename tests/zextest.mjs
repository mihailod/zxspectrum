// Runs a CP/M ZEXALL/ZEXDOC binary on the generated core with a minimal BDOS.
// usage: node tests/zextest.mjs path/to/zexall.com
import fs from 'node:fs';
import { generateCore, CORE_RUNTIME } from '../src/z80gen.mjs';

const harness = `
let t = 0;
const mem = new Uint8Array(65536);
function rdi(ad) { return mem[ad]; }
function rd(ad) { t += 3; return mem[ad]; }
function wr(ad, v) { t += 3; mem[ad] = v; }
function cn(ad, n) { t += n; }
function pin(p) { t += 4; return 0xff; }
function pout(p, v) { t += 4; }
`;
const cpu = new Function(harness + CORE_RUNTIME + generateCore() + `
return {
  mem, getRegs, setRegs,
  run(print) {
    for (;;) {
      if (pc === 5) {
        if (c === 2) print(String.fromCharCode(e));
        else if (c === 9) { let ad = d << 8 | e; while (mem[ad] !== 36) print(String.fromCharCode(mem[ad++])); }
        ret();
      } else if (pc === 0) return t;
      step();
    }
  },
};`)();

const bin = fs.readFileSync(process.argv[2]);
cpu.mem.set(bin, 0x100);
cpu.mem[5] = 0xc9;
cpu.setRegs({ ...cpu.getRegs(), pc: 0x100, sp: 0xf000 });
let line = '', errors = 0;
const t0 = Date.now();
cpu.run(ch => {
  if (ch === '\n') { console.log(line); if (/ERROR/.test(line)) errors++; line = ''; }
  else if (ch !== '\r') line += ch;
});
if (line) console.log(line);
console.log(`\n${errors} error(s), ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(errors ? 1 : 0);
