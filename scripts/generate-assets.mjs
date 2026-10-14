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
import { drawBuildings, drawCityTiles, drawEdges, drawRankIcons } from './world-art.mjs';
import { drawUiKit } from './ui-art.mjs';

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
// Layout (16 colunas × 16 linhas de tiles 16×16, exportado com margin 1 e
// spacing 2 — "extrudado" — para evitar costuras com zoom fracionado).
// Os índices precisam bater com src/systems/Tiles.ts.
const T = 16;
const COLS = 16;
const ROWS = 36;
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
// ================================================================ BIOMAS (linhas 8–15)
// Snowland 128–143 · Blockland 144–159 · Blackland 160–175 · Dustland/Greenland 176–191
// copas grandes 192+ (linhas 12–14) e troncos na linha 15. Índices em src/systems/Tiles.ts.
const BP = {
  snow: ['#e6edf5', '#d3ddea', '#f6faff', '#b6c4d8', '#98aac4', '#7d90ad'],
  ice: ['#a9d3ec', '#8ec0e0', '#cde9f8', '#6fa2c9', '#ffffff'],
  stone: ['#8c8983', '#787570', '#a3a099', '#64615c', '#bbb8b1', '#4e4b47'],
  dry: ['#a89a5c', '#8e8048', '#c2b474'],
  ash: ['#2c2731', '#25202a', '#36303c', '#1c1821', '#433b4a'],
  ember: ['#ff7a3a', '#c8401e', '#ffd07a'],
  crysP: ['#b46cec', '#7b3cc2', '#e6b8ff', '#4a2282'],
  crysC: ['#5ee0ea', '#2a9ab8', '#cafcff', '#1a5a78'],
  dune: ['#e2b86e', '#d4a65c', '#eecb8a', '#c08e48', '#f6dea6'],
  sstone: ['#c98a52', '#b07440', '#dea26c', '#8e5a30', '#6e4424'],
  cactus: ['#5c9c4a', '#457c38', '#78ba60', '#2f5c27'],
  lush: ['#3f8a3a', '#2f6e2e', '#58a548', '#77bf5a', '#22521f'],
};
// --- Snowland
{
  const S = BP.snow;
  const flakes = (ox, oy, r, n) => {
    for (let i = 0; i < n; i++) tiles.set(ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), S[2]);
  };
  noiseTile(128, [S[0], S[1], S[2]], [0.6, 0.25, 0.15], 401, (ox, oy, r) => flakes(ox, oy, r, 3));
  noiseTile(129, [S[0], S[2], S[1]], [0.55, 0.3, 0.15], 402, (ox, oy, r) => {
    for (let i = 0; i < 2; i++) {
      const x = ox + 2 + Math.floor(r() * 10), y = oy + 3 + Math.floor(r() * 10);
      tiles.rect(x, y, 4, 1, S[3]);
      tiles.rect(x + 1, y - 1, 3, 1, S[2]);
    }
  });
  noiseTile(130, [S[1], S[0], S[3]], [0.55, 0.33, 0.12], 403, (ox, oy, r) => flakes(ox, oy, r, 2));
  noiseTile(131, [S[3], S[4], S[1]], [0.55, 0.3, 0.15], 404, (ox, oy, r) => {
    for (let i = 0; i < 3; i++) tiles.set(ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), S[5]);
  });
  const I = BP.ice;
  noiseTile(132, [I[0], I[1], I[2]], [0.6, 0.25, 0.15], 405, (ox, oy) => {
    tiles.line(ox + 2, oy + 3, ox + 6, oy + 1, I[4]);
    tiles.line(ox + 9, oy + 11, ox + 13, oy + 9, I[2]);
  });
  noiseTile(133, [I[0], I[1], I[2]], [0.55, 0.3, 0.15], 406, (ox, oy) => {
    tiles.line(ox + 1, oy + 4, ox + 8, oy + 9, I[3]);
    tiles.line(ox + 8, oy + 9, ox + 14, oy + 7, I[3]);
    tiles.line(ox + 8, oy + 9, ox + 9, oy + 15, I[3]);
    tiles.line(ox + 3, oy + 2, ox + 6, oy + 1, I[4]);
  });
  // pedra com neve
  {
    const [ox, oy] = at(134);
    tiles.ellipse(ox + 8, oy + 12.5, 6, 2, '#000000', 0.22);
    tiles.ellipse(ox + 8, oy + 10, 5.5, 3.8, RK[1]);
    tiles.ellipse(ox + 7, oy + 9, 3.5, 2.2, RK[0]);
    tiles.ellipse(ox + 8, oy + 7.5, 5, 2, S[0]);
    tiles.ellipse(ox + 7, oy + 7, 3, 1.2, S[2]);
    tiles.outline(ox, oy, T, T);
  }
  // arbusto congelado
  {
    const [ox, oy] = at(135);
    tiles.ellipse(ox + 8, oy + 13.5, 6, 2, '#000000', 0.22);
    tiles.ellipse(ox + 8, oy + 9.5, 6, 4.5, PAL.pine[1]);
    tiles.ellipse(ox + 7, oy + 8.5, 4.5, 3.2, PAL.pine[0]);
    tiles.ellipse(ox + 8, oy + 6.5, 5, 1.8, S[0]);
    for (const [x, y] of [[4, 9], [11, 8], [8, 11]]) tiles.set(ox + x, oy + y, S[2]);
    tiles.outline(ox, oy, T, T);
  }
  // cristais de gelo
  {
    const [ox, oy] = at(136);
    tiles.ellipse(ox + 8, oy + 13.5, 5, 1.6, '#000000', 0.2);
    for (const [x, h, w] of [[5, 7, 2], [8, 10, 3], [11, 6, 2]]) {
      for (let y = 0; y < h; y++) {
        const ww = Math.max(1, Math.round(w * (1 - y / h)));
        tiles.rect(ox + x - (ww >> 1), oy + 13 - y, ww, 1, y > h * 0.6 ? I[4] : I[0]);
      }
      tiles.set(ox + x - 1, oy + 12, I[3]);
    }
    tiles.outline(ox, oy, T, T);
  }
  // capim saindo da neve
  {
    const [ox, oy] = at(137);
    const r = rng(407);
    for (let i = 0; i < 5; i++) {
      const x = ox + 3 + Math.floor(r() * 10);
      tiles.line(x, oy + 13, x + (r() > 0.5 ? 1 : -1), oy + 9 - Math.floor(r() * 3), BP.dry[i % 2]);
    }
    tiles.rect(ox + 2, oy + 13, 12, 1, S[0]);
  }
  // cume de montanha nevada / paredão
  noiseTile(138, [RK[1], RK[2], S[1], S[0]], [0.38, 0.26, 0.2, 0.16], 408, (ox, oy, r) => {
    for (let i = 0; i < 2; i++) {
      const x = ox + 2 + Math.floor(r() * 11), y = oy + 2 + Math.floor(r() * 11);
      tiles.rect(x, y, 3, 2, RK[2]);
      tiles.rect(x, y, 3, 1, RK[0]);
    }
  });
  {
    const [ox, oy] = at(139);
    tiles.rect(ox, oy, T, T, RK[2]);
    tiles.rect(ox, oy, T, 3, S[0]);
    tiles.rect(ox, oy + 3, T, 1, S[3]);
    for (let x = 0; x < T; x += 4) {
      tiles.line(ox + x + 1, oy + 4, ox + x + 2, oy + 15, RK[3]);
      tiles.rect(ox + x + 2, oy + 5, 1, 6, RK[1]);
    }
    tiles.set(ox + 3, oy + 3, S[0]);
    tiles.set(ox + 10, oy + 3, S[0]);
    tiles.rect(ox, oy + 15, T, 1, RK[5]);
  }
  // toco com neve
  {
    const [sx, sy] = at(140);
    tiles.ellipse(sx + 8, sy + 12, 6, 2, '#000000', 0.22);
    tiles.rect(sx + 4, sy + 7, 8, 5, PAL.wood[1]);
    tiles.ellipse(sx + 8, sy + 7, 4.5, 1.8, S[0]);
    tiles.outline(sx, sy, T, T);
  }
  // flor-de-gelo
  {
    const [ox, oy] = at(141);
    for (const [x, y] of [[5, 8], [10, 10]]) {
      tiles.line(ox + x, oy + y + 1, ox + x, oy + y + 4, PAL.pine[2]);
      tiles.set(ox + x - 1, oy + y, I[2]);
      tiles.set(ox + x + 1, oy + y, I[2]);
      tiles.set(ox + x, oy + y - 1, I[2]);
      tiles.set(ox + x, oy + y, '#6c8de0');
    }
  }
  // monte de neve
  {
    const [ox, oy] = at(142);
    tiles.ellipse(ox + 8, oy + 11, 7, 3.5, S[1]);
    tiles.ellipse(ox + 7, oy + 10, 5, 2.4, S[0]);
    tiles.ellipse(ox + 6, oy + 9.5, 2.5, 1, S[2]);
  }
}
// --- Blockland
{
  const B = BP.stone;
  noiseTile(144, [B[0], B[1], B[2]], [0.55, 0.3, 0.15], 421, (ox, oy, r) => {
    tiles.line(ox + Math.floor(r() * 8), oy + 5, ox + 8 + Math.floor(r() * 8), oy + 6, B[3]);
  });
  noiseTile(145, [B[0], B[2], B[1]], [0.5, 0.3, 0.2], 422, (ox, oy) => {
    tiles.rect(ox, oy + 7, T, 1, B[3]);
    tiles.rect(ox + 7, oy, 1, 7, B[3]);
    tiles.rect(ox + 3, oy + 8, 1, 8, B[3]);
    tiles.rect(ox, oy + 8, T, 1, B[4]);
  });
  noiseTile(146, [B[1], B[0], B[3]], [0.5, 0.35, 0.15], 423);
  noiseTile(147, [B[1], B[2], B[3], B[4]], [0.4, 0.25, 0.2, 0.15], 424, (ox, oy, r) => {
    for (let i = 0; i < 6; i++) {
      const x = ox + Math.floor(r() * 15), y = oy + Math.floor(r() * 15);
      tiles.rect(x, y, 2, 1, B[3]);
      tiles.set(x, y, B[4]);
    }
  });
  noiseTile(148, [B[0], B[1], BP.dry[1]], [0.55, 0.3, 0.15], 425, (ox, oy, r) => tufts(ox, oy, r, 3, BP.dry[0], BP.dry[2]));
  // bloco de pedra (cubo)
  const block = (id, moss) => {
    const [ox, oy] = at(id);
    tiles.ellipse(ox + 8, oy + 14.5, 7, 1.5, '#000000', 0.3);
    tiles.rect(ox + 2, oy + 5, 12, 9, B[1]);
    tiles.rect(ox + 2, oy + 2, 12, 4, B[2]);
    tiles.rect(ox + 2, oy + 2, 12, 1, B[4]);
    tiles.rect(ox + 12, oy + 5, 2, 9, B[3]);
    tiles.line(ox + 5, oy + 7, ox + 7, oy + 11, B[3]);
    if (moss) {
      tiles.rect(ox + 2, oy + 2, 7, 2, PAL.forest[2]);
      tiles.rect(ox + 3, oy + 4, 3, 2, PAL.forest[0]);
    }
    tiles.outline(ox, oy, T, T);
  };
  block(149, false);
  block(150, true);
  {
    const [ox, oy] = at(151); // seixos
    for (const [x, y, w] of [[3, 10, 3], [8, 12, 2], [11, 8, 3], [6, 6, 2]]) {
      tiles.ellipse(ox + x, oy + y, w / 2 + 0.6, 1.2, B[1]);
      tiles.set(ox + x - 1, oy + y - 1, B[4]);
    }
    tiles.outline(ox, oy, T, T);
  }
  {
    const [ox, oy] = at(152); // touceira seca
    const r = rng(426);
    for (let i = 0; i < 7; i++) {
      const x = ox + 3 + Math.floor(r() * 10);
      tiles.line(x, oy + 14, x + (r() > 0.5 ? 2 : -2), oy + 8 - Math.floor(r() * 3), BP.dry[i % 3]);
    }
  }
  noiseTile(153, [B[3], B[1], B[5], B[0]], [0.42, 0.3, 0.16, 0.12], 427, (ox, oy, r) => {
    for (let i = 0; i < 3; i++) {
      const x = ox + 1 + Math.floor(r() * 12), y = oy + 1 + Math.floor(r() * 12);
      tiles.rect(x, y, 3, 3, B[1]);
      tiles.rect(x, y, 3, 1, B[4]);
    }
  });
  {
    const [ox, oy] = at(154);
    tiles.rect(ox, oy, T, T, B[1]);
    tiles.rect(ox, oy, T, 2, B[4]);
    for (let x = 0; x < T; x += 5) {
      tiles.rect(ox + x, oy + 2, 1, 14, B[3]);
      tiles.rect(ox + x + 1, oy + 2, 1, 14, B[0]);
    }
    tiles.rect(ox, oy + 9, T, 1, B[3]);
    tiles.rect(ox, oy + 15, T, 1, B[5]);
  }
  {
    const [ox, oy] = at(155); // veio de minério
    tiles.ellipse(ox + 8, oy + 13, 6, 2, '#000000', 0.25);
    tiles.ellipse(ox + 8, oy + 9.5, 6, 4.5, B[1]);
    tiles.ellipse(ox + 7, oy + 8.5, 4, 3, B[0]);
    for (const [x, y] of [[5, 9], [9, 7], [10, 11], [7, 11]]) {
      tiles.set(ox + x, oy + y, '#e0b84a');
      tiles.set(ox + x + 1, oy + y, '#a07a22');
    }
    tiles.outline(ox, oy, T, T);
  }
  {
    const [ox, oy] = at(156); // bloquinho solto
    tiles.ellipse(ox + 8, oy + 13, 4.5, 1.2, '#000000', 0.25);
    tiles.rect(ox + 5, oy + 8, 6, 5, B[1]);
    tiles.rect(ox + 5, oy + 7, 6, 2, B[2]);
    tiles.rect(ox + 10, oy + 8, 1, 5, B[3]);
    tiles.outline(ox, oy, T, T);
  }
}
// --- Blackland
{
  const A = BP.ash;
  noiseTile(160, [A[0], A[1], A[2]], [0.55, 0.3, 0.15], 441, (ox, oy, r) => {
    for (let i = 0; i < 2; i++) tiles.set(ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), A[4]);
  });
  noiseTile(161, [A[1], A[0], A[3]], [0.5, 0.35, 0.15], 442);
  noiseTile(162, [A[0], A[2], A[4]], [0.6, 0.3, 0.1], 443);
  noiseTile(163, [A[0], A[1], A[3]], [0.55, 0.3, 0.15], 444, (ox, oy) => {
    const E = BP.ember;
    tiles.line(ox + 1, oy + 5, ox + 7, oy + 8, E[1]);
    tiles.line(ox + 7, oy + 8, ox + 14, oy + 6, E[1]);
    tiles.line(ox + 7, oy + 8, ox + 8, oy + 14, E[1]);
    tiles.set(ox + 7, oy + 8, E[2]);
    tiles.set(ox + 4, oy + 6, E[0]);
    tiles.set(ox + 11, oy + 7, E[0]);
  });
  noiseTile(164, ['#1a1622', '#221d2c', '#2e2840'], [0.6, 0.28, 0.12], 445, (ox, oy) => {
    tiles.line(ox + 2, oy + 2, ox + 6, oy + 6, '#5a4c7a');
    tiles.line(ox + 9, oy + 10, ox + 13, oy + 12, '#46396a');
  });
  const crystal = (id, P, big) => {
    const [ox, oy] = at(id);
    tiles.ellipse(ox + 8, oy + 14, big ? 7 : 5, 1.6, '#000000', 0.35);
    const shards = big ? [[4, 9, 3], [8, 14, 4], [12, 8, 3], [6, 6, 2]] : [[5, 6, 2], [8, 9, 3], [11, 5, 2]];
    for (const [x, h, w] of shards) {
      for (let y = 0; y < h; y++) {
        const ww = Math.max(1, Math.round(w * (1 - (y / h) * 0.8)));
        for (let k = 0; k < ww; k++) tiles.set(ox + x - (ww >> 1) + k, oy + 14 - y, k === 0 ? P[2] : k === ww - 1 ? P[1] : P[0]);
      }
      tiles.set(ox + x, oy + 14 - h + 1, P[2]);
    }
    tiles.outline(ox, oy, T, T);
  };
  crystal(165, BP.crysP, false);
  crystal(166, BP.crysC, false);
  crystal(167, BP.crysP, true);
  {
    const [ox, oy] = at(168); // fungo luminoso
    for (const [x, y, s] of [[5, 10, 2.5], [10, 12, 2], [9, 7, 1.6]]) {
      tiles.rect(ox + x, oy + y, 1, 3, '#a8b0c0');
      tiles.ellipse(ox + x + 0.5, oy + y, s, s * 0.7, BP.crysC[0]);
      tiles.set(ox + x, oy + y - 1, BP.crysC[2]);
    }
    tiles.outline(ox, oy, T, T);
  }
  {
    const [ox, oy] = at(169); // espinheiro negro
    const r = rng(446);
    for (let i = 0; i < 6; i++) {
      const x = ox + 4 + Math.floor(r() * 8);
      const top = oy + 3 + Math.floor(r() * 5);
      tiles.line(x, oy + 14, x + (r() > 0.5 ? 3 : -3), top, '#3a2a40');
      tiles.set(x + (r() > 0.5 ? 1 : -1), top + 3, '#8a2a3a');
    }
    tiles.outline(ox, oy, T, T);
  }
  {
    const [ox, oy] = at(170); // ossos
    tiles.rect(ox + 3, oy + 10, 8, 1, '#d8d0bc');
    tiles.rect(ox + 2, oy + 9, 2, 3, '#e8e2d0');
    tiles.rect(ox + 10, oy + 9, 2, 3, '#e8e2d0');
    tiles.ellipse(ox + 11, oy + 6, 2.5, 2, '#e8e2d0');
    tiles.set(ox + 10, oy + 6, '#3a3040');
    tiles.outline(ox, oy, T, T);
  }
  noiseTile(171, [A[2], A[0], A[4], '#4a3a5a'], [0.45, 0.3, 0.15, 0.1], 447, (ox, oy, r) => {
    for (let i = 0; i < 2; i++) tiles.set(ox + 2 + Math.floor(r() * 12), oy + 2 + Math.floor(r() * 12), BP.crysP[0]);
  });
  {
    const [ox, oy] = at(172);
    tiles.rect(ox, oy, T, T, '#1f1a26');
    tiles.rect(ox, oy, T, 2, A[4]);
    for (let x = 1; x < T; x += 5) tiles.line(ox + x, oy + 2, ox + x + 1, oy + 15, '#120e18');
    tiles.set(ox + 4, oy + 8, BP.crysP[0]);
    tiles.set(ox + 12, oy + 5, BP.crysP[2]);
    tiles.rect(ox, oy + 15, T, 1, '#0c0a10');
  }
  noiseTile(173, ['#140f1e', '#1c1530', '#26204a'], [0.6, 0.3, 0.1], 448, (ox, oy) => {
    tiles.set(ox + 4, oy + 5, BP.crysP[2]);
    tiles.set(ox + 11, oy + 10, BP.crysP[0]);
  });
  {
    const [ox, oy] = at(174); // capim de brasa
    const r = rng(449);
    for (let i = 0; i < 6; i++) {
      const x = ox + 3 + Math.floor(r() * 10);
      tiles.line(x, oy + 14, x + (r() > 0.5 ? 1 : -1), oy + 9 - Math.floor(r() * 3), i % 2 ? '#7a2a2a' : '#a8401e');
    }
  }
}
// --- Dustland
{
  const D2 = BP.dune;
  noiseTile(176, [D2[0], D2[1], D2[2]], [0.6, 0.25, 0.15], 461);
  noiseTile(177, [D2[0], D2[2], D2[1]], [0.55, 0.3, 0.15], 462, (ox, oy) => {
    for (let y = 3; y < T; y += 6) {
      tiles.line(ox + 1, oy + y, ox + 7, oy + y - 1, D2[3]);
      tiles.line(ox + 7, oy + y - 1, ox + 14, oy + y, D2[3]);
      tiles.line(ox + 2, oy + y - 1, ox + 7, oy + y - 2, D2[4]);
    }
  });
  noiseTile(178, [D2[1], D2[0], D2[3]], [0.55, 0.33, 0.12], 463);
  noiseTile(179, [D2[0], D2[2], D2[1]], [0.55, 0.3, 0.15], 464, (ox, oy) => {
    for (let y = 2; y < T; y += 4) tiles.line(ox, oy + y, ox + 15, oy + y + 1, D2[3]);
  });
  const SS = BP.sstone;
  noiseTile(180, [SS[0], SS[1], SS[2]], [0.55, 0.3, 0.15], 465, (ox, oy) => {
    tiles.rect(ox, oy + 6, T, 1, SS[3]);
    tiles.rect(ox, oy + 12, T, 1, SS[3]);
    tiles.rect(ox + 9, oy, 1, 6, SS[3]);
  });
  {
    const [ox, oy] = at(181); // cacto grande (colisão)
    const C = BP.cactus;
    tiles.ellipse(ox + 8, oy + 14.5, 5, 1.4, '#000000', 0.3);
    tiles.rect(ox + 6, oy + 1, 4, 14, C[0]);
    tiles.rect(ox + 6, oy + 1, 1, 14, C[2]);
    tiles.rect(ox + 9, oy + 1, 1, 14, C[1]);
    tiles.rect(ox + 2, oy + 6, 2, 5, C[0]);
    tiles.rect(ox + 2, oy + 10, 4, 2, C[0]);
    tiles.rect(ox + 12, oy + 4, 2, 5, C[0]);
    tiles.rect(ox + 10, oy + 8, 4, 2, C[0]);
    tiles.set(ox + 8, oy, '#f2c94c');
    tiles.outline(ox, oy, T, T);
  }
  {
    const [ox, oy] = at(182); // cacto pequeno
    const C = BP.cactus;
    tiles.ellipse(ox + 8, oy + 14, 4, 1.2, '#000000', 0.3);
    tiles.ellipse(ox + 8, oy + 11, 3, 3.5, C[0]);
    tiles.ellipse(ox + 7, oy + 10, 1.5, 2, C[2]);
    tiles.set(ox + 8, oy + 7, '#e0484a');
    tiles.outline(ox, oy, T, T);
  }
  {
    const [ox, oy] = at(183); // arbusto seco
    const r = rng(466);
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (1.05 + r() * 0.9);
      const l = 4 + r() * 4;
      tiles.line(ox + 8, oy + 13, ox + 8 + Math.cos(a) * l, oy + 13 + Math.sin(a) * l, i % 2 ? '#8a6a3a' : '#6e5230');
    }
  }
  {
    const [ox, oy] = at(184); // crânio
    tiles.ellipse(ox + 8, oy + 10, 3.5, 2.8, '#ece4d0');
    tiles.rect(ox + 6, oy + 12, 4, 2, '#d8d0bc');
    tiles.set(ox + 7, oy + 10, '#3a3040');
    tiles.set(ox + 9, oy + 10, '#3a3040');
    tiles.line(ox + 3, oy + 13, ox + 5, oy + 12, '#d8d0bc');
    tiles.outline(ox, oy, T, T);
  }
  {
    const [ox, oy] = at(185); // rocha de arenito
    tiles.ellipse(ox + 8, oy + 13, 6.5, 2, '#000000', 0.25);
    tiles.ellipse(ox + 8, oy + 10, 6, 4, SS[1]);
    tiles.ellipse(ox + 7, oy + 8.5, 4.5, 2.6, SS[0]);
    tiles.rect(ox + 3, oy + 10, 10, 1, SS[3]);
    tiles.set(ox + 6, oy + 7, SS[2]);
    tiles.outline(ox, oy, T, T);
  }
  noiseTile(186, [SS[0], SS[2], SS[1]], [0.5, 0.3, 0.2], 467, (ox, oy) => {
    tiles.rect(ox, oy + 5, T, 1, SS[1]);
    tiles.rect(ox, oy + 11, T, 1, SS[1]);
  });
  {
    const [ox, oy] = at(187); // paredão da mesa (camadas)
    for (let y = 0; y < T; y++) tiles.rect(ox, oy + y, T, 1, [SS[2], SS[0], SS[0], SS[1], SS[3]][Math.floor(y / 3.2)]);
    for (let x = 2; x < T; x += 5) tiles.line(ox + x, oy + 3, ox + x + 1, oy + 15, SS[3]);
    tiles.rect(ox, oy + 15, T, 1, SS[4]);
  }
  noiseTile(188, [G[2], G[1], G[4]], [0.55, 0.3, 0.15], 468, (ox, oy, r) => tufts(ox, oy, r, 4, G[3], G[4]));
}
// --- Greenland (extras)
{
  const [ox, oy] = at(189); // samambaia
  const L = BP.lush;
  for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
    for (let k = 0; k < 7; k++) {
      const x = ox + 8 + Math.sin(a) * k;
      const y = oy + 14 - Math.cos(a) * k * 1.1;
      tiles.set(x, y, k > 4 ? L[3] : L[0]);
      if (k % 2) tiles.set(x + 1, y, L[2]);
    }
  }
  tiles.outline(ox, oy, T, T);
}
{
  const [ox, oy] = at(190); // flor grande
  tiles.line(ox + 8, oy + 14, ox + 8, oy + 7, BP.lush[1]);
  tiles.rect(ox + 5, oy + 11, 3, 1, BP.lush[0]);
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [1, -1], [-1, 1]]) tiles.set(ox + 8 + dx, oy + 6 + dy, PAL.flowers[4]);
  tiles.set(ox + 8, oy + 6, PAL.flowers[1]);
  tiles.outline(ox, oy, T, T);
}
// --- copas grandes: base (canto superior esquerdo), largura × altura em tiles
function bigCanopy(base, w, h, draw) {
  const img = new Img(w * 16, h * 16);
  draw(img);
  img.outline(0, 0, w * 16, h * 16);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) tiles.blit(img, i * 16, j * 16, 16, 16, ...at(base + j * 16 + i));
}
// pinheiro alto nevado (3×3)
bigCanopy(192, 3, 3, (img) => {
  const P = ['#24543c', '#183c2b', '#2f6a4a', '#3f7e5a'];
  const S = BP.snow;
  for (let l = 0; l < 5; l++) {
    const top = 1 + l * 9;
    const half = 4 + l * 3.6;
    for (let y = 0; y < 11; y++) {
      const w = Math.round((half * (y + 1)) / 11);
      for (let x = -w; x <= w; x++) img.set(24 + x, top + y, x < -w / 3 ? P[2] : x > w / 2 ? P[1] : P[0]);
    }
    // neve no topo de cada camada
    for (let y = 0; y < 4; y++) {
      const w = Math.round((half * (y + 1)) / 11);
      for (let x = -w; x <= w; x++) img.set(24 + x, top + y, y === 0 ? S[2] : S[0]);
    }
    img.line(24 - Math.round(half * 0.8), top + 9, 24 - 2, top + 6, S[1]);
  }
});
// árvore morta (3×2)
bigCanopy(195, 3, 2, (img) => {
  const W = ['#3a3040', '#2a2230', '#4a4054'];
  const r = rng(481);
  const branch = (x, y, a, len, d) => {
    if (d > 4 || len < 2) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    img.line(x, y, x2, y2, d < 2 ? W[0] : W[2]);
    if (d < 2) img.line(x + 1, y, x2 + 1, y2, W[1]);
    branch(x2, y2, a - 0.5 - r() * 0.3, len * 0.7, d + 1);
    branch(x2, y2, a + 0.5 + r() * 0.3, len * 0.7, d + 1);
  };
  branch(24, 32, -Math.PI / 2, 12, 0);
});
// palmeira (3×2)
bigCanopy(198, 3, 2, (img) => {
  const P = ['#5a9a3a', '#447a2c', '#78b850', '#2e5a1e'];
  img.line(24, 31, 23, 14, '#8a6a3a');
  img.line(25, 31, 24, 14, '#6e5230');
  for (const [a, l] of [[-2.8, 18], [-2.2, 16], [-1.7, 14], [-1.2, 15], [-0.6, 17], [-0.1, 18]]) {
    for (let k = 0; k < l; k++) {
      const x = 24 + Math.cos(a) * k;
      const y = 13 + Math.sin(a) * k * 0.6 + (k * k) / 28;
      img.set(x, y, P[0]);
      img.set(x, y + 1, P[1]);
      if (k % 3 === 0) img.set(x, y - 1, P[2]);
    }
  }
  img.ellipse(24, 14, 2, 1.6, '#6e4426');
});
// carvalho antigo (3×2), mais escuro e cheio
bigCanopy(201, 3, 2, (img) => {
  const P = ['#2f7a34', '#235e28', '#45943f', '#64ad52', '#173f1a'];
  leafy(img, 24, 17, 22, 14, P, 482);
  leafy(img, 13, 13, 10, 9, P, 483);
  leafy(img, 35, 12, 11, 9, P, 484);
  leafy(img, 24, 8, 12, 7, P, 485);
});
// árvore de cristal (3×2)
bigCanopy(204, 3, 2, (img) => {
  const P = BP.crysP;
  const C = BP.crysC;
  for (const [x, y, h, w, pal] of [[24, 30, 22, 5, P], [15, 28, 14, 4, C], [33, 28, 16, 4, P], [20, 22, 10, 3, C], [29, 20, 9, 3, C]]) {
    for (let k = 0; k < h; k++) {
      const ww = Math.max(1, Math.round(w * (1 - (k / h) * 0.85)));
      for (let i = 0; i < ww; i++) img.set(x - (ww >> 1) + i, y - k, i === 0 ? pal[2] : i === ww - 1 ? pal[1] : pal[0]);
    }
  }
});
// troncos (linha 15)
trunk(240, ['#4a3222', '#34221a', '#6a4a32'], false);
trunk(241, ['#3a3040', '#2a2230', '#4a4054'], false);
{
  const [ox, oy] = at(242); // base da palmeira
  const img = new Img(16, 16);
  img.ellipse(8, 13, 6, 2.2, '#000000', 0.3);
  img.rect(7, 0, 3, 13, '#8a6a3a');
  img.rect(7, 0, 1, 13, '#a88a52');
  for (let y = 2; y < 13; y += 3) img.rect(7, y, 3, 1, '#6e5230');
  img.outline(0, 0, 16, 16);
  tiles.blit(img, 0, 0, 16, 16, ox, oy);
}
trunk(243, ['#5a3a20', '#40281a', '#7a5032'], false);
{
  const [ox, oy] = at(244); // base de cristal
  const img = new Img(16, 16);
  img.ellipse(8, 13, 7, 2.4, '#000000', 0.35);
  img.rect(5, 2, 6, 11, BP.crysP[1]);
  img.rect(5, 2, 2, 11, BP.crysP[2]);
  img.rect(9, 2, 2, 11, BP.crysP[3]);
  img.outline(0, 0, 16, 16);
  tiles.blit(img, 0, 0, 16, 16, ox, oy);
}
// marcador de colisão (não renderizado)
tiles.rect(...at(112), T, T, '#ff00ff', 0.5);

