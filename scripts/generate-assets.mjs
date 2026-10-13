// Vaelmor — gerador procedural de pixel art (placeholder).
// Gera todos os PNGs de public/assets e public/icons a partir de código,
// numa grade de 16×16 e com uma paleta única (PAL). Sem dependências:
// usa apenas zlib do Node para codificar PNG.
//
//   npm run assets
//
// Para trocar por arte final basta substituir os PNGs mantendo o layout
// (tamanho de frame e posição dos tiles) descrito em public/assets/README.md.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');

// ---------------------------------------------------------------- paleta
export const PAL = {
  outline: '#1e1a24',
  grass: ['#4f8f3a', '#5a9a3f', '#6aab48', '#3f7a31', '#7dbb54'],
  high: ['#6c8a4a', '#7a9852', '#5b7840', '#8ea862', '#4c6636'],
  forest: ['#3d6e30', '#355f2b', '#477a37', '#2c5124'],
  dirt: ['#a77b4f', '#946a42', '#b98c5c', '#7f5836'],
  sand: ['#d6c288', '#c8b277', '#e2d29c', '#b9a068'],
  rock: ['#9a9ca0', '#7f8287', '#64676d', '#4b4e55', '#b9bbbe', '#383a40'],
  cobble: ['#a59a8c', '#8c8276', '#bdb3a4', '#6e665c'],
  water: ['#3a78bd', '#2f64a3', '#4f92d6', '#8cc6ee', '#d9f1ff', '#255289'],
  wood: ['#8a5a32', '#6e4426', '#a8743f', '#4f2f1a'],
  oak: ['#3f8a3a', '#2f6e2e', '#58a548', '#77bf5a', '#22521f'],
  pine: ['#2d6343', '#204a33', '#3c7c55', '#4f9467', '#163626'],
  willow: ['#7aae4a', '#62953a', '#94c660', '#b0d97a', '#4b7a2c'],
  trunk: ['#6e4426', '#55331c', '#8a5a32'],
  skin: ['#f0c8a0', '#d6a27a'],
  hair: ['#6b3b1f', '#8f5530'],
  teal: ['#2f8a7e', '#226860', '#46a898'],
  cape: ['#b5483a', '#8e3229'],
  pants: ['#4a4a6a', '#383852'],
  boots: ['#3a2a20'],
  belt: ['#7a4a2a', '#d9b04a'],
  steel: ['#dfe6ee', '#9aa6b4'],
  bandit: ['#6e2f2f', '#4f2222', '#c0392b', '#3b3333', '#2a2424', '#8b7b6b'],
  slime: ['#6ad04a', '#3e9a34', '#a6ee7a', '#e8ffd8', '#2c6e26'],
  wolf: ['#8a8f99', '#6a6f79', '#c4c8cf', '#4c5059', '#e04040'],
  sheep: ['#f2f0e8', '#d8d4c6', '#3a3436', '#5a5254', '#ffffff'],
  deer: ['#b07a44', '#8a5a30', '#e8d0a8', '#5a3a20', '#d9c2a0'],
  bird: ['#2a2a3a', '#4a4a62', '#e0a040'],
  flowers: ['#e0484a', '#f2c94c', '#f4f1ea', '#6c8de0', '#c46ad6'],
  roofRed: ['#b5483a', '#8e3229', '#cf6a50'],
  roofBlue: ['#4a6ea8', '#36528a', '#6a8ec4'],
  roofSlate: ['#5a5f70', '#454958', '#727889'],
  roofThatch: ['#c8963c', '#a87a2c', '#deb05a'],
  plaster: ['#e6d7b3', '#c7b48c', '#f3e8cc'],
  stoneWall: ['#a3a3a0', '#858582', '#c0c0bc', '#6a6a68'],
  window: ['#2a3550', '#ffd36a', '#ffb347'],
  fire: ['#fff3b0', '#ffd34a', '#ff9a2a', '#e8512a', '#a8301e'],
  ui: ['#ffffff', '#e04848', '#7a1f2a', '#2a2234'],
};

// ---------------------------------------------------------------- utilidades
function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  set(x, y, c, a = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const [r, g, b] = hex(c);
    const i = (y * this.w + x) * 4;
    const sa = a;
    const da = this.d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    this.d[i] = (r * sa + this.d[i] * da * (1 - sa)) / oa;
    this.d[i + 1] = (g * sa + this.d[i + 1] * da * (1 - sa)) / oa;
    this.d[i + 2] = (b * sa + this.d[i + 2] * da * (1 - sa)) / oa;
    this.d[i + 3] = oa * 255;
  }
  put(x, y, r, g, b, a) {
    const i = (y * this.w + x) * 4;
    this.d[i] = r;
    this.d[i + 1] = g;
    this.d[i + 2] = b;
    this.d[i + 3] = a;
  }
  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  clear(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4);
  }
  rect(x, y, w, h, c, a = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }
  ellipse(cx, cy, rx, ry, c, a = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
  }
  line(x0, y0, x1, y1, c, a = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, a);
  }
  // contorno automático de 1px ao redor dos pixels opacos da região
  outline(x0, y0, w, h, c = PAL.outline) {
    const marks = [];
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (this.alpha(x, y) > 200) continue;
        const n = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ].some(([nx, ny]) => nx >= x0 && ny >= y0 && nx < x0 + w && ny < y0 + h && this.alpha(nx, ny) > 200);
        if (n) marks.push([x, y]);
      }
    for (const [x, y] of marks) {
      this.clear(x, y);
      this.set(x, y, c);
    }
  }
  // espelha horizontalmente uma região para outra
  mirror(sx, sy, w, h, dx, dy) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = ((sy + y) * this.w + sx + x) * 4;
        const j = ((dy + y) * this.w + dx + (w - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) this.d[j + k] = this.d[i + k];
      }
  }
  blit(src, sx, sy, w, h, dx, dy) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = ((sy + y) * src.w + sx + x) * 4;
        const j = ((dy + y) * this.w + dx + x) * 4;
        if (dx + x < 0 || dy + y < 0 || dx + x >= this.w || dy + y >= this.h) continue;
        for (let k = 0; k < 4; k++) this.d[j + k] = src.d[i + k];
      }
  }
  scaled(f) {
    const o = new Img(this.w * f, this.h * f);
    for (let y = 0; y < o.h; y++)
      for (let x = 0; x < o.w; x++) {
        const i = ((Math.floor(y / f) * this.w + Math.floor(x / f)) * 4);
        o.d.set(this.d.subarray(i, i + 4), (y * o.w + x) * 4);
      }
    return o;
  }
}

// ---------------------------------------------------------------- PNG
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(img) {
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 4 + 1)] = 0;
    Buffer.from(img.d.buffer, y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const written = [];
function save(rel, img) {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, png(img));
  written.push(`${rel} (${img.w}×${img.h})`);
}

// ================================================================ TILESET
// Layout (16 colunas × 8 linhas de tiles 16×16, exportado com margin 1 e
// spacing 2 — "extrudado" — para evitar costuras com zoom fracionado).
// Os índices precisam bater com src/systems/Tiles.ts.
const T = 16;
const COLS = 16;
const ROWS = 8;
const tiles = new Img(COLS * T, ROWS * T);
const at = (id) => [(id % COLS) * T, Math.floor(id / COLS) * T];

