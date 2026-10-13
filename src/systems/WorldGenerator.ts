import { MAP_H, MAP_W, TILE } from '../config';
import { generateMap, type MapData, type SpawnKind } from './MapGenerator';
import { fbm, mulberry32, valueNoise } from './Noise';
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

export const WORLD_W = 480;
export const WORLD_H = 480;
/** Escala do traçado em relação ao primeiro mundo (320×320). */
const K = WORLD_W / 320;
const k = (v: number) => Math.round(v * K);
/** Posição do vale original (120×120) dentro do mundo: centro-norte. */
const OX = Math.round(WORLD_W / 2 - 60);
const OY = k(105);

export interface WorldData extends MapData {
  biome: Uint8Array;
  /** Pontos de luz permanentes (cristais) em px do mundo. */
  glows: { x: number; y: number; color: number }[];
  /** Um ponto livre no coração de cada bioma (para o debug teleportar). */
  poi: { x: number; y: number }[];
}

/**
 * Mundo de 320×320 tiles: o vale de Vaelmor original no centro-norte e cinco
 * biomas em volta — Snowland ao norte, Blockland a leste, Blackland a
 * sudeste, Dustland ao sul e Greenland a oeste e em volta do vale. As
 * fronteiras são deformadas por ruído; cada bioma tem chão, relevo
 * (montanhas com paredão), água, árvores e decoração próprios.
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
  const cliffs = new Int16Array(N).fill(-1);
  const decor = new Int16Array(N).fill(-1);
  const canopy = new Int16Array(N).fill(-1);
  const collision = new Uint8Array(N);
  const biome = new Uint8Array(N);
  const occupied = new Uint8Array(N);
  const glows: WorldData['glows'] = [];

  const inVale = (x: number, y: number) => x >= OX && y >= OY && x < OX + MAP_W && y < OY + MAP_H;

  // ------------------------------------------------------------ biomas
  const biomeAt = (x: number, y: number): Biome => {
    if (inVale(x, y)) return Biome.VALE;
    const warp = (sx: number, sd: number) =>
      (fbm((x * 0.012) / K + sx, (y * 0.012) / K, seed + sd, 3) - 0.5) * 150 * K + (fbm(x * 0.05 + sx, y * 0.05, seed + sd + 7, 2) - 0.5) * 22;
    const wx = warp(0, 501);
    const wy = warp(50, 502);
    const u = x + wx;
    const v = y + wy;
    if (v < k(92)) return Biome.SNOW;
    if (u > k(236) && v < k(218)) return Biome.BLOCK;
    if (u > k(218) && v >= k(218)) return Biome.BLACK;
    if (v > k(240)) return Biome.DUST;
    return Biome.GREEN;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) biome[idx(x, y)] = biomeAt(x, y);

  // ------------------------------------------------------------ chão base
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const r = valueNoise(x * 0.9, y * 0.9, seed + 13);
      const n = fbm(x * 0.07, y * 0.07, seed + 511);
      switch (biome[i] as Biome) {
        case Biome.GREEN: {
          const forest = fbm(x * 0.05 + 40, y * 0.05, seed + 17);
          ground[i] = forest > 0.5 + (r - 0.5) * 0.05 ? T.FOREST : r < 0.5 ? T.GRASS[0] : r < 0.82 ? T.GRASS[1] : T.GRASS[2];
          break;
        }
        case Biome.SNOW: {
          const forest = fbm(x * 0.05 + 40, y * 0.05, seed + 17);
          ground[i] = forest > 0.58 ? T.SNOW_SHADOW : r < 0.55 ? T.SNOW[0] : r < 0.85 ? T.SNOW[1] : T.SNOW[2];
          break;
        }
        case Biome.BLOCK:
          ground[i] = n > 0.62 ? T.GRAVEL : n < 0.32 ? T.STONE_DRY : r < 0.5 ? T.STONE[0] : r < 0.8 ? T.STONE[2] : T.STONE[1];
          break;
        case Biome.BLACK:
          ground[i] = n > 0.66 ? T.OBSIDIAN : r > 0.93 ? T.ASH_CRACK : r < 0.5 ? T.ASH[0] : r < 0.8 ? T.ASH[1] : T.ASH[2];
          break;
        case Biome.DUST:
          ground[i] = n > 0.64 ? T.SANDSTONE : r < 0.45 ? T.DUNE[0] : r < 0.7 ? T.DUNE[1] : r < 0.88 ? T.DUNE[2] : T.DUNE_RIPPLE;
          break;
        default:
          break;
      }
    }

  // ------------------------------------------------------------ água
  const setWater = (x: number, y: number, tile = T.WATER) => {
    if (!inside(x, y) || inVale(x, y)) return;
    const i = idx(x, y);
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
    water[i] = tile;
    collision[i] = 1;
  };
  const river = (pts: [number, number][], hw: number) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, y0] = pts[s];
      const [x1, y1] = pts[s + 1];
      const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= len; k++) {
        const t = k / Math.max(1, len);
        const cx = Math.round(x0 + (x1 - x0) * t + Math.sin((y0 + k) * 0.08 + s) * 3);
        const cy = Math.round(y0 + (y1 - y0) * t);
        for (let dy = -hw; dy <= hw; dy++) for (let dx = -hw; dx <= hw; dx++) if (dx * dx + dy * dy <= hw * hw + 1) setWater(cx + dx, cy + dy);
      }
    }
  };
  const lake = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++)
      for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (valueNoise(x * 0.4, y * 0.4, seed + 521) - 0.5) * 0.5;
        if (d <= 1) setWater(x, y);
      }
  };
  // o Rio Serro continua ao sul do vale, atravessa o Dustland e morre num oásis
  const valley = generateMap(seed);
  let serroX = OX + 60;
  for (let x = 0; x < MAP_W; x++) if (valley.water[(MAP_H - 1) * MAP_W + x] >= 0) serroX = OX + x;
  river([[serroX, OY + MAP_H], [serroX - 6, k(250)], [serroX + 8, k(276)], [serroX + 2, k(292)]], 2);
  lake(serroX + 2, k(296), 9, 6);
  // grande rio de Greenland: desce das montanhas de neve pelo oeste, com lagoas
  river([[k(46), k(70)], [k(38), k(130)], [k(54), k(190)], [k(42), k(250)], [k(58), k(300)]], 3);
  // segundo rio de Greenland, a leste do vale, descendo para o deserto
  river([[OX + MAP_W + 18, k(98)], [OX + MAP_W + 26, k(160)], [OX + MAP_W + 14, k(215)], [OX + MAP_W + 22, k(250)]], 2);
  for (let n = 0; n < 20; n++) {
    const cx = 10 + rand() * k(95);
    const cy = k(100) + rand() * k(140);
    if (biome[idx(Math.round(cx), Math.round(cy))] === Biome.GREEN) lake(cx, cy, 4 + rand() * 6, 3 + rand() * 4);
  }
  // lagos congelados no Snowland
  for (let n = 0; n < 16; n++) lake(15 + rand() * k(290), 12 + rand() * k(60), 4 + rand() * 8, 3 + rand() * 5);
  // poucos rios no Blockland (um riacho estreito)
  river([[k(300), k(108)], [k(284), k(150)], [k(292), k(200)]], 1);
  // poças do vazio no Blackland
  for (let n = 0; n < 14; n++) lake(k(240) + rand() * k(70), k(236) + rand() * k(75), 2 + rand() * 4, 2 + rand() * 3);
  // oásis no Dustland
  const oases: [number, number][] = [];
  for (let n = 0; n < 9; n++) {
    const cx = 20 + rand() * k(190);
    const cy = k(258) + rand() * k(50);
    if (biome[idx(Math.round(cx), Math.round(cy))] !== Biome.DUST) continue;
    lake(cx, cy, 3 + rand() * 2, 2 + rand() * 2);
    oases.push([cx, cy]);
  }
  oases.push([serroX + 2, k(296)]);
  // margens: areia em Greenland, grama de oásis no deserto
  const isWater = (x: number, y: number) => inside(x, y) && water[idx(x, y)] >= 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (inVale(x, y) || water[i] >= 0) continue;
      let near = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isWater(x + dx, y + dy)) near = Math.max(near, 3 - Math.max(Math.abs(dx), Math.abs(dy)));
      if (!near) continue;
      const b = biome[i] as Biome;
      if (b === Biome.GREEN && near >= 2) ground[i] = T.SAND;
      else if (b === Biome.DUST) ground[i] = T.OASIS_GRASS;
      else if (b === Biome.BLOCK && near >= 2) ground[i] = T.GRAVEL;
    }

  // ------------------------------------------------------------ montanhas
  // maciços (manchas grandes de ruído); a borda de baixo de cada um vira paredão
  const massif = (x: number, y: number, s: number) => fbm((x * 0.028) / Math.sqrt(K), (y * 0.028) / Math.sqrt(K), seed + s, 4);
  const mountain = new Uint8Array(N);
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
      if (!m || water[i] >= 0 || ground[i] === T.VOID || ground[i] === T.ICE || ground[i] === T.ICE_CRACK) continue;
      // longe do vale
      if (x > OX - 8 && y > OY - 8 && x < OX + MAP_W + 8 && y < OY + MAP_H + 8) continue;
      if (massif(x, y, 531) > m[0] + (valueNoise(x * 0.5, y * 0.5, seed + 537) - 0.5) * 0.02) mountain[i] = 1;
    }
  // tira pontas de 1 tile (fica só maciço de verdade)
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

  // ------------------------------------------------------------ cola o vale original
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const s = y * MAP_W + x;
      const d = idx(OX + x, OY + y);
      ground[d] = valley.ground[s];
      water[d] = valley.water[s];
      cliffs[d] = valley.cliffs[s];
      decor[d] = valley.decor[s];
      canopy[d] = valley.canopy[s];
      collision[d] = valley.collision[s];
      occupied[d] = valley.collision[s] || valley.canopy[s] >= 0 || valley.decor[s] >= 0 ? 1 : 0;
    }
  const PX = OX * TILE;
  const PY = OY * TILE;
  // borda do vale: o chão de fora herda (pontilhado) o chão da beirada do vale
  const BLEND = 14;
  const blendable = new Set<number>([...T.GRASS, ...T.HIGH, T.FOREST, T.ROCK_GROUND]);
  for (let y = OY - BLEND; y < OY + MAP_H + BLEND; y++)
    for (let x = OX - BLEND; x < OX + MAP_W + BLEND; x++) {
      if (!inside(x, y) || inVale(x, y)) continue;
      const i = idx(x, y);
      if (biome[i] !== Biome.GREEN || water[i] >= 0 || cliffs[i] >= 0) continue;
      const ex = Math.min(OX + MAP_W - 1, Math.max(OX, x));
      const ey = Math.min(OY + MAP_H - 1, Math.max(OY, y));
      const d = Math.max(Math.abs(x - ex), Math.abs(y - ey));
      const src = ground[idx(ex, ey)];
      if (!blendable.has(src)) continue;
      if (valueNoise(x * 0.35, y * 0.35, seed + 571) * BLEND * 1.3 > d) ground[i] = src === T.FOREST || src === T.ROCK_GROUND ? src : ground[i] === T.FOREST && !T.HIGH.includes(src as never) ? T.FOREST : src;
    }

  // ------------------------------------------------------------ árvores
  const free = (x: number, y: number) => {
    if (!inside(x, y) || inVale(x, y)) return false;
    const i = idx(x, y);
    return !occupied[i] && water[i] < 0 && cliffs[i] < 0 && !collision[i] && ground[i] !== T.ICE && ground[i] !== T.ICE_CRACK && ground[i] !== T.VOID;
  };
  const tree = (x: number, y: number, canopyBase: number, trunkTile: number, h = 2) => {
    if (!free(x, y) || !free(x, y + 1)) return false;
    for (let dy = -h; dy <= 0; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (!inside(cx, cy) || inVale(cx, cy) || occupied[idx(cx, cy)] || canopy[idx(cx, cy)] >= 0) return false;
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
  for (let y = 4; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (inVale(x, y)) continue;
      const forest = fbm(x * 0.05 + 40, y * 0.05, seed + 17);
      const r = rand();
      switch (biome[i] as Biome) {
        case Biome.GREEN: {
          // florestas densas e majestosas
          const p = forest > 0.5 ? 0.42 : forest > 0.42 ? 0.12 : 0.025;
          if (r > p) break;
          if (waterNear(x, y, 3) && rand() < 0.6) tree(x, y, T.CANOPY_WILLOW, T.TRUNK_WILLOW);
          else if (rand() < 0.45) tree(x, y, T.CANOPY_BIGOAK, T.TRUNK_BIGOAK);
          else if (rand() < 0.75) tree(x, y, T.CANOPY_OAK, T.TRUNK_OAK);
          else tree(x, y, T.CANOPY_PINE, T.TRUNK_PINE);
          break;
        }
        case Biome.SNOW: {
          // pinheiros altíssimos (copa 3×3)
          const p = forest > 0.58 ? 0.4 : forest > 0.48 ? 0.1 : 0.03;
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
          if (oases.some(([ox, oy]) => Math.hypot(x - ox, y - oy) < 9) && r < 0.22) tree(x, y, T.CANOPY_PALM, T.TRUNK_PALM);
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
      const g = ground[i];
      switch (biome[i] as Biome) {
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
          if (g === T.VOID) break;
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

  // ------------------------------------------------------------ spawns
  const spawns: MapData['spawns'] = valley.spawns.map((s) => ({ ...s, x: s.x + PX, y: s.y + PY }));
  const walkable = (x: number, y: number) => inside(x, y) && !collision[idx(x, y)] && water[idx(x, y)] < 0;
  const roomy = (x: number, y: number) => walkable(x, y) && walkable(x + 1, y) && walkable(x - 1, y) && walkable(x, y + 1) && walkable(x, y - 1);
  const place = (kind: SpawnKind, count: number, b: Biome, variant?: string) => {
    let placed = 0;
    for (let tries = 0; tries < 8000 && placed < count; tries++) {
      const x = 2 + Math.floor(rand() * (W - 4));
      const y = 2 + Math.floor(rand() * (H - 4));
      if (biome[idx(x, y)] !== b || !roomy(x, y)) continue;
      spawns.push({ kind, x: x * TILE + 8, y: y * TILE + 8, variant });
      placed++;
    }
  };
  // Greenland: muita vida
  place('deer', 30, Biome.GREEN);
  place('fox', 24, Biome.GREEN);
  place('boar', 22, Biome.GREEN);
  place('slime', 18, Biome.GREEN);
  place('wolf', 12, Biome.GREEN);
  place('bandit', 8, Biome.GREEN);
  // Snowland
  place('hare', 26, Biome.SNOW);
  place('deer', 10, Biome.SNOW, 'snow');
  place('bear', 16, Biome.SNOW);
  place('wolf', 22, Biome.SNOW, 'snow');
  place('wraith', 6, Biome.SNOW);
  // Blockland
  place('goat', 22, Biome.BLOCK);
  place('golem', 18, Biome.BLOCK);
  place('slime', 16, Biome.BLOCK, 'stone');
  place('bandit', 10, Biome.BLOCK);
  // Blackland
  place('spider', 26, Biome.BLACK);
  place('wraith', 24, Biome.BLACK);
  place('slime', 10, Biome.BLACK, 'void');
  // Dustland
  place('lizard', 24, Biome.DUST);
  place('scorpion', 24, Biome.DUST);
  place('bandit', 14, Biome.DUST);
  place('slime', 10, Biome.DUST, 'sand');
  place('wolf', 8, Biome.DUST, 'sand');

  // ------------------------------------------------------------ pontos de interesse (debug)
  const poi: WorldData['poi'] = [];
  const centers: [number, number][] = [
    [OX + 60, OY + 80], // vale (Brumavale fica perto)
    [k(40), k(170)],
    [k(150), k(40)],
    [k(285), k(160)],
    [k(270), k(275)],
    [k(130), k(285)],
  ];
  for (const [cx, cy] of centers) {
    let best: { x: number; y: number } | null = null;
    for (let r = 0; r < 60 && !best; r++)
      for (let k = 0; k < 24 && !best; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r);
        if (roomy(x, y)) best = { x: x * TILE + 8, y: y * TILE + 8 };
      }
    poi.push(best ?? { x: cx * TILE, y: cy * TILE });
  }
  poi[0] = { x: valley.start.x + PX, y: valley.start.y + PY };

  return {
    width: W,
    height: H,
    ground,
    water,
    cliffs,
    decor,
    canopy,
    collision,
    biome,
    glows,
    poi,
    houses: valley.houses.map((h) => ({ ...h, tx: h.tx + OX, ty: h.ty + OY })),
    wells: valley.wells.map((w) => ({ tx: w.tx + OX, ty: w.ty + OY })),
    torches: valley.torches.map((t) => ({ x: t.x + PX, y: t.y + PY })),
    spawns,
    start: { x: valley.start.x + PX, y: valley.start.y + PY },
    waterfall: { x0: valley.waterfall.x0 + PX, x1: valley.waterfall.x1 + PX, top: valley.waterfall.top + PY, base: valley.waterfall.base + PY },
    villages: valley.villages.map((v) => ({ ...v, cx: v.cx + PX, cy: v.cy + PY })),
  };
}