// transições suaves entre terrenos e tiles de cidade (linhas 16–31)
drawEdges({ tiles, at, hex });
drawCityTiles({ tiles, at, rng, PAL, Img });

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
// ================================================================ TEREN (rig de poses, 48×48)
// Cada frame é uma pose calculada: o braço sai do ombro até a mão e a espada
// é presa à mão num ângulo. Golpes são varreduras de ângulo em relação à
// direção do personagem; o rastro (smear) é desenhado entre o ângulo do frame
// anterior e o atual, então sempre acompanha a lâmina.
//
// Layout (por linha = direção 0 baixo, 1 esquerda, 2 direita, 3 cima):
//   0–3 parado (respiração) · 4–9 andar · 10–14 golpe 1 · 15–19 golpe 2
//   20–24 golpe 3 (estocada) · 25–30 rolagem · 31 dano · 32 conjurar chama
const TF = 48;
const TEREN_PAL = {
  skin: '#f0c8a0', skinS: '#d6a27a', blush: '#eaa58f',
  hair: ['#4a2814', '#6b3b1f', '#93592f'],
  tunic: ['#4fb3a2', '#2f8a7e', '#21665d'],
  cape: ['#cf5f4b', '#a8402f', '#7a2820'],
  pants: ['#4a4a6a', '#34344c'],
  boots: ['#5a3c2a', '#38261a'],
  belt: '#6e4426', buckle: '#f0c850',
  steel: ['#ffffff', '#e2e9f1', '#a3afbd', '#66707d'],
  guard: '#e0b444', grip: '#5a3420', eye: '#1e1a24',
  fire: ['#fff3b0', '#ffd34a', '#ff9a2a'],
};
let TC = TEREN_PAL;
const BANDIT_PAL = {
  ...TEREN_PAL,
  skin: '#d9a37c', skinS: '#b8835e', blush: '#c98a6a',
  hair: ['#241c1c', '#3b3333', '#5a4a44'],
  tunic: ['#8a3f3a', '#6e2f2f', '#4f2222'],
  cape: ['#5a4a40', '#3f342e', '#2a2420'],
  pants: ['#3b3333', '#2a2424'], boots: ['#2a2020', '#1a1414'],
  belt: '#8b7b6b', buckle: '#b0a090',
  steel: ['#ffffff', '#c8d0da', '#8a96a4', '#56606c'], guard: '#8b7b6b', grip: '#3a2418',
  mask: '#c0392b', maskS: '#8e2a20', hood: true,
};
const DIRV = [[0, 1], [-1, 0], [1, 0], [0, -1]];
const DIRA = [90, 180, 0, -90];
// ombro da mão da espada (destro) e da mão livre, por direção (1 = esquerda; 2 é espelhado)
const SHOULDER = { 0: [19, 29], 1: [22, 29], 3: [28, 29] };
const OFF_SHOULDER = { 0: [28, 29], 1: [25, 29], 3: [19, 29] };
const IDLE_ANGLE = { 0: 115, 1: 140, 3: 70 };
const rad = (a) => (a * Math.PI) / 180;