function noiseTile(id, colors, weights, seed, extra) {
  const r = rng(seed);
  const [ox, oy] = at(id);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let v = r();
      let k = 0;
      while (k < weights.length - 1 && v > weights[k]) {
        v -= weights[k];
        k++;
      }
      tiles.set(ox + x, oy + y, colors[k]);
    }
  if (extra) extra(ox, oy, r);
}
function tufts(ox, oy, r, n, c1, c2) {
  // coordenadas dentro do tile (com wrap) para não vazar para o vizinho
  const w = (v, o) => o + (((v - o) % T) + T) % T;
  for (let i = 0; i < n; i++) {
    const x = ox + 1 + Math.floor(r() * 14);
    const y = oy + 2 + Math.floor(r() * 13);
    tiles.set(x, y, c1);
    tiles.set(x, y - 1, c1);
    tiles.set(w(x + 1, ox), y, c2);
  }
}

// chão
const G = PAL.grass;
noiseTile(0, [G[1], G[0], G[2]], [0.62, 0.22, 0.16], 11, (ox, oy, r) => tufts(ox, oy, r, 3, G[3], G[2]));
noiseTile(1, [G[1], G[0], G[2]], [0.55, 0.3, 0.15], 12, (ox, oy, r) => tufts(ox, oy, r, 2, G[2], G[4]));
noiseTile(2, [G[1], G[2], G[0]], [0.6, 0.25, 0.15], 13, (ox, oy, r) => {
  tufts(ox, oy, r, 4, G[3], G[4]);
});
const H = PAL.high;
noiseTile(3, [H[0], H[1], H[2]], [0.6, 0.22, 0.18], 21, (ox, oy, r) => tufts(ox, oy, r, 2, H[4], H[3]));
noiseTile(4, [H[0], H[2], H[1]], [0.55, 0.28, 0.17], 22, (ox, oy, r) => tufts(ox, oy, r, 3, H[4], H[1]));
noiseTile(5, [H[0], H[1], PAL.rock[1]], [0.64, 0.24, 0.12], 23, (ox, oy, r) => {
  for (let i = 0; i < 2; i++) {
    const x = ox + 2 + Math.floor(r() * 11);
    const y = oy + 2 + Math.floor(r() * 11);
    tiles.rect(x, y, 2, 2, PAL.rock[0]);
    tiles.set(x, y, PAL.rock[4]);
  }
});
const D = PAL.dirt;
noiseTile(6, [D[0], D[1], D[2], D[3]], [0.55, 0.25, 0.14, 0.06], 31);
const S = PAL.sand;
noiseTile(7, [S[0], S[1], S[2], S[3]], [0.6, 0.22, 0.13, 0.05], 41);
const RK = PAL.rock;
noiseTile(8, [RK[1], RK[0], RK[2]], [0.5, 0.3, 0.2], 51, (ox, oy, r) => {
  for (let i = 0; i < 3; i++) tiles.set(ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), RK[4]);
});
// calçamento
{
  const [ox, oy] = at(9);
  const C = PAL.cobble;
  tiles.rect(ox, oy, T, T, C[3]);
  const r = rng(61);
  const stones = [
    [0, 0, 7, 5], [8, 0, 8, 5], [0, 6, 5, 4], [6, 6, 6, 4], [13, 6, 3, 4],
    [0, 11, 8, 5], [9, 11, 7, 5],
  ];
  for (const [x, y, w, h] of stones) {
    tiles.rect(ox + x, oy + y, w - 1, h - 1, r() > 0.5 ? C[0] : C[1]);
    tiles.rect(ox + x, oy + y, w - 1, 1, C[2]);
  }
}
// ponte (tábuas verticais, atravessa rio N-S de leste a oeste)
{
  const [ox, oy] = at(10);
  const W = PAL.wood;
  for (let x = 0; x < T; x++) {
    const plank = Math.floor(x / 4);
    tiles.rect(ox + x, oy + 1, 1, 14, plank % 2 ? W[0] : W[2]);
    if (x % 4 === 3) tiles.rect(ox + x, oy + 1, 1, 14, W[1]);
  }
  tiles.rect(ox, oy, T, 1, W[3]);
  tiles.rect(ox, oy + 15, T, 1, W[3]);
  for (let x = 1; x < T; x += 4) {
    tiles.set(ox + x, oy + 3, W[3]);
    tiles.set(ox + x, oy + 12, W[3]);
  }
}
// escadaria de pedra (passagem no penhasco)
{
  const [ox, oy] = at(11);
  for (let s = 0; s < 4; s++) {
    tiles.rect(ox, oy + s * 4, T, 3, RK[0]);
    tiles.rect(ox, oy + s * 4, T, 1, RK[4]);
    tiles.rect(ox, oy + s * 4 + 3, T, 1, RK[3]);
  }
  tiles.rect(ox, oy, 1, T, RK[3]);
  tiles.rect(ox + 15, oy, 1, T, RK[3]);
}
// chão de floresta
const F = PAL.forest;
noiseTile(12, [F[0], F[1], F[2], F[3]], [0.5, 0.25, 0.15, 0.1], 71, (ox, oy, r) => {
  for (let i = 0; i < 2; i++) tiles.set(ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), D[1]);
});
// rampa de terra (passagem oeste)
noiseTile(13, [D[1], D[0], D[3], RK[1]], [0.45, 0.3, 0.15, 0.1], 81, (ox, oy) => {
  for (let y = 2; y < T; y += 5) tiles.rect(ox + 1, oy + y, 14, 1, D[3]);
});

// água: 4 frames, o padrão de ondas desce 4px por frame (fluxo N→S)
const WA = PAL.water;
const waves = (() => {
  const r = rng(91);
  const a = [];
  for (let i = 0; i < 7; i++) a.push([Math.floor(r() * 16), Math.floor(r() * 16), 2 + Math.floor(r() * 4), r() > 0.6]);
  return a;
})();
for (let f = 0; f < 4; f++) {
  const [ox, oy] = at(16 + f);
  tiles.rect(ox, oy, T, T, WA[0]);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x * 7 + y * 13) % 17 === 0) tiles.set(ox + x, oy + y, WA[1]);
  for (const [wx, wy, len, bright] of waves) {
    const y = (wy + f * 4) % 16;
    for (let i = 0; i < len; i++) tiles.set(ox + ((wx + i) % 16), oy + y, bright ? WA[3] : WA[2]);
    tiles.set(ox + ((wx + len) % 16), oy + ((y + 1) % 16), WA[5]);
  }
}
// cachoeira: listras verticais rápidas
for (let f = 0; f < 4; f++) {
  const [ox, oy] = at(20 + f);
  const r = rng(101);
  for (let x = 0; x < T; x++) {
    const base = x % 3 === 0 ? WA[2] : x % 3 === 1 ? WA[0] : WA[3];
    tiles.rect(ox + x, oy, 1, T, base);
    const off = Math.floor(r() * 16);
    const len = 3 + Math.floor(r() * 5);
    for (let i = 0; i < len; i++) tiles.set(ox + x, oy + ((off + f * 4 + i) % 16), i === 0 ? WA[4] : WA[3]);
  }
}
// espuma (base da cachoeira) — elipses desenhadas com wrap para o tile ser contínuo
for (let f = 0; f < 4; f++) {
  const [ox, oy] = at(24 + f);
  const r = rng(111 + f);
  const tmp = new Img(T * 3, T * 3);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * 16);
    const y = Math.floor(r() * 16);
    const rx = 1.5 + r() * 2;
    const ry = 1 + r() * 1.5;
    const c = r() > 0.4 ? WA[4] : WA[3];
    for (const dx of [0, 16, 32]) for (const dy of [0, 16, 32]) tmp.ellipse(x + dx, y + dy, rx, ry, c);
  }
  tiles.rect(ox, oy, T, T, WA[2]);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const i = ((y + T) * tmp.w + x + T) * 4;
      if (tmp.d[i + 3]) tiles.put(ox + x, oy + y, tmp.d[i], tmp.d[i + 1], tmp.d[i + 2], 255);
    }
}
// borda superior da queda (água que despenca)
for (let f = 0; f < 4; f++) {
  const [ox, oy] = at(28 + f);
  tiles.blit(tiles, ...at(16 + f), T, T, ox, oy);
  tiles.rect(ox, oy + 12, T, 4, WA[3]);
  for (let x = 0; x < T; x++) if ((x + f) % 3 === 0) tiles.set(ox + x, oy + 13, WA[4]);
  tiles.rect(ox, oy + 15, T, 1, WA[4]);
}

