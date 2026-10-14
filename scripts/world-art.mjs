// Arte do mundo grande: transições suaves entre terrenos, tiles de cidade e
// construções por bioma. Chamado por generate-assets.mjs (recebe os
// utilitários de lá). Os índices batem com src/systems/Tiles.ts e as medidas
// das construções vão para src/data/buildings.ts (gerado aqui).
import fs from 'node:fs';
import path from 'node:path';

/**
 * Materiais com transição, do mais baixo para o mais alto: o material mais
 * alto "derrama" meio tile sobre o vizinho mais baixo (neve cobre a grama, a
 * grama cobre a terra da estrada, a areia cobre a água…).
 * Ordem igual a MATERIALS em src/systems/Terrain.ts (o índice 0 é o primeiro
 * material com transição). `src` = tile de onde vem a textura.
 */
export const EDGE_MATERIALS = [
  { id: 'ice', src: 132, rim: '#8ec0e0' },
  { id: 'dirt', src: 6, rim: '#7f5836' },
  { id: 'gravel', src: 147, rim: '#64615c' },
  { id: 'stone', src: 144, rim: '#64615c' },
  { id: 'obsidian', src: 164, rim: '#1c1821' },
  { id: 'ash', src: 160, rim: '#1c1821' },
  { id: 'sandstone', src: 180, rim: '#8e5a30' },
  { id: 'dune', src: 176, rim: '#c08e48' },
  { id: 'sand', src: 7, rim: '#b9a068' },
  { id: 'grass', src: 0, rim: '#3f7a31' },
  { id: 'forest', src: 12, rim: '#2c5124' },
  { id: 'snowshade', src: 131, rim: '#98aac4' },
  { id: 'snow', src: 128, rim: '#b6c4d8' },
  // cumes das montanhas (arredondam o contorno dos maciços); ficam nas linhas 32–35
  { id: 'snowpeak', src: 138, rim: '#7d90ad' },
  { id: 'rockpeak', src: 153, rim: '#4e4b47' },
  { id: 'blackpeak', src: 171, rim: '#1c1821' },
  { id: 'mesapeak', src: 186, rim: '#6e4424' },
];
export const EDGE_BASE = 256;
/** Base do tile de transição do material `mi` (os 13 primeiros nas linhas 16–28, os cumes a partir do 512). */
export const edgeBase = (mi) => (mi < 13 ? EDGE_BASE + mi * 16 : 512 + (mi - 13) * 16);
export const CITY_BASE = 464;

const hash = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Ruído suave (bilinear de uma grade 4×4 por tile). */
const smooth = (x, y, s) => {
  const gx = x / 4;
  const gy = y / 4;
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const fx = gx - i;
  const fy = gy - j;
  const a = hash(i, j, s);
  const b = hash(i + 1, j, s);
  const c = hash(i, j + 1, s);
  const d = hash(i + 1, j + 1, s);
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
};

/**
 * Tiles de transição: para cada material, 15 máscaras (bits dos cantos:
 * 1 NO, 2 NE, 4 SO, 8 SE). A cobertura é a interpolação dos 4 cantos com um
 * ruído que some nas bordas do tile (as bordas casam com os vizinhos), uma
 * linha de contorno por dentro e uma sombra leve por fora.
 */
export function drawEdges({ tiles, at, hex }) {
  const T = 16;
  EDGE_MATERIALS.forEach((m, mi) => {
    const [sx, sy] = at(m.src);
    for (let mask = 1; mask < 16; mask++) {
      const [ox, oy] = at(edgeBase(mi) + mask);
      const cov = [];
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const u = (x + 0.5) / T;
          const v = (y + 0.5) / T;
          const c = (mask & 1 ? (1 - u) * (1 - v) : 0) + (mask & 2 ? u * (1 - v) : 0) + (mask & 4 ? (1 - u) * v : 0) + (mask & 8 ? u * v : 0);
          const env = 16 * u * (1 - u) * v * (1 - v);
          const n = smooth(x + mask * 37, y + mi * 23, 7 + mi) - 0.5;
          cov.push(c + n * 0.42 * env > 0.5);
        }
      const on = (x, y) => x >= 0 && y >= 0 && x < T && y < T && cov[y * T + x];
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          if (on(x, y)) {
            const k = ((sy + y) * tiles.w + sx + x) * 4;
            // contorno: pixel coberto vizinho de um descoberto (dentro do tile)
            const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
              const nx = x + dx;
              const ny = y + dy;
              return nx >= 0 && ny >= 0 && nx < T && ny < T && !cov[ny * T + nx];
            });
            if (edge) tiles.set(ox + x, oy + y, m.rim);
            else tiles.put(ox + x, oy + y, tiles.d[k], tiles.d[k + 1], tiles.d[k + 2], 255);
          } else if ([[1, 0], [-1, 0], [0, -1]].some(([dx, dy]) => on(x + dx, y + dy))) {
            // sombra fininha do lado de fora (dá relevo à borda)
            tiles.set(ox + x, oy + y, '#000000', 0.16);
          }
        }
    }
  });
  void hex;
}