function thickLine(img, x0, y0, x1, y1, c) {
  img.line(x0, y0, x1, y1, c);
  img.line(x0 + 1, y0, x1 + 1, y1, c);
}

/** Espada: punho atrás da mão, guarda, lâmina com fio claro e ponta branca. */
function drawSword(img, hx, hy, ang, len) {
  const dx = Math.cos(rad(ang));
  const dy = Math.sin(rad(ang));
  const px = -dy;
  const py = dx;
  for (let i = -3; i <= -1; i++) img.set(hx + dx * i, hy + dy * i, i === -3 ? TC.guard : TC.grip);
  for (let i = 2; i <= len; i++) {
    const x = hx + dx * i;
    const y = hy + dy * i;
    img.set(x + px * 0.6, y + py * 0.6, TC.steel[3]);
    img.set(x, y, i === len ? TC.steel[0] : TC.steel[1]);
  }
  for (let k = -2; k <= 2; k++) img.set(hx + dx * 1 + px * k, hy + dy * 1 + py * k, TC.guard);
}

/** Rastro em arco entre dois ângulos absolutos, em torno do ombro. */
function drawSmear(img, cx, cy, a0, a1, r0, r1, strength) {
  const steps = Math.max(8, Math.abs(a1 - a0) * 1.2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const a = rad(a0 + (a1 - a0) * t);
    const fade = (0.25 + 0.75 * t) * strength;
    for (let r = r0; r <= r1; r += 0.5) {
      const k = (r - r0) / Math.max(1, r1 - r0);
      const col = k > 0.75 ? '#ffffff' : k > 0.4 ? '#d8f0ff' : '#9fd0ff';
      img.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, col, fade * (0.35 + 0.65 * k));
    }
  }
}

