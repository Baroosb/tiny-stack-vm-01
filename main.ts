// A tiny stack VM for make.fun's tiny stack ISA: exact reference semantics. A run ends
// by throwing its exit code: HALT and EXIT throw theirs, a trap throws the trap's code.
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';

// Opcode facts, Q[op] = imm | pops<<3 | pushes<<5 (-1: no such opcode); imm is the
// immediate's byte length. Rows: "op:imm,pops,pushes" in hex. Binary ops share row 48.
const Q = new Int16Array(256).fill(-1);
for (const t of '0:000 1:101 2:401 3:010 4:012 5:022 6:023 7:033 17:011 1b:011 30:200 31:210 32:210 33:200 34:000 40:011 41:020 50:010 51:010 52:001 53:010'.split(' ')) { const [h, f] = t.split(':'); Q[parseInt(h, 16)] = +f[0] | +f[1] << 3 | +f[2] << 5; }
for (const o of [16,17,18,19,20,21,22,24,25,26,28,29,30,32,33,34]) Q[o] = 48;

function run(p, inp) {
const n = p.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), O = new Uint8Array(65536);
let sp = 0, cs = 0, ol = 0, ip = 0, pc = 0, st = 0;
try { for (;;) {
if (st === 1e6) throw 10; // step limit
if (pc < 0 || pc >= n) throw 9;
const op = p[pc], q = Q[op];
if (q < 0) throw 5; // unknown opcode
const im = q & 7;
if (pc + im >= n) throw 9;
st++;
const nx = pc + 1 + im, po = q >> 3 & 3;
if (sp < po) throw 2;
if (sp - po + (q >> 5) > 256) throw 3;
pc = nx;
switch (op) {
case 0: throw 0;
case 1: D[sp++] = p[nx-1] << 24 >> 24; break;
case 2: D[sp++] = p[nx-4] | p[nx-3] << 8 | p[nx-2] << 16 | p[nx-1] << 24; break;
case 3: sp--; break;
case 4: D[sp] = D[sp-1]; sp++; break;
case 5: { const t = D[sp-1]; D[sp-1] = D[sp-2]; D[sp-2] = t; break; }
case 6: D[sp] = D[sp-2]; sp++; break;
case 7: { const a = D[sp-3]; D[sp-3] = D[sp-2]; D[sp-2] = D[sp-1]; D[sp-1] = a; break; }
case 23: D[sp-1] = -D[sp-1] | 0; break;
case 27: D[sp-1] = ~D[sp-1]; break;
case 48: case 49: case 50: { const rel = (p[nx-2] | p[nx-1] << 8) << 16 >> 16; if (op === 48 || (D[--sp] === 0) === (op === 49)) pc = nx + rel; break; }
case 51: if (cs === 64) throw 7; C[cs++] = nx; pc = p[nx-2] | p[nx-1] << 8; break;
case 52: if (!cs) throw 8; pc = C[--cs]; break;
case 64: { const a = D[sp-1]; if (a < 0 || a > 255) throw 6; D[sp-1] = M[a]; break; }
case 65: { const a = D[sp-1]; if (a < 0 || a > 255) throw 6; M[a] = D[sp-2]; sp -= 2; break; }
case 80: { const s = '' + D[sp-1]; if (ol + s.length > 65536) throw 11; for (const c of s) O[ol++] = c.charCodeAt(0); sp--; break; }
case 81: if (ol > 65535) throw 11; O[ol++] = D[--sp] & 255; break;
case 82: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
case 83: throw D[--sp] & 255;
default: { const b = D[sp-1], a = D[sp-2]; let r;
switch (op) {
case 16: r = a + b | 0; break;
case 17: r = a - b | 0; break;
case 18: r = Math.imul(a, b); break; // MUL: exact low 32 bits
case 19: if (!b) throw 4; r = a === -2147483648 && b === -1 ? a : a / b | 0; break; // DIV
case 20: if (!b) throw 4; r = b === -1 ? 0 : a % b | 0; break; // MOD
case 21: if (!b) throw 4; r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break; // DIVU
case 22: if (!b) throw 4; r = (a >>> 0) % (b >>> 0) | 0; break; // MODU
case 24: r = a & b; break;
case 25: r = a | b; break;
case 26: r = a ^ b; break;
case 28: r = a << (b & 31); break;
case 29: r = a >> (b & 31); break;
case 30: r = a >>> (b & 31) | 0; break;
case 32: r = a === b ? 1 : 0; break;
case 33: r = a < b ? 1 : 0; break;
case 34: r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU
}
D[sp-2] = r; sp--; }
}
} } catch (e) { if (typeof e !== 'number') throw e; return {out: O.subarray(0, ol), code: e}; }
}

// Every instance dir under the input dir gets its answer dir under the output dir.
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input', O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
const r = run(readFileSync(`${I}/${id}/program.bin`), readFileSync(`${I}/${id}/input.bin`));
mkdirSync(`${O}/${id}`, {recursive: true});
writeFileSync(`${O}/${id}/stdout.bin`, r.out);
writeFileSync(`${O}/${id}/exit.txt`, r.code + '\n');
}