// ------------------------------------------------------------------ tiles de cidade
export const BIOME_STYLE = ['green', 'snow', 'block', 'black', 'dust'];
const WALL = {
  green: ['#a3a3a0', '#858582', '#c0c0bc', '#6a6a68'],
  snow: ['#9aa4b0', '#7c8694', '#c4ccd6', '#5e6874'],
  block: ['#7a7670', '#625e59', '#97938b', '#4a4743'],
  black: ['#3e3648', '#2e2836', '#564c62', '#1e1a24'],
  dust: ['#d2a468', '#b88a52', '#e6bf86', '#946a3a'],
};
const PAVE = {
  snow: ['#b8c0cc', '#9aa4b0', '#dde4ec', '#7c8694'],
  block: ['#8a857d', '#726e67', '#a39e95', '#56524d'],
  black: ['#4a4054', '#3a3244', '#5e5270', '#241e2a'],
  dust: ['#dcb47a', '#c89c62', '#ecca94', '#a87c48'],
};

export function drawCityTiles({ tiles, at, rng, PAL, Img }) {
  const T = 16;
  // muralhas: topo (ameias) e frente (pedras) por bioma
  BIOME_STYLE.forEach((b, i) => {
    const C = WALL[b];
    const r = rng(900 + i);
    {
      const [ox, oy] = at(CITY_BASE + i * 2);
      tiles.rect(ox, oy, T, T, C[1]);
      for (let y = 0; y < T; y += 4)
        for (let x = (y / 4) % 2 ? -3 : 0; x < T; x += 6) {
          tiles.rect(ox + Math.max(0, x), oy + y, Math.min(5, T - Math.max(0, x)), 3, r() > 0.5 ? C[0] : C[2]);
          tiles.rect(ox + Math.max(0, x), oy + y + 3, Math.min(6, T - Math.max(0, x)), 1, C[3]);
        }
      // ameias no alto
      for (let x = 0; x < T; x += 8) {
        tiles.rect(ox + x, oy, 5, 3, C[2]);
        tiles.rect(ox + x, oy + 3, 5, 1, C[3]);
      }
      if (b === 'snow') for (let x = 0; x < T; x += 8) tiles.rect(ox + x, oy, 5, 1, '#f6faff');
    }
    {
      const [ox, oy] = at(CITY_BASE + i * 2 + 1);
      tiles.rect(ox, oy, T, T, C[3]);
      for (let y = 1; y < T; y += 5)
        for (let x = (y % 2) * 4; x < T; x += 8) {
          tiles.rect(ox + x, oy + y, Math.min(7, T - x), 4, r() > 0.5 ? C[1] : C[0]);
          tiles.rect(ox + x, oy + y, Math.min(7, T - x), 1, C[2]);
        }
      tiles.rect(ox, oy + 14, T, 2, '#000000', 0.25);
    }
  });
  // ponte vertical (tábuas horizontais, atravessa rio leste-oeste)
  {
    const [ox, oy] = at(CITY_BASE + 10);
    const W = PAL.wood;
    for (let y = 0; y < T; y++) {
      const plank = Math.floor(y / 4);
      tiles.rect(ox + 1, oy + y, 14, 1, plank % 2 ? W[0] : W[2]);
      if (y % 4 === 3) tiles.rect(ox + 1, oy + y, 14, 1, W[1]);
    }
    tiles.rect(ox, oy, 1, T, W[3]);
    tiles.rect(ox + 15, oy, 1, T, W[3]);
  }
  // calçamentos por bioma (o verde usa o calçamento original)
  ['snow', 'block', 'black', 'dust'].forEach((b, i) => {
    const [ox, oy] = at(CITY_BASE + 11 + i);
    const C = PAVE[b];
    const r = rng(950 + i);
    tiles.rect(ox, oy, T, T, C[3]);
    const stones = b === 'dust' ? [[0, 0, 8, 8], [8, 0, 8, 8], [0, 8, 8, 8], [8, 8, 8, 8]] : [[0, 0, 7, 5], [8, 0, 8, 5], [0, 6, 5, 4], [6, 6, 6, 4], [13, 6, 3, 4], [0, 11, 8, 5], [9, 11, 7, 5]];
    for (const [x, y, w, h] of stones) {
      tiles.rect(ox + x, oy + y, w - 1, h - 1, r() > 0.5 ? C[0] : C[1]);
      tiles.rect(ox + x, oy + y, w - 1, 1, C[2]);
    }
    if (b === 'snow') for (let k = 0; k < 6; k++) tiles.set(ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), '#f6faff');
    if (b === 'black') for (let k = 0; k < 2; k++) tiles.set(ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), '#b46cec');
  });
  // decoração de rua (16×16 com contorno)
  const deco = (id, draw) => {
    const t = new Img(16, 16);
    draw(t);
    t.outline(0, 0, 16, 16);
    const [ox, oy] = at(CITY_BASE + id);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const k = (y * 16 + x) * 4;
        if (t.d[k + 3]) tiles.put(ox + x, oy + y, t.d[k], t.d[k + 1], t.d[k + 2], t.d[k + 3]);
      }
  };
  const W = PAL.wood;
  deco(16, (t) => {
    // barril
    t.ellipse(8, 14, 5, 1.5, '#000000', 0.3);
    t.rect(4, 4, 8, 10, W[0]);
    t.rect(4, 4, 2, 10, W[2]);
    t.rect(4, 6, 8, 1, '#4a4a52');
    t.rect(4, 11, 8, 1, '#4a4a52');
    t.ellipse(8, 4, 4, 1.4, W[3]);
  });
  deco(17, (t) => {
    // caixote
    t.ellipse(8, 14, 6, 1.5, '#000000', 0.3);
    t.rect(3, 5, 10, 9, W[2]);
    t.rect(3, 5, 10, 1, W[0]);
    t.line(3, 5, 12, 13, W[1]);
    t.line(12, 5, 3, 13, W[1]);
    t.rect(3, 13, 10, 1, W[1]);
  });
  deco(18, (t) => {
    // pilha de caixotes
    t.ellipse(8, 14, 7, 1.5, '#000000', 0.3);
    for (const [x, y] of [[1, 8], [8, 8], [4, 2]]) {
      t.rect(x, y, 7, 6, W[2]);
      t.rect(x, y, 7, 1, W[0]);
      t.line(x, y, x + 6, y + 5, W[1]);
    }
  });
  deco(19, (t) => {
    // banco
    t.rect(1, 8, 14, 2, W[2]);
    t.rect(1, 8, 14, 1, W[0]);
    t.rect(2, 10, 2, 4, W[1]);
    t.rect(12, 10, 2, 4, W[1]);
  });
  deco(20, (t) => {
    // vaso de flores
    t.rect(4, 9, 8, 5, '#b5483a');
    t.rect(4, 9, 8, 1, '#cf6a50');
    t.ellipse(8, 7, 5, 3, '#3f8a3a');
    for (const [x, y, c] of [[5, 6, '#e0484a'], [9, 5, '#f2c94c'], [11, 7, '#c46ad6'], [7, 8, '#f4f1ea']]) t.rect(x, y, 2, 2, c);
  });
  deco(21, (t) => {
    // fardo de feno
    t.ellipse(8, 14, 6, 1.5, '#000000', 0.3);
    t.rect(2, 6, 12, 8, '#d8b04a');
    t.rect(2, 6, 12, 1, '#f0d070');
    for (let x = 3; x < 14; x += 3) t.line(x, 7, x, 13, '#b08a2c');
    t.rect(2, 9, 12, 1, '#8a5a32');
  });
  deco(22, (t) => {
    // sacos
    t.ellipse(8, 14, 6, 1.5, '#000000', 0.3);
    t.ellipse(5.5, 10, 4, 4, '#c8b28a');
    t.ellipse(10.5, 10.5, 4, 3.6, '#b39a72');
    t.rect(4, 6, 3, 1, '#7a5a3a');
    t.rect(9, 7, 3, 1, '#7a5a3a');
  });
  // plantação nova / madura e terra arada
  {
    const [ox, oy] = at(CITY_BASE + 25);
    tiles.rect(ox, oy, T, T, '#7f5836');
    for (let y = 1; y < T; y += 4) {
      tiles.rect(ox, oy + y, T, 2, '#946a42');
      tiles.rect(ox, oy + y + 2, T, 1, '#5e3e22');
    }
  }
  for (const [id, ripe] of [[23, false], [24, true]]) {
    const [ox, oy] = at(CITY_BASE + id);
    const [fx, fy] = at(CITY_BASE + 25);
    tiles.blit(tiles, fx, fy, T, T, ox, oy);
    for (let y = 1; y < T; y += 4)
      for (let x = 1; x < T; x += 3) {
        if (ripe) {
          tiles.rect(ox + x, oy + y - 2, 1, 4, '#c8a83c');
          tiles.set(ox + x, oy + y - 3, '#f2d36a');
          tiles.set(ox + x + 1, oy + y - 2, '#e8c050');
        } else {
          tiles.set(ox + x, oy + y, '#6aab48');
          tiles.set(ox + x, oy + y - 1, '#7dbb54');
        }
      }
  }
  // praça: piso decorado (padrão em losango)
  {
    const [ox, oy] = at(CITY_BASE + 26);
    const C = PAL.cobble;
    tiles.rect(ox, oy, T, T, C[0]);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
        if (Math.abs(d - 7) < 0.6) tiles.set(ox + x, oy + y, C[3]);
        else if (d < 6.5 && (x + y) % 4 === 0) tiles.set(ox + x, oy + y, C[2]);
      }
    tiles.rect(ox, oy, T, 1, C[1]);
    tiles.rect(ox, oy, 1, T, C[1]);
  }
  deco(27, (t) => {
    // estandarte
    t.rect(7, 1, 2, 14, W[1]);
    t.rect(9, 2, 6, 8, '#b5483a');
    t.rect(9, 2, 6, 1, '#cf6a50');
    t.rect(11, 5, 2, 2, '#f2c94c');
  });
}

