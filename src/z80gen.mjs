// Z80 core generator.
//
// Emits JavaScript source for a Z80 interpreter whose bus behaviour (the order
// and timing of every memory read/write, contention probe and port access)
// matches Fuse 1.6.0 exactly, including MEMPTR (wz), the Q register used by
// SCF/CCF, undocumented flags and undocumented opcodes.
//
// The emitted code is a fragment meant to be placed inside a closure that
// provides the bus primitives:
//   t            current T-state (mutable)
//   rd(a)        timed memory read (3T + contention)
//   wr(a,v)      timed memory write (3T + contention)
//   rdi(a)       untimed read used for opcode fetch after cn(pc,4)
//   cn(a,n)      contention probe on address a, then n T-states
//   pin(p)       timed port read, pout(p,v) timed port write
//
// Per-opcode emitters are kept separate from the switch assembly so that the
// static recompiler (phase 3) can reuse them.

const S = 0x80, Z = 0x40, F5 = 0x20, H = 0x10, F3 = 0x08, PV = 0x04, N = 0x02, C = 0x01;

const R8 = ['b', 'c', 'd', 'e', 'h', 'l', null, 'a'];
const COND = [
  '!(f&0x40)', '(f&0x40)', '!(f&0x01)', '(f&0x01)',
  '!(f&0x04)', '(f&0x04)', '!(f&0x80)', '(f&0x80)',
];
const ALU = ['add8', 'adc8', 'sub8', 'sbc8', 'and8', 'xor8', 'or8', 'cp8'];
const ROT = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];

const IR = 'cn(ir(),1);';
const PCINC = 'pc=(pc+1)&65535;';

// --- operand helpers -------------------------------------------------------

// 8-bit register read; X is null (HL) or 'ix'/'iy' (H/L become IXH/IXL)
function g8(n, X) {
  if (X && n === 4) return `(${X}>>8)`;
  if (X && n === 5) return `(${X}&255)`;
  return R8[n];
}
function s8(n, X, expr) {
  if (X && n === 4) return `${X}=(${X}&255)|((${expr})<<8);`;
  if (X && n === 5) return `${X}=(${X}&0xff00)|(${expr});`;
  return `${R8[n]}=${expr};`;
}
// 16-bit register pair (p: 0=BC 1=DE 2=HL/IX/IY 3=SP)
function g16(p, X) {
  switch (p) {
    case 0: return '(b<<8|c)';
    case 1: return '(d<<8|e)';
    case 2: return X ? X : '(h<<8|l)';
    case 3: return 'sp';
  }
}
function s16(p, X, expr) {
  switch (p) {
    case 0: return `{const v_=${expr};b=v_>>8;c=v_&255;}`;
    case 1: return `{const v_=${expr};d=v_>>8;e=v_&255;}`;
    case 2: return X ? `${X}=${expr};` : `{const v_=${expr};h=v_>>8;l=v_&255;}`;
    case 3: return `sp=${expr};`;
  }
}
// low/high byte names of a pair for byte-wise loads (LD rp,nn / LD rp,(nn))
function pairBytes(p, X) {
  // returns [setLow, setHigh, getLow, getHigh]
  if (p === 0) return [v => `c=${v};`, v => `b=${v};`, 'c', 'b'];
  if (p === 1) return [v => `e=${v};`, v => `d=${v};`, 'e', 'd'];
  if (p === 2 && !X) return [v => `l=${v};`, v => `h=${v};`, 'l', 'h'];
  const R = p === 3 ? 'sp' : X;
  return [v => `${R}=(${R}&0xff00)|${v};`, v => `${R}=(${R}&255)|(${v}<<8);`, `(${R}&255)`, `(${R}>>8)`];
}

// (IX+d) address computation for ordinary indexed instructions: wz = X+d
function ixd(X) {
  return `{const o_=rd(pc);cn(pc,1);cn(pc,1);cn(pc,1);cn(pc,1);cn(pc,1);${PCINC}wz=(${X}+((o_<<24)>>24))&65535;}`;
}

// --- unprefixed / DD / FD --------------------------------------------------

