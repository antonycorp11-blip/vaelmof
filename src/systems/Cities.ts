import { BUILDINGS, type BuildingKey } from '../data/buildings';
import { mulberry32, valueNoise } from './Noise';
import { T } from './Tiles';
import type { Biome } from './WorldGenerator';

/** Contexto de geração compartilhado com o WorldGenerator (arrays do mundo). */
export interface GenCtx {
  W: number;
  H: number;
  seed: number;
  ground: Int16Array;
  water: Int16Array;
  cliffs: Int16Array;
  decor: Int16Array;
  canopy: Int16Array;
  collision: Uint8Array;
  biome: Uint8Array;
  /** Tiles reservados (cidade, estrada): sem árvores, decoração, montanha, água ou criaturas. */
  reserve: Uint8Array;
  mountain: Uint8Array;
  /** Onde não nasce montanha (em volta das cidades, borda irregular). */
  noMount: Uint8Array;
  /** Chão natural de um bioma num ponto. */
  baseGround: (b: Biome, x: number, y: number, town?: boolean) => number;
}

export type Style = 'green' | 'snow' | 'block' | 'black' | 'dust';
/** Estilo de construção de cada bioma (o vale usa o de Greenland). */
export const STYLE_OF: Style[] = ['green', 'green', 'snow', 'block', 'black', 'dust'];
const STYLE_IDX: Record<Style, number> = { green: 0, snow: 1, block: 2, black: 3, dust: 4 };