// penhascos
{
  // borda (topo do penhasco)
  const [ox, oy] = at(32);
  noiseTile(32, [H[0], H[1], H[2]], [0.6, 0.25, 0.15], 121);
  tiles.rect(ox, oy + 9, T, 7, RK[0]);
  tiles.rect(ox, oy + 9, T, 1, RK[4]);
  tiles.rect(ox, oy + 8, T, 1, H[4]);
  for (let x = 0; x < T; x += 5) tiles.rect(ox + x, oy + 11, 1, 5, RK[2]);
  // face
  const [fx, fy] = at(33);
  tiles.rect(fx, fy, T, T, RK[1]);
  for (let y = 0; y < T; y += 5) tiles.rect(fx, fy + y, T, 1, RK[2]);
  const r = rng(131);
  for (let i = 0; i < 6; i++) {
    const x = fx + Math.floor(r() * 15);
    const y = fy + Math.floor(r() * 14);
    tiles.rect(x, y, 2, 1, RK[0]);
    tiles.set(x, y + 1, RK[3]);
  }
  // base com sombra
  const [bx, by] = at(34);
  tiles.rect(bx, by, T, T, RK[2]);
  for (let y = 0; y < 10; y += 5) tiles.rect(bx, by + y, T, 1, RK[3]);
  tiles.rect(bx, by + 11, T, 5, RK[3]);
  tiles.rect(bx, by + 14, T, 2, RK[5]);
  for (let x = 0; x < T; x += 3) tiles.set(bx + x, by + 13, G[3]);
  // face alternativa com fenda e musgo
  const [ax, ay] = at(35);
  tiles.blit(tiles, fx, fy, T, T, ax, ay);
  tiles.line(ax + 6, ay, ax + 9, ay + 15, RK[3]);
  tiles.rect(ax + 1, ay + 2, 3, 2, F[0]);
  tiles.rect(ax + 11, ay + 9, 3, 2, F[2]);
}

// decoração (fundo transparente)
function flower(id, c, seed) {
  const [ox, oy] = at(id);
  const r = rng(seed);
  for (let i = 0; i < 3; i++) {
    const x = ox + 3 + Math.floor(r() * 10);
    const y = oy + 4 + Math.floor(r() * 9);
    tiles.set(x, y + 1, G[3]);
    tiles.set(x, y + 2, G[3]);
    tiles.set(x - 1, y, c);
    tiles.set(x + 1, y, c);
    tiles.set(x, y - 1, c);
    tiles.set(x, y + 1 - 1 + 0, PAL.flowers[1] === c ? PAL.flowers[0] : PAL.flowers[1]);
  }
}
flower(48, PAL.flowers[0], 141);
flower(49, PAL.flowers[1], 142);
flower(50, PAL.flowers[2], 143);
flower(51, PAL.flowers[3], 144);
function bush(id, berries) {
  const [ox, oy] = at(id);
  tiles.ellipse(ox + 8, oy + 13.5, 6, 2, '#000000', 0.25);
  tiles.ellipse(ox + 8, oy + 9, 6.5, 5, PAL.oak[1]);
  tiles.ellipse(ox + 7, oy + 8, 5, 4, PAL.oak[0]);
  tiles.ellipse(ox + 6, oy + 7, 2.5, 2, PAL.oak[2]);
  if (berries) for (const [x, y] of [[5, 9], [9, 7], [11, 10], [7, 11]]) tiles.set(ox + x, oy + y, PAL.flowers[0]);
  tiles.outline(ox, oy, T, T);
}
bush(52, false);
bush(53, true);
{
  const [ox, oy] = at(54); // pedra
  tiles.ellipse(ox + 8, oy + 12, 6, 2, '#000000', 0.25);
  tiles.ellipse(ox + 8, oy + 10, 5, 3.5, RK[1]);
  tiles.ellipse(ox + 7, oy + 9, 3, 2, RK[0]);
  tiles.set(ox + 6, oy + 8, RK[4]);
  tiles.outline(ox, oy, T, T);
}
{
  const [ox, oy] = at(55); // capim alto
  const r = rng(151);
  for (let i = 0; i < 7; i++) {
    const x = ox + 2 + Math.floor(r() * 12);
    const h = 3 + Math.floor(r() * 5);
    tiles.line(x, oy + 14, x + (r() > 0.5 ? 1 : -1), oy + 14 - h, i % 2 ? G[2] : G[4]);
  }
}
{
  const [ox, oy] = at(56); // cogumelos
  for (const [x, y] of [[5, 10], [10, 12]]) {
    tiles.rect(ox + x, oy + y, 2, 3, PAL.sheep[0]);
    tiles.ellipse(ox + x + 1, oy + y - 0.5, 3, 2, PAL.flowers[0]);
    tiles.set(ox + x, oy + y - 1, PAL.sheep[4]);
  }
  tiles.outline(ox, oy, T, T);
}
{
  const [ox, oy] = at(57); // juncos
  for (const x of [3, 6, 8, 11, 13]) {
    tiles.line(ox + x, oy + 15, ox + x, oy + 5 + (x % 3), PAL.willow[1]);
    tiles.rect(ox + x, oy + 4 + (x % 3), 1, 3, PAL.wood[0]);
  }
}
{
  const W = PAL.wood;
  // cerca horizontal
  const [hx, hy] = at(58);
  tiles.rect(hx, hy + 6, T, 2, W[2]);
  tiles.rect(hx, hy + 10, T, 2, W[0]);
  tiles.rect(hx + 2, hy + 4, 3, 10, W[0]);
  tiles.rect(hx + 11, hy + 4, 3, 10, W[0]);
  tiles.rect(hx + 2, hy + 4, 3, 1, W[2]);
  tiles.rect(hx + 11, hy + 4, 3, 1, W[2]);
  tiles.outline(hx, hy, T, T);
  // cerca vertical
  const [vx, vy] = at(59);
  tiles.rect(vx + 6, vy, 3, T, W[0]);
  tiles.rect(vx + 6, vy, 1, T, W[2]);
  tiles.rect(vx + 5, vy + 3, 5, 3, W[1]);
  tiles.rect(vx + 5, vy + 11, 5, 3, W[1]);
  tiles.outline(vx, vy, T, T);
  // poste
  const [px, py] = at(60);
  tiles.rect(px + 6, py + 3, 4, 11, W[0]);
  tiles.rect(px + 6, py + 3, 4, 1, W[2]);
  tiles.outline(px, py, T, T);
  // toco
  const [sx, sy] = at(61);
  tiles.ellipse(sx + 8, sy + 12, 6, 2, '#000000', 0.25);
  tiles.rect(sx + 4, sy + 7, 8, 5, W[0]);
  tiles.ellipse(sx + 8, sy + 7, 4, 1.5, W[2]);
  tiles.outline(sx, sy, T, T);
  // placa
  const [gx, gy] = at(63);
  tiles.rect(gx + 7, gy + 8, 2, 7, W[1]);
  tiles.rect(gx + 3, gy + 3, 10, 6, W[2]);
  tiles.rect(gx + 5, gy + 5, 6, 1, W[3]);
  tiles.rect(gx + 5, gy + 7, 4, 1, W[3]);
  tiles.outline(gx, gy, T, T);
}
{
  const [ox, oy] = at(62); // vitória-régia (sobre água)
  tiles.ellipse(ox + 6, oy + 7, 3.5, 2.5, PAL.willow[1]);
  tiles.ellipse(ox + 11, oy + 11, 2.5, 2, PAL.willow[0]);
  tiles.set(ox + 6, oy + 6, PAL.flowers[4]);
}