// Returns code for opcode `op` in the base table. With X set (DD/FD prefix)
// returns null when the opcode does not involve H, L or (HL) – the prefix
// then acts as a 4T NOP and the opcode is re-dispatched (Fuse semantics).
export function emitBase(op, X = null) {
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, qb = y & 1;
  const HLp = X ? X : '(h<<8|l)';

  if (x === 1) {
    if (op === 0x76) return X ? null : 'halted=1;pc=(pc-1)&65535;';
    if (z === 6) { // LD r,(HL)
      if (!X) return `${R8[y]}=rd(h<<8|l);`;
      return `${ixd(X)}${R8[y]}=rd(wz);`;
    }
    if (y === 6) { // LD (HL),r
      if (!X) return `wr(h<<8|l,${R8[z]});`;
      return `${ixd(X)}wr(wz,${R8[z]});`;
    }
    if (X && !(y === 4 || y === 5 || z === 4 || z === 5)) return null;
    if (y === z) return '';
    return s8(y, X, g8(z, X));
  }

  if (x === 2) { // ALU A,r
    const fn = ALU[y];
    if (z === 6) {
      if (!X) return `${fn}(rd(h<<8|l));`;
      return `${ixd(X)}${fn}(rd(wz));`;
    }
    if (X && !(z === 4 || z === 5)) return null;
    return `${fn}(${g8(z, X)});`;
  }

  if (x === 0) {
    switch (z) {
      case 0:
        if (X) return null;
        switch (y) {
          case 0: return '';
          case 1: return '{let t_=a;a=a_;a_=t_;t_=f;f=f_;f_=t_;}';
          case 2: return `${IR}b=(b-1)&255;if(b){jr();}else{cn(pc,3);${PCINC}}`;
          case 3: return 'jr();';
          default: return `if(${COND[y - 4]}){jr();}else{cn(pc,3);${PCINC}}`;
        }
      case 1:
        if (X && p !== 2) {
          if (qb === 1 && p !== 2) { /* ADD IX,rp */ } else return null;
        }
        if (qb === 0) { // LD rp,nn
          const [sl, sh] = pairBytes(p, X);
          return sl('imm()') + sh('imm()');
        } else { // ADD HL,rp
          const src = p === 2 ? HLp : g16(p, X);
          return `${IR.repeat(7)}${s16(2, X, `add16(${HLp},${src})`)}`;
        }
      case 2:
        if (X && p !== 2) return null;
        switch (y) {
          case 0: return `wz=((c+1)&255)|(a<<8);wr(b<<8|c,a);`;
          case 1: return `wz=((b<<8|c)+1)&65535;a=rd(b<<8|c);`;
          case 2: return `wz=((e+1)&255)|(a<<8);wr(d<<8|e,a);`;
          case 3: return `wz=((d<<8|e)+1)&65535;a=rd(d<<8|e);`;
          case 4: { const [, , gl, gh] = pairBytes(2, X);
            return `{let ad_=imm();ad_|=imm()<<8;wr(ad_,${gl});ad_=(ad_+1)&65535;wz=ad_;wr(ad_,${gh});}`; }
          case 5: { const [sl, sh] = pairBytes(2, X);
            return `{let ad_=imm();ad_|=imm()<<8;${sl('rd(ad_)')}ad_=(ad_+1)&65535;wz=ad_;${sh('rd(ad_)')}}`; }
          case 6: return `{let ad_=imm();ad_|=imm()<<8;wz=((ad_+1)&255)|(a<<8);wr(ad_,a);}`;
          case 7: return `{let ad_=imm();ad_|=imm()<<8;wz=(ad_+1)&65535;a=rd(ad_);}`;
        }
        break;
      case 3:
        if (X && p !== 2) return null;
        return IR + IR + s16(p, X, `(${g16(p, X)}${qb ? '-' : '+'}1)&65535`);
      case 4: case 5: {
        const fn = z === 4 ? 'inc8' : 'dec8';
        if (y === 6) {
          if (!X) return `{const ad_=h<<8|l;let v_=rd(ad_);cn(ad_,1);v_=${fn}(v_);wr(ad_,v_);}`;
          return `${ixd(X)}{let v_=rd(wz);cn(wz,1);v_=${fn}(v_);wr(wz,v_);}`;
        }
        if (X && !(y === 4 || y === 5)) return null;
        return s8(y, X, `${fn}(${g8(y, X)})`);
      }
      case 6:
        if (y === 6) {
          if (!X) return 'wr(h<<8|l,imm());';
          return `{const o_=imm();const v_=rd(pc);cn(pc,1);cn(pc,1);${PCINC}wz=(${X}+((o_<<24)>>24))&65535;wr(wz,v_);}`;
        }
        if (X && !(y === 4 || y === 5)) return null;
        return s8(y, X, 'imm()');
      case 7:
        if (X) return null;
        switch (y) {
          case 0: return 'a=((a<<1)|(a>>7))&255;f=(f&0xc4)|(a&0x29);q=f;';
          case 1: return 'f=(f&0xc4)|(a&1);a=((a>>1)|(a<<7))&255;f|=a&0x28;q=f;';
          case 2: return '{const t_=a;a=((a<<1)|(f&1))&255;f=(f&0xc4)|(a&0x28)|(t_>>7);q=f;}';
          case 3: return '{const t_=a;a=((a>>1)|(f<<7))&255;f=(f&0xc4)|(a&0x28)|(t_&1);q=f;}';
          case 4: return 'daa();';
          case 5: return 'a^=255;f=(f&0xc5)|(a&0x28)|0x12;q=f;';
          case 6: return 'f=(f&0xc4)|(((lastQ^f)|a)&0x28)|1;q=f;';
          case 7: return 'f=(f&0xc4)|((f&1)?0x10:1)|(((lastQ^f)|a)&0x28);q=f;';
        }
    }
  }

  // x === 3
  switch (z) {
    case 0: if (X) return null; return `${IR}if(${COND[y]}){ret();}`;
    case 1:
      if (qb === 0) { // POP
        if (X && p !== 2) return null;
        if (p === 3) return 'f=rd(sp);sp=(sp+1)&65535;a=rd(sp);sp=(sp+1)&65535;';
        const [sl, sh] = pairBytes(p, X);
        return `${sl('rd(sp)')}sp=(sp+1)&65535;${sh('rd(sp)')}sp=(sp+1)&65535;`;
      }
      switch (p) {
        case 0: return X ? null : 'ret();';
        case 1: return X ? null : '{let t_=b;b=b_;b_=t_;t_=c;c=c_;c_=t_;t_=d;d=d_;d_=t_;t_=e;e=e_;e_=t_;t_=h;h=h_;h_=t_;t_=l;l=l_;l_=t_;}';
        case 2: return `pc=${HLp};`;
        case 3: return `${IR}${IR}sp=${HLp};`;
      }
      break;
    case 2: if (X) return null; return `wz=imm();wz|=rd(pc)<<8;if(${COND[y]}){pc=wz;}else{${PCINC}}`;
    case 3:
      switch (y) {
        case 0: return X ? null : `wz=imm();wz|=rd(pc)<<8;pc=wz;`;
        case 1: return null; // CB prefix handled by caller
        case 2: return X ? null : `{const n_=imm();wz=((n_+1)&255)|(a<<8);pout(n_|(a<<8),a);}`;
        case 3: return X ? null : `{const p_=imm()+(a<<8);a=pin(p_);wz=(p_+1)&65535;}`;
        case 4: {
          const [sl, sh, gl, gh] = pairBytes(2, X);
          return `{const sp1_=(sp+1)&65535;const lo_=rd(sp);const hi_=rd(sp1_);cn(sp1_,1);wr(sp1_,${gh});wr(sp,${gl});cn(sp,1);cn(sp,1);${sl('lo_')}${sh('hi_')}wz=lo_|(hi_<<8);}`;
        }
        case 5: return X ? null : '{let t_=d;d=h;h=t_;t_=e;e=l;l=t_;}';
        case 6: return X ? null : 'iff1=iff2=0;';
        case 7: return X ? null : 'iff1=iff2=1;eiAt=t;if(intChk>t+1)intChk=t+1;';
      }
      break;
    case 4: if (X) return null; return `wz=imm();wz|=rd(pc)<<8;if(${COND[y]}){cn(pc,1);${PCINC}push(pc);pc=wz;}else{${PCINC}}`;
    case 5:
      if (qb === 0) { // PUSH
        if (X && p !== 2) return null;
        if (p === 3) return `${IR}push(a<<8|f);`;
        return `${IR}push(${g16(p, X)});`;
      }
      if (p === 0) return X ? null : `wz=imm();wz|=rd(pc)<<8;cn(pc,1);${PCINC}push(pc);pc=wz;`;
      return null; // DD/ED/FD prefixes handled by caller
    case 6: if (X) return null; return `${ALU[y]}(imm());`;
    case 7: if (X) return null; return `${IR}push(pc);pc=${y * 8};wz=pc;`;
  }
  throw new Error('unreachable ' + op.toString(16));
}