export interface City {
  name: string;
  biome: Biome;
  style: Style;
  capital: boolean;
  /** Centro e retângulo da muralha (tiles, inclusivo). */
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Building {
  key: BuildingKey;
  variant: number;
  /** Canto superior esquerdo do sprite (tile). */
  tx: number;
  ty: number;
}

/** Objetos com sprite próprio (posição em px; âncora no pé). */
export type Prop =
  | { kind: 'tower'; x: number; y: number; frame: number }
  | { kind: 'fountain'; x: number; y: number }
  | { kind: 'stall'; x: number; y: number; frame: number }
  | { kind: 'torch'; x: number; y: number };

/** Modelo de cidade: nome, bioma e porte (meia-largura, meia-altura, praça). */
interface CityPlan {
  name: string;
  biome: Biome;
  size: 'capital' | 'major' | 'town';
}
const SIZE = {
  capital: { hw: 34, hh: 26, pw: 9, ph: 6, gate: 5, large: 4 },
  major: { hw: 26, hh: 20, pw: 7, ph: 5, gate: 4, large: 2 },
  town: { hw: 19, hh: 15, pw: 5, ph: 4, gate: 4, large: 1 },
};
/** Margem em volta da muralha (estrada de acesso, fazendas). */
const MARGIN = 14;

export const CITY_PLANS: CityPlan[] = [
  { name: 'Brumavale', biome: 1, size: 'capital' },
  { name: 'Carvalhal', biome: 1, size: 'major' },
  { name: 'Pontealta', biome: 1, size: 'major' },
  { name: 'Pedrafria', biome: 2, size: 'major' },
  { name: 'Invernia', biome: 2, size: 'major' },
  { name: 'Gelomar', biome: 2, size: 'town' },
  { name: 'Rochedo', biome: 3, size: 'major' },
  { name: 'Forjaval', biome: 3, size: 'major' },
  { name: 'Muralha Velha', biome: 3, size: 'town' },
  { name: 'Umbravale', biome: 4, size: 'major' },
  { name: 'Cinzalva', biome: 4, size: 'town' },
  { name: 'Areia Rubra', biome: 5, size: 'major' },
  { name: 'Miragem', biome: 5, size: 'major' },
  { name: 'Solgrave', biome: 5, size: 'town' },
];

/**
 * Escolhe onde fica cada cidade: bem dentro do bioma (longe das fronteiras e
 * do mar), longe das outras cidades. A capital fica no coração de Greenland.
 */
export function pickCities(ctx: GenCtx, oceanMargin: (x: number, y: number) => number, capitalHint: [number, number]): City[] {
  const { W, H, biome } = ctx;
  const rand = mulberry32(ctx.seed + 7001);
  const cities: City[] = [];
  for (const plan of CITY_PLANS) {
    const Z = SIZE[plan.size];
    const m = MARGIN + 6;
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    let valid = 0;
    for (let k = 0; k < 6000 && valid < 80; k++) {
      let x: number;
      let y: number;
      if (plan.size === 'capital') {
        x = Math.round(capitalHint[0] + (rand() - 0.5) * 160);
        y = Math.round(capitalHint[1] + (rand() - 0.5) * 120);
      } else {
        x = Math.floor(rand() * W);
        y = Math.floor(rand() * H);
      }
      if (x - Z.hw - m < 2 || y - Z.hh - m < 2 || x + Z.hw + m >= W - 2 || y + Z.hh + m >= H - 2) continue;
      if (biome[y * W + x] !== plan.biome) continue;
      let ok = true;
      for (let yy = y - Z.hh - m; yy <= y + Z.hh + m && ok; yy += 4)
        for (let xx = x - Z.hw - m; xx <= x + Z.hw + m && ok; xx += 4) if (biome[yy * W + xx] !== plan.biome || oceanMargin(xx, yy) < 8) ok = false;
      if (!ok) continue;
      let minD = Infinity;
      for (const c of cities) minD = Math.min(minD, Math.hypot(c.cx - x, c.cy - y));
      if (minD < 150) continue;
      valid++;
      // folga: quanto do anel em volta também é do bioma
      let ring = 0;
      for (let a = 0; a < 16; a++) {
        const rx = Math.round(x + Math.cos((a / 16) * Math.PI * 2) * (Z.hw + 50));
        const ry = Math.round(y + Math.sin((a / 16) * Math.PI * 2) * (Z.hh + 50));
        if (rx >= 0 && ry >= 0 && rx < W && ry < H && biome[ry * W + rx] === plan.biome) ring++;
      }
      let score = ring * 10 + Math.min(minD, 400) * 0.05;
      if (plan.size === 'capital') score -= Math.hypot(x - capitalHint[0], y - capitalHint[1]) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
    if (!best) continue;
    const [cx, cy] = best;
    cities.push({ name: plan.name, biome: plan.biome, style: STYLE_OF[plan.biome], capital: plan.size === 'capital', cx, cy, x0: cx - Z.hw, y0: cy - Z.hh, x1: cx + Z.hw, y1: cy + Z.hh });
  }
  // reserva: sem água, árvores ou criaturas; as montanhas recuam uma faixa irregular além dela
  for (const c of cities) {
    const E = 12;
    for (let y = c.y0 - MARGIN - E; y <= c.y1 + MARGIN + E; y++)
      for (let x = c.x0 - MARGIN - E; x <= c.x1 + MARGIN + E; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = Math.max(c.x0 - x, x - c.x1, c.y0 - y, y - c.y1);
        if (d <= MARGIN) ctx.reserve[y * W + x] = 1;
        if (d <= MARGIN + 2 + valueNoise(x * 0.12, y * 0.12, ctx.seed + 7050) * (E - 2)) ctx.noMount[y * W + x] = 1;
      }
  }
  return cities;
}

const sizeOf = (c: City) => (c.capital ? SIZE.capital : c.x1 - c.x0 >= SIZE.major.hw * 2 ? SIZE.major : SIZE.town);

/** Porta (ponto de saída, 2 tiles fora da muralha) de cada lado: N, S, O, L. */
function gates(c: City): { x: number; y: number; nx: number; ny: number }[] {
  return [
    { x: c.cx, y: c.y0 - 2, nx: 0, ny: -1 },
    { x: c.cx, y: c.y1 + 2, nx: 0, ny: 1 },
    { x: c.x0 - 2, y: c.cy, nx: -1, ny: 0 },
    { x: c.x1 + 2, y: c.cy, nx: 1, ny: 0 },
  ];
}

/**
 * Estradas de terra entre as cidades (árvore geradora mínima + alguns atalhos),
 * saindo pelos portões. Atravessam rios com pontes e abrem passagem nas
 * montanhas. Devolve a máscara da estrada.
 */
export function buildRoads(ctx: GenCtx, cities: City[]): Uint8Array {
  const { W, H } = ctx;
  const road = new Uint8Array(W * H);
  const rand = mulberry32(ctx.seed + 7101);
  const n = cities.length;
  const d = (a: City, b: City) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const edges = new Set<string>();
  // Prim
  const inTree = [0];
  while (inTree.length < n) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (const i of inTree)
      for (let j = 0; j < n; j++) {
        if (inTree.includes(j)) continue;
        const v = d(cities[i], cities[j]);
        if (v < bd) {
          bd = v;
          best = [i, j];
        }
      }
    if (!best) break;
    inTree.push(best[1]);
    edges.add(best.sort((a, b) => a - b).join('-'));
  }
  // atalhos: cada cidade também liga à 2ª mais próxima, se não for longe
  for (let i = 0; i < n; i++) {
    const order = cities.map((c, j) => [d(cities[i], c), j] as const).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]);
    const second = order[1];
    if (second && second[0] < 420) edges.add([i, second[1]].sort((a, b) => a - b).join('-'));
  }
  const paint = (x: number, y: number, dx: number, dy: number, hw: number) => {
    // a passagem na montanha tem largura irregular (sem paredões retos)
    const cut = 3 + valueNoise(x * 0.09, y * 0.09, ctx.seed + 7060) * 6;
    const R = Math.ceil(cut);
    for (let oy = -R; oy <= R; oy++)
      for (let ox = -R; ox <= R; ox++) {
        const tx = x + ox;
        const ty = y + oy;
        if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) continue;
        const i = ty * W + tx;
        if (ox * ox + oy * oy <= cut * cut) ctx.mountain[i] = 0;
        if (Math.abs(ox) > 2 || Math.abs(oy) > 2) continue;
        ctx.reserve[i] = 1;
        if (Math.abs(ox) > hw || Math.abs(oy) > hw) continue;
        road[i] = 1;
        if (ctx.water[i] >= 0 || ctx.ground[i] === T.VOID) {
          ctx.water[i] = -1;
          ctx.ground[i] = Math.abs(dx) >= Math.abs(dy) ? T.BRIDGE : T.BRIDGE_V;
          ctx.collision[i] = 0;
        } else if (ctx.ground[i] !== T.BRIDGE && ctx.ground[i] !== T.BRIDGE_V) ctx.ground[i] = T.DIRT;
      }
  };
  for (const e of edges) {
    const [a, b] = e.split('-').map(Number);
    const A = cities[a];
    const B = cities[b];
    const pickGate = (from: City, to: City) =>
      gates(from).reduce((best, g) => {
        const vx = to.cx - from.cx;
        const vy = to.cy - from.cy;
        const s = (g.nx * vx + g.ny * vy) / Math.hypot(vx, vy);
        return s > best.s ? { s, g } : best;
      }, { s: -2, g: gates(from)[0] }).g;
    const ga = pickGate(A, B);
    const gb = pickGate(B, A);
    const pts: [number, number][] = [
      [ga.x, ga.y],
      [ga.x + ga.nx * 10, ga.y + ga.ny * 10],
      [gb.x + gb.nx * 10, gb.y + gb.ny * 10],
      [gb.x, gb.y],
    ];
    const hw = A.capital || B.capital ? 1 : 1;
    const amp = (rand() - 0.5) * 2;
    const freq = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, y0] = pts[s];
      const [x1, y1] = pts[s + 1];
      const len = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      const px = -(y1 - y0) / len;
      const py = (x1 - x0) / len;
      for (let k = 0; k <= len; k++) {
        const t = k / len;
        // o trecho longo serpenteia um pouco
        const wob = s === 1 ? Math.sin(t * Math.PI * freq) * Math.min(28, len * 0.07) * amp : 0;
        const x = Math.round(x0 + (x1 - x0) * t + px * wob);
        const y = Math.round(y0 + (y1 - y0) * t + py * wob);
        paint(x, y, x1 - x0, y1 - y0, hw);
      }
    }
  }
  return road;
}