// árvores: copa 3×2 tiles (camada acima das entidades) + tronco 1 tile (colisão)
function canopy(col0, draw) {
  const img = new Img(48, 32);
  draw(img);
  img.outline(0, 0, 48, 32);
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 3; i++) tiles.blit(img, i * 16, j * 16, 16, 16, ...at(64 + j * 16 + col0 + i));
}
function leafy(img, cx, cy, rx, ry, P, seed) {
  const r = rng(seed);
  img.ellipse(cx, cy, rx, ry, P[1]);
  img.ellipse(cx - 1, cy - 1.5, rx - 1.5, ry - 1.5, P[0]);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 0.8;
    const x = cx + Math.cos(a) * rx * d;
    const y = cy + Math.sin(a) * ry * d;
    img.ellipse(x, y, 1.6, 1.2, y < cy ? P[2] : P[1]);
  }
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * (1.1 + r() * 0.8);
    const d = 0.3 + r() * 0.5;
    img.set(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, P[3]);
  }
}
canopy(0, (img) => {
  // carvalho
  leafy(img, 24, 17, 20, 14, PAL.oak, 201);
  leafy(img, 15, 14, 9, 8, PAL.oak, 202);
  leafy(img, 32, 13, 10, 9, PAL.oak, 203);
  leafy(img, 24, 10, 10, 8, PAL.oak, 204);
});
canopy(3, (img) => {
  // pinheiro: camadas triangulares
  const P = PAL.pine;
  for (let l = 0; l < 4; l++) {
    const top = 1 + l * 7;
    const half = 5 + l * 3.2;
    for (let y = 0; y < 10; y++) {
      const w = Math.round((half * (y + 1)) / 10);
      for (let x = -w; x <= w; x++) img.set(24 + x, top + y, x < -w / 3 ? P[2] : x > w / 2 ? P[1] : P[0]);
    }
    img.line(24 - half + 1, top + 9, 24 - 1, top + 6, P[3]);
  }
});
canopy(6, (img) => {
  // salgueiro: copa arredondada com ramos caídos
  const P = PAL.willow;
  leafy(img, 24, 11, 19, 10, P, 221);
  const r = rng(222);
  for (let x = 7; x <= 41; x += 2) {
    const len = 8 + Math.floor(r() * 10);
    for (let y = 0; y < len; y++) img.set(x + (y > len / 2 ? 0 : 0), 13 + y, y % 3 === 0 ? P[2] : P[1]);
  }
});
function trunk(id, P, pineSkirt) {
  const [ox, oy] = at(id);
  const img = new Img(16, 16);
  img.ellipse(8, 13, 7, 2.5, '#000000', 0.3);
  img.rect(6, 0, 4, 13, P[0]);
  img.rect(6, 0, 1, 13, P[2]);
  img.rect(9, 0, 1, 13, P[1]);
  img.rect(5, 11, 6, 2, P[0]);
  img.set(4, 12, P[1]);
  img.set(11, 12, P[1]);
  if (pineSkirt) {
    for (let y = 0; y < 4; y++) {
      const w = 8 - y;
      for (let x = -w; x <= w; x++) img.set(8 + x, y, PAL.pine[1]);
    }
  }
  img.outline(0, 0, 16, 16);
  tiles.blit(img, 0, 0, 16, 16, ox, oy);
}
trunk(96, PAL.trunk, false);
trunk(97, ['#5a3a22', '#40281a', '#7a5032'], true);
trunk(98, ['#7a6a52', '#5a4c3a', '#9a8a70'], false);
// marcador de colisão (não renderizado)
tiles.rect(...at(112), T, T, '#ff00ff', 0.5);

// exporta extrudado (margin 1, spacing 2)
function extrude(src, cols, rows) {
  const E = new Img(cols * (T + 2), rows * (T + 2));
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const sx = i * T;
      const sy = j * T;
      const dx = i * (T + 2) + 1;
      const dy = j * (T + 2) + 1;
      for (let y = -1; y <= T; y++)
        for (let x = -1; x <= T; x++) {
          const cx = Math.min(T - 1, Math.max(0, x));
          const cy = Math.min(T - 1, Math.max(0, y));
          const k = ((sy + cy) * src.w + sx + cx) * 4;
          E.d.set(src.d.subarray(k, k + 4), ((dy + y) * E.w + dx + x) * 4);
        }
    }
  return E;
}
save('assets/tilesets/vaelmor-tiles.png', extrude(tiles, COLS, ROWS));
save('assets/tilesets/vaelmor-tiles-preview.png', tiles);