/** Rastro reto (estocada). */
function drawThrustSmear(img, hx, hy, ang, len, strength) {
  const dx = Math.cos(rad(ang));
  const dy = Math.sin(rad(ang));
  const px = -dy;
  const py = dx;
  for (const off of [-2, 0, 2]) {
    for (let i = -6; i <= len + 3; i++) {
      const k = (i + 6) / (len + 9);
      img.set(hx + dx * i + px * off, hy + dy * i + py * off, off === 0 ? '#ffffff' : '#bfe4ff', strength * k * (off === 0 ? 0.9 : 0.45));
    }
  }
}

function legsFront(t, ox, k, liftL, liftR, spread) {
  const L = 20 - spread + ox;
  const R = 25 + spread + ox;
  t.rect(L, 35 - liftL, 3, 4, TC.pants[0]);
  t.rect(R, 35 - liftR, 3, 4, TC.pants[1]);
  t.rect(L, 39 - liftL, 3, 2, TC.boots[0]);
  t.rect(R, 39 - liftR, 3, 2, TC.boots[1]);
  void k;
}

function drawBodyFront(t, P, ux, uy) {
  const lx = Math.round(ux / 2);
  // capa (atrás)
  t.rect(18 + ux, 28 + uy, 12, 8, TC.cape[2]);
  t.rect(18 + ux + P.capeSway, 36 + uy, 12, 1, TC.cape[2]);
  legsFront(t, lx, 0, P.liftL, P.liftR, P.spread);
  // túnica
  t.rect(20 + ux, 27 + uy, 8, 7, TC.tunic[1]);
  t.rect(20 + ux, 27 + uy, 1, 7, TC.tunic[0]);
  t.rect(27 + ux, 27 + uy, 1, 7, TC.tunic[2]);
  t.rect(19 + ux, 33 + uy, 10, 2, TC.tunic[1]);
  t.rect(19 + ux, 34 + uy, 10, 1, TC.tunic[2]);
  t.set(23 + ux, 27 + uy, TC.skinS);
  t.set(24 + ux, 27 + uy, TC.skinS);
  t.set(23 + ux, 28 + uy, TC.skinS);
  t.rect(20 + ux, 32 + uy, 8, 1, TC.belt);
  t.rect(23 + ux, 32 + uy, 2, 1, TC.buckle);
  t.set(21 + ux, 27 + uy, TC.buckle); // fecho da capa
  t.set(26 + ux, 27 + uy, TC.buckle);
  // braço livre (lado direito da tela)
  if (!P.off) {
    t.rect(28 + ux, 28 + uy + P.armSwing, 2, 4, TC.tunic[2]);
    t.rect(28 + ux, 32 + uy + P.armSwing, 2, 1, TC.skin);
  }
  // cabeça
  drawHeadFront(t, ux, uy, P.hurt);
}

function drawHeadFront(t, ux, uy, hurt) {
  const X = 20 + ux;
  const Y = 18 + uy;
  t.rect(X, Y + 1, 8, 7, TC.skin);
  t.rect(X, Y + 7, 8, 1, TC.skinS);
  t.clear(X, Y + 7);
  t.clear(X + 7, Y + 7);
  // cabelo
  t.rect(X - 1, Y - 2, 10, 4, TC.hair[1]);
  t.rect(X + 1, Y - 2, 5, 1, TC.hair[2]);
  t.rect(X - 1, Y + 1, 1, 5, TC.hair[1]);
  t.rect(X + 8, Y + 1, 1, 5, TC.hair[1]);
  t.set(X - 1, Y + 6, TC.hair[0]);
  t.set(X + 8, Y + 6, TC.hair[0]);
  for (const [x, y, c] of [[0, 2, 1], [1, 2, 1], [3, 2, 1], [4, 2, 1], [6, 2, 1], [7, 2, 1], [0, 3, 0], [3, 3, 0], [7, 3, 0], [4, 3, 0]])
    t.set(X + x, Y + y, TC.hair[c]);
  t.set(X + 2, Y - 1, TC.hair[2]);
  // rosto
  if (hurt) {
    t.rect(X + 1, Y + 4, 2, 1, TC.eye);
    t.rect(X + 5, Y + 4, 2, 1, TC.eye);
  } else {
    t.rect(X + 2, Y + 4, 1, 2, TC.eye);
    t.rect(X + 5, Y + 4, 1, 2, TC.eye);
  }
  t.set(X + 1, Y + 6, TC.blush);
  t.set(X + 6, Y + 6, TC.blush);
  if (TC.mask) {
    t.rect(X, Y + 6, 8, 2, TC.mask);
    t.rect(X, Y + 7, 8, 1, TC.maskS);
  }
  if (TC.hood) {
    t.rect(X - 1, Y - 3, 10, 4, TC.cape[1]);
    t.rect(X - 2, Y, 2, 7, TC.cape[1]);
    t.rect(X + 8, Y, 2, 7, TC.cape[1]);
    t.rect(X + 1, Y - 3, 6, 1, TC.cape[0]);
    t.rect(X, Y + 1, 8, 1, TC.cape[2]);
  }
}

