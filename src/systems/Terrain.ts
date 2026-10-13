import { T } from './Tiles';

/**
 * Transições suaves entre terrenos (marching squares nos cantos dos tiles).
 *
 * Cada tile tem um material com uma prioridade. Cada canto (vértice) recebe a
 * maior prioridade entre os 4 tiles que o tocam; um tile cujos cantos têm um
 * material mais alto que o seu ganha, na camada "edge", o tile de transição
 * desse material com a máscara dos cantos (1 NO, 2 NE, 4 SO, 8 SE). Assim a
 * neve "derrama" sobre a grama, a grama sobre a terra da estrada, a areia
 * sobre a água — sem as escadinhas de tiles quadrados.
 */

// Prioridades: 0 vazio, 1 água, 2 calçado (sem transição); de 3 em diante, os
// materiais de scripts/world-art.mjs (EDGE_MATERIALS), na mesma ordem.
const VOID = 0;
const WATER = 1;
const PAVED = 2;
const M = { ice: 3, dirt: 4, gravel: 5, stone: 6, obsidian: 7, ash: 8, sandstone: 9, dune: 10, sand: 11, grass: 12, forest: 13, snowshade: 14, snow: 15 } as const;
const FIRST_EDGE = 3;
/** Cumes das montanhas (camada de penhascos): acima de tudo, arredondam o contorno dos maciços. */
const PEAK: Record<number, number> = { [T.SNOW_PEAK]: 16, [T.ROCK_PEAK]: 17, [T.BLACK_PEAK]: 18, [T.MESA_PEAK]: 19 };
/** Primeiro tile de transição de cada prioridade (ver edgeBase em scripts/world-art.mjs). */
const edgeBase = (rank: number) => {
  const mi = rank - FIRST_EDGE;
  return mi < 13 ? T.EDGE + mi * 16 : 512 + (mi - 13) * 16;
};

/** Material de cada tile de chão. */
const RANK = new Uint8Array(1024).fill(PAVED);
const setRank = (tiles: readonly number[] | number, r: number) => {
  for (const t of Array.isArray(tiles) ? tiles : [tiles]) RANK[t as number] = r;
};
setRank(T.VOID, VOID);
setRank([T.ICE, T.ICE_CRACK], M.ice);
setRank(T.DIRT, M.dirt);
setRank(T.GRAVEL, M.gravel);
setRank([...T.STONE, T.STONE_DRY, T.ROCK_GROUND], M.stone);
setRank(T.OBSIDIAN, M.obsidian);
setRank([...T.ASH, T.ASH_CRACK], M.ash);
setRank(T.SANDSTONE, M.sandstone);
setRank([...T.DUNE, T.DUNE_RIPPLE], M.dune);
setRank(T.SAND, M.sand);
setRank([...T.GRASS, ...T.HIGH, T.OASIS_GRASS], M.grass);
setRank(T.FOREST, M.forest);
setRank(T.SNOW_SHADOW, M.snowshade);
setRank([...T.SNOW], M.snow);

export function rankOf(ground: number, water: number): number {
  if (water >= 0) return WATER;
  if (ground < 0) return VOID;
  return RANK[ground];
}

/** Preenche a camada `edge` a partir do chão e da água. */
export function computeEdges(W: number, H: number, ground: Int16Array, water: Int16Array, cliffs: Int16Array, edge: Int16Array) {
  const rank = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) rank[i] = (cliffs[i] >= 0 && PEAK[cliffs[i]]) || rankOf(ground[i], water[i]);
  // vértice (x, y) = canto superior esquerdo do tile (x, y)
  const VW = W + 1;
  const vert = new Uint8Array(VW * (H + 1));
  for (let y = 0; y <= H; y++)
    for (let x = 0; x <= W; x++) {
      let r = 0;
      for (let dy = -1; dy <= 0; dy++)
        for (let dx = -1; dx <= 0; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
          const v = rank[ty * W + tx];
          if (v > r) r = v;
        }
      vert[y * VW + x] = r;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const own = rank[i];
      const nw = vert[y * VW + x];
      const ne = vert[y * VW + x + 1];
      const sw = vert[(y + 1) * VW + x];
      const se = vert[(y + 1) * VW + x + 1];
      const top = Math.max(nw, ne, sw, se);
      if (top <= own || top < FIRST_EDGE) {
        edge[i] = -1;
        continue;
      }
      const mask = (nw === top ? 1 : 0) | (ne === top ? 2 : 0) | (sw === top ? 4 : 0) | (se === top ? 8 : 0);
      edge[i] = edgeBase(top) + mask;
    }
}