// ================================================================ PERSONAGENS
// humanoide 16×16 desenhado por primitivas + contorno automático
// dir: 0 baixo, 1 esquerda, 2 direita, 3 cima | pose: idle, stepA, stepB, attack
function humanoid(img, ox, oy, dir, pose, c) {
  const R = (x, y, w, h, col) => img.rect(ox + x, oy + y, w, h, col);
  const P = (x, y, col) => img.set(ox + x, oy + y, col);
  const side = dir === 1 || dir === 2;
  const a = pose === 'stepA';
  const b = pose === 'stepB';
  const atk = pose === 'attack';
  // pernas
  if (!side) {
    R(6, 12, 2, a ? 2 : 3, c.pants);
    R(8, 12, 2, b ? 2 : 3, c.pants);
    R(6, a ? 13 : 14, 2, 1, c.boots);
    R(8, b ? 13 : 14, 2, 1, c.boots);
  } else {
    if (a || b) {
      R(5, 12, 2, 2, c.pants);
      R(9, 12, 2, 2, c.pants);
      R(4, 14, 3, 1, c.boots);
      R(9, 14, 3, 1, c.boots);
    } else {
      R(7, 12, 3, 2, c.pants);
      R(6, 14, 4, 1, c.boots);
    }
  }
  // capa (costas)
  if (c.cape && dir === 3) R(5, 8, 6, 5, c.cape);
  if (c.cape && side) R(dir === 1 ? 9 : 5, 8, 2, 5, c.cape);
  // tronco
  R(5, 8, 6, 4, c.body);
  R(side ? (dir === 1 ? 5 : 10) : 10, 8, 1, 4, c.bodyDark);
  R(5, 11, 6, 1, c.belt);
  if (c.buckle && dir === 0) P(8, 11, c.buckle);
  if (c.cape && dir === 0) {
    P(5, 8, c.cape);
    P(10, 8, c.cape);
  }
  // braços
  if (!side) {
    const swingL = a ? 1 : 0;
    const swingR = b ? 1 : 0;
    R(4, 8 + swingL, 1, 3, c.body);
    P(4, 11 + swingL, c.skin);
    if (atk) {
      R(11, 8, 1, 2, c.body);
      P(11, 10, c.skin);
      if (dir === 0) {
        R(11, 11, 1, 4, c.blade);
        P(10, 11, c.hilt);
        P(12, 11, c.hilt);
      } else {
        R(11, 4, 1, 4, c.blade);
        P(10, 8, c.hilt);
        P(12, 8, c.hilt);
      }
    } else {
      R(11, 8 + swingR, 1, 3, c.body);
      P(11, 11 + swingR, c.skin);
    }
  } else {
    const fx = dir === 1 ? -1 : 1;
    if (atk) {
      const ax = dir === 1 ? 3 : 11;
      R(ax, 9, 2, 1, c.body);
      P(dir === 1 ? 2 : 13, 9, c.skin);
      R(dir === 1 ? 0 : 14, 9, 2, 1, c.blade);
      P(dir === 1 ? 2 : 13, 8, c.hilt);
      P(dir === 1 ? 2 : 13, 10, c.hilt);
    } else {
      const sw = a ? fx : b ? -fx : 0;
      R(7 + sw, 9, 2, 2, c.bodyDark);
      P(7 + sw + (dir === 1 ? 0 : 1), 11, c.skin);
    }
  }
  // cabeça
  R(5, 2, 6, 6, c.skin);
  R(5, 7, 6, 1, c.skinDark);
  if (dir === 0) {
    R(5, 1, 6, 2, c.hair);
    R(4, 2, 1, 4, c.hair);
    R(11, 2, 1, 4, c.hair);
    R(5, 3, 2, 1, c.hair);
    R(9, 3, 2, 1, c.hair);
    P(6, 1, c.hairLight);
    P(6, 5, c.eye);
    P(9, 5, c.eye);
    if (c.mask) R(5, 6, 6, 2, c.mask);
  } else if (dir === 3) {
    R(4, 1, 8, 6, c.hair);
    R(5, 1, 3, 1, c.hairLight);
    if (c.mask) R(4, 6, 8, 1, c.mask);
  } else {
    // perfil desenhado olhando para a esquerda; direita é espelhada depois
    R(5, 1, 6, 2, c.hair);
    R(8, 2, 4, 5, c.hair);
    P(6, 1, c.hairLight);
    P(6, 5, c.eye);
    P(4, 5, c.skin);
    if (c.mask) R(4, 6, 4, 2, c.mask);
  }
  if (c.hood) {
    if (dir === 0) {
      R(4, 0, 8, 3, c.hood);
      R(4, 3, 1, 4, c.hood);
      R(11, 3, 1, 4, c.hood);
    } else if (dir === 3) R(4, 0, 8, 8, c.hood);
    else {
      R(5, 0, 7, 3, c.hood);
      R(9, 3, 3, 5, c.hood);
    }
  }
}
function shadow(img, ox, oy, rx = 4.5) {
  img.ellipse(ox + 8, oy + 14.6, rx, 1.6, '#000000', 0.32);
}
function sheetHumanoid(file, c, withRoll) {
  const cols = withRoll ? 5 : 4;
  const img = new Img(cols * 16, 4 * 16);
  const poses = ['idle', 'stepA', 'stepB', 'attack'];
  for (let d = 0; d < 4; d++)
    for (let p = 0; p < 4; p++) {
      const ox = p * 16;
      const oy = d * 16;
      if (d === 2) continue;
      const tmp = new Img(16, 16);
      humanoid(tmp, 0, 0, d, poses[p], c);
      tmp.outline(0, 0, 16, 16);
      const sh = new Img(16, 16);
      shadow(sh, 0, 0);
      img.blit(sh, 0, 0, 16, 16, ox, oy);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const i = (y * 16 + x) * 4;
          if (tmp.d[i + 3] > 0) img.d.set(tmp.d.subarray(i, i + 4), ((oy + y) * img.w + ox + x) * 4);
        }
    }
  // direita = esquerda espelhada
  for (let p = 0; p < 4; p++) img.mirror(p * 16, 16, 16, 16, p * 16, 32);
  if (withRoll) {
    // rolagem: bola girando (4 frames) na coluna 4
    for (let f = 0; f < 4; f++) {
      const ox = 64;
      const oy = f * 16;
      shadow(img, ox, oy, 5);
      const tmp = new Img(16, 16);
      tmp.ellipse(8, 9.5, 5, 4.5, c.body);
      tmp.ellipse(8.5, 10, 3.5, 3, c.bodyDark);
      const ang = (f / 4) * Math.PI * 2;
      tmp.ellipse(8 + Math.cos(ang) * 2.5, 9.5 + Math.sin(ang) * 2.2, 2.2, 2.2, c.hair);
      tmp.ellipse(8 - Math.cos(ang) * 2.5, 9.5 - Math.sin(ang) * 2.2, 1.5, 1.5, c.cape || c.boots);
      tmp.outline(0, 0, 16, 16);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const i = (y * 16 + x) * 4;
          if (tmp.d[i + 3] > 0) img.d.set(tmp.d.subarray(i, i + 4), ((oy + y) * img.w + ox + x) * 4);
        }
    }
  }
  save(file, img);
}
sheetHumanoid(
  'assets/sprites/teren.png',
  {
    skin: PAL.skin[0], skinDark: PAL.skin[1], hair: PAL.hair[0], hairLight: PAL.hair[1], eye: PAL.outline,
    body: PAL.teal[0], bodyDark: PAL.teal[1], belt: PAL.belt[0], buckle: PAL.belt[1], pants: PAL.pants[0],
    boots: PAL.boots[0], cape: PAL.cape[0], blade: PAL.steel[0], hilt: PAL.belt[1],
  },
  true,
);
sheetHumanoid('assets/sprites/bandit.png', {
  skin: '#d9a37c', skinDark: '#b8835e', hair: PAL.bandit[4], hairLight: PAL.bandit[3], eye: PAL.outline,
  body: PAL.bandit[0], bodyDark: PAL.bandit[1], belt: PAL.bandit[5], pants: PAL.bandit[3], boots: PAL.bandit[4],
  mask: PAL.bandit[2], hood: PAL.bandit[3], blade: PAL.steel[1], hilt: PAL.wood[1],
});