// --- CB prefix ------------------------------------------------------------

export function emitCB(op) {
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
  if (z === 6) {
    const pre = 'const ad_=h<<8|l;';
    switch (x) {
      case 0: return `{${pre}let v_=rd(ad_);cn(ad_,1);v_=${ROT[y]}(v_);wr(ad_,v_);}`;
      case 1: return `{${pre}const v_=rd(ad_);cn(ad_,1);bitmp(${y},v_);}`;
      case 2: return `{${pre}const v_=rd(ad_);cn(ad_,1);wr(ad_,v_&${0xff ^ (1 << y)});}`;
      case 3: return `{${pre}const v_=rd(ad_);cn(ad_,1);wr(ad_,v_|${1 << y});}`;
    }
  }
  const r = R8[z];
  switch (x) {
    case 0: return `${r}=${ROT[y]}(${r});`;
    case 1: return `bit(${y},${r});`;
    case 2: return `${r}&=${0xff ^ (1 << y)};`;
    case 3: return `${r}|=${1 << y};`;
  }
}

// DD CB d op / FD CB d op – wz already holds X+d
export function emitXCB(op) {
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
  const store = z === 6 ? '' : `${R8[z]}=v_;`;
  switch (x) {
    case 0: return `{let v_=rd(wz);cn(wz,1);v_=${ROT[y]}(v_);${store}wr(wz,v_);}`;
    case 1: return `{const v_=rd(wz);cn(wz,1);bitmp(${y},v_);}`;
    case 2: return `{const v_=rd(wz)&${0xff ^ (1 << y)};cn(wz,1);${store}wr(wz,v_);}`;
    case 3: return `{const v_=rd(wz)|${1 << y};cn(wz,1);${store}wr(wz,v_);}`;
  }
}

