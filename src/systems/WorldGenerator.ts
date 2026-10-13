import { TILE } from '../config';
import { buildRoads, pickCities, stampCity, type Building, type City, type GenCtx, type Prop } from './Cities';
import { fbm, mulberry32, valueNoise } from './Noise';
import { computeEdges } from './Terrain';
import { T } from './Tiles';

/** Biomas do mundo (ver docs/design/expansao-mundo.md). */
export enum Biome {
  VALE = 0,
  GREEN = 1,
  SNOW = 2,
  BLOCK = 3,
  BLACK = 4,
  DUST = 5,
}

export interface BiomeInfo {
  name: string;
  /** Tom multiplicativo da luz ambiente. */
  tint: number;
  /** 0..1: quanto o bioma escurece (luzes/cristais acendem acima de 0). */
  dark: number;
  /** Cor do bioma no mapa. */
  map: number;
}

export const BIOMES: BiomeInfo[] = [
  { name: 'Vale de Vaelmor', tint: 0xffffff, dark: 0, map: 0x5a9a3f },
  { name: 'Greenland', tint: 0xf4fff0, dark: 0, map: 0x2f7a34 },
  { name: 'Snowland', tint: 0xb8c6e2, dark: 0.3, map: 0xe6edf5 },
  { name: 'Blockland', tint: 0xeee8de, dark: 0, map: 0x8c8983 },
  { name: 'Blackland', tint: 0x62548a, dark: 0.75, map: 0x2c2731 },
  { name: 'Dustland', tint: 0xfff0cc, dark: 0, map: 0xe2b86e },
];

export type SpawnKind =
  | 'sheep' | 'deer' | 'slime' | 'wolf' | 'bandit' | 'wraith'
  | 'boar' | 'bear' | 'golem' | 'spider' | 'scorpion'
  | 'fox' | 'hare' | 'goat' | 'lizard';

export type { Building, City, Prop };

/** Lado do mundo em tiles (≈10× a área do mundo anterior, de 480×480). */
export const WORLD_W = 1536;
export const WORLD_H = 1536;
/** Escala do traçado em relação ao primeiro mundo (320×320). */
const K = WORLD_W / 320;
const k = (v: number) => Math.round(v * K);
/** Raio (tiles) do Vale de Vaelmor em volta da capital. */
const VALE_R = 90;

export interface WorldData {
  width: number;
  height: number;
  /** Camadas como arrays [y * width + x]; -1 = vazio. */
  ground: Int16Array;
  water: Int16Array;
  /** Transições suaves entre terrenos (ver Terrain.ts). */
  edge: Int16Array;
  cliffs: Int16Array;
  decor: Int16Array;
  canopy: Int16Array;
  collision: Uint8Array;
  biome: Uint8Array;
  spawns: { kind: SpawnKind; x: number; y: number; variant?: string }[];
  /** Pontos de luz permanentes (cristais) em px do mundo. */
  glows: { x: number; y: number; color: number }[];
  cities: City[];
  buildings: Building[];
  props: Prop[];
  /** Um ponto livre no coração de cada bioma (para o debug teleportar). */
  poi: { x: number; y: number }[];
  start: { x: number; y: number };
}

/**
 * Mundo de 1536×1536 tiles cercado de mar (no Blackland, de abismo): o Vale
 * de Vaelmor com a capital Brumavale no coração de Greenland, Snowland ao
 * norte, Blockland a leste, Blackland a sudeste e Dustland ao sul. As
 * fronteiras são curvas largas de ruído com uma faixa de mistura (manchas de
 * um bioma no outro) e transições suaves de terreno; cada bioma tem chão,
 * montanhas com paredão, água, árvores e decoração próprios, e 2–3 cidades
 * muradas ligadas por estradas.
 */