// limo: 4 frames (pulo) + 1 frame de dano
{
  const img = new Img(5 * 16, 16);
  const sq = [
    [6, 4.5, 11],
    [6.8, 3.8, 11.7],
    [5.2, 5.4, 9.5],
    [5, 5.8, 8],
    [6.5, 4.2, 11],
  ];
  sq.forEach(([rx, ry, cy], f) => {
    const ox = f * 16;
    img.ellipse(ox + 8, 14.5, f === 3 ? 4 : 6, 1.5, '#000000', 0.3);
    const tmp = new Img(16, 16);
    const P = PAL.slime;
    tmp.ellipse(8, cy, rx, ry, P[1]);
    tmp.ellipse(7.5, cy - 0.8, rx - 1.2, ry - 1.2, P[0]);
    tmp.ellipse(6, cy - ry / 2, 1.6, 1.1, P[2]);
    tmp.set(5, cy - ry / 2 - 0.5, P[3]);
    tmp.set(6, cy, PAL.outline);
    tmp.set(10, cy, PAL.outline);
    tmp.set(6, cy - 1, P[3]);
    tmp.set(10, cy - 1, P[3]);
    tmp.outline(0, 0, 16, 16, P[4]);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        if (tmp.d[i + 3] > 0) img.d.set(tmp.d.subarray(i, i + 4), (y * img.w + ox + x) * 4);
      }
  });
  save('assets/sprites/slime.png', img);
}

// quadrúpedes (vista lateral, olhando para a esquerda; o jogo espelha)
function composite(img, tmp, ox, oy) {
  for (let y = 0; y < tmp.h; y++)
    for (let x = 0; x < tmp.w; x++) {
      const i = (y * tmp.w + x) * 4;
      if (tmp.d[i + 3] > 0) img.d.set(tmp.d.subarray(i, i + 4), ((oy + y) * img.w + ox + x) * 4);
    }
}
function quad(file, frames, draw, sw = 4.5) {
  const img = new Img(frames * 16, 16);
  for (let f = 0; f < frames; f++) {
    img.ellipse(f * 16 + 8, 14.6, sw, 1.5, '#000000', 0.3);
    const tmp = new Img(16, 16);
    draw(tmp, f);
    tmp.outline(0, 0, 16, 16);
    composite(img, tmp, f * 16, 0);
  }
  save(file, img);
}
// lobo: 0-1 andar, 2 agachado (preparo), 3 investida, 4 dano
quad('assets/sprites/wolf.png', 5, (t, f) => {
  const P = PAL.wolf;
  const crouch = f === 2;
  const lunge = f === 3;
  const by = crouch ? 9 : lunge ? 7 : 8;
  // pernas
  const legs = f === 1 ? [[3, 1], [6, -1], [10, 1], [12, -1]] : lunge ? [[1, 2], [4, 2], [11, -2], [13, -2]] : [[3, 0], [5, 0], [10, 0], [12, 0]];
  for (const [x, s] of legs) t.rect(x + (s > 0 ? 0 : 0), by + 3, 1, crouch ? 2 : 4, P[1]);
  // corpo
  t.ellipse(8.5, by + 1.5, lunge ? 6.5 : 5.5, crouch ? 2.2 : 2.6, P[0]);
  t.rect(5, by + 2, 7, 1, P[2]);
  // rabo
  t.line(13, by, 15, by - 2 + (crouch ? 2 : 0), P[1]);
  // cabeça
  const hx = lunge ? 1 : 3;
  const hy = crouch ? by : by - 3;
  t.ellipse(hx + 1.5, hy + 1.5, 2.5, 2, P[0]);
  t.rect(hx - 1, hy + 2, 2, 1, P[2]);
  t.set(hx + 2, hy - 1, P[1]);
  t.set(hx + 3, hy - 1, P[1]);
  t.set(hx + 1, hy + 1, crouch || lunge ? P[4] : PAL.outline);
}, 5.5);
// ovelha: 0-1 andar, 2 pastando
quad('assets/sprites/sheep.png', 3, (t, f) => {
  const P = PAL.sheep;
  const legs = f === 1 ? [4, 6, 10, 12] : [4, 5, 11, 12];
  legs.forEach((x, i) => t.rect(x, 11, 1, 3 - (f === 1 && i % 2 ? 1 : 0), P[2]));
  t.ellipse(8.5, 9, 5.5, 3.6, P[1]);
  for (const [x, y] of [[5, 6.5], [8, 6], [11, 6.5], [6.5, 9], [10, 9]]) t.ellipse(x, y, 2, 1.8, P[0]);
  const hy = f === 2 ? 10 : 7;
  t.ellipse(3, hy, 2, 1.8, P[2]);
  t.set(2, hy - 1, P[3]);
  t.set(4, hy - 2, P[0]);
  t.set(2, hy, P[4]);
}, 5);
// cervo: 0-1 andar, 2 alerta, 3 correndo
quad('assets/sprites/deer.png', 4, (t, f) => {
  const P = PAL.deer;
  const run = f === 3;
  const legs = f === 1 ? [[4, 1], [6, -1], [10, 1], [12, -1]] : run ? [[2, 2], [5, 2], [11, -2], [13, -1]] : [[4, 0], [5, 0], [11, 0], [12, 0]];
  for (const [x, s] of legs) t.line(x, 9, x + Math.sign(s), 13, P[1]);
  t.ellipse(8.5, 8, 5, 2.6, P[0]);
  t.rect(6, 9, 5, 1, P[4]);
  t.rect(13, 6, 2, 2, P[2]);
  const hx = run ? 2 : 3;
  const hy = f === 2 ? 1 : 2;
  t.line(hx + 2, hy + 3, hx + 3, 7, P[0]);
  t.line(hx + 3, hy + 3, hx + 4, 7, P[0]);
  t.ellipse(hx + 1.5, hy + 2.5, 2, 1.5, P[0]);
  t.set(hx, hy + 3, P[3]);
  t.set(hx + 1, hy + 2, PAL.outline);
  t.line(hx + 2, hy + 1, hx + 1, hy - 1, P[3]);
  t.line(hx + 3, hy + 1, hx + 4, hy - 1, P[3]);
});
// pássaro (visto de cima, olhando para a direita): 3 frames de bater asas
{
  const img = new Img(3 * 16, 16);
  const P = PAL.bird;
  [[-4], [0], [3]].forEach(([wing], f) => {
    const tmp = new Img(16, 16);
    tmp.ellipse(8, 8, 3.5, 1.5, P[0]);
    tmp.rect(11, 7, 2, 2, P[0]);
    tmp.set(13, 8, P[2]);
    tmp.rect(3, 7, 2, 2, P[1]);
    tmp.line(8, 7, 6 + wing / 2, 7 + wing - 3, P[1]);
    tmp.line(9, 7, 7 + wing / 2, 7 + wing - 3, P[0]);
    tmp.line(8, 9, 6 + wing / 2, 9 - wing + 3, P[1]);
    tmp.line(9, 9, 7 + wing / 2, 9 - wing + 3, P[0]);
    composite(img, tmp, f * 16, 0);
  });
  save('assets/sprites/bird.png', img);
}