// ------------------------------------------------------------------ construções
/** Estilo de cada bioma: paredes, telhados (2 variantes) e janelas. */
const STYLE = {
  green: { wall: ['#e6d7b3', '#c7b48c', '#f3e8cc', '#a8946c'], timber: true, roofs: [['#b5483a', '#8e3229', '#cf6a50'], ['#c8963c', '#a87a2c', '#deb05a'], ['#8a5a32', '#6e4426', '#a8743f']], win: ['#2a3550', '#ffd36a'] },
  snow: { wall: ['#8a5a32', '#6e4426', '#a8743f', '#4f2f1a'], logs: true, roofs: [['#4a6ea8', '#36528a', '#6a8ec4'], ['#5a5f70', '#454958', '#727889'], ['#7a3a3a', '#5a2a2a', '#9a5050']], snowcap: true, win: ['#2a3550', '#ffd36a'] },
  block: { wall: ['#a3a3a0', '#858582', '#c0c0bc', '#6a6a68'], bricks: true, roofs: [['#5a5f70', '#454958', '#727889'], ['#6a4a3a', '#54382a', '#84604a'], ['#4a5a50', '#3a483f', '#5e7064']], win: ['#2a3550', '#ffd36a'] },
  black: { wall: ['#4a4054', '#3a3244', '#5e5270', '#241e2a'], bricks: true, roofs: [['#5a3a7a', '#42285c', '#7a54a0'], ['#2e2836', '#1e1a24', '#433b4a'], ['#6a2a4a', '#4a1a34', '#8a3a62']], spikes: true, win: ['#1a1424', '#c890ff'] },
  dust: { wall: ['#dcb27a', '#c89c62', '#ecca94', '#a87c48'], flat: true, roofs: [['#b5483a', '#8e3229', '#cf6a50'], ['#2f8a7e', '#226860', '#46a898'], ['#d8b04a', '#b08a2c', '#f0d070']], win: ['#3a2a20', '#ffc860'] },
};