export function generateWorld(seed: number): WorldData {
  const W = WORLD_W;
  const H = WORLD_H;
  const N = W * H;
  const rand = mulberry32(seed + 900);
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const pick = <V>(arr: readonly V[]): V => arr[Math.floor(rand() * arr.length)];

  const ground = new Int16Array(N).fill(-1);
  const water = new Int16Array(N).fill(-1);
  const edge = new Int16Array(N).fill(-1);
  const cliffs = new Int16Array(N).fill(-1);
  const decor = new Int16Array(N).fill(-1);
  const canopy = new Int16Array(N).fill(-1);
  const collision = new Uint8Array(N);
  const biome = new Uint8Array(N);
  /** Bioma "visual" (chão, árvores e decoração): na faixa de mistura, às vezes é o vizinho. */
  const look = new Uint8Array(N);
  const occupied = new Uint8Array(N);
  const reserve = new Uint8Array(N);
  const mountain = new Uint8Array(N);
  const noMount = new Uint8Array(N);
  const glows: WorldData['glows'] = [];

  // ------------------------------------------------------------ biomas
  // a deformação das fronteiras é calculada numa grade de 4 tiles e interpolada
  const G = 4;
  const GW = Math.ceil(W / G) + 2;
  const GH = Math.ceil(H / G) + 2;
  const warpX = new Float32Array(GW * GH);
  const warpY = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++)
    for (let gx = 0; gx < GW; gx++) {
      const x = gx * G;
      const y = gy * G;
      const warp = (sx: number, sd: number) =>
        (fbm((x * 0.012) / K + sx, (y * 0.012) / K, seed + sd, 3) - 0.5) * 150 * K + (fbm(x * 0.022 + sx, y * 0.022, seed + sd + 7, 2) - 0.5) * 34;
      warpX[gy * GW + gx] = warp(0, 501);
      warpY[gy * GW + gx] = warp(50, 502);
    }
  const sample = (a: Float32Array, x: number, y: number) => {
    const fx = x / G;
    const fy = y / G;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const o = j * GW + i;
    return (a[o] * (1 - tx) + a[o + 1] * tx) * (1 - ty) + (a[o + GW] * (1 - tx) + a[o + GW + 1] * tx) * ty;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // ondulação fina por cima (a fronteira não fica reta de perto)
      const fine = (valueNoise(x * 0.07, y * 0.07, seed + 503) - 0.5) * 16 + (valueNoise(x * 0.19, y * 0.19, seed + 504) - 0.5) * 5;
      const u = x + sample(warpX, x, y) + fine;
      const v = y + sample(warpY, x, y) - fine;
      let b = Biome.GREEN;
      if (v < k(92)) b = Biome.SNOW;
      else if (u > k(236) && v < k(218)) b = Biome.BLOCK;
      else if (u > k(218) && v >= k(218)) b = Biome.BLACK;
      else if (v > k(240)) b = Biome.DUST;
      biome[idx(x, y)] = b;
    }

  // mar em volta do mundo (litoral recortado por ruído)
  const coast = (x: number, y: number) => {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    return d - (22 + fbm(x * 0.01, y * 0.01, seed + 950, 3) * 46);
  };

  // ------------------------------------------------------------ cidades (lugares)
  const ctx: GenCtx = {
    W,
    H,
    seed,
    ground,
    water,
    cliffs,
    decor,
    canopy,
    collision,
    biome,
    reserve,
    mountain,
    noMount,
    baseGround: (b, x, y, town) => baseGround(b, x, y, town),
  };
  const cities = pickCities(ctx, coast, [k(118), k(160)]);
  const capital = cities.find((c) => c.capital) ?? cities[0];
  // Vale de Vaelmor: o entorno da capital (Greenland mais calmo)
  for (let y = capital.cy - VALE_R; y <= capital.cy + VALE_R; y++)
    for (let x = capital.cx - VALE_R; x <= capital.cx + VALE_R; x++) {
      if (!inside(x, y) || biome[idx(x, y)] !== Biome.GREEN) continue;
      const r = VALE_R * (0.8 + valueNoise(x * 0.03, y * 0.03, seed + 960) * 0.4);
      if (Math.hypot(x - capital.cx, y - capital.cy) < r) biome[idx(x, y)] = Biome.VALE;
    }

  // ------------------------------------------------------------ faixa de mistura
  // distância (chamfer) até o outro bioma, e qual é ele; o vale conta como Greenland
  const fam = (b: number) => (b === Biome.VALE ? Biome.GREEN : b);
  const BD = 14;
  const dist = new Uint8Array(N).fill(255);
  const other = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const b = fam(biome[i]);
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        const o = fam(biome[j]);
        if (o !== b) {
          dist[i] = 0;
          other[i] = o;
          dist[j] = 0;
          other[j] = b;
        }
      }
    }
  const relax = (i: number, j: number, c: number) => {
    if (dist[j] + c < dist[i] && other[j] !== fam(biome[i])) {
      dist[i] = Math.min(254, dist[j] + c);
      other[i] = other[j];
    }
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - W, 1);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = idx(x, y);
      if (x < W - 1) relax(i, i + 1, 1);
      if (y < H - 1) relax(i, i + W, 1);
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      look[i] = biome[i];
      const d = dist[i];
      if (d >= BD || reserve[i]) continue;
      // manchas do vizinho, mais densas perto da fronteira
      const blob = valueNoise(x * 0.16, y * 0.16, seed + 970) * 0.65 + valueNoise(x * 0.45, y * 0.45, seed + 971) * 0.35;
      if (blob > 0.42 + (d / BD) * 0.5) look[i] = other[i];
    }

  // ------------------------------------------------------------ chão
  /** Chão natural do bioma; `town` = dentro de uma cidade (sem manchas de floresta, cascalho…). */
  function baseGround(b: Biome, x: number, y: number, town = false): number {
    const r = valueNoise(x * 0.9, y * 0.9, seed + 13);
    const n = town ? 0 : fbm(x * 0.07, y * 0.07, seed + 511, 2);
    switch (b) {
      case Biome.VALE:
      case Biome.GREEN: {
        const forest = town ? 0 : fbm(x * 0.05 + 40, y * 0.05, seed + 17, 3);
        return forest > 0.52 + (r - 0.5) * 0.04 ? T.FOREST : r < 0.5 ? T.GRASS[0] : r < 0.82 ? T.GRASS[1] : T.GRASS[2];
      }
      case Biome.SNOW: {
        const forest = town ? 0 : fbm(x * 0.05 + 40, y * 0.05, seed + 17, 3);
        return forest > 0.6 ? T.SNOW_SHADOW : r < 0.55 ? T.SNOW[0] : r < 0.85 ? T.SNOW[1] : T.SNOW[2];
      }
      case Biome.BLOCK:
        return n > 0.64 ? T.GRAVEL : r < 0.5 ? T.STONE[0] : r < 0.8 ? T.STONE[2] : T.STONE[1];
      case Biome.BLACK:
        return n > 0.68 ? T.OBSIDIAN : r > 0.93 ? T.ASH_CRACK : r < 0.5 ? T.ASH[0] : r < 0.8 ? T.ASH[1] : T.ASH[2];
      case Biome.DUST:
        return n > 0.66 ? T.SANDSTONE : r < 0.45 ? T.DUNE[0] : r < 0.7 ? T.DUNE[1] : r < 0.88 ? T.DUNE[2] : T.DUNE_RIPPLE;
      default:
        return T.GRASS[0];
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ground[idx(x, y)] = baseGround(look[idx(x, y)], x, y);

  // ------------------------------------------------------------ água
  const oceanAt = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (Math.min(x, y, W - 1 - x, H - 1 - y) > 80) continue;
      const c = coast(x, y);
      if (c >= 0) continue;
      const i = idx(x, y);
      oceanAt[i] = 1;
      if (biome[i] === Biome.BLACK) {
        ground[i] = T.VOID;
        collision[i] = 1;
      } else if (biome[i] === Biome.SNOW && c > -4) ground[i] = (x * 7 + y * 3) % 5 === 0 ? T.ICE_CRACK : T.ICE;
      else {
        water[i] = T.WATER;
        collision[i] = 1;
      }
    }
  const setWater = (x: number, y: number) => {
    if (!inside(x, y)) return;
    const i = idx(x, y);
    if (reserve[i] || oceanAt[i]) return;
    const b = biome[i] as Biome;
    if (b === Biome.SNOW) {
      // lagos e rios congelados: gelo andável
      ground[i] = (x * 7 + y * 3) % 5 === 0 ? T.ICE_CRACK : T.ICE;
      return;
    }
    if (b === Biome.BLACK) {
      water[i] = -1;
      ground[i] = T.VOID;
      collision[i] = 1;
      return;
    }
    water[i] = T.WATER;
    collision[i] = 1;
  };
  const disc = (cx: number, cy: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) setWater(cx + dx, cy + dy);
  };
  const lake = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++)
      for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (valueNoise(x * 0.3, y * 0.3, seed + 521) - 0.5) * 0.7;
        if (d <= 1) setWater(x, y);
      }
  };
  // rios: nascem no interior e serpenteiam até o mar, desviando das cidades
  for (let r = 0; r < 22; r++) {
    let x = 0;
    let y = 0;
    for (let t = 0; t < 200; t++) {
      x = 120 + Math.floor(rand() * (W - 240));
      y = 120 + Math.floor(rand() * (H - 240));
      const b = biome[idx(x, y)];
      if (!reserve[idx(x, y)] && b !== Biome.DUST && b !== Biome.BLACK) break;
    }
    // vai para a borda mais próxima, com curvas
    const dx0 = x < W - x ? -1 : 1;
    const dy0 = y < H - y ? -1 : 1;
    const toX = Math.min(x, W - x) < Math.min(y, H - y);
    let ang = Math.atan2(toX ? 0 : dy0, toX ? dx0 : 0) + (rand() - 0.5) * 1.2;
    const target = ang;
    if (rand() < 0.4) lake(x, y, 6 + rand() * 6, 4 + rand() * 4);
    for (let s = 0; s < 1400; s++) {
      ang += (valueNoise(s * 0.03, r * 13.1, seed + 980) - 0.5) * 0.22;
      ang += (target - ang) * 0.02;
      let nx = x + Math.cos(ang);
      let ny = y + Math.sin(ang);
      // desvia das cidades
      for (let turn = 0; turn < 12 && inside(Math.round(nx), Math.round(ny)) && reserve[idx(Math.round(nx), Math.round(ny))]; turn++) {
        ang += 0.35;
        nx = x + Math.cos(ang);
        ny = y + Math.sin(ang);
      }
      x = nx;
      y = ny;
      const tx = Math.round(x);
      const ty = Math.round(y);
      if (!inside(tx, ty) || oceanAt[idx(tx, ty)]) break;
      disc(tx, ty, s < 150 ? 1 : s < 500 ? 2 : 3);
      if (rand() < 0.003) lake(tx, ty, 5 + rand() * 7, 4 + rand() * 4);
    }
  }
  // lagos por bioma (gelo no Snowland, poças de vazio no Blackland, oásis no deserto)
  const oases: [number, number][] = [];
  const lakes = (b: Biome, n: number, rx: number, ry: number, mark?: boolean) => {
    for (let t = 0, made = 0; t < n * 40 && made < n; t++) {
      const cx = 60 + rand() * (W - 120);
      const cy = 60 + rand() * (H - 120);
      if (biome[idx(Math.round(cx), Math.round(cy))] !== b) continue;
      lake(cx, cy, rx * (0.5 + rand()), ry * (0.5 + rand()));
      if (mark) oases.push([cx, cy]);
      made++;
    }
  };
  lakes(Biome.GREEN, 110, 8, 5);
  lakes(Biome.VALE, 8, 7, 5);
  lakes(Biome.SNOW, 90, 9, 6);
  lakes(Biome.BLOCK, 24, 4, 3);
  lakes(Biome.BLACK, 110, 4, 3);
  lakes(Biome.DUST, 60, 4, 3, true);
  // margens: areia em Greenland e no litoral, grama de oásis no deserto, cascalho no Blockland
  const isWater = (x: number, y: number) => inside(x, y) && water[idx(x, y)] >= 0;
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const i = idx(x, y);
      if (water[i] >= 0 || collision[i]) continue;
      let near = 0;
      for (let dy = -2; dy <= 2 && near < 3; dy++) for (let dx = -2; dx <= 2; dx++) if (isWater(x + dx, y + dy)) near = Math.max(near, 3 - Math.max(Math.abs(dx), Math.abs(dy)));
      if (!near) continue;
      const b = look[i] as Biome;
      const sea = coast(x, y) < 10;
      if ((b === Biome.GREEN || b === Biome.VALE) && near >= 2) ground[i] = T.SAND;
      else if (b === Biome.DUST) ground[i] = sea ? T.SAND : T.OASIS_GRASS;
      else if (b === Biome.BLOCK && near >= 2) ground[i] = T.GRAVEL;
      else if (sea && near >= 2 && b === Biome.SNOW) ground[i] = T.SNOW[1];
    }

  // ------------------------------------------------------------ montanhas
  const massif = (x: number, y: number, s: number) => fbm(x * 0.0229, y * 0.0229, seed + s, 4);
  const MOUNT: Partial<Record<Biome, [number, number, number]>> = {
    [Biome.SNOW]: [0.63, T.SNOW_PEAK, T.SNOW_CLIFF],
    [Biome.BLOCK]: [0.6, T.ROCK_PEAK, T.ROCK_CLIFF],
    [Biome.BLACK]: [0.66, T.BLACK_PEAK, T.BLACK_CLIFF],
    [Biome.DUST]: [0.67, T.MESA_PEAK, T.MESA_CLIFF],
    [Biome.GREEN]: [0.7, T.ROCK_PEAK, T.ROCK_CLIFF],
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const m = MOUNT[biome[i] as Biome];
      if (!m || water[i] >= 0 || collision[i] || noMount[i] || ground[i] === T.ICE || ground[i] === T.ICE_CRACK || coast(x, y) < 6) continue;
      if (massif(x, y, 531) > m[0] + (valueNoise(x * 0.5, y * 0.5, seed + 537) - 0.5) * 0.02) mountain[i] = 1;
    }

  // ------------------------------------------------------------ estradas
  const road = buildRoads(ctx, cities);

  // tira pontas de 1 tile (fica só maciço de verdade) e ergue o paredão
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (mountain[i] && mountain[i - 1] + mountain[i + 1] + mountain[i - W] + mountain[i + W] < 2) mountain[i] = 0;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (!mountain[i]) continue;
      const m = MOUNT[biome[i] as Biome]!;
      // paredão de 2 tiles na borda de baixo de cada maciço; o resto é o cume
      const below = y + 1 < H && mountain[idx(x, y + 1)];
      const below2 = y + 2 < H && mountain[idx(x, y + 2)];
      cliffs[i] = below && below2 ? m[1] : m[2];
      collision[i] = 1;
      occupied[i] = 1;
    }

  // ------------------------------------------------------------ cidades (construção)
  const buildings: Building[] = [];
  const props: Prop[] = [];
  const sheep: { x: number; y: number }[] = [];
  for (const c of cities) stampCity(ctx, c, road, { buildings, props, sheep });
  for (let i = 0; i < N; i++) if (reserve[i]) occupied[i] = 1;

  // ------------------------------------------------------------ árvores
  const free = (x: number, y: number) => {
    if (!inside(x, y)) return false;
    const i = idx(x, y);
    return !occupied[i] && water[i] < 0 && cliffs[i] < 0 && !collision[i] && ground[i] !== T.ICE && ground[i] !== T.ICE_CRACK && ground[i] !== T.VOID;
  };
  const tree = (x: number, y: number, canopyBase: number, trunkTile: number, h = 2) => {
    if (!free(x, y) || !free(x, y + 1)) return false;
    for (let dy = -h; dy <= 0; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (!inside(cx, cy) || occupied[idx(cx, cy)] || canopy[idx(cx, cy)] >= 0) return false;
      }
    for (let dy = -h; dy <= -1; dy++) for (let dx = -1; dx <= 1; dx++) canopy[idx(x + dx, y + dy)] = canopyBase + (dy + h) * 16 + (dx + 1);
    decor[idx(x, y)] = trunkTile;
    collision[idx(x, y)] = 1;
    for (let dy = -h; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy)) occupied[idx(x + dx, y + dy)] = 1;
    return true;
  };
  const waterNear = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (isWater(x + dx, y + dy)) return true;
    return false;
  };
  const nearOasis = (x: number, y: number) => ground[idx(x, y)] === T.OASIS_GRASS || oases.some(([ox, oy]) => Math.abs(x - ox) < 9 && Math.abs(y - oy) < 9);
  for (let y = 4; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (occupied[i]) continue;
      const r = rand();
      if (r > 0.45) continue;
      const forest = fbm(x * 0.05 + 40, y * 0.05, seed + 17, 3);
      switch (look[i] as Biome) {
        case Biome.VALE:
        case Biome.GREEN: {
          // florestas densas e majestosas (no vale, mais abertas)
          const dense = look[i] === Biome.VALE ? 0.25 : 0.42;
          const p = forest > 0.52 ? dense : forest > 0.44 ? 0.1 : 0.02;
          if (r > p) break;
          if (waterNear(x, y, 3) && rand() < 0.6) tree(x, y, T.CANOPY_WILLOW, T.TRUNK_WILLOW);
          else if (rand() < 0.45) tree(x, y, T.CANOPY_BIGOAK, T.TRUNK_BIGOAK);
          else if (rand() < 0.75) tree(x, y, T.CANOPY_OAK, T.TRUNK_OAK);
          else tree(x, y, T.CANOPY_PINE, T.TRUNK_PINE);
          break;
        }
        case Biome.SNOW: {
          // pinheiros altíssimos (copa 3×3)
          const p = forest > 0.6 ? 0.4 : forest > 0.5 ? 0.1 : 0.025;
          if (r < p) tree(x, y, T.CANOPY_SNOWPINE, T.TRUNK_SNOWPINE, 3);
          break;
        }
        case Biome.BLOCK:
          if (r < 0.006) tree(x, y, T.CANOPY_PINE, T.TRUNK_PINE);
          else if (r < 0.01) tree(x, y, T.CANOPY_DEAD, T.TRUNK_DEAD);
          break;
        case Biome.BLACK:
          if (r < 0.018) tree(x, y, T.CANOPY_CRYSTAL, T.TRUNK_CRYSTAL) && glows.push({ x: x * TILE + 8, y: y * TILE - 10, color: 0xb46cec });
          else if (r < 0.04) tree(x, y, T.CANOPY_DEAD, T.TRUNK_DEAD);
          break;
        case Biome.DUST:
          if (r < 0.22 && nearOasis(x, y)) tree(x, y, T.CANOPY_PALM, T.TRUNK_PALM);
          else if (r < 0.004) tree(x, y, T.CANOPY_DEAD, T.TRUNK_DEAD);
          break;
        default:
          break;
      }
    }

  // ------------------------------------------------------------ decoração
  const solid = (i: number, tile: number) => {
    decor[i] = tile;
    collision[i] = 1;
    occupied[i] = 1;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (!free(x, y) || decor[i] >= 0) continue;
      const r = rand();
      if (r > 0.27) continue;
      const g = ground[i];
      switch (look[i] as Biome) {
        case Biome.VALE:
        case Biome.GREEN: {
          if (g === T.SAND) {
            if (r < 0.14) decor[i] = T.REEDS;
            break;
          }
          const field = valueNoise(x * 0.15, y * 0.15, seed + 41);
          if (r < (field > 0.62 ? 0.2 : 0.03)) decor[i] = rand() < 0.15 ? T.BIG_FLOWER : pick(T.FLOWERS);
          else if (r < 0.26) {
            const q = rand();
            decor[i] = g === T.FOREST ? (q < 0.4 ? T.FERN : q < 0.6 ? T.MUSHROOM : q < 0.75 ? T.STUMP : T.TALL_GRASS) : q < 0.35 ? T.TALL_GRASS : q < 0.55 ? T.BUSH : q < 0.65 ? T.BUSH_BERRY : q < 0.8 ? T.FERN : T.ROCK;
            if (decor[i] === T.BUSH || decor[i] === T.BUSH_BERRY) decor[i] = rand() < 0.3 ? decor[i] : T.TALL_GRASS;
          }
          break;
        }
        case Biome.SNOW:
          if (g === T.ICE || g === T.ICE_CRACK) break;
          if (r < 0.012) solid(i, T.SNOW_ROCK);
          else if (r < 0.03) decor[i] = T.SNOW_DRIFT;
          else if (r < 0.045) decor[i] = T.SNOW_GRASS;
          else if (r < 0.055) decor[i] = T.FROZEN_BUSH;
          else if (r < 0.062) decor[i] = T.ICE_SHARDS;
          else if (r < 0.066) decor[i] = T.SNOW_STUMP;
          else if (r < 0.07) decor[i] = T.FROST_FLOWER;
          break;
        case Biome.BLOCK: {
          // blocos de pedra em aglomerados
          const cluster = valueNoise(x * 0.12, y * 0.12, seed + 551);
          if (r < (cluster > 0.7 ? 0.22 : 0.015)) solid(i, rand() < 0.25 ? T.BLOCK_MOSS : T.BLOCK);
          else if (r < 0.04) decor[i] = T.BLOCK_SMALL;
          else if (r < 0.065) decor[i] = T.PEBBLES;
          else if (r < 0.085) decor[i] = T.DRY_TUFT;
          else if (r < 0.09) solid(i, T.ORE);
          break;
        }
        case Biome.BLACK: {
          const field = valueNoise(x * 0.1, y * 0.1, seed + 561);
          if (r < (field > 0.68 ? 0.12 : 0.012)) {
            const big = rand() < 0.3;
            const purple = rand() < 0.6;
            if (big) solid(i, T.CRYSTAL_BIG);
            else decor[i] = purple ? T.CRYSTAL_P : T.CRYSTAL_C;
            if (rand() < (big ? 0.8 : 0.35)) glows.push({ x: x * TILE + 8, y: y * TILE + 6, color: purple || big ? 0xb46cec : 0x5ee0ea });
          } else if (r < 0.15) decor[i] = rand() < 0.5 ? T.GLOW_FUNGUS : T.EMBER_GRASS;
          else if (r < 0.17) decor[i] = T.THORNS;
          else if (r < 0.178) decor[i] = T.BONES;
          break;
        }
        case Biome.DUST:
          if (g === T.OASIS_GRASS) {
            if (r < 0.15) decor[i] = T.TALL_GRASS;
            break;
          }
          if (g === T.SAND) break;
          if (r < 0.008) solid(i, T.CACTUS);
          else if (r < 0.016) decor[i] = T.CACTUS_SMALL;
          else if (r < 0.028) decor[i] = T.DEAD_BUSH;
          else if (r < 0.032) decor[i] = T.SKULL;
          else if (r < 0.038) solid(i, T.DESERT_ROCK);
          break;
        default:
          break;
      }
    }

  // ------------------------------------------------------------ transições
  computeEdges(W, H, ground, water, cliffs, edge);

  // ------------------------------------------------------------ criaturas
  const spawns: WorldData['spawns'] = [];
  const walkable = (x: number, y: number) => inside(x, y) && !collision[idx(x, y)] && water[idx(x, y)] < 0 && !reserve[idx(x, y)];
  const roomy = (x: number, y: number) => walkable(x, y) && walkable(x + 1, y) && walkable(x - 1, y) && walkable(x, y + 1) && walkable(x, y - 1);
  const place = (kind: SpawnKind, count: number, b: Biome, variant?: string) => {
    let placed = 0;
    for (let tries = 0; tries < count * 120 && placed < count; tries++) {
      const x = 2 + Math.floor(rand() * (W - 4));
      const y = 2 + Math.floor(rand() * (H - 4));
      if (biome[idx(x, y)] !== b || !roomy(x, y)) continue;
      spawns.push({ kind, x: x * TILE + 8, y: y * TILE + 8, variant });
      placed++;
    }
  };
  const S = 8;
  // Vale de Vaelmor: bichos mansos e poucos inimigos fracos
  place('deer', 3 * S, Biome.VALE);
  place('fox', 2 * S, Biome.VALE);
  place('slime', 2 * S, Biome.VALE);
  // Greenland: muita vida
  place('deer', 30 * S, Biome.GREEN);
  place('fox', 24 * S, Biome.GREEN);
  place('boar', 22 * S, Biome.GREEN);
  place('slime', 18 * S, Biome.GREEN);
  place('wolf', 12 * S, Biome.GREEN);
  place('bandit', 8 * S, Biome.GREEN);
  // Snowland
  place('hare', 26 * S, Biome.SNOW);
  place('deer', 10 * S, Biome.SNOW, 'snow');
  place('bear', 16 * S, Biome.SNOW);
  place('wolf', 22 * S, Biome.SNOW, 'snow');
  place('wraith', 6 * S, Biome.SNOW);
  // Blockland
  place('goat', 22 * S, Biome.BLOCK);
  place('golem', 18 * S, Biome.BLOCK);
  place('slime', 16 * S, Biome.BLOCK, 'stone');
  place('bandit', 10 * S, Biome.BLOCK);
  // Blackland
  place('spider', 26 * S, Biome.BLACK);
  place('wraith', 24 * S, Biome.BLACK);
  place('slime', 10 * S, Biome.BLACK, 'void');
  // Dustland
  place('lizard', 24 * S, Biome.DUST);
  place('scorpion', 24 * S, Biome.DUST);
  place('bandit', 14 * S, Biome.DUST);
  place('slime', 10 * S, Biome.DUST, 'sand');
  place('wolf', 8 * S, Biome.DUST, 'sand');
  // rebanhos de ovelhas nas fazendas
  for (const s of sheep) for (let n = 0; n < 3; n++) spawns.push({ kind: 'sheep', x: s.x + (rand() - 0.5) * 60, y: s.y + rand() * 30 });

  // ------------------------------------------------------------ pontos de interesse (debug)
  const poi: WorldData['poi'] = [];
  const centers: [number, number][] = [
    [capital.cx, capital.cy],
    [k(60), k(170)],
    [k(150), k(40)],
    [k(285), k(140)],
    [k(275), k(285)],
    [k(120), k(290)],
  ];
  const free2 = (x: number, y: number) => inside(x, y) && !collision[idx(x, y)] && water[idx(x, y)] < 0;
  for (const [cx, cy] of centers) {
    let best: { x: number; y: number } | null = null;
    for (let r = 0; r < 120 && !best; r++)
      for (let a = 0; a < 24 && !best; a++) {
        const x = Math.round(cx + Math.cos((a / 24) * Math.PI * 2) * r);
        const y = Math.round(cy + Math.sin((a / 24) * Math.PI * 2) * r);
        if (free2(x, y) && free2(x + 1, y) && free2(x, y + 1)) best = { x: x * TILE + 8, y: y * TILE + 8 };
      }
    poi.push(best ?? { x: cx * TILE, y: cy * TILE });
  }
  // começa na praça da capital, ao sul da fonte
  const start = { x: capital.cx * TILE + 8, y: (capital.cy + 3) * TILE + 8 };
  poi[0] = start;

  return { width: W, height: H, ground, water, edge, cliffs, decor, canopy, collision, biome, spawns, glows, cities, buildings, props, poi, start };
}