// ================================================================ EFEITOS
// golpe em arco (32×32, 3 frames, apontando para a direita)
{
  const img = new Img(96, 32);
  for (let f = 0; f < 3; f++) {
    const span = [0.9, 1.5, 1.7][f];
    const start = -span / 2;
    for (let i = 0; i <= 40; i++) {
      const a = start + (span * i) / 40;
      const thick = Math.sin((i / 40) * Math.PI) * (f === 2 ? 2 : 3.5);
      for (let r = 11; r < 11 + thick + 1; r += 0.5) {
        const col = r < 12 ? PAL.steel[0] : r < 13.5 ? '#ffffff' : '#b8e0ff';
        img.set(f * 32 + 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, col, f === 2 ? 0.55 : 1);
      }
    }
  }
  save('assets/sprites/slash.png', img);
}
// projétil de chama (16×16, 3 frames)
{
  const img = new Img(48, 16);
  const C = PAL.fire;
  for (let f = 0; f < 3; f++) {
    const ox = f * 16;
    img.ellipse(ox + 7 - f * 0.5, 8, 5 + f * 0.4, 3.6, C[3], 0.9);
    img.ellipse(ox + 9, 8, 4, 3, C[2]);
    img.ellipse(ox + 10, 8, 2.6, 2, C[1]);
    img.ellipse(ox + 10.5, 8, 1.4, 1.1, C[0]);
    img.set(ox + 2 + f, 6 - (f % 2), C[2]);
    img.set(ox + 1 + f, 10 + (f % 2), C[3]);
  }
  save('assets/sprites/flame.png', img);
}
// explosão (32×32, 5 frames)
{
  const img = new Img(160, 32);
  const C = PAL.fire;
  for (let f = 0; f < 5; f++) {
    const ox = f * 32;
    const r = 4 + f * 3;
    const rr = rng(300 + f);
    if (f < 4) img.ellipse(ox + 16, 16, r, r, C[3], 0.85 - f * 0.12);
    img.ellipse(ox + 16, 16, r * 0.75, r * 0.75, C[2], f < 4 ? 0.95 : 0.4);
    if (f < 3) img.ellipse(ox + 16, 16, r * 0.45, r * 0.45, C[1]);
    if (f < 2) img.ellipse(ox + 16, 16, r * 0.25, r * 0.25, C[0]);
    for (let i = 0; i < 6 + f * 2; i++) {
      const a = rr() * Math.PI * 2;
      const d = r + rr() * 3;
      img.rect(ox + 16 + Math.cos(a) * d, 16 + Math.sin(a) * d, 2, 2, f > 2 ? '#5a5a5a' : C[1], 0.8);
    }
  }
  save('assets/sprites/explosion.png', img);
}
// tocha: 0 apagada, 1-3 acesa
{
  const img = new Img(64, 16);
  for (let f = 0; f < 4; f++) {
    const ox = f * 16;
    const tmp = new Img(16, 16);
    tmp.rect(7, 6, 2, 9, PAL.wood[1]);
    tmp.rect(6, 5, 4, 2, PAL.wood[3]);
    tmp.outline(0, 0, 16, 16);
    composite(img, tmp, ox, 0);
    img.ellipse(ox + 8, 15, 3, 1, '#000000', 0.3);
    if (f > 0) {
      const C = PAL.fire;
      const h = [0, 4, 5, 3.5][f];
      img.ellipse(ox + 8, 4.5 - h / 4, 2.2, h / 1.6, C[3]);
      img.ellipse(ox + 8 + (f === 2 ? 0.5 : 0), 4.5 - h / 4, 1.4, h / 2.2, C[1]);
      img.set(ox + 8, 3, C[0]);
    }
  }
  save('assets/sprites/torch.png', img);
}
// partículas e utilidades
{
  const px = new Img(4, 4);
  px.rect(0, 0, 4, 4, '#ffffff');
  save('assets/sprites/pixel.png', px);
  const rain = new Img(2, 7);
  rain.rect(0, 0, 1, 7, '#bcdcff', 0.75);
  rain.rect(1, 2, 1, 4, '#ffffff', 0.35);
  save('assets/sprites/raindrop.png', rain);
  const splash = new Img(24, 8);
  for (let f = 0; f < 3; f++) {
    const r = 1 + f * 1.4;
    for (let a = 0; a < Math.PI * 2; a += 0.3) splash.set(f * 8 + 4 + Math.cos(a) * r, 5 + Math.sin(a) * r * 0.5, '#d8ecff', 0.8 - f * 0.2);
  }
  save('assets/sprites/splash.png', splash);
  const sh = new Img(16, 8);
  sh.ellipse(8, 4, 7, 3, '#000000', 0.35);
  save('assets/sprites/shadow.png', sh);
  // brilho radial (luz de janela/tocha) — gradiente suave
  const g = new Img(64, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32;
      const a = Math.max(0, 1 - d);
      g.put(x, y, 255, 255, 255, Math.round(a * a * 255));
    }
  save('assets/sprites/glow.png', g);
  // neblina: ruído de valor periódico (tileável) 128×128
  const rr = rng(777);
  const grids = [8, 16, 32].map((m) => ({ m, g: Array.from({ length: m * m }, () => rr()) }));
  const sm = (t) => t * t * (3 - 2 * t);
  const fog = new Img(128, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      let val = 0;
      let amp = 1;
      let tot = 0;
      for (const { m, g } of grids) {
        const gx = (x * m) / 128;
        const gy = (y * m) / 128;
        const i = Math.floor(gx);
        const j = Math.floor(gy);
        const v = (a, b) => g[(b % m) * m + (a % m)];
        const sx = sm(gx - i);
        const sy = sm(gy - j);
        const top = v(i, j) * (1 - sx) + v(i + 1, j) * sx;
        const bot = v(i, j + 1) * (1 - sx) + v(i + 1, j + 1) * sx;
        val += (top * (1 - sy) + bot * sy) * amp;
        tot += amp;
        amp *= 0.5;
      }
      val /= tot;
      fog.put(x, y, 235, 240, 248, Math.round(Math.max(0, Math.min(1, (val - 0.3) * 1.8)) * 255));
    }
  save('assets/sprites/fog.png', fog);
}

// ícones dos botões (16×16): golpe, esquiva, chama, coração
{
  const img = new Img(64, 16);
  const s = new Img(16, 16);
  s.line(3, 12, 11, 4, PAL.steel[0]);
  s.line(4, 12, 12, 4, PAL.steel[1]);
  s.line(12, 3, 13, 3, PAL.steel[0]);
  s.line(2, 10, 6, 14, PAL.belt[1]);
  s.rect(2, 13, 2, 2, PAL.wood[1]);
  s.outline(0, 0, 16, 16);
  composite(img, s, 0, 0);
  const d = new Img(16, 16);
  for (let a = 0.3; a < Math.PI * 1.6; a += 0.08) d.set(8 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, '#bfe6ff');
  d.rect(11, 2, 3, 3, '#bfe6ff');
  d.ellipse(8, 8, 2, 2, '#ffffff');
  d.outline(0, 0, 16, 16);
  composite(img, d, 16, 0);
  const fl = new Img(16, 16);
  fl.ellipse(8, 10, 5, 5, PAL.fire[3]);
  fl.ellipse(8, 7, 3.5, 6, PAL.fire[3]);
  fl.ellipse(8, 10, 3.2, 3.5, PAL.fire[2]);
  fl.ellipse(8, 11, 1.8, 2, PAL.fire[1]);
  fl.outline(0, 0, 16, 16);
  composite(img, fl, 32, 0);
  const h = new Img(16, 16);
  h.ellipse(5.5, 6, 3.5, 3.5, PAL.ui[1]);
  h.ellipse(10.5, 6, 3.5, 3.5, PAL.ui[1]);
  for (let y = 7; y < 14; y++) h.rect(2 + (y - 7), y, 12 - (y - 7) * 2, 1, PAL.ui[1]);
  h.rect(4, 4, 2, 2, '#ffb0b0');
  h.outline(0, 0, 16, 16);
  composite(img, h, 48, 0);
  save('assets/sprites/ui-icons.png', img);
}