// --- ED prefix ------------------------------------------------------------

export function emitED(op) {
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, qb = y & 1;
  if (x === 1) {
    switch (z) {
      case 0: // IN r,(C)
        if (y === 6) return `{const p_=b<<8|c;wz=(p_+1)&65535;const v_=pin(p_);f=(f&1)|sz53p[v_];q=f;}`;
        return `{const p_=b<<8|c;wz=(p_+1)&65535;${R8[y]}=pin(p_);f=(f&1)|sz53p[${R8[y]}];q=f;}`;
      case 1: // OUT (C),r
        return `{const p_=b<<8|c;pout(p_,${y === 6 ? '0' : R8[y]});wz=(p_+1)&65535;}`;
      case 2: {
        const src = g16(p, null);
        return `${IR.repeat(7)}${qb ? 'adc16' : 'sbc16'}(${src});`;
      }
      case 3: {
        if (qb === 0) {
          const [, , gl, gh] = pairBytes(p, null);
          return `{let ad_=imm();ad_|=imm()<<8;wr(ad_,${gl});ad_=(ad_+1)&65535;wz=ad_;wr(ad_,${gh});}`;
        }
        const [sl, sh] = pairBytes(p, null);
        return `{let ad_=imm();ad_|=imm()<<8;${sl('rd(ad_)')}ad_=(ad_+1)&65535;wz=ad_;${sh('rd(ad_)')}}`;
      }
      case 4: return '{const v_=a;a=0;sub8(v_);}';
      case 5: return 'iff1=iff2;ret();';
      case 6: return `im=${[0, 0, 1, 2, 0, 0, 1, 2][y]};`;
      case 7:
        switch (y) {
          case 0: return `${IR}i=a;`;
          case 1: return `${IR}r=a&127;r7=a;`;
          case 2: return `${IR}a=i;f=(f&1)|sz53[a]|(iff2?4:0);q=f;iff2Read=1;`;
          case 3: return `${IR}a=(r&127)|(r7&128);f=(f&1)|sz53[a]|(iff2?4:0);q=f;iff2Read=1;`;
          case 4: return '{const ad_=h<<8|l;const v_=rd(ad_);cn(ad_,1);cn(ad_,1);cn(ad_,1);cn(ad_,1);wr(ad_,((a<<4)|(v_>>4))&255);a=(a&0xf0)|(v_&15);f=(f&1)|sz53p[a];q=f;wz=(ad_+1)&65535;}';
          case 5: return '{const ad_=h<<8|l;const v_=rd(ad_);cn(ad_,1);cn(ad_,1);cn(ad_,1);cn(ad_,1);wr(ad_,((v_<<4)|(a&15))&255);a=(a&0xf0)|(v_>>4);f=(f&1)|sz53p[a];q=f;wz=(ad_+1)&65535;}';
          default: return '';
        }
    }
  }
  if (x === 2 && y >= 4 && z <= 3) {
    const dec = y & 1;          // 0 = increment, 1 = decrement
    const rep = y >= 6;         // repeating form
    const d = dec ? '-' : '+';
    switch (z) {
      case 0: // LDI/LDD/LDIR/LDDR
        return `{const hl_=h<<8|l,de_=d<<8|e;let v_=rd(hl_);` +
          (rep ? `wr(de_,v_);cn(de_,1);cn(de_,1);let bc_=((b<<8|c)-1)&65535;b=bc_>>8;c=bc_&255;`
               : `let bc_=((b<<8|c)-1)&65535;b=bc_>>8;c=bc_&255;wr(de_,v_);cn(de_,1);cn(de_,1);`) +
          `v_=(v_+a)&255;f=(f&0xc1)|(bc_?4:0)|(v_&8)|((v_&2)?0x20:0);q=f;` +
          (rep ? `if(bc_){cn(de_,1);cn(de_,1);cn(de_,1);cn(de_,1);cn(de_,1);pc=(pc-2)&65535;wz=(pc+1)&65535;}` : '') +
          `{const n1_=(hl_${d}1)&65535,n2_=(de_${d}1)&65535;h=n1_>>8;l=n1_&255;d=n2_>>8;e=n2_&255;}}`;
      case 1: // CPI/CPD/CPIR/CPDR
        return `{const hl_=h<<8|l;const v_=rd(hl_);let r_=(a-v_)&255;const lk_=((a&8)>>3)|((v_&8)>>2)|((r_&8)>>1);` +
          `cn(hl_,1);cn(hl_,1);cn(hl_,1);cn(hl_,1);cn(hl_,1);` +
          `const bc_=((b<<8|c)-1)&65535;b=bc_>>8;c=bc_&255;` +
          `f=(f&1)|(bc_?6:2)|hcSub[lk_]|(r_?0:0x40)|(r_&0x80);if(f&0x10)r_=(r_-1)&255;f|=(r_&8)|((r_&2)?0x20:0);q=f;` +
          (rep ? `if((f&0x44)===4){cn(hl_,1);cn(hl_,1);cn(hl_,1);cn(hl_,1);cn(hl_,1);pc=(pc-2)&65535;wz=(pc+1)&65535;}else{wz=(wz${d}1)&65535;}`
               : `wz=(wz${d}1)&65535;`) +
          `{const n_=(hl_${d}1)&65535;h=n_>>8;l=n_&255;}}`;
      case 2: // INI/IND/INIR/INDR
        return `{${IR}const hl_=h<<8|l;const v_=pin(b<<8|c);wr(hl_,v_);wz=((b<<8|c)${d}1)&65535;b=(b-1)&255;` +
          `const v2_=(v_+((c${d}1)&255))&255;` +
          `f=((v_&0x80)?2:0)|((v2_<v_)?0x11:0)|(parity[(v2_&7)^b]?4:0)|sz53[b];q=f;` +
          (rep ? `if(b){cn(hl_,1);cn(hl_,1);cn(hl_,1);cn(hl_,1);cn(hl_,1);pc=(pc-2)&65535;}` : '') +
          `{const n_=(hl_${d}1)&65535;h=n_>>8;l=n_&255;}}`;
      case 3: // OUTI/OUTD/OTIR/OTDR
        return `{${IR}const hl_=h<<8|l;const v_=rd(hl_);b=(b-1)&255;wz=((b<<8|c)${d}1)&65535;pout(b<<8|c,v_);` +
          `{const n_=(hl_${d}1)&65535;h=n_>>8;l=n_&255;}` +
          `const v2_=(v_+l)&255;` +
          `f=((v_&0x80)?2:0)|((v2_<v_)?0x11:0)|(parity[(v2_&7)^b]?4:0)|sz53[b];q=f;` +
          (rep ? `if(b){const bc_=b<<8|c;cn(bc_,1);cn(bc_,1);cn(bc_,1);cn(bc_,1);cn(bc_,1);pc=(pc-2)&65535;}` : '') +
          `}`;
    }
  }
  return ''; // NOPD
}