function drawBodyBack(t, P, ux, uy) {
  const lx = Math.round(ux / 2);
  legsFront(t, lx, 0, P.liftR, P.liftL, P.spread);
  // braços nas laterais
  if (!P.off) t.rect(18 + ux, 28 + uy + P.armSwing, 2, 4, TC.tunic[2]);
  t.rect(20 + ux, 27 + uy, 8, 7, TC.tunic[1]);
  // capa cobrindo as costas
  t.rect(19 + ux, 27 + uy, 10, 9, TC.cape[1]);
  t.rect(19 + ux + P.capeSway, 36 + uy, 10, 1, TC.cape[1]);
  t.rect(22 + ux, 29 + uy, 1, 7, TC.cape[2]);
  t.rect(25 + ux, 29 + uy, 1, 7, TC.cape[2]);
  t.rect(19 + ux, 27 + uy, 10, 1, TC.cape[0]);
  // cabeça (nuca)
  const X = 20 + ux;
  const Y = 18 + uy;
  t.rect(X - 1, Y - 2, 10, 9, TC.hair[1]);
  t.rect(X + 1, Y - 2, 6, 1, TC.hair[2]);
  t.rect(X + 2, Y - 1, 2, 3, TC.hair[2]);
  t.rect(X - 1, Y + 5, 10, 2, TC.hair[0]);
  t.rect(X + 2, Y + 7, 4, 1, TC.skinS);
  if (TC.hood) {
    t.rect(X - 2, Y - 3, 12, 10, TC.cape[1]);
    t.rect(X, Y - 3, 6, 1, TC.cape[0]);
    t.rect(X - 1, Y + 5, 10, 2, TC.cape[2]);
  }
}

function drawBodySide(t, P, ux, uy) {
  // perfil olhando para a esquerda
  const lx = Math.round(ux / 2);
  // capa atrás (à direita), esvoaçando
  t.rect(26 + ux, 27 + uy, 3, 9, TC.cape[1]);
  t.rect(28 + ux, 31 + uy, 1 + P.capeFly, 5, TC.cape[2]);
  // braço de trás
  if (!P.off) t.rect(24 + ux - P.armSwing, 28 + uy, 2, 4, TC.tunic[2]);
  // pernas
  const a = P.legA;
  const b = -P.legA + P.spread;
  t.rect(23 + lx + b, 35 - P.liftR, 2, 4, TC.pants[1]);
  t.rect(22 + lx + b, 39 - P.liftR, 3, 2, TC.boots[1]);
  t.rect(22 + lx + a - P.spread, 35 - P.liftL, 2, 4, TC.pants[0]);
  t.rect(21 + lx + a - P.spread, 39 - P.liftL, 3, 2, TC.boots[0]);
  // túnica
  t.rect(21 + ux, 27 + uy, 6, 7, TC.tunic[1]);
  t.rect(21 + ux, 27 + uy, 1, 7, TC.tunic[0]);
  t.rect(26 + ux, 27 + uy, 1, 7, TC.tunic[2]);
  t.rect(20 + ux, 33 + uy, 8, 2, TC.tunic[1]);
  t.rect(20 + ux, 34 + uy, 8, 1, TC.tunic[2]);
  t.rect(21 + ux, 32 + uy, 6, 1, TC.belt);
  t.set(21 + ux, 32 + uy, TC.buckle);
  // cabeça de perfil
  const X = 19 + ux;
  const Y = 18 + uy;
  t.rect(X, Y + 1, 7, 7, TC.skin);
  t.rect(X, Y + 7, 6, 1, TC.skinS);
  t.set(X - 1, Y + 4, TC.skin); // nariz
  t.rect(X, Y - 2, 9, 4, TC.hair[1]);
  t.rect(X + 2, Y - 2, 4, 1, TC.hair[2]);
  t.rect(X + 4, Y + 1, 5, 6, TC.hair[1]);
  t.rect(X + 7, Y + 5, 2, 2, TC.hair[0]);
  t.set(X, Y + 2, TC.hair[0]);
  t.set(X + 1, Y + 2, TC.hair[1]);
  t.set(X + 5, Y + 4, TC.skinS); // orelha
  t.set(X + 5, Y + 5, TC.skinS);
  if (P.hurt) t.rect(X, Y + 4, 2, 1, TC.eye);
  else t.rect(X + 1, Y + 4, 1, 2, TC.eye);
  t.set(X + 1, Y + 6, TC.blush);
  if (TC.mask) {
    t.rect(X - 1, Y + 5, 6, 2, TC.mask);
    t.rect(X - 1, Y + 6, 6, 1, TC.maskS);
  }
  if (TC.hood) {
    t.rect(X, Y - 3, 9, 4, TC.cape[1]);
    t.rect(X + 4, Y, 6, 8, TC.cape[1]);
    t.rect(X + 2, Y - 3, 4, 1, TC.cape[0]);
    t.rect(X + 4, Y + 1, 1, 6, TC.cape[2]);
  }
}

function drawTerenFrame(img, ox, oy, d, P) {
  const tmp = new Img(TF, TF);
  const fx = new Img(TF, TF);
  const [vx, vy] = DIRV[d];
  const ux = Math.round(vx * P.lean);
  const uy = Math.round(vy * P.lean + P.bob);
  // sombra
  img.ellipse(ox + 24, oy + 41, P.roll !== undefined ? 7 : 6, 2, '#000000', 0.32);

  if (P.roll !== undefined) {
    const k = P.roll;
    const cy = 35 - [0, 2, 3, 3, 2, 0][k];
    const sq = k === 0 || k === 5 ? 1.15 : 1;
    tmp.ellipse(24, cy, 6.5 * sq, 6.5 / sq, TC.tunic[1]);
    tmp.ellipse(24.5, cy + 1, 4.5, 4, TC.tunic[2]);
    const th = rad(k * 60 + 20);
    for (let a = -0.9; a <= 0.9; a += 0.15)
      tmp.ellipse(24 + Math.cos(th + a) * 4.6, cy + Math.sin(th + a) * 4.6, 1.3, 1.3, TC.cape[1]);
    tmp.ellipse(24 + Math.cos(th + Math.PI) * 3.4, cy + Math.sin(th + Math.PI) * 3.4, 2.4, 2.4, TC.hair[1]);
    tmp.ellipse(24 + Math.cos(th + 1.8) * 4, cy + Math.sin(th + 1.8) * 4, 1.4, 1.4, TC.boots[0]);
    tmp.outline(0, 0, TF, TF);
    composite(img, tmp, ox, oy);
    return;
  }

  const view = d === 2 ? 1 : d;
  const [sx0, sy0] = SHOULDER[view];
  const sx = sx0 + ux;
  const sy = sy0 + uy;
  const ang = DIRA[view] + P.rel;
  const hx = Math.round(sx + Math.cos(rad(ang)) * P.r);
  const hy = Math.round(sy + Math.sin(rad(ang)) * P.r);
  const len = P.len ?? 11;
  const tipY = hy + Math.sin(rad(ang)) * len;
  const behind = tipY < sy - 2;

  // rastro do golpe
  if (P.smearFrom !== undefined) {
    const a0 = DIRA[view] + P.smearFrom;
    drawSmear(fx, sx, sy, a0, ang, P.r + 3, P.r + len + 1, P.smear ?? 1);
  }
  if (P.thrust) drawThrustSmear(fx, hx, hy, ang, len, P.thrust);

  if (behind) drawSword(tmp, hx, hy, ang, len);
  if (view === 0) drawBodyFront(tmp, P, ux, uy);
  else if (view === 3) drawBodyBack(tmp, P, ux, uy);
  else drawBodySide(tmp, P, ux, uy);
  // braço da espada: ombro → mão
  thickLine(tmp, sx, sy, Math.round((sx + hx) / 2), Math.round((sy + hy) / 2), TC.tunic[2]);
  thickLine(tmp, Math.round((sx + hx) / 2), Math.round((sy + hy) / 2), hx, hy, TC.skin);
  tmp.rect(hx, hy, 2, 2, TC.skin);
  if (!behind) drawSword(tmp, hx, hy, ang, len);
  // mão livre estendida (conjurar)
  if (P.off) {
    const [ox0, oy0] = OFF_SHOULDER[view];
    const fxx = ox0 + ux + vx * 7;
    const fyy = oy0 + uy + (view === 1 ? 0 : vy * 6);
    const ax = view === 1 ? 25 - 7 + ux : fxx;
    thickLine(tmp, ox0 + ux, oy0 + uy, ax, fyy, TC.tunic[2]);
    tmp.rect(ax, fyy, 2, 2, TC.skin);
  }
  tmp.outline(0, 0, TF, TF);
  if (behind) {
    composite(img, fx, ox, oy);
    composite(img, tmp, ox, oy);
  } else {
    composite(img, tmp, ox, oy);
    composite(img, fx, ox, oy);
  }
  if (P.off) {
    const [ox0, oy0] = OFF_SHOULDER[view];
    const cx = ox + (view === 1 ? 17 : ox0 + vx * 8) + ux;
    const cy = oy + oy0 + uy + (view === 1 ? 0 : vy * 8);
    img.ellipse(cx + 1, cy + 1, 2.6, 2.6, TC.fire[2], 0.9);
    img.ellipse(cx + 1, cy + 1, 1.6, 1.6, TC.fire[1]);
    img.set(cx + 1, cy, TC.fire[0]);
  }
}

