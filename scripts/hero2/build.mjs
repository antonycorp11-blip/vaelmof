// Teren desenhado à mão: monta o spritesheet a partir dos desenhos em ASCII
// (um caractere por pixel, 1 px = 1 px do mundo) e gera as rotações da espada.
//
//   npm run hero
//
// Desenhos: front.txt, side.txt (olhando para a esquerda), back.txt e
// sword.txt; cores em pal.json. Saída:
//   public/assets/sprites/teren.png        32×40, 6 col × 4 lin
//     linhas: baixo, esquerda, direita (espelho), cima
//     colunas: parado, parado (respira), passo A, passo, passo B, passo
//   public/assets/sprites/teren-sword.png  28×28, 32 ângulos (0° = direita, sentido horário)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../lib/png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'public', 'assets', 'sprites');
const PAL = JSON.parse(readFileSync(join(HERE, 'pal.json'), 'utf8'));

const load = (f) =>
  readFileSync(join(HERE, f), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split(''));

const FW = 32, FH = 40;
const clone = (g) => g.map((r) => r.slice());
const blankGrid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));

// faixa das pernas e divisão entre as duas pernas em cada vista
const LEGS = { top: 29, bottom: 38 };

/** Encolhe uma perna (pé levantado): remove 2 linhas da coxa e sobe o resto. */
function liftLeg(g, x0, x1) {
  const o = clone(g);
  for (let y = LEGS.top + 1; y <= LEGS.bottom; y++)
    for (let x = x0; x <= x1; x++) o[y][x] = y + 2 <= LEGS.bottom + 1 && g[y + 2] ? g[y + 2][x] : '.';
  return o;
}

/** Desloca uma perna na horizontal (passada na vista lateral). */
function shiftLeg(g, x0, x1, dx) {
  const o = clone(g);
  for (let y = LEGS.top + 1; y <= LEGS.bottom; y++) {
    for (let x = x0; x <= x1; x++) o[y][x] = '.';
    for (let x = x0; x <= x1; x++) if (g[y][x] !== '.') o[y][x + dx] = g[y][x];
  }
  return o;
}

/** Respiração: o tronco e a cabeça descem 1 px. */
function bob(g) {
  const o = clone(g);
  for (let y = LEGS.top - 1; y >= 1; y--) o[y] = g[y - 1].slice();
  o[0] = Array(FW).fill('.');
  return o;
}

function framesFor(view, g) {
  if (view === 'side') {
    // perna da frente (esquerda na tela) e de trás
    const a = shiftLeg(shiftLeg(g, 6, 11, -1), 12, 21, 1);
    const b = shiftLeg(shiftLeg(g, 6, 11, 1), 12, 21, -1);
    return [g, bob(g), bob(a), g, bob(b), g];
  }
  const a = liftLeg(g, 8, 15);
  const b = liftLeg(g, 16, 23);
  return [g, bob(g), bob(a), g, bob(b), g];
}

const mirror = (g) => g.map((r) => r.slice().reverse());

const views = { down: load('front.txt'), left: load('side.txt'), up: load('back.txt') };
const rows = [framesFor('front', views.down), framesFor('side', views.left), framesFor('side', views.left).map(mirror), framesFor('front', views.up)];

const COLS = 6;
const sheet = new Uint8Array(COLS * FW * 4 * FH * 4);
const SW = COLS * FW;
rows.forEach((frames, r) =>
  frames.forEach((g, c) => {
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const col = PAL[g[y]?.[x]];
        if (!col) continue;
        const i = ((r * FH + y) * SW + c * FW + x) * 4;
        sheet.set([...col, 255], i);
      }
  }),
);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'teren.png'), encodePng(SW, 4 * FH, sheet));

// ------------------------------------------------------------------ espada: 32 rotações ("RotSprite" simplificado)
const sword = load('sword.txt');
const GRIP = [2, 2];
const N = 32, S = 28, K = 6; // ângulos, tamanho do quadro, supersampling
const swordSheet = new Uint8Array(N * S * S * 4);
for (let k = 0; k < N; k++) {
  const a = (k / N) * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const votes = {};
      let opaque = 0;
      for (let j = 0; j < K; j++)
        for (let i = 0; i < K; i++) {
          // ponto no quadro (centro = empunhadura) → espaço do desenho (rotação inversa)
          const px = x + (i + 0.5) / K - S / 2, py = y + (j + 0.5) / K - S / 2;
          const sx = px * c + py * s + GRIP[0] + 0.5, sy = -px * s + py * c + GRIP[1] + 0.5;
          const ch = sword[Math.floor(sy)]?.[Math.floor(sx)];
          if (!ch || ch === '.') continue;
          opaque++;
          votes[ch] = (votes[ch] ?? 0) + (ch === 'o' ? 0.7 : 1);
        }
      if (opaque < K * K * 0.42) continue;
      const ch = Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0];
      const col = PAL[ch];
      swordSheet.set([...col, 255], ((y * N * S) + k * S + x) * 4);
    }
}
writeFileSync(join(OUT, 'teren-sword.png'), encodePng(N * S, S, swordSheet));
console.log('Teren: teren.png (6×4 quadros 32×40) e teren-sword.png (32 ângulos 28×28)');