// --- assembly -------------------------------------------------------------

function sw(name, arg, cases, dflt) {
  let s = `function ${name}(${arg}){switch(${arg}){\n`;
  // group identical bodies to keep the source compact
  const groups = new Map();
  cases.forEach((body, i) => {
    if (body === null || body === undefined) return;
    if (!groups.has(body)) groups.set(body, []);
    groups.get(body).push(i);
  });
  for (const [body, ops] of groups) {
    s += ops.map(o => `case ${o}:`).join('') + `${body}break;\n`;
  }
  if (dflt) s += `default:${dflt}\n`;
  return s + '}}\n';
}

function prefixFetch(handler) {
  return `{cn(pc,4);const o2_=rdi(pc);${PCINC}r=(r+1)&127;${handler}(o2_);}`;
}

export function generateCore() {
  const base = [], cb = [], ed = [], ix = [], iy = [], xcb = [];
  for (let op = 0; op < 256; op++) {
    base[op] = emitBase(op);
    cb[op] = emitCB(op);
    ed[op] = emitED(op);
    ix[op] = emitBase(op, 'ix');
    iy[op] = emitBase(op, 'iy');
    xcb[op] = emitXCB(op);
  }
  base[0xcb] = prefixFetch('exCB');
  base[0xdd] = prefixFetch('exDD');
  base[0xed] = prefixFetch('exED');
  base[0xfd] = prefixFetch('exFD');
  const xcbFetch = X =>
    `{cn(pc,3);wz=(${X}+((rdi(pc)<<24)>>24))&65535;${PCINC}cn(pc,3);const o3_=rdi(pc);cn(pc,1);cn(pc,1);${PCINC}exXCB(o3_);}`;
  ix[0xcb] = xcbFetch('ix');
  iy[0xcb] = xcbFetch('iy');
  // non-H/L opcodes after DD/FD: prefix behaves as a NOP, opcode re-dispatched
  const redispatch = 'lastQ=q;q=0;exBase(o_);';

  return [
    sw('exBase', 'o_', base),
    sw('exCB', 'o_', cb),
    sw('exED', 'o_', ed),
    sw('exDD', 'o_', ix, redispatch),
    sw('exFD', 'o_', iy, redispatch),
    sw('exXCB', 'o_', xcb),
  ].join('\n');
}