// composite precisa existir antes; definido abaixo como function (hoisting)
function terenPoses(view) {
  const idle = IDLE_ANGLE[view] - DIRA[view];
  const base = { bob: 0, lean: 0, rel: idle, r: 4, liftL: 0, liftR: 0, spread: 0, armSwing: 0, capeSway: 0, capeFly: 0, legA: 0 };
  const P = (o) => ({ ...base, ...o });
  const frames = [];
  // parado (respiração)
  for (const b of [0, 0, 1, 1]) frames.push(P({ bob: b, rel: idle + b * 3 }));
  // andar (6)
  for (let k = 0; k < 6; k++) {
    const s = Math.sin((k / 6) * Math.PI * 2);
    frames.push(
      P({
        bob: k === 1 || k === 4 ? -1 : 0,
        liftL: s > 0.4 ? 1 : 0,
        liftR: s < -0.4 ? 1 : 0,
        legA: Math.round(s * 2.5),
        armSwing: Math.round(-s),
        capeSway: Math.round(s),
        capeFly: k % 3 === 0 ? 1 : 2,
        rel: idle + s * 8,
      }),
    );
  }
  // golpe 1: diagonal (preparo → impacto → continuação → recuperação)
  const slash = (rels, rs, leans) =>
    rels.map((rel, i) =>
      P({
        rel,
        r: rs[i],
        lean: leans[i],
        spread: i >= 1 && i <= 3 ? 1 : 0,
        smearFrom: i >= 1 && i <= 3 ? rels[i - 1] : undefined,
        smear: [0, 0.7, 1, 0.55, 0][i],
        capeFly: i >= 2 ? 2 : 0,
        capeSway: i >= 2 ? 1 : 0,
        armSwing: i >= 2 ? 1 : 0,
      }),
    );
  frames.push(...slash([-125, -70, -5, 55, 70], [4, 6, 8, 7, 5], [-1, 0, 1.5, 1.5, 0.5]));
  // golpe 2: de volta (backhand)
  frames.push(...slash([115, 70, 5, -55, -70], [5, 6, 8, 7, 5], [-0.5, 0, 1.5, 1.5, 0.5]));
  // golpe 3: estocada com avanço
  const th = [
    { r: 1, lean: -1.5, bob: 1 },
    { r: 3, lean: -1, bob: 1 },
    { r: 10, lean: 2.5, thrust: 1 },
    { r: 10, lean: 2.5, thrust: 0.5 },
    { r: 6, lean: 1 },
  ];
  for (const t of th) frames.push(P({ rel: 0, len: 12, spread: 1, capeFly: 2, ...t }));
  // rolagem (6)
  for (let k = 0; k < 6; k++) frames.push({ roll: k });
  // dano
  frames.push(P({ lean: -1.5, rel: idle + 25, r: 3, hurt: true, armSwing: -1 }));
  // conjurar
  frames.push(P({ lean: 0.5, off: true, rel: idle - 10 }));
  return frames;
}

// (o Teren agora é gerado por scripts/hero/build.mjs; este rig 2D segue em uso pelo Bandoleiro)

// Bandoleiro no mesmo rig: 0–3 parado · 4–9 andar · 10–14 golpe de adaga · 15 dano
const BANDIT_COLS = 16;
function banditPoses(view) {
  const all = terenPoses(view);
  const idle = IDLE_ANGLE[view] - DIRA[view];
  const base = all[0];
  const P = (o) => ({ ...base, ...o });
  const dagger = 7;
  const stab = [
    P({ rel: -150, r: 3, lean: -1, bob: 1, len: dagger }),
    P({ rel: -95, r: 5, lean: 0, len: dagger, smearFrom: -150, smear: 0.6 }),
    P({ rel: -20, r: 9, lean: 2, len: dagger, spread: 1, smearFrom: -95, smear: 1 }),
    P({ rel: 30, r: 8, lean: 2, len: dagger, spread: 1, smearFrom: -20, smear: 0.5 }),
    P({ rel: idle, r: 5, lean: 0.5, len: dagger }),
  ];
  const withDagger = (f) => ({ ...f, len: dagger });
  return [...all.slice(0, 10).map(withDagger), ...stab, withDagger(all[31])];
}
{
  TC = BANDIT_PAL;
  const sheet = new Img(BANDIT_COLS * TF, 4 * TF);
  for (const d of [0, 1, 3]) banditPoses(d).forEach((p, c) => drawTerenFrame(sheet, c * TF, d * TF, d, p));
  for (let c = 0; c < BANDIT_COLS; c++) sheet.mirror(c * TF, TF, TF, TF, c * TF, 2 * TF);
  save('assets/sprites/bandit.png', sheet);
  TC = TEREN_PAL;
}


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
// ================================================================ CRIATURAS DOS BIOMAS
// Vista lateral olhando para a esquerda (o jogo espelha para a direita).
// Inimigos: 0–1 andar, 2 preparo, 3 ataque, 4 dano. Animais: 0–1 andar, 2 alerta, 3 correndo.
function sheetN(file, frames, S, draw, sw) {
  const img = new Img(frames * S, S);
  for (let f = 0; f < frames; f++) {
    img.ellipse(f * S + S / 2, S - 1.4, sw, 1.5, '#000000', 0.3);
    const tmp = new Img(S, S);
    draw(tmp, f);
    tmp.outline(0, 0, S, S);
    composite(img, tmp, f * S, 0);
  }
  save(file, img);
}
const CP = {
  boar: ['#6e4a32', '#523624', '#8a6040', '#3a2618', '#efe6d0'],
  bear: ['#eef0f2', '#cdd3dc', '#ffffff', '#a8b2c0', '#2a2430'],
  golem: ['#8c8983', '#6e6b66', '#a8a59e', '#4e4b47', '#5ee0ea'],
  spider: ['#2c2438', '#1c1626', '#b46cec', '#e6b8ff', '#5ee0ea'],
  scorp: ['#c87a3a', '#a05a28', '#e09a52', '#6e3a18', '#2a1a10'],
  fox: ['#d8742e', '#b05a22', '#f2f0e8', '#3a2418'],
  hare: ['#f2f4f8', '#d2d8e2', '#e8a0a8', '#3a3040'],
  goat: ['#8a7a68', '#6a5c4c', '#d8d0c0', '#3a3028', '#c8b890'],
  lizard: ['#a8a050', '#848040', '#d4cc7a', '#4a4a20', '#c84a3a'],
};
// javali: atropela (investida longa)
sheetN('assets/sprites/boar.png', 5, 16, (t, f) => {
  const P = CP.boar;
  const crouch = f === 2;
  const charge = f === 3;
  const by = crouch ? 9 : 8;
  const legs = f === 1 ? [[4, 1], [6, -1], [11, 1], [13, -1]] : charge ? [[2, 2], [5, 2], [11, -2], [14, -2]] : [[4, 0], [6, 0], [11, 0], [13, 0]];
  for (const [x, s] of legs) t.line(x, by + 3, x + Math.sign(s), by + 6 - (crouch ? 1 : 0), P[3]);
  t.ellipse(9, by + 1.5, charge ? 6.5 : 6, 3.4, P[0]);
  t.ellipse(9.5, by + 0.5, 5, 2, P[2]);
  for (let x = 6; x <= 13; x += 2) t.set(x, by - 2, P[3]);
  t.line(14, by, 15, by - 1, P[1]);
  const hx = charge ? 1 : 2;
  const hy = crouch ? by + 2 : by;
  t.ellipse(hx + 2.5, hy + 1, 2.8, 2.4, P[1]);
  t.rect(hx - 0.5, hy + 1, 2, 2, P[2]);
  t.set(hx - 0.5, hy + 1, P[3]);
  t.line(hx + 1, hy + 3, hx - 0.5, hy + 1.5, P[4]);
  t.set(hx + 2, hy, P[4]);
  t.set(hx + 3, hy - 1.5, P[1]);
}, 5.5);
// urso-polar: ergue-se e golpeia o chão
sheetN('assets/sprites/bear.png', 5, 24, (t, f) => {
  const P = CP.bear;
  const rear = f === 2;
  const slam = f === 3;
  if (rear) {
    t.ellipse(13, 13, 5.5, 7.5, P[0]);
    t.ellipse(12, 12, 3.5, 5.5, P[2]);
    t.rect(10, 19, 3, 4, P[1]);
    t.rect(15, 19, 3, 4, P[1]);
    t.ellipse(10, 4.5, 3.6, 3.2, P[0]);
    t.set(7, 4, P[4]);
    t.set(9, 3, P[4]);
    t.set(11, 1.5, P[1]);
    t.line(8, 9, 5, 6, P[1]);
    t.line(17, 9, 19, 6, P[1]);
    t.set(5, 5.5, P[4]);
    return;
  }
  const by = slam ? 13 : 12;
  const legs = f === 1 ? [[5, 1], [8, -1], [15, 1], [18, -1]] : slam ? [[3, 2], [6, 2], [16, 0], [19, 0]] : [[5, 0], [8, 0], [15, 0], [18, 0]];
  for (const [x, s] of legs) t.rect(x + (s > 0 ? -1 : 0), by + 3, 3, 23 - by - 4, P[1]);
  t.ellipse(12.5, by + 1, 8.5, 5, P[0]);
  t.ellipse(12, by - 0.5, 6.5, 3, P[2]);
  t.ellipse(20, by - 1, 1.5, 1.5, P[1]);
  const hx = slam ? 2 : 3;
  const hy = slam ? by + 1 : by - 2;
  t.ellipse(hx + 3, hy, 3.6, 3.2, P[0]);
  t.rect(hx - 0.5, hy, 2.5, 2, P[2]);
  t.set(hx - 0.5, hy, P[4]);
  t.set(hx + 2, hy - 1, P[4]);
  t.ellipse(hx + 5, hy - 3, 1, 1, P[1]);
  if (slam) for (const x of [1, 3]) t.set(x, by + 7, P[3]);
}, 8);
// golem de pedra: lento, ergue os braços e esmaga
sheetN('assets/sprites/golem.png', 5, 24, (t, f) => {
  const P = CP.golem;
  const up = f === 2;
  const slam = f === 3;
  const bob = f === 1 ? 1 : 0;
  // pernas
  t.rect(8, 17, 4, 6 - bob, P[1]);
  t.rect(13, 17 + bob, 4, 6 - bob, P[1]);
  // tronco
  t.rect(6, 8 + bob, 13, 10, P[0]);
  t.rect(6, 8 + bob, 13, 2, P[2]);
  t.rect(16, 10 + bob, 3, 8, P[3]);
  t.line(9, 12 + bob, 12, 15 + bob, P[3]);
  t.rect(7, 14 + bob, 3, 2, PAL.forest[2]);
  // cabeça
  t.rect(4, 3 + bob, 7, 6, P[0]);
  t.rect(4, 3 + bob, 7, 1, P[2]);
  t.set(5, 5 + bob, P[4]);
  t.set(7, 5 + bob, P[4]);
  // braços
  if (up) {
    t.rect(2, 0, 3, 8, P[1]);
    t.rect(19, 0, 3, 9, P[1]);
    t.rect(1, 0, 5, 3, P[0]);
    t.rect(18, 0, 5, 3, P[0]);
  } else if (slam) {
    t.rect(0, 14, 5, 4, P[0]);
    t.rect(2, 9, 3, 6, P[1]);
    t.rect(19, 10, 3, 8, P[1]);
    for (const x of [0, 3, 6]) t.set(x, 20, P[3]);
  } else {
    t.rect(2, 9 + bob, 4, 9, P[1]);
    t.rect(2, 16 + bob, 4, 3, P[0]);
    t.rect(19, 9 + bob, 3, 8, P[1]);
  }
}, 7);
// aranha de cristal: pula no herói
sheetN('assets/sprites/spider.png', 5, 16, (t, f) => {
  const P = CP.spider;
  const crouch = f === 2;
  const leap = f === 3;
  const by = crouch ? 10 : leap ? 7 : 9;
  const swing = f === 1 ? 1 : 0;
  for (let i = 0; i < 4; i++) {
    const x = 4 + i * 2.6;
    const out = leap ? 2 : 0;
    t.line(x, by, x - 2 - out + (i % 2 ? swing : -swing), by + 4 - (crouch ? 1 : 0), P[1]);
    t.line(x + 1, by, x + 3 + out - (i % 2 ? swing : -swing), by + 4 - (crouch ? 1 : 0), P[0]);
  }
  t.ellipse(10, by - 0.5, 4.5, 3, P[0]);
  t.ellipse(4.5, by + 0.5, 2.5, 2.2, P[1]);
  t.set(3, by, P[4]);
  t.set(4, by - 0.5, P[4]);
  // cristais nas costas
  for (const [x, h] of [[8, 3], [10, 4], [12, 3]]) {
    t.line(x, by - 3, x, by - 3 - h, P[2]);
    t.set(x, by - 3 - h, P[3]);
  }
}, 5);
// escorpião: ferroada rápida
sheetN('assets/sprites/scorpion.png', 5, 16, (t, f) => {
  const P = CP.scorp;
  const raise = f === 2;
  const sting = f === 3;
  const by = 10;
  const leg = f === 1 ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    t.line(6 + i * 2, by + 1, 5 + i * 2 - leg, by + 4, P[3]);
    t.line(7 + i * 2, by + 1, 8 + i * 2 + leg, by + 4, P[1]);
  }
  t.ellipse(8, by, 4.5, 2.2, P[0]);
  t.ellipse(8, by - 0.8, 3.5, 1, P[2]);
  // pinças
  t.line(4, by, 1, by - 1, P[1]);
  t.ellipse(1.5, by - 1.5, 1.6, 1.2, P[0]);
  t.set(0, by - 2, P[3]);
  // cauda segmentada
  const tail = sting ? [[12, by - 1], [14, by - 3], [13, by - 6], [9, by - 7], [6, by - 6]] : raise ? [[12, by - 1], [14, by - 3], [14.5, by - 5.5], [14, by - 8], [12, by - 9.5]] : [[12, by - 1], [14, by - 3], [14, by - 6], [12, by - 8], [10, by - 7]];
  for (const [x, y] of tail) t.ellipse(x, y, 1.4, 1.2, P[0]);
  const [sx, sy] = tail[tail.length - 1];
  t.set(sx - 1, sy + 1, P[4]);
  t.set(sx - 2, sy + 1, P[4]);
  t.set(3, by - 1, P[4]);
}, 5);
// raposa
sheetN('assets/sprites/fox.png', 4, 16, (t, f) => {
  const P = CP.fox;
  const run = f === 3;
  const legs = f === 1 ? [[4, 1], [6, -1], [10, 1], [12, -1]] : run ? [[2, 2], [5, 2], [10, -2], [13, -2]] : [[4, 0], [5, 0], [10, 0], [11, 0]];
  for (const [x, s] of legs) t.line(x, 10, x + Math.sign(s), 13, P[3]);
  t.ellipse(8, 9, 4.5, 2.2, P[0]);
  t.rect(5, 10, 5, 1, P[2]);
  t.ellipse(13.5, 8, 2.5, 1.6, P[0]);
  t.set(15, 7, P[2]);
  t.set(15, 8, P[2]);
  const hx = run ? 1.5 : 2.5;
  const hy = f === 2 ? 5 : 6;
  t.ellipse(hx + 1.5, hy + 1, 2.2, 1.8, P[0]);
  t.set(hx - 0.5, hy + 1.5, P[3]);
  t.rect(hx, hy + 2, 2, 1, P[2]);
  t.set(hx + 1, hy - 1, P[1]);
  t.set(hx + 2.5, hy - 1.5, P[1]);
  t.set(hx + 1, hy + 0.5, P[3]);
}, 4.5);
// lebre-da-neve
sheetN('assets/sprites/hare.png', 4, 16, (t, f) => {
  const P = CP.hare;
  const run = f === 3;
  const by = run ? 9 : 10;
  t.ellipse(9, by, run ? 4.5 : 3.6, 2.6, P[0]);
  t.ellipse(12.5, by + 1, 1.4, 1.4, P[0]);
  t.rect(9, by + 2, 3, 2, P[1]);
  t.rect(5, by + 2, 2, 2, P[1]);
  const hy = f === 2 ? by - 4 : by - 3;
  t.ellipse(5, hy + 1, 2.2, 2, P[0]);
  t.line(5, hy - 1, 5 + (run ? 3 : 1), hy - 5, P[0]);
  t.line(6, hy - 1, 7 + (run ? 3 : 1), hy - 4, P[1]);
  t.set(4, hy + 0.5, P[3]);
  t.set(3, hy + 1.5, P[2]);
}, 3.5);
// cabra-montesa
sheetN('assets/sprites/goat.png', 4, 16, (t, f) => {
  const P = CP.goat;
  const run = f === 3;
  const legs = f === 1 ? [[4, 1], [6, -1], [11, 1], [13, -1]] : run ? [[2, 2], [5, 2], [11, -2], [14, -2]] : [[4, 0], [5, 0], [11, 0], [12, 0]];
  for (const [x, s] of legs) t.line(x, 9, x + Math.sign(s), 13, P[3]);
  t.ellipse(8.5, 8, 5, 2.6, P[0]);
  t.rect(5, 9, 6, 1, P[1]);
  t.set(14, 6, P[1]);
  const hx = run ? 1.5 : 2.5;
  const hy = f === 2 ? 2 : 3;
  t.rect(hx + 2, hy + 2, 2, 3, P[0]);
  t.ellipse(hx + 1.5, hy + 1.5, 2, 1.8, P[0]);
  t.line(hx + 2, hy - 0.5, hx + 5, hy - 2, P[4]);
  t.line(hx + 5, hy - 2, hx + 6, hy, P[4]);
  t.set(hx, hy + 3.5, P[2]);
  t.set(hx + 1, hy + 1, P[3]);
}, 4.5);
// lagarto do deserto
sheetN('assets/sprites/lizard.png', 4, 16, (t, f) => {
  const P = CP.lizard;
  const run = f === 3;
  const by = 11;
  const leg = f === 1 || run ? 1 : 0;
  t.line(5, by + 1, 4 - leg, by + 3, P[3]);
  t.line(9, by + 1, 10 + leg, by + 3, P[3]);
  t.ellipse(7.5, by, 4, 1.6, P[0]);
  t.line(11, by, 15, by + (run ? 0 : 1), P[1]);
  t.set(14, by + 1, P[1]);
  const hy = f === 2 ? by - 3 : by - 1;
  t.ellipse(3, hy + 0.5, 2.2, 1.4, P[0]);
  t.set(2, hy, P[3]);
  if (f === 2) t.set(0, hy + 1, P[4]);
  for (const x of [6, 8, 10]) t.set(x, by - 1, P[2]);
}, 4);
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