interface Out {
  buildings: Building[];
  props: Prop[];
  /** Ovelhas perto das fazendas (px). */
  sheep: { x: number; y: number }[];
}

/**
 * Monta uma cidade: muralha com torres e 4 portões, avenidas em cruz até a
 * praça (fonte, feira, bancos), ruas secundárias em grade, quarteirões cheios
 * de casas (pequenas, médias e grandes), tochas nas avenidas e, em Greenland,
 * fazendas do lado de fora.
 */
export function stampCity(ctx: GenCtx, c: City, road: Uint8Array, out: Out) {
  const { W } = ctx;
  const Z = sizeOf(c);
  const rand = mulberry32(ctx.seed + 7300 + c.cx * 31 + c.cy);
  const si = STYLE_IDX[c.style];
  const i = (x: number, y: number) => y * W + x;
  const setGround = (x: number, y: number, t: number) => (ctx.ground[i(x, y)] = t);
  // limpa a área (dentro e a margem)
  for (let y = c.y0 - MARGIN; y <= c.y1 + MARGIN; y++)
    for (let x = c.x0 - MARGIN; x <= c.x1 + MARGIN; x++) {
      const k = i(x, y);
      const inside = x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1;
      if (inside || ctx.water[k] >= 0 || ctx.ground[k] === T.VOID) {
        if (!road[k] || inside) ctx.ground[k] = ctx.baseGround(c.biome, x, y, inside);
        ctx.water[k] = -1;
      }
      if (ctx.cliffs[k] >= 0) ctx.mountain[k] = 0;
      ctx.cliffs[k] = -1;
      ctx.decor[k] = -1;
      ctx.canopy[k] = -1;
      ctx.collision[k] = 0;
    }
  // ruas: avenidas e praça calçadas; ruas secundárias de terra (ou calçadas nas cidades de pedra)
  const pave = T.PAVE[si];
  const street = c.style === 'block' || c.style === 'black' ? pave : T.DIRT;
  const occ = new Uint8Array((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1));
  const lw = c.x1 - c.x0 + 1;
  const mark = (x: number, y: number, v = 1) => {
    if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) occ[(y - c.y0) * lw + (x - c.x0)] = v;
  };
  const isFree = (x: number, y: number) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1 && !occ[(y - c.y0) * lw + (x - c.x0)];
  const ix0 = c.x0 + 1;
  const ix1 = c.x1 - 1;
  const iy0 = c.y0 + 2;
  const iy1 = c.y1 - 2;
  const rect = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        setGround(x, y, t);
        mark(x, y);
      }
  };
  // anel interno junto à muralha
  rect(ix0, iy0, ix1, iy0 + 1, street);
  rect(ix0, iy1 - 1, ix1, iy1, street);
  rect(ix0, iy0, ix0 + 1, iy1, street);
  rect(ix1 - 1, iy0, ix1, iy1, street);
  // ruas secundárias
  const vStreets: [number, number][] = [
    [ix0, ix0 + 1],
    [ix1 - 1, ix1],
    [c.cx - 1, c.cx + 1],
  ];
  const hStreets: [number, number][] = [
    [iy0, iy0 + 1],
    [iy1 - 1, iy1],
    [c.cy - 1, c.cy + 1],
  ];
  for (const s of [-1, 1]) {
    for (let k = 0; ; k++) {
      const x = c.cx + s * (Z.pw + 1 + k * 13);
      const a = s < 0 ? x - 1 : x;
      if (a < ix0 + 5 || a + 1 > ix1 - 5) break;
      rect(a, iy0, a + 1, iy1, street);
      vStreets.push([a, a + 1]);
    }
    for (let k = 0; ; k++) {
      const y = c.cy + s * (Z.ph + 1 + k * 11);
      const a = s < 0 ? y - 1 : y;
      if (a < iy0 + 5 || a + 1 > iy1 - 5) break;
      rect(ix0, a, ix1, a + 1, street);
      hStreets.push([a, a + 1]);
    }
  }
  // avenidas (portão a portão) e praça
  rect(c.x0, c.cy - 1, c.x1, c.cy + 1, pave);
  rect(c.cx - 1, c.y0, c.cx + 1, c.y1, pave);
  const px0 = c.cx - Z.pw;
  const px1 = c.cx + Z.pw;
  const py0 = c.cy - Z.ph;
  const py1 = c.cy + Z.ph;
  rect(px0, py0, px1, py1, pave);
  for (let y = py0; y <= py1; y++)
    for (let x = px0; x <= px1; x++) {
      const dd = Math.max(Math.abs(x - c.cx) / Z.pw, Math.abs(y - c.cy) / Z.ph);
      if (Math.hypot(x - c.cx, (y - c.cy) * 1.3) < 3.6 || (dd > 0.55 && dd < 0.75)) setGround(x, y, T.PLAZA);
    }
  // muralha (topo/frente na camada de penhascos) com portões
  const wallTop = T.WALL + si * 2;
  const wallFace = wallTop + 1;
  const gw = Z.gate;
  const isWall = (x: number, y: number) => {
    const onRing = y === c.y0 || y === c.y0 + 1 || y === c.y1 - 1 || y === c.y1 || x === c.x0 || x === c.x1;
    if (!onRing || x < c.x0 || x > c.x1 || y < c.y0 || y > c.y1) return false;
    const gx = Math.abs(x - c.cx) <= gw >> 1;
    const gy = Math.abs(y - c.cy) <= gw >> 1;
    if ((y <= c.y0 + 1 || y >= c.y1 - 1) && gx) return false;
    if ((x === c.x0 || x === c.x1) && gy && y > c.y0 + 1 && y < c.y1 - 1) return false;
    return true;
  };
  for (let y = c.y0; y <= c.y1; y++)
    for (let x = c.x0; x <= c.x1; x++) {
      if (!isWall(x, y)) continue;
      const k = i(x, y);
      ctx.cliffs[k] = isWall(x, y + 1) ? wallTop : wallFace;
      ctx.collision[k] = 1;
      mark(x, y);
    }
  // torres: cantos, ao lado dos portões e a cada ~14 tiles
  const tower = (tx: number, tyBottom: number) => {
    out.props.push({ kind: 'tower', x: tx * 16 + 16, y: (tyBottom + 1) * 16, frame: si });
    for (let x = tx; x <= tx + 1; x++) {
      ctx.collision[i(x, tyBottom)] = 1;
      mark(x, tyBottom);
    }
  };
  const towerXs = new Set<number>([c.x0, c.x1 - 1, c.cx - (gw >> 1) - 2, c.cx + (gw >> 1) + 1]);
  for (let x = c.x0 + 14; x < c.x1 - 8; x += 14) if (Math.abs(x - c.cx) > gw + 3) towerXs.add(x);
  for (const x of towerXs) {
    tower(x, c.y0 + 1);
    tower(x, c.y1);
  }
  for (let y = c.y0 + 14; y < c.y1 - 6; y += 14) {
    if (Math.abs(y - c.cy) <= gw + 2) continue;
    tower(c.x0, y);
    tower(c.x1 - 1, y);
  }
  for (const s of [-1, 1]) {
    tower(c.x0, c.cy + s * ((gw >> 1) + 2) + (s > 0 ? 0 : 0));
    tower(c.x1 - 1, c.cy + s * ((gw >> 1) + 2));
  }
  // fonte no centro da praça
  out.props.push({ kind: 'fountain', x: c.cx * 16 + 8, y: (c.cy + 1) * 16 + 6 });
  for (let x = c.cx - 1; x <= c.cx + 1; x++) {
    ctx.collision[i(x, c.cy)] = 1;
    mark(x, c.cy, 2);
  }
  // feira: barracas nas bordas da praça (fora das avenidas)
  for (const y of [py0 + 1, py1 - 1])
    for (let x = px0 + 1; x <= px1 - 2; x += 4) {
      if (Math.abs(x - c.cx) <= 2 || Math.abs(x + 1 - c.cx) <= 2) continue;
      out.props.push({ kind: 'stall', x: (x + 1) * 16, y: (y + 1) * 16, frame: Math.floor(rand() * 3) });
      for (const xx of [x, x + 1]) ctx.collision[i(xx, y)] = 1;
    }
  for (const [x, y] of [[px0, py0], [px1, py0], [px0, py1], [px1, py1]]) {
    ctx.decor[i(x, y)] = T.FLOWER_POT;
    ctx.collision[i(x, y)] = 1;
  }
  for (const x of [c.cx - 4, c.cx + 4]) {
    if (x > px0 && x < px1) {
      ctx.decor[i(x, c.cy - 2)] = T.BENCH;
      ctx.decor[i(x, c.cy + 2)] = T.BENCH;
    }
  }
  // tochas ao longo das avenidas
  const torch = (x: number, y: number) => {
    if (!isFree(x, y) && ctx.ground[i(x, y)] !== pave) return;
    out.props.push({ kind: 'torch', x: x * 16 + 8, y: y * 16 + 14 });
    ctx.collision[i(x, y)] = 1;
    mark(x, y);
  };
  for (let x = c.x0 + 4; x <= c.x1 - 4; x += 7) if (x < px0 - 1 || x > px1 + 1) {
    torch(x, c.cy - 2);
    torch(x, c.cy + 2);
  }
  for (let y = c.y0 + 5; y <= c.y1 - 4; y += 7) if (y < py0 - 1 || y > py1 + 1) {
    torch(c.cx - 2, y);
    torch(c.cx + 2, y);
  }
  // quarteirões: espaços entre as ruas
  const gapsOf = (bands: [number, number][], lo: number, hi: number) => {
    const b = [...bands].sort((p, q) => p[0] - q[0]);
    const gaps: [number, number][] = [];
    let cur = lo;
    for (const [a, z] of b) {
      if (a > cur) gaps.push([cur, a - 1]);
      cur = Math.max(cur, z + 1);
    }
    if (cur <= hi) gaps.push([cur, hi]);
    return gaps;
  };
  const xs = gapsOf(vStreets, ix0, ix1);
  const ys = gapsOf(hStreets, iy0, iy1);
  let largeLeft = Z.large;
  const blocks: [number, number, number, number, number][] = [];
  for (const [bx0, bx1] of xs)
    for (const [by0, by1] of ys) {
      // dentro da praça: já calçado
      if (bx0 >= px0 && bx1 <= px1 && by0 >= py0 && by1 <= py1) continue;
      const nearPlaza = Math.abs((bx0 + bx1) / 2 - c.cx) < Z.pw + 16 && Math.abs((by0 + by1) / 2 - c.cy) < Z.ph + 12;
      blocks.push([bx0, bx1, by0, by1, nearPlaza ? 0 : 1]);
    }
  // os quarteirões perto da praça primeiro (é lá que ficam os prédios grandes)
  blocks.sort((a, b) => a[4] - b[4]);
  const style = c.style;
  const place = (key: 's' | 'm' | 'l', tx: number, tyBottom: number) => {
    const B = BUILDINGS[`${style}-${key}`];
    const w = B.w / 16;
    const h = B.h / 16;
    const ty = tyBottom - h + 1;
    out.buildings.push({ key: `${style}-${key}`, variant: Math.floor(rand() * B.variants), tx, ty });
    for (let y = ty; y <= tyBottom; y++)
      for (let x = tx; x < tx + w; x++) {
        mark(x, y);
        if (y > tyBottom - B.solidRows) ctx.collision[i(x, y)] = 1;
      }
  };
  const fits = (tx: number, tyBottom: number, w: number, h: number, bx1: number, by0: number) => {
    if (tx + w - 1 > bx1 || tyBottom - h + 1 < by0) return false;
    for (let y = tyBottom - h + 1; y <= tyBottom; y++) for (let x = tx; x < tx + w; x++) if (!isFree(x, y)) return false;
    return true;
  };
  for (const [bx0, bx1, by0, by1, far] of blocks) {
    // prateleiras de baixo para cima: fachada voltada para a rua (ou o quintal) de baixo
    let shelf = by1;
    while (shelf - 2 >= by0) {
      let x = bx0;
      let tallest = 0;
      while (x <= bx1 - 2) {
        const opts: ('s' | 'm' | 'l')[] = [];
        if (largeLeft > 0 && !far && rand() < 0.7) opts.push('l');
        opts.push(rand() < 0.6 ? 'm' : 's', 's');
        let done = false;
        for (const o of opts) {
          const B = BUILDINGS[`${style}-${o}`];
          const w = B.w / 16;
          const h = B.h / 16;
          if (fits(x, shelf, w, h, bx1, by0)) {
            place(o, x, shelf);
            if (o === 'l') largeLeft--;
            x += w + (rand() < 0.5 ? 1 : 2);
            tallest = Math.max(tallest, h);
            done = true;
            break;
          }
        }
        if (!done) x++;
      }
      if (!tallest) break;
      shelf -= tallest + 1;
    }
    // sobras: quintais com barris, caixotes, feno, flores
    for (let y = by0; y <= by1; y++)
      for (let x = bx0; x <= bx1; x++) {
        if (!isFree(x, y) || rand() > 0.07) continue;
        const pick = rand();
        const t =
          style === 'green' ? (pick < 0.3 ? T.HAY : pick < 0.55 ? T.BARREL : pick < 0.75 ? T.FLOWER_POT : T.BUSH)
          : style === 'dust' ? (pick < 0.4 ? T.SACKS : pick < 0.7 ? T.BARREL : T.CRATES)
          : style === 'snow' ? (pick < 0.4 ? T.CRATE : pick < 0.7 ? T.BARREL : T.SNOW_DRIFT)
          : pick < 0.4 ? T.CRATES : pick < 0.7 ? T.BARREL : T.CRATE;
        ctx.decor[i(x, y)] = t;
        if (t !== T.SNOW_DRIFT && t !== T.FLOWER_POT && t !== T.BUSH) ctx.collision[i(x, y)] = 1;
        mark(x, y);
      }
  }
  // estandartes ao lado dos portões (por dentro)
  for (const [x, y] of [[c.cx - (gw >> 1) - 1, c.y0 + 2], [c.cx + (gw >> 1) + 1, c.y0 + 2], [c.cx - (gw >> 1) - 1, c.y1 - 2], [c.cx + (gw >> 1) + 1, c.y1 - 2]]) {
    if (ctx.ground[i(x, y)] === street) ctx.decor[i(x, y)] = T.BANNER;
  }
  // fazendas do lado de fora (Greenland e vale)
  if (style === 'green') {
    const fields: [number, number][] = [];
    for (let x = c.x0; x + 10 <= c.x1; x += 13) fields.push([x, c.y1 + 3], [x, c.y0 - 9]);
    for (const [fx, fy] of fields) {
      if (Math.abs(fx + 5 - c.cx) < 8) continue;
      let clear = true;
      for (let y = fy - 1; y <= fy + 6 && clear; y++) for (let x = fx - 1; x <= fx + 11 && clear; x++) if (road[i(x, y)]) clear = false;
      if (!clear) continue;
      const ripe = rand() < 0.5;
      for (let y = fy; y <= fy + 5; y++)
        for (let x = fx; x <= fx + 10; x++) {
          const border = y === fy || y === fy + 5 || x === fx || x === fx + 10;
          setGround(x, y, border ? ctx.baseGround(c.biome, x, y) : (y + (ripe ? 0 : 1)) % 3 === 0 ? T.FIELD : ripe ? T.CROP_RIPE : T.CROP_YOUNG);
          if (!border) continue;
          const gap = y === fy + 5 && Math.abs(x - fx - 5) <= 1;
          if (gap) continue;
          const corner = (x === fx || x === fx + 10) && (y === fy || y === fy + 5);
          ctx.decor[i(x, y)] = corner ? T.FENCE_POST : y === fy || y === fy + 5 ? T.FENCE_H : T.FENCE_V;
          ctx.collision[i(x, y)] = 1;
        }
      if (rand() < 0.6) out.sheep.push({ x: (fx + 5) * 16, y: (fy + 8) * 16 });
    }
  }
}