// ================================================================ CASAS
// 48×48, 2 frames (janelas apagadas / acesas). Linha 0 do sprite (telhado)
// fica fora da colisão para o jogador poder passar "atrás" da casa.
function house(file, roof, wall, stone, seed) {
  const img = new Img(96, 48);
  for (let f = 0; f < 2; f++) {
    const t = new Img(48, 48);
    const r = rng(seed);
    // paredes
    t.rect(4, 24, 40, 22, wall[0]);
    t.rect(4, 24, 40, 2, wall[1]);
    if (stone) {
      for (let y = 26; y < 46; y += 4)
        for (let x = 4 + ((y / 4) % 2) * 3; x < 44; x += 6) {
          t.rect(x, y, Math.min(5, 44 - x), 3, r() > 0.5 ? wall[0] : wall[2]);
          t.rect(x, y + 3, Math.min(6, 44 - x), 1, wall[3]);
        }
    } else {
      t.rect(4, 24, 2, 22, PAL.wood[1]);
      t.rect(42, 24, 2, 22, PAL.wood[1]);
      t.rect(4, 34, 40, 2, PAL.wood[1]);
      t.rect(4, 44, 40, 2, PAL.wood[1]);
    }
    // porta
    t.rect(20, 33, 8, 13, PAL.wood[1]);
    t.rect(21, 34, 6, 12, PAL.wood[0]);
    t.rect(24, 34, 1, 12, PAL.wood[1]);
    t.set(26, 40, PAL.belt[1]);
    // janelas
    for (const wx of [8, 32]) {
      t.rect(wx, 30, 8, 7, PAL.wood[1]);
      t.rect(wx + 1, 31, 6, 5, f ? PAL.window[1] : PAL.window[0]);
      t.rect(wx + 4, 31, 1, 5, PAL.wood[1]);
      t.rect(wx + 1, 33, 6, 1, PAL.wood[1]);
      if (f) t.set(wx + 2, 31, '#fff6d0');
      else t.set(wx + 2, 31, '#5a6a90');
    }
    // telhado
    for (let y = 0; y < 26; y++) {
      const inset = Math.max(0, 12 - y);
      const x0 = 1 + inset * 0.6;
      const x1 = 47 - inset * 0.6;
      for (let x = Math.floor(x0); x < x1; x++) {
        const row = Math.floor(y / 3);
        let c = row % 2 ? roof[0] : roof[1];
        if (x < 24 && y > 2) c = row % 2 ? roof[2] : roof[0];
        t.set(x, y + 2, c);
      }
    }
    t.rect(1, 26, 46, 2, roof[1]);
    t.rect(23, 2, 2, 24, roof[1]);
    // chaminé
    t.rect(34, 0, 5, 9, stone ? wall[3] : PAL.stoneWall[1]);
    t.rect(34, 0, 5, 1, PAL.stoneWall[2]);
    t.outline(0, 0, 48, 48);
    composite(img, t, f * 48, 0);
  }
  save(file, img);
}
house('assets/tiles/house-brumavale-a.png', PAL.roofRed, PAL.plaster, false, 401);
house('assets/tiles/house-brumavale-b.png', PAL.roofThatch, PAL.plaster, false, 402);
house('assets/tiles/house-pedrafria-a.png', PAL.roofBlue, PAL.stoneWall, true, 403);
house('assets/tiles/house-pedrafria-b.png', PAL.roofSlate, PAL.stoneWall, true, 404);

// poço (decoração de praça, 32×32)
{
  const t = new Img(32, 32);
  t.ellipse(16, 27, 11, 3, '#000000', 0.3);
  t.rect(7, 16, 18, 10, PAL.stoneWall[0]);
  for (let x = 7; x < 25; x += 4) t.rect(x, 20, 3, 1, PAL.stoneWall[3]);
  t.ellipse(16, 16, 9, 3, PAL.stoneWall[2]);
  t.ellipse(16, 16, 7, 2, PAL.water[1]);
  t.rect(8, 4, 2, 12, PAL.wood[1]);
  t.rect(22, 4, 2, 12, PAL.wood[1]);
  t.rect(6, 2, 20, 3, PAL.roofRed[0]);
  t.rect(15, 5, 2, 6, PAL.wood[0]);
  t.outline(0, 0, 32, 32);
  save('assets/tiles/well.png', t);
}

// ================================================================ ÍCONES PWA
function icon(size) {
  const base = new Img(32, 32);
  for (let y = 0; y < 32; y++) {
    const k = y / 31;
    const c = k < 0.5 ? '#2a2650' : '#3a3a7a';
    base.rect(0, y, 32, 1, c);
  }
  base.ellipse(23, 8, 3.5, 3.5, '#f2ead0');
  base.ellipse(24.5, 7, 3, 3, '#2a2650');
  for (const [x, y] of [[5, 4], [11, 7], [16, 3], [28, 14]]) base.set(x, y, '#ffffff');
  // montanhas
  for (let x = 0; x < 32; x++) {
    const h = 14 + Math.round(Math.abs(((x * 1.7) % 16) - 8) * 0.9);
    base.rect(x, h, 1, 32 - h, x < 16 ? PAL.pine[1] : PAL.pine[0]);
  }
  // penhasco + cachoeira
  base.rect(0, 20, 32, 4, PAL.rock[2]);
  base.rect(0, 20, 32, 1, PAL.rock[4]);
  base.rect(14, 12, 4, 13, PAL.water[2]);
  base.rect(15, 12, 1, 13, PAL.water[4]);
  base.rect(0, 24, 32, 8, PAL.grass[0]);
  base.ellipse(16, 26, 6, 2, PAL.water[4]);
  base.rect(14, 26, 4, 6, PAL.water[0]);
  // V
  for (let i = 0; i < 7; i++) {
    base.rect(4 + i * 0.7, 3 + i * 1.3, 2, 2, PAL.fire[1]);
    base.rect(12 - i * 0.7, 3 + i * 1.3, 2, 2, PAL.fire[1]);
  }
  const f = Math.floor(size / 32);
  const s = base.scaled(f);
  if (s.w === size) return s;
  const o = new Img(size, size);
  o.rect(0, 0, size, size, '#2a2650');
  o.blit(s, 0, 0, s.w, s.h, Math.floor((size - s.w) / 2), Math.floor((size - s.h) / 2));
  return o;
}
save('icons/icon-192.png', icon(192));
save('icons/icon-512.png', icon(512));
save('icons/apple-touch-icon.png', icon(180));
save('icons/favicon-32.png', icon(32));

console.log('Assets gerados:\n  ' + written.join('\n  '));