// ícones dos botões (16×16): golpe, esquiva, chama, coração (+ armas e ações, abaixo)
{
  const img = new Img(16 * 21, 16);
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
  // 4 giro, 5 montante, 6 cajado/raio, 7 arco, 8 tiro triplo, 9 estocada, 10 coletar, 11 mochila, 12 trocar arma
  {
    const ic = (i, draw) => {
      const t = new Img(16, 16);
      draw(t);
      t.outline(0, 0, 16, 16);
      composite(img, t, i * 16, 0);
    };
    ic(4, (t) => {
      for (let a = 0; a < Math.PI * 1.75; a += 0.07) t.set(8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, a > 4 ? '#ffffff' : '#bfe6ff');
      t.line(5, 11, 11, 5, PAL.steel[0]);
      t.line(6, 11, 12, 5, PAL.steel[1]);
      t.rect(4, 11, 2, 2, PAL.belt[1]);
    });
    ic(5, (t) => {
      t.line(2, 14, 13, 3, PAL.steel[1]);
      t.line(3, 14, 14, 3, PAL.steel[0]);
      t.line(2, 13, 13, 2, PAL.steel[0]);
      t.line(1, 11, 5, 15, PAL.belt[1]);
      t.rect(1, 14, 2, 2, PAL.wood[1]);
    });
    ic(6, (t) => {
      t.line(3, 15, 10, 4, PAL.wood[0]);
      t.line(4, 15, 11, 4, PAL.wood[2]);
      t.ellipse(11.5, 3.5, 2.6, 2.6, '#b46cec');
      t.ellipse(11, 3, 1.2, 1.2, '#e6b8ff');
    });
    ic(7, (t) => {
      for (let a = -1.2; a <= 1.2; a += 0.06) t.set(6 + Math.cos(a) * 6, 8 + Math.sin(a) * 6.5, PAL.wood[0]);
      t.line(6, 2, 6, 14, '#e8e2d0');
      t.line(3, 8, 14, 8, PAL.steel[1]);
      t.rect(13, 7, 2, 3, PAL.steel[0]);
      t.rect(2, 7, 2, 3, '#e04848');
    });
    ic(8, (t) => {
      for (const dy of [-4, 0, 4]) {
        t.line(2, 8 + dy * 0.6, 12, 8 + dy, PAL.steel[1]);
        t.rect(12, 7 + dy, 2, 2, PAL.steel[0]);
        t.set(2, 8 + dy * 0.6, '#e04848');
      }
    });
    ic(9, (t) => {
      t.line(1, 8, 13, 8, PAL.steel[0]);
      t.line(1, 9, 13, 9, PAL.steel[1]);
      t.rect(13, 7, 2, 4, '#ffffff');
      for (const x of [3, 6, 9]) t.set(x, 5, '#bfe6ff');
      for (const x of [4, 7, 10]) t.set(x, 12, '#bfe6ff');
    });
    ic(10, (t) => {
      t.line(4, 14, 11, 4, PAL.wood[0]);
      t.line(5, 14, 12, 4, PAL.wood[2]);
      t.rect(8, 2, 6, 3, PAL.steel[1]);
      t.rect(8, 2, 6, 1, PAL.steel[0]);
      t.rect(13, 4, 1, 3, PAL.steel[1]);
    });
    ic(11, (t) => {
      t.rect(3, 6, 10, 8, PAL.wood[0]);
      t.rect(3, 6, 10, 2, PAL.wood[2]);
      t.rect(6, 3, 4, 3, PAL.wood[1]);
      t.rect(7, 9, 2, 2, PAL.belt[1]);
    });
    ic(12, (t) => {
      for (let a = 0.4; a < Math.PI - 0.4; a += 0.08) t.set(8 + Math.cos(a) * 5, 9 - Math.sin(a) * 5, '#ffe9a8');
      for (let a = Math.PI + 0.4; a < Math.PI * 2 - 0.4; a += 0.08) t.set(8 + Math.cos(a) * 5, 7 - Math.sin(a) * 5, '#ffe9a8');
      t.rect(12, 7, 2, 3, '#ffe9a8');
      t.rect(2, 6, 2, 3, '#ffe9a8');
    });
    // habilidades novas: 13 grito de guerra, 14 golpe sísmico, 15 fúria, 16 lança de gelo,
    // 17 nova arcana, 18 flecha perfurante, 19 chuva de flechas, 20 atributos
    ic(13, (t) => {
      t.rect(2, 6, 4, 5, PAL.wood[1]);
      t.line(5, 6, 9, 3, PAL.wood[2]);
      t.line(5, 10, 9, 13, PAL.wood[2]);
      t.line(9, 3, 9, 13, PAL.wood[0]);
      for (const r of [3, 5.5]) for (let a = -0.9; a <= 0.9; a += 0.12) t.set(9 + Math.cos(a) * r, 8 + Math.sin(a) * r, '#ffe9a8');
    });
    ic(14, (t) => {
      t.rect(1, 11, 14, 3, PAL.rock[2]);
      t.rect(1, 11, 14, 1, PAL.rock[4]);
      t.line(8, 11, 6, 14, '#1e1a24');
      t.line(8, 11, 11, 14, '#1e1a24');
      t.line(7, 2, 7, 10, PAL.steel[0]);
      t.line(8, 2, 8, 10, PAL.steel[1]);
      t.rect(5, 2, 5, 1, PAL.belt[1]);
      for (const x of [2, 13]) t.set(x, 9, '#e0c090');
    });
    ic(15, (t) => {
      t.ellipse(8, 9, 5, 5.5, '#7a1f2a');
      t.ellipse(8, 7, 3, 5, '#e04848');
      t.ellipse(8, 10, 2.5, 3, '#ff9a3a');
      t.rect(5, 8, 2, 1, '#ffffff');
      t.rect(9, 8, 2, 1, '#ffffff');
    });
    ic(16, (t) => {
      t.line(2, 14, 12, 4, '#5ec8ee');
      t.line(3, 14, 13, 4, '#cdf2ff');
      t.line(12, 2, 14, 4, '#ffffff');
      t.rect(12, 3, 2, 2, '#ffffff');
      for (const [x, y] of [[4, 9], [8, 13], [10, 9]]) t.set(x, y, '#9fe8ff');
    });
    ic(17, (t) => {
      for (const [r, c] of [[6.5, '#b46cec'], [4, '#e6b8ff']]) for (let a = 0; a < Math.PI * 2; a += 0.1) t.set(8 + Math.cos(a) * r, 8 + Math.sin(a) * r, c);
      t.ellipse(8, 8, 1.6, 1.6, '#ffffff');
    });
    ic(18, (t) => {
      t.line(1, 8, 13, 8, PAL.wood[2]);
      t.rect(12, 7, 3, 3, PAL.steel[0]);
      t.rect(1, 7, 2, 3, '#e04848');
      for (const x of [5, 9]) {
        t.line(x, 4, x, 6, '#ffffff');
        t.line(x, 10, x, 12, '#ffffff');
      }
    });
    ic(19, (t) => {
      for (const [x, y] of [[3, 2], [8, 4], [12, 1]]) {
        t.line(x, y, x, y + 7, PAL.wood[2]);
        t.rect(x - 1, y + 7, 3, 2, PAL.steel[0]);
      }
      t.ellipse(8, 14, 6, 1.5, '#e04848');
    });
    ic(20, (t) => {
      t.rect(2, 12, 3, 3, '#5ec8ee');
      t.rect(6, 9, 3, 6, '#78ba60');
      t.rect(10, 6, 3, 9, '#ffe9a8');
      t.line(3, 7, 7, 3, '#ffffff');
      t.rect(6, 2, 3, 2, '#ffffff');
    });
  }
  save('assets/sprites/ui-icons.png', img);
}