// Static support code (ALU, tables, state) that the generated switches use.
export const CORE_RUNTIME = String.raw`
// ---- flag tables ----
const sz53 = new Uint8Array(256), sz53p = new Uint8Array(256), parity = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  sz53[i] = i & 0xa8;
  let p = 0;
  for (let k = i; k; k >>= 1) p ^= k & 1;
  parity[i] = p ? 0 : 4;
  sz53p[i] = sz53[i] | parity[i];
}
sz53[0] |= 0x40; sz53p[0] |= 0x40;
const hcAdd = [0, 0x10, 0x10, 0x10, 0, 0, 0, 0x10];
const hcSub = [0, 0, 0x10, 0, 0x10, 0, 0x10, 0x10];
const ovAdd = [0, 0, 0, 4, 4, 0, 0, 0];
const ovSub = [0, 4, 0, 0, 0, 0, 4, 0];

// ---- registers ----
let a = 0xff, f = 0xff, b = 0, c = 0, d = 0, e = 0, h = 0, l = 0;
let a_ = 0xff, f_ = 0xff, b_ = 0, c_ = 0, d_ = 0, e_ = 0, h_ = 0, l_ = 0;
let ix = 0, iy = 0, sp = 0xffff, pc = 0, wz = 0, i = 0, r = 0, r7 = 0;
let iff1 = 0, iff2 = 0, im = 0, halted = 0, q = 0, lastQ = 0, iff2Read = 0;
let eiAt = -1, intChk = Infinity;

function ir() { return (i << 8) | (r7 & 0x80) | (r & 0x7f); }
function imm() { const v = rd(pc); pc = (pc + 1) & 65535; return v; }
function push(v) {
  sp = (sp - 1) & 65535; wr(sp, v >> 8);
  sp = (sp - 1) & 65535; wr(sp, v & 255);
}
function ret() {
  const lo = rd(sp); sp = (sp + 1) & 65535;
  const hi = rd(sp); sp = (sp + 1) & 65535;
  pc = lo | (hi << 8); wz = pc;
}
function jr() {
  const o = rd(pc);
  cn(pc, 1); cn(pc, 1); cn(pc, 1); cn(pc, 1); cn(pc, 1);
  pc = (pc + ((o << 24) >> 24) + 1) & 65535; wz = pc;
}

// ---- ALU ----
function add8(v) {
  const t_ = a + v, lk = ((a & 0x88) >> 3) | ((v & 0x88) >> 2) | ((t_ & 0x88) >> 1);
  a = t_ & 255;
  f = ((t_ & 0x100) ? 1 : 0) | hcAdd[lk & 7] | ovAdd[lk >> 4] | sz53[a]; q = f;
}
function adc8(v) {
  const t_ = a + v + (f & 1), lk = ((a & 0x88) >> 3) | ((v & 0x88) >> 2) | ((t_ & 0x88) >> 1);
  a = t_ & 255;
  f = ((t_ & 0x100) ? 1 : 0) | hcAdd[lk & 7] | ovAdd[lk >> 4] | sz53[a]; q = f;
}
function sub8(v) {
  const t_ = a - v, lk = ((a & 0x88) >> 3) | ((v & 0x88) >> 2) | ((t_ & 0x88) >> 1);
  a = t_ & 255;
  f = ((t_ & 0x100) ? 1 : 0) | 2 | hcSub[lk & 7] | ovSub[lk >> 4] | sz53[a]; q = f;
}
function sbc8(v) {
  const t_ = a - v - (f & 1), lk = ((a & 0x88) >> 3) | ((v & 0x88) >> 2) | ((t_ & 0x88) >> 1);
  a = t_ & 255;
  f = ((t_ & 0x100) ? 1 : 0) | 2 | hcSub[lk & 7] | ovSub[lk >> 4] | sz53[a]; q = f;
}
function and8(v) { a &= v; f = 0x10 | sz53p[a]; q = f; }
function xor8(v) { a ^= v; f = sz53p[a]; q = f; }
function or8(v) { a |= v; f = sz53p[a]; q = f; }
function cp8(v) {
  const t_ = a - v, lk = ((a & 0x88) >> 3) | ((v & 0x88) >> 2) | ((t_ & 0x88) >> 1);
  f = ((t_ & 0x100) ? 1 : ((t_ & 255) ? 0 : 0x40)) | 2 | hcSub[lk & 7] | ovSub[lk >> 4] |
      (v & 0x28) | (t_ & 0x80);
  q = f;
}
function inc8(v) {
  v = (v + 1) & 255;
  f = (f & 1) | (v === 0x80 ? 4 : 0) | ((v & 0x0f) ? 0 : 0x10) | sz53[v]; q = f;
  return v;
}
function dec8(v) {
  f = (f & 1) | ((v & 0x0f) ? 0 : 0x10) | 2;
  v = (v - 1) & 255;
  f |= (v === 0x7f ? 4 : 0) | sz53[v]; q = f;
  return v;
}
function add16(x, y) {
  const t_ = x + y, lk = ((x & 0x0800) >> 11) | ((y & 0x0800) >> 10) | ((t_ & 0x0800) >> 9);
  wz = (x + 1) & 65535;
  f = (f & 0xc4) | ((t_ & 0x10000) ? 1 : 0) | ((t_ >> 8) & 0x28) | hcAdd[lk]; q = f;
  return t_ & 65535;
}
function adc16(v) {
  const hl = h << 8 | l, t_ = hl + v + (f & 1);
  const lk = ((hl & 0x8800) >> 11) | ((v & 0x8800) >> 10) | ((t_ & 0x8800) >> 9);
  wz = (hl + 1) & 65535;
  h = (t_ >> 8) & 255; l = t_ & 255;
  f = ((t_ & 0x10000) ? 1 : 0) | ovAdd[lk >> 4] | (h & 0xa8) | hcAdd[lk & 7] | ((t_ & 65535) ? 0 : 0x40); q = f;
}
function sbc16(v) {
  const hl = h << 8 | l, t_ = hl - v - (f & 1);
  const lk = ((hl & 0x8800) >> 11) | ((v & 0x8800) >> 10) | ((t_ & 0x8800) >> 9);
  wz = (hl + 1) & 65535;
  h = (t_ >> 8) & 255; l = t_ & 255;
  f = ((t_ & 0x10000) ? 1 : 0) | 2 | ovSub[lk >> 4] | (h & 0xa8) | hcSub[lk & 7] | ((t_ & 65535) ? 0 : 0x40); q = f;
}
function daa() {
  let add = 0, carry = f & 1;
  if ((f & 0x10) || (a & 0x0f) > 9) add = 6;
  if (carry || a > 0x99) add |= 0x60;
  if (a > 0x99) carry = 1;
  if (f & 2) sub8(add); else add8(add);
  f = (f & 0xfa) | carry | parity[a]; q = f;
}
function rlc(v) { v = ((v << 1) | (v >> 7)) & 255; f = (v & 1) | sz53p[v]; q = f; return v; }
function rrc(v) { f = v & 1; v = ((v >> 1) | (v << 7)) & 255; f |= sz53p[v]; q = f; return v; }
function rl(v) { const o = v; v = ((v << 1) | (f & 1)) & 255; f = (o >> 7) | sz53p[v]; q = f; return v; }
function rr(v) { const o = v; v = ((v >> 1) | (f << 7)) & 255; f = (o & 1) | sz53p[v]; q = f; return v; }
function sla(v) { f = v >> 7; v = (v << 1) & 255; f |= sz53p[v]; q = f; return v; }
function sra(v) { f = v & 1; v = (v & 0x80) | (v >> 1); f |= sz53p[v]; q = f; return v; }
function sll(v) { f = v >> 7; v = ((v << 1) | 1) & 255; f |= sz53p[v]; q = f; return v; }
function srl(v) { f = v & 1; v >>= 1; f |= sz53p[v]; q = f; return v; }
function bit(n, v) {
  f = (f & 1) | 0x10 | (v & 0x28);
  if (!(v & (1 << n))) f |= 0x44;
  if (n === 7 && (v & 0x80)) f |= 0x80;
  q = f;
}
function bitmp(n, v) {
  f = (f & 1) | 0x10 | ((wz >> 8) & 0x28);
  if (!(v & (1 << n))) f |= 0x44;
  if (n === 7 && (v & 0x80)) f |= 0x80;
  q = f;
}

// ---- execution ----
function step() {
  cn(pc, 4);
  const op = rdi(pc);
  pc = (pc + 1) & 65535; r = (r + 1) & 127;
  iff2Read = 0;
  lastQ = q; q = 0;
  exBase(op);
}

// Maskable interrupt, Fuse semantics (accepted only while INT is low, i.e.
// t < intLen, and not straight after EI).
function interrupt(intLen) {
  if (!iff1 || t >= intLen) return 0;
  if (iff2Read) f &= ~4;
  if (t === eiAt) { if (intChk > t + 1) intChk = t + 1; return 0; }
  if (halted) { pc = (pc + 1) & 65535; halted = 0; }
  iff1 = iff2 = 0;
  r = (r + 1) & 127;
  t += 7;
  push(pc);
  if (im === 2) {
    const v = (i << 8) | 0xff;
    const lo = rd(v), hi = rd((v + 1) & 65535);
    pc = lo | (hi << 8);
  } else pc = 0x38;
  wz = pc; q = 0;
  return 1;
}

function getRegs() {
  return { a, f, b, c, d, e, h, l, a_, f_, b_, c_, d_, e_, h_, l_, ix, iy, sp, pc, wz, i,
           r: (r7 & 0x80) | (r & 0x7f), iff1, iff2, im, halted, q, eiAt, intChk };
}
function setRegs(s) {
  ({ a, f, b, c, d, e, h, l, a_, f_, b_, c_, d_, e_, h_, l_, ix, iy, sp, pc, wz, i, iff1, iff2, im } = s);
  r = s.r & 127; r7 = s.r & 0x80;
  halted = s.halted || 0; q = s.q || 0; lastQ = 0; iff2Read = 0;
  eiAt = s.eiAt ?? -1; intChk = s.intChk ?? Infinity;
}
`;