/** Tamanhos: largura × altura do sprite, altura da parede e linhas de colisão (de baixo). */
export const SIZES = {
  s: { w: 48, h: 48, wall: 22, solidRows: 2, variants: 2 },
  m: { w: 64, h: 64, wall: 28, solidRows: 3, variants: 2 },
  l: { w: 96, h: 80, wall: 34, solidRows: 3, variants: 1 },
};

function windowsFor(w, wall) {
  // janelas dos dois lados da porta, espaçadas de 16 px
  const n = Math.max(1, Math.floor((w / 2 - 12) / 16));
  const xs = [];
  for (let i = 0; i < n; i++) {
    xs.push(w / 2 - 16 - i * 16);
    xs.push(w / 2 + 8 + i * 16);
  }
  return xs.map((x) => [x, -wall + 7]);
}

function drawBuilding(Img, rng, b, size, variant, lit, seed) {
  const S = STYLE[b];
  const Z = SIZES[size];
  const t = new Img(Z.w, Z.h);
  const r = rng(seed);
  const W = Z.w;
  const H = Z.h;
  const top = H - Z.wall;
  const C = S.wall;
  const roof = S.roofs[(variant + (size === 'l' ? 2 : 0)) % S.roofs.length];
  const x0 = 4;
  const x1 = W - 4;
  // sombra no chão
  t.ellipse(W / 2, H - 2, W / 2 - 2, 3, '#000000', 0.3);
  // paredes
  t.rect(x0, top, x1 - x0, Z.wall - 2, C[0]);
  t.rect(x0, top, x1 - x0, 2, C[1]);
  if (S.timber) {
    for (const x of [x0, x1 - 2, W / 2 - 1]) t.rect(x, top, 2, Z.wall - 2, '#6e4426');
    t.rect(x0, top + Math.round(Z.wall / 2) - 2, x1 - x0, 2, '#6e4426');
    t.line(x0 + 2, top + 2, x0 + 10, top + Math.round(Z.wall / 2) - 2, '#6e4426');
    t.line(x1 - 3, top + 2, x1 - 11, top + Math.round(Z.wall / 2) - 2, '#6e4426');
  }
  if (S.logs) for (let y = top; y < H - 2; y += 4) {
    t.rect(x0, y, x1 - x0, 3, r() > 0.5 ? C[0] : C[2]);
    t.rect(x0, y + 3, x1 - x0, 1, C[3]);
    t.ellipse(x0 + 1, y + 1.5, 1.5, 1.5, C[2]);
    t.ellipse(x1 - 1, y + 1.5, 1.5, 1.5, C[2]);
  }
  if (S.bricks) for (let y = top + 2; y < H - 2; y += 4)
    for (let x = x0 + ((y / 4) % 2) * 3; x < x1; x += 6) {
      t.rect(x, y, Math.min(5, x1 - x), 3, r() > 0.5 ? C[0] : C[2]);
      t.rect(x, y + 3, Math.min(6, x1 - x), 1, C[3]);
    }
  if (S.flat) {
    // adobe: manchas e base mais escura
    for (let k = 0; k < Z.w; k++) t.set(x0 + Math.floor(r() * (x1 - x0)), top + 2 + Math.floor(r() * (Z.wall - 5)), C[1]);
    t.rect(x0, H - 6, x1 - x0, 4, C[3]);
  }
  // base de pedra nas casas grandes
  if (size !== 's' && !S.bricks) {
    t.rect(x0, H - 7, x1 - x0, 5, '#858582');
    for (let x = x0; x < x1; x += 5) t.rect(x, H - 7, 1, 5, '#6a6a68');
  }
  // porta (dupla nas grandes)
  const dw = size === 'l' ? 14 : 8;
  const dh = size === 'l' ? 18 : 13;
  const dx = Math.round(W / 2 - dw / 2);
  const dy = H - 2 - dh;
  t.rect(dx - 1, dy - 1, dw + 2, dh + 1, '#4f2f1a');
  t.rect(dx, dy, dw, dh, '#8a5a32');
  for (let x = dx + 3; x < dx + dw; x += 3) t.rect(x, dy, 1, dh, '#6e4426');
  if (size === 'l' || S.flat) t.ellipse(W / 2, dy, dw / 2, 3, '#8a5a32');
  t.set(dx + dw - 2, dy + Math.round(dh / 2), '#d9b04a');
  // toldo na porta (deserto)
  if (S.flat) {
    t.rect(dx - 5, dy - 5, dw + 10, 4, roof[0]);
    for (let x = dx - 5; x < dx + dw + 5; x += 4) t.rect(x, dy - 5, 2, 4, roof[2]);
  }
  // janelas
  for (const [wx, wy] of windowsFor(W, Z.wall)) {
    const x = Math.round(wx);
    const y = H + wy;
    if (x < x0 + 1 || x + 8 > x1 - 1) continue;
    t.rect(x - 1, y - 1, 10, 9, '#4f2f1a');
    t.rect(x, y, 8, 7, lit ? S.win[1] : S.win[0]);
    if (S.flat) t.ellipse(x + 4, y, 4, 2, lit ? S.win[1] : S.win[0]);
    t.rect(x + 4, y, 1, 7, '#4f2f1a');
    t.rect(x, y + 3, 8, 1, '#4f2f1a');
    t.set(x + 1, y + 1, lit ? '#fff6d0' : '#5a6a90');
    if (b === 'green' && !lit) t.rect(x, y + 7, 8, 2, '#3f8a3a');
  }
  // telhado
  if (S.flat) {
    // teto plano com mureta e, nas grandes, cúpula
    t.rect(x0 - 1, top - 6, x1 - x0 + 2, 6, C[2]);
    t.rect(x0 - 1, top - 6, x1 - x0 + 2, 1, '#f6e2b8');
    t.rect(x0 - 1, top - 1, x1 - x0 + 2, 1, C[3]);
    for (let x = x0; x < x1; x += 6) t.rect(x, top - 9, 3, 3, C[2]);
    if (size !== 's') {
      const rr = size === 'l' ? 20 : 13;
      const cy = top - 6 - rr * 0.5;
      t.ellipse(W / 2, cy, rr, rr * 0.9, roof[1]);
      t.ellipse(W / 2 - rr * 0.25, cy - rr * 0.25, rr * 0.7, rr * 0.6, roof[0]);
      t.ellipse(W / 2 - rr * 0.4, cy - rr * 0.45, rr * 0.25, rr * 0.2, roof[2]);
      t.rect(W / 2 - 1, cy - rr * 0.9 - 5, 2, 6, '#d9b04a');
    }
  } else {
    const roofH = top - 2;
    for (let y = 0; y < roofH; y++) {
      const k = y / roofH;
      const inset = (1 - Math.min(1, k * 1.6)) * (W / 2 - 6);
      const a = Math.floor(1 + inset);
      const z = Math.ceil(W - 1 - inset);
      for (let x = a; x < z; x++) {
        const row = Math.floor(y / 3);
        let c = row % 2 ? roof[0] : roof[1];
        if (x < W / 2 && y > 2) c = row % 2 ? roof[2] : roof[0];
        if (S.snowcap && (y < roofH * 0.45 || (y > roofH - 4 && r() > 0.3))) c = y < roofH * 0.42 ? '#f6faff' : '#dfe8f2';
        t.set(x, y + 2, c);
      }
    }
    t.rect(1, top, W - 2, 2, roof[1]);
    if (S.snowcap) {
      t.rect(1, top, W - 2, 1, '#f6faff');
      for (let x = 4; x < W - 4; x += 5) t.rect(x, top + 2, 1, 2 + Math.floor(r() * 3), '#cde9f8');
    }
    t.rect(W / 2 - 1, 2, 2, roofH, S.snowcap ? '#dfe8f2' : roof[1]);
    if (S.spikes) for (let x = 6; x < W - 6; x += 8) {
      t.line(x, top, x, top - 5, '#1e1a24');
      t.set(x, top - 6, '#b46cec');
    }
    // chaminé ou torre
    if (size === 'l') {
      // torre lateral com bandeira
      t.rect(W - 22, 0, 14, top + 2, C[1]);
      t.rect(W - 22, 0, 14, 3, C[2]);
      for (let x = W - 22; x < W - 8; x += 4) t.rect(x, 0, 2, 2, C[3]);
      t.rect(W - 18, 8, 6, 8, lit ? S.win[1] : S.win[0]);
    } else {
      t.rect(W - 14, 0, 5, 9, C[3]);
      t.rect(W - 14, 0, 5, 1, C[2]);
    }
  }
  t.outline(0, 0, W, H);
  return t;
}