// projéteis: flecha (aponta para a direita) e raio arcano (2 quadros)
{
  const ar = new Img(16, 16);
  ar.line(1, 8, 12, 8, PAL.wood[2]);
  ar.rect(12, 7, 3, 3, PAL.steel[0]);
  ar.set(15, 8, PAL.steel[0]);
  ar.rect(0, 6, 2, 1, '#e04848');
  ar.rect(0, 10, 2, 1, '#e04848');
  ar.outline(0, 0, 16, 16);
  save('assets/sprites/arrow.png', ar);
  const bo = new Img(32, 16);
  for (let f = 0; f < 2; f++) {
    bo.ellipse(f * 16 + 8, 8, 4.5 - f, 4.5 - f, '#7b3cc2');
    bo.ellipse(f * 16 + 8, 8, 3, 3, '#b46cec');
    bo.ellipse(f * 16 + 7.5, 7.5, 1.6 + f * 0.4, 1.6 + f * 0.4, '#f4e0ff');
  }
  save('assets/sprites/bolt.png', bo);
}

// itens (16×16) — recursos por região; índices em src/data/items.ts
{
  const N = 14;
  const img = new Img(16 * N, 16);
  const item = (i, draw) => {
    const t = new Img(16, 16);
    draw(t);
    t.outline(0, 0, 16, 16);
    composite(img, t, i * 16, 0);
  };
  const log = (bark, core, ring, extra) => (t) => {
    t.rect(2, 6, 11, 6, bark[0]);
    t.rect(2, 6, 11, 2, bark[1]);
    t.rect(2, 11, 11, 1, bark[2]);
    t.ellipse(13, 9, 2.2, 3, core);
    t.set(13, 9, ring);
    if (extra) extra(t);
  };
  item(0, log(['#6e4426', '#8a5a32', '#4f2f1a'], '#d8b07a', '#a87a48'));
  item(1, log(['#3a2a20', '#5a4232', '#241a14'], '#c8a070', '#8a6a48', (t) => t.rect(3, 5, 8, 2, '#f6faff')));
  item(2, log(['#3a3040', '#4a4054', '#2a2230'], '#7a7084', '#5a5064'));
  item(3, log(['#a88a52', '#c8a86a', '#8a6a3a'], '#e8d0a0', '#b89a62', (t) => { for (let x = 3; x < 12; x += 3) t.rect(x, 6, 1, 6, '#8a6a3a'); }));
  const stone = (P, extra) => (t) => {
    t.ellipse(8, 10, 6, 4, P[1]);
    t.ellipse(7, 9, 4.5, 2.8, P[0]);
    t.set(5, 8, P[2]);
    if (extra) extra(t);
  };
  item(4, stone(['#9a9ca0', '#7f8287', '#b9bbbe'], (t) => { t.rect(5, 7, 3, 1, PAL.forest[2]); t.set(10, 8, PAL.forest[0]); }));
  item(5, stone(['#9aa6b4', '#7a8696', '#c8d4e0'], (t) => t.ellipse(8, 7.5, 5, 1.6, '#f6faff')));
  item(6, (t) => {
    t.rect(3, 6, 10, 8, '#787570');
    t.rect(3, 4, 10, 3, '#a3a099');
    t.rect(11, 6, 2, 8, '#64615c');
  });
  item(7, stone(['#8c8983', '#6e6b66', '#bbb8b1'], (t) => { for (const [x, y] of [[5, 9], [8, 8], [10, 11], [7, 11]]) { t.set(x, y, '#e0b84a'); t.set(x + 1, y, '#a07a22'); } }));
  item(8, (t) => {
    for (const [x, h, w] of [[6, 9, 2], [9, 12, 3], [12, 7, 2]]) {
      for (let y = 0; y < h; y++) {
        const ww = Math.max(1, Math.round(w * (1 - (y / h) * 0.8)));
        for (let k = 0; k < ww; k++) t.set(x - (ww >> 1) + k, 14 - y, k === 0 ? '#e6b8ff' : '#b46cec');
      }
    }
  });
  item(9, stone(['#dea26c', '#b07440', '#f0c090'], (t) => t.rect(3, 10, 10, 1, '#8e5a30')));
  item(10, (t) => {
    for (let i = 0; i < 5; i++) t.line(3 + i * 2, 14, 6 + i * 2, 3, i % 2 ? '#78ba60' : '#5c9c4a');
    t.rect(3, 9, 10, 2, '#c8a86a');
  });
  item(11, (t) => {
    for (const [x, h] of [[6, 9], [9, 12], [11, 7]]) for (let y = 0; y < h; y++) t.rect(x - (y < h * 0.7 ? 1 : 0), 14 - y, y < h * 0.7 ? 2 : 1, 1, y > h * 0.6 ? '#ffffff' : '#a9d3ec');
  });
  item(12, (t) => {
    for (const [x, y] of [[6, 9], [9, 8], [8, 11], [11, 11], [5, 12]]) {
      t.ellipse(x, y, 1.8, 1.8, '#c0392b');
      t.set(x - 0.5, y - 0.5, '#ff8a7a');
    }
    t.line(8, 7, 10, 4, PAL.forest[2]);
    t.rect(10, 3, 3, 2, PAL.oak[2]);
  });
  item(13, (t) => {
    t.ellipse(8, 9, 5.5, 4, '#e8e2d0');
    t.ellipse(7, 8, 3.5, 2.2, '#ffffff');
    t.rect(4, 11, 8, 2, '#c8c0a8');
  });
  save('assets/sprites/items.png', img);
}

// ================================================================ CONSTRUÇÕES
// construções das cidades (por bioma), torres, fonte e barracas
drawBuildings({ Img, rng, save, composite, PAL }, ROOT);
drawRankIcons({ Img, save });
drawUiKit({ Img, save, composite });


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
