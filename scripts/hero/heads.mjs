// Cabeça do herói desenhada à mão (pixel a pixel) em 5 vistas; as outras 3
// são espelhadas. Os desenhos ficam em scripts/hero/heads/*.txt (24×24, um
// caractere por pixel) e são encaixados sobre o corpo renderizado.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'heads');

/** Paleta dos desenhos (caractere → cor). */
export const HEAD_PAL = {
  o: [36, 20, 15], // contorno
  h: [90, 46, 22], // cabelo escuro
  H: [138, 74, 34], // cabelo
  j: [180, 110, 52], // cabelo claro
  J: [214, 149, 90], // brilho do cabelo
  s: [246, 206, 166], // pele
  S: [222, 160, 122], // pele sombra
  t: [180, 112, 90], // pele sombra funda
  e: [28, 16, 16], // cílio
  I: [70, 36, 22], // íris
  p: [36, 18, 14], // pupila
  i: [150, 86, 42], // íris clara
  w: [255, 255, 255], // brilho do olho
  m: [150, 70, 58], // boca
  k: [238, 156, 136], // bochecha
  b: [70, 36, 18], // sobrancelha
};

/** Centro da cabeça dentro do desenho (px). */
export const HEAD_ANCHOR = [12, 15];

function load(name) {
  const rows = readFileSync(join(DIR, `${name}.txt`), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'));
  return rows.map((r) => r.padEnd(24, '.').slice(0, 24));
}

const VIEWS = Object.fromEntries(['S', 'SW', 'W', 'NW', 'N'].map((k) => [k, load(k)]));
const mirror = (g) => g.map((r) => [...r].reverse().join(''));

/** Vista e espelhamento por yaw do modelo (0 = de frente). */
export function headView(yaw) {
  const y = ((Math.round(yaw) % 360) + 360) % 360;
  const table = { 0: ['S', false], 315: ['SW', false], 270: ['W', false], 225: ['NW', false], 180: ['N', false], 135: ['NW', true], 90: ['W', true], 45: ['SW', true] };
  const [k, flip] = table[y] ?? ['S', false];
  return flip ? mirror(VIEWS[k]) : VIEWS[k];
}

/**
 * Gira o desenho (vizinho mais próximo) em torno da âncora — usado na
 * cambalhota. Devolve uma grade 32×32 (margem para os cantos) e a âncora nela.
 */
export function rotateGrid(g, deg) {
  const N = 32, P = 4;
  const a = (-deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const [ax, ay] = HEAD_ANCHOR;
  const out = [];
  for (let y = 0; y < N; y++) {
    let row = '';
    for (let x = 0; x < N; x++) {
      const dx = x - P + 0.5 - ax, dy = y - P + 0.5 - ay;
      const sx = Math.floor(ax + dx * c - dy * s), sy = Math.floor(ay + dx * s + dy * c);
      row += sx >= 0 && sy >= 0 && sx < 24 && sy < 24 ? g[sy][sx] : '.';
    }
    out.push(row);
  }
  return { grid: out, anchor: [ax + P, ay + P] };
}