/** Folhas das construções: casa-<bioma>-<tamanho>.png com variantes × (apagada, acesa). */
export function drawBuildings({ Img, rng, save, composite, PAL }, srcDir) {
  const meta = {};
  BIOME_STYLE.forEach((b, bi) => {
    for (const [size, Z] of Object.entries(SIZES)) {
      const img = new Img(Z.w * Z.variants * 2, Z.h);
      for (let v = 0; v < Z.variants; v++)
        for (let lit = 0; lit < 2; lit++) composite(img, drawBuilding(Img, rng, b, size, v, !!lit, 1000 + bi * 50 + v * 7 + size.charCodeAt(0)), (v * 2 + lit) * Z.w, 0);
      save(`assets/tiles/bld-${b}-${size}.png`, img);
      meta[`${b}-${size}`] = { w: Z.w, h: Z.h, variants: Z.variants, solidRows: Z.solidRows, windows: windowsFor(Z.w, Z.wall).filter(([x]) => x >= 5 && x + 8 <= Z.w - 5).map(([x, y]) => [x + 4, Z.h + y + 3]) };
    }
  });
  // torres da muralha (32×48), uma por bioma
  {
    const img = new Img(32 * 5, 48);
    BIOME_STYLE.forEach((b, i) => {
      const C = WALL[b];
      const t = new Img(32, 48);
      t.ellipse(16, 46, 14, 2.5, '#000000', 0.3);
      t.rect(3, 10, 26, 36, C[1]);
      for (let y = 12; y < 46; y += 4)
        for (let x = 3 + ((y / 4) % 2) * 3; x < 29; x += 6) {
          t.rect(x, y, Math.min(5, 29 - x), 3, (x + y) % 3 ? C[0] : C[2]);
          t.rect(x, y + 3, Math.min(6, 29 - x), 1, C[3]);
        }
      t.rect(1, 4, 30, 7, C[2]);
      for (let x = 1; x < 31; x += 6) t.rect(x, 0, 4, 5, C[2]);
      t.rect(1, 10, 30, 1, C[3]);
      t.rect(13, 20, 6, 9, '#1e1a24');
      t.ellipse(16, 20, 3, 2, '#1e1a24');
      if (b === 'snow') {
        t.rect(1, 4, 30, 2, '#f6faff');
        for (let x = 1; x < 31; x += 6) t.rect(x, 0, 4, 1, '#f6faff');
      }
      if (b === 'black') t.rect(14, 22, 4, 5, '#b46cec');
      t.outline(0, 0, 32, 48);
      composite(img, t, i * 32, 0);
    });
    save('assets/tiles/tower.png', img);
  }
  // fonte da praça (48×40)
  {
    const t = new Img(48, 40);
    t.ellipse(24, 30, 22, 8, '#000000', 0.3);
    t.ellipse(24, 27, 21, 8, '#858582');
    t.ellipse(24, 25, 21, 8, '#c0c0bc');
    t.ellipse(24, 25, 18, 6, PAL.water[1]);
    t.ellipse(24, 24, 15, 4.5, PAL.water[0]);
    t.rect(21, 8, 6, 17, '#a3a3a0');
    t.rect(21, 8, 2, 17, '#c0c0bc');
    t.ellipse(24, 9, 8, 3, '#c0c0bc');
    t.ellipse(24, 8, 6, 2, PAL.water[2]);
    for (const [x, y] of [[17, 12], [31, 12], [14, 18], [34, 18], [24, 3]]) t.rect(x, y, 1, 3, PAL.water[3]);
    t.rect(23, 1, 2, 7, PAL.water[3]);
    t.outline(0, 0, 48, 40);
    save('assets/tiles/fountain.png', t);
  }
  // barracas de feira (32×32, 3 cores)
  {
    const img = new Img(96, 32);
    [['#b5483a', '#f3e8cc'], ['#4a6ea8', '#f3e8cc'], ['#2f8a7e', '#f2c94c']].forEach(([a, c], i) => {
      const t = new Img(32, 32);
      t.ellipse(16, 30, 14, 2, '#000000', 0.3);
      t.rect(4, 12, 2, 18, '#6e4426');
      t.rect(26, 12, 2, 18, '#6e4426');
      t.rect(3, 20, 26, 7, '#a8743f');
      t.rect(3, 20, 26, 1, '#c89660');
      for (const [x, cc] of [[6, '#e0484a'], [11, '#f2c94c'], [16, '#78ba60'], [21, '#c46ad6']]) t.ellipse(x + 2, 19, 2, 1.5, cc);
      for (let y = 4; y < 13; y++) {
        const inset = Math.max(0, 6 - y);
        for (let x = 1 + inset; x < 31 - inset; x++) t.set(x, y, Math.floor(x / 4) % 2 ? a : c);
      }
      for (let x = 1; x < 31; x += 4) t.ellipse(x + 2, 13, 2, 1.5, a);
      t.outline(0, 0, 32, 32);
      composite(img, t, i * 32, 0);
    });
    save('assets/tiles/stall.png', img);
  }
  // medidas para o jogo
  const out = path.join(srcDir, 'src/data/buildings.ts');
  const body = `// Gerado por scripts/world-art.mjs — não editar à mão.
/** Construções por bioma e tamanho: sprite, variantes, linhas sólidas (de baixo) e janelas (px no sprite). */
export const BUILDINGS = ${JSON.stringify(meta)} as const;
export type BuildingKey = keyof typeof BUILDINGS;
`;
  fs.writeFileSync(out, body);
}

// ------------------------------------------------------------------ insígnias de patente
/**
 * Ícones de patente sobre a cabeça (11×11): 10 patentes × 2 lados. O fundo é
 * um escudo azul (aliado / herói) ou vermelho (inimigo); a insígnia é dourada:
 * ponto, 1–3 divisas, 1–2 barras, 1–3 estrelas e a coroa do Marechal.
 */
export function drawRankIcons({ Img, save }) {
  const S = 11;
  const img = new Img(S * 10, S * 2);
  const gold = '#ffd34a';
  const goldD = '#b08a2c';
  for (let team = 0; team < 2; team++)
    for (let r = 0; r < 10; r++) {
      const t = new Img(S, S);
      const [bg, bgD] = team === 0 ? ['#2f5fae', '#1c3a70'] : ['#a83030', '#6a1a1a'];
      // escudo
      for (let y = 0; y < 10; y++) {
        const inset = y < 6 ? 0 : y - 5;
        for (let x = inset; x < 10 - inset; x++) t.set(x, y, y < 5 ? bg : bgD);
      }
      // divisa em ^ (1 px de espessura, sem embolar quando são três)
      const chevron = (y) => {
        for (const [x, dy] of [[2, 2], [3, 1], [4, 0], [5, 0], [6, 1], [7, 2]]) t.set(x, y + dy, gold);
      };
      const bar = (y) => t.rect(2, y, 6, 1.5, gold);
      const star = (cx, cy) => {
        t.set(cx, cy - 1, gold);
        t.set(cx - 1, cy, gold);
        t.set(cx, cy, gold);
        t.set(cx + 1, cy, gold);
        t.set(cx, cy + 1, goldD);
      };
      switch (r) {
        case 0: // Recruta
          t.rect(4, 4, 2, 2, gold);
          break;
        case 1: // Soldado
          chevron(3.5);
          break;
        case 2: // Cabo
          chevron(2);
          chevron(5.5);
          break;
        case 3: // Sargento
          chevron(0.5);
          chevron(3);
          chevron(5.5);
          break;
        case 4: // Tenente
          bar(4);
          break;
        case 5: // Capitão
          bar(3);
          bar(6);
          break;
        case 6: // Major
          star(5, 4);
          break;
        case 7: // Coronel
          star(3, 4);
          star(7, 4);
          break;
        case 8: // General
          star(2, 3);
          star(5, 5);
          star(8, 3);
          break;
        case 9: // Marechal: coroa
          t.rect(2, 4, 6, 3, gold);
          for (const x of [2, 4.5, 7]) t.rect(x, 2, 1, 2, gold);
          t.rect(2, 6, 6, 1, goldD);
          break;
      }
      t.outline(0, 0, S, S);
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const k = (y * S + x) * 4;
          if (t.d[k + 3]) img.put(r * S + x, team * S + y, t.d[k], t.d[k + 1], t.d[k + 2], t.d[k + 3]);
        }
    }
  save('assets/sprites/rank-icons.png', img);
}
