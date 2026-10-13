import { MAP_H, MAP_W, TILE } from '../config';
import { fbm, mulberry32, valueNoise } from './Noise';
import { T } from './Tiles';

export type SpawnKind = 'sheep' | 'deer' | 'slime' | 'wolf' | 'bandit' | 'wraith';

export interface HouseDef {
  tx: number;
  ty: number;
  texture: string;
}

export interface MapData {
  width: number;
  height: number;
  /** Camadas como arrays [y * width + x]; -1 = vazio. */
  ground: Int16Array;
  water: Int16Array;
  cliffs: Int16Array;
  decor: Int16Array;
  canopy: Int16Array;
  collision: Uint8Array;
  houses: HouseDef[];
  wells: { tx: number; ty: number }[];
  torches: { x: number; y: number }[];
  spawns: { kind: SpawnKind; x: number; y: number }[];
  start: { x: number; y: number };
  waterfall: { x0: number; x1: number; top: number; base: number };
  villages: { name: string; cx: number; cy: number }[];
}

/**
 * Gera o vale de Vaelmor proceduralmente (determinístico pela seed).
 *
 * Geografia: o planalto ocupa o norte; uma escarpa contínua (penhascos de
 * 3 tiles) o separa do vale ao sul. O Rio Serro nasce num lago no topo do
 * mapa, desce pelo planalto, despenca na Queda do Serro e atravessa o vale
 * até a borda sul. Duas passagens cruzam a escarpa: uma escadaria (estrada
 * para Pedrafria) e uma rampa a oeste.
 */
export function generateMap(seed: number): MapData {
  const W = MAP_W;
  const H = MAP_H;
  const N = W * H;
  const rand = mulberry32(seed);
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const pick = <V>(arr: readonly V[]): V => arr[Math.floor(rand() * arr.length)];

  const ground = new Int16Array(N).fill(-1);
  const water = new Int16Array(N).fill(-1);
  const cliffs = new Int16Array(N).fill(-1);
  const decor = new Int16Array(N).fill(-1);
  const canopy = new Int16Array(N).fill(-1);
  const collision = new Uint8Array(N);
  const reserved = new Uint8Array(N); // vilas, estrada: sem árvores/decoração
  const road = new Uint8Array(N);

  // ------------------------------------------------------------ rio (eixo)
  const rx: number[] = [];
  for (let y = 0; y < H; y++) {
    rx.push(Math.round(57 + Math.sin(y * 0.05 + 1.2) * 7 + (fbm(y * 0.06, 3.3, seed + 7, 3) - 0.5) * 10));
  }
  const WX = rx[38];

  // ------------------------------------------------------------ escarpa
  const cliffY: number[] = [];
  for (let x = 0; x < W; x++) cliffY.push(Math.round(37 + (fbm(x * 0.07, 9.1, seed + 3, 3) - 0.5) * 12));
  const PASS_E = 88;
  const PASS_W = 20;
  const locked = new Uint8Array(W);
  const flatten = (x0: number, x1: number, v: number) => {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      cliffY[x] = v;
      locked[x] = 1;
    }
  };
  flatten(WX - 5, WX + 5, cliffY[WX]);
  flatten(PASS_E - 3, PASS_E + 4, cliffY[PASS_E]);
  flatten(PASS_W - 3, PASS_W + 4, cliffY[PASS_W]);
  // suaviza degraus (no máximo 1 tile entre colunas vizinhas)
  for (let x = 1; x < W; x++) if (!locked[x]) cliffY[x] = Math.max(cliffY[x - 1] - 1, Math.min(cliffY[x - 1] + 1, cliffY[x]));
  for (let x = W - 2; x >= 0; x--) if (!locked[x]) cliffY[x] = Math.max(cliffY[x + 1] - 1, Math.min(cliffY[x + 1] + 1, cliffY[x]));
  const CY_WF = cliffY[WX];
  // o rio corre reto (em WX) ao cruzar a escarpa, com transição suave
  for (let y = CY_WF - 10; y <= CY_WF + 12; y++) {
    const d = Math.abs(y - (CY_WF + 1));
    const k = d <= 6 ? 1 : 1 - (d - 6) / 5;
    rx[y] = Math.round(rx[y] * (1 - k) + WX * k);
  }
  const isPlateau = (x: number, y: number) => y < cliffY[x];
  const isBand = (x: number, y: number) => y >= cliffY[x] && y <= cliffY[x] + 2;
  const isPassE = (x: number) => x >= PASS_E && x <= PASS_E + 2;
  const isPassW = (x: number) => x >= PASS_W && x <= PASS_W + 2;

  // ------------------------------------------------------------ chão base
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const n = fbm(x * 0.09, y * 0.09, seed + 11);
      const r = valueNoise(x * 0.9, y * 0.9, seed + 13);
      if (isPlateau(x, y) || isBand(x, y)) {
        if (n > 0.66) ground[i] = T.ROCK_GROUND;
        else ground[i] = r < 0.55 ? T.HIGH[0] : r < 0.85 ? T.HIGH[1] : T.HIGH[2];
      } else {
        const forest = fbm(x * 0.06 + 40, y * 0.06, seed + 17);
        // borda da floresta pontilhada para suavizar a transição
        if (forest > 0.6 + (r - 0.5) * 0.05) ground[i] = T.FOREST;
        else ground[i] = r < 0.5 ? T.GRASS[0] : r < 0.82 ? T.GRASS[1] : T.GRASS[2];
      }
    }

  // ------------------------------------------------------------ penhascos
  for (let x = 0; x < W; x++) {
    const cy = cliffY[x];
    for (let k = 0; k < 3; k++) {
      const y = cy + k;
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      if (isPassE(x)) {
        cliffs[i] = T.STAIRS;
        continue;
      }
      if (isPassW(x)) {
        cliffs[i] = T.RAMP;
        continue;
      }
      cliffs[i] = k === 0 ? T.CLIFF_LIP : k === 1 ? (rand() < 0.25 ? T.CLIFF_FACE_ALT : T.CLIFF_FACE) : T.CLIFF_BASE;
      collision[i] = 1;
    }
  }

  // ------------------------------------------------------------ água
  const setWater = (x: number, y: number, tile: number) => {
    if (!inside(x, y)) return;
    const i = idx(x, y);
    water[i] = tile;
    cliffs[i] = -1;
    collision[i] = 1;
  };
  // lago da nascente
  for (let y = 0; y < 7; y++)
    for (let x = rx[0] - 8; x <= rx[0] + 8; x++) {
      const dx = (x - rx[0]) / 7.5;
      const dy = (y - 1) / 5;
      if (dx * dx + dy * dy <= 1) setWater(x, y, T.WATER);
    }
  for (let y = 0; y < H; y++) {
    const plateau = y < CY_WF;
    const hw = plateau ? 1 : 2;
    for (let x = rx[y] - hw; x <= rx[y] + hw; x++) {
      if (isBand(x, y) && Math.abs(x - WX) <= 1) continue; // cachoeira tratada abaixo
      if (isBand(x, y)) continue;
      setWater(x, y, T.WATER);
    }
  }
  // Queda do Serro
  for (let x = WX - 1; x <= WX + 1; x++) {
    setWater(x, CY_WF, T.WATER_LIP);
    setWater(x, CY_WF + 1, T.WATERFALL);
    setWater(x, CY_WF + 2, T.WATERFALL);
  }
  for (let y = CY_WF + 3; y <= CY_WF + 5; y++)
    for (let x = WX - 3; x <= WX + 3; x++) {
      const edge = Math.abs(x - WX) === 3 && y === CY_WF + 5;
      if (!edge) setWater(x, y, y <= CY_WF + 4 && Math.abs(x - WX) <= 2 ? T.FOAM : T.WATER);
    }

  const isWater = (x: number, y: number) => inside(x, y) && water[idx(x, y)] >= 0;

  // areia nas margens
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (water[i] >= 0 || cliffs[i] >= 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isWater(x + dx, y + dy)) near = true;
      if (near) ground[i] = T.SAND;
    }

  // distância até a água (BFS curta) — usada para salgueiros e juncos
  const waterDist = new Uint8Array(N).fill(255);
  {
    const q: number[] = [];
    for (let i = 0; i < N; i++) if (water[i] >= 0) {
      waterDist[i] = 0;
      q.push(i);
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const d = waterDist[i];
      if (d >= 6) continue;
      const x = i % W;
      const y = (i / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        if (waterDist[j] > d + 1) {
          waterDist[j] = d + 1;
          q.push(j);
        }
      }
    }
  }

  // ------------------------------------------------------------ vilas
  const houses: HouseDef[] = [];
  const wells: { tx: number; ty: number }[] = [];
  const torches: { x: number; y: number }[] = [];
  const reserve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) reserved[idx(x, y)] = 1;
  };
  const paint = (x0: number, y0: number, x1: number, y1: number, tile: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (inside(x, y) && water[idx(x, y)] < 0 && cliffs[idx(x, y)] < 0) ground[idx(x, y)] = tile;
  };
  const addHouse = (tx: number, ty: number, texture: string) => {
    houses.push({ tx, ty, texture });
    for (let y = ty + 1; y <= ty + 2; y++) for (let x = tx; x <= tx + 2; x++) collision[idx(x, y)] = 1;
    reserve(tx - 1, ty - 1, tx + 3, ty + 3);
    // caminho de terra da porta até a praça
    paint(tx + 1, ty + 3, tx + 1, ty + 3, T.DIRT);
    torches.push({ x: (tx + 3) * TILE + 4, y: (ty + 3) * TILE - 2 });
  };
  const addTorch = (tx: number, ty: number) => torches.push({ x: tx * TILE + 8, y: ty * TILE + 12 });
  const fenceH = (x0: number, x1: number, y: number, gaps: number[] = []) => {
    for (let x = x0; x <= x1; x++) {
      if (gaps.some((g) => Math.abs(g - x) <= 1)) continue;
      const i = idx(x, y);
      if (water[i] >= 0 || cliffs[i] >= 0) continue;
      decor[i] = T.FENCE_H;
      collision[i] = 1;
    }
  };
  const fenceV = (x: number, y0: number, y1: number, gaps: number[] = []) => {
    for (let y = y0; y <= y1; y++) {
      if (gaps.some((g) => Math.abs(g - y) <= 1)) continue;
      const i = idx(x, y);
      if (water[i] >= 0 || cliffs[i] >= 0) continue;
      decor[i] = T.FENCE_V;
      collision[i] = 1;
    }
  };

  // Brumavale — margem leste do rio
  const BY = 76;
  const BX = rx[BY] + 15;
  reserve(BX - 11, BY - 11, BX + 11, BY + 9);
  for (let y = BY - 11; y <= BY + 9; y++)
    for (let x = BX - 11; x <= BX + 11; x++) {
      const i = idx(x, y);
      if (ground[i] === T.FOREST) ground[i] = T.GRASS[0];
    }
  paint(BX - 4, BY - 2, BX + 4, BY + 2, T.COBBLE);
  addHouse(BX - 8, BY - 8, 'house-brumavale-a');
  addHouse(BX - 2, BY - 9, 'house-brumavale-b');
  addHouse(BX + 4, BY - 8, 'house-brumavale-a');
  addHouse(BX - 7, BY + 3, 'house-brumavale-b');
  addHouse(BX + 3, BY + 3, 'house-brumavale-a');
  paint(BX - 7, BY - 5, BX + 5, BY - 4, T.DIRT);
  paint(BX - 6, BY + 3, BX + 4, BY + 3, T.DIRT);
  wells.push({ tx: BX - 1, ty: BY - 1 });
  collision[idx(BX - 1, BY)] = 1;
  collision[idx(BX, BY)] = 1;
  for (const [dx, dy] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) addTorch(BX + dx, BY + dy);
  fenceH(BX - 11, BX + 11, BY - 11, [BX]);
  fenceH(BX - 11, BX + 11, BY + 9, [BX - 1]);
  fenceV(BX + 11, BY - 10, BY + 8, [BY]);
  fenceV(BX - 11, BY - 10, BY + 8, [BY]);

  // Pedrafria — na encosta do planalto, acima da escadaria
  const PX = PASS_E + 3;
  const PY = cliffY[PASS_E] - 14;
  reserve(PX - 10, PY - 10, PX + 10, PY + 8);
  paint(PX - 3, PY - 2, PX + 3, PY + 2, T.COBBLE);
  addHouse(PX - 8, PY - 7, 'house-pedrafria-a');
  addHouse(PX - 1, PY - 8, 'house-pedrafria-b');
  addHouse(PX + 5, PY - 6, 'house-pedrafria-a');
  addHouse(PX - 7, PY + 3, 'house-pedrafria-b');
  addHouse(PX + 4, PY + 3, 'house-pedrafria-b');
  paint(PX - 7, PY - 4, PX + 6, PY - 3, T.DIRT);
  for (const [dx, dy] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) addTorch(PX + dx, PY + dy);
  fenceH(PX - 10, PX + 10, PY - 10, [PX]);
  fenceV(PX - 10, PY - 9, PY + 7, [PY]);
  fenceV(PX + 10, PY - 9, PY + 7, [PY]);

  // ------------------------------------------------------------ estrada
  const roadNoiseSeed = seed + 29;
  const drawRoad = (pts: [number, number][], width = 2) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, y0] = pts[s];
      const [x1, y1] = pts[s + 1];
      const len = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= len; k++) {
        const t = k / Math.max(1, len);
        const wob = (valueNoise((s * 50 + k) * 0.15, 1, roadNoiseSeed) - 0.5) * 2.2 * Math.sin(t * Math.PI);
        const horiz = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
        const cx = Math.round(x0 + (x1 - x0) * t + (horiz ? 0 : wob));
        const cy = Math.round(y0 + (y1 - y0) * t + (horiz ? wob : 0));
        for (let dy = 0; dy < width; dy++)
          for (let dx = 0; dx < width; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (!inside(x, y)) continue;
            const i = idx(x, y);
            if (cliffs[i] === T.STAIRS || cliffs[i] === T.RAMP) {
              road[i] = 1;
              continue;
            }
            if (cliffs[i] >= 0) continue;
            if (water[i] >= 0) {
              // ponte
              water[i] = -1;
              ground[i] = T.BRIDGE;
              collision[i] = 0;
              road[i] = 2;
              continue;
            }
            if (ground[i] === T.COBBLE) continue;
            ground[i] = T.DIRT;
            road[i] = 1;
            if (decor[i] === T.FENCE_H || decor[i] === T.FENCE_V) {
              decor[i] = -1;
              collision[i] = 0;
            }
          }
      }
    }
  };
  const cyE = cliffY[PASS_E];
  drawRoad([
    [BX + 4, BY],
    [BX + 14, BY - 2],
    [PASS_E + 1, BY - 14],
    [PASS_E + 1, cyE + 3],
    [PASS_E + 1, cyE - 1],
    [PASS_E + 1, PY + 6],
    [PX, PY + 2],
  ]);
  const cyW = cliffY[PASS_W];
  drawRoad([
    [BX - 4, BY],
    [rx[BY] + 6, BY],
    [rx[BY] - 6, BY],
    [PASS_W + 1, BY - 12],
    [PASS_W + 1, cyW + 3],
    [PASS_W + 1, cyW - 1],
    [PASS_W - 2, cyW - 10],
  ]);
  // trilha até a queda (mirante)
  drawRoad([
    [rx[BY] - 6, BY],
    [WX - 7, CY_WF + 10],
    [WX - 6, CY_WF + 5],
  ], 1);
  for (let i = 0; i < N; i++) if (road[i]) reserved[i] = 1;
  // placas e tochas na estrada
  decor[idx(BX + 14, BY - 4)] = T.SIGN;
  decor[idx(PASS_E - 1, cyE + 4)] = T.SIGN;
  addTorch(PASS_E - 1, cyE + 3);
  addTorch(PASS_E + 4, cyE + 3);
  addTorch(PASS_E - 1, cyE - 2);
  addTorch(PASS_E + 4, cyE - 2);
  addTorch(rx[BY] + 4, BY - 1);
  addTorch(rx[BY] - 5, BY - 1);

  // ------------------------------------------------------------ árvores
  const occupied = new Uint8Array(N);
  const free = (x: number, y: number) => {
    if (!inside(x, y)) return false;
    const i = idx(x, y);
    return !occupied[i] && !reserved[i] && water[i] < 0 && cliffs[i] < 0 && !collision[i];
  };
  const startTx = BX;
  const startTy = BY + 1;
  for (let y = 3; y < H; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      const plateau = isPlateau(x, y);
      const forest = fbm(x * 0.06 + 40, y * 0.06, seed + 17);
      const nearRiver = waterDist[i] >= 2 && waterDist[i] <= 4;
      let type: 'oak' | 'pine' | 'willow';
      let p: number;
      if (plateau) {
        type = 'pine';
        const slope = cliffY[x] - y < 12; // encosta próxima à escarpa
        p = forest > 0.5 ? 0.3 : slope ? 0.1 : 0.05;
      } else if (nearRiver) {
        type = 'willow';
        p = 0.11;
      } else {
        type = 'oak';
        p = forest > 0.6 ? 0.34 : forest > 0.5 ? 0.09 : 0.018;
      }
      if (rand() > p) continue;
      if (Math.abs(x - startTx) < 4 && Math.abs(y - startTy) < 4) continue;
      // tronco + copa 3×2 + folga lateral
      let ok = free(x, y) && free(x, y + 1);
      for (let dy = -2; dy <= 0 && ok; dy++)
        for (let dx = -1; dx <= 1 && ok; dx++) {
          const cx = x + dx;
          const cy = y + dy;
          if (!inside(cx, cy) || occupied[idx(cx, cy)] || canopy[idx(cx, cy)] >= 0) ok = false;
          else if (isBand(cx, cy) || water[idx(cx, cy)] >= 0 && dy === 0) ok = false;
        }
      if (!ok) continue;
      const base = type === 'oak' ? T.CANOPY_OAK : type === 'pine' ? T.CANOPY_PINE : T.CANOPY_WILLOW;
      const trunk = type === 'oak' ? T.TRUNK_OAK : type === 'pine' ? T.TRUNK_PINE : T.TRUNK_WILLOW;
      for (let dy = -2; dy <= -1; dy++)
        for (let dx = -1; dx <= 1; dx++) canopy[idx(x + dx, y + dy)] = base + (dy + 2) * 16 + (dx + 1);
      decor[i] = trunk;
      collision[i] = 1;
      for (let dy = -2; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy)) occupied[idx(x + dx, y + dy)] = 1;
    }

  // ------------------------------------------------------------ decoração
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (water[i] >= 0) {
        if (water[i] === T.WATER && y > CY_WF + 6 && rand() < 0.025) decor[i] = T.LILY;
        continue;
      }
      if (decor[i] >= 0 || cliffs[i] >= 0 || collision[i] || road[i]) continue;
      const g = ground[i];
      const r = rand();
      const villageArea = reserved[i];
      if (g === T.SAND) {
        if (r < 0.14 && !villageArea) decor[i] = T.REEDS;
        continue;
      }
      if (g === T.COBBLE || g === T.DIRT) continue;
      const flowerField = valueNoise(x * 0.15, y * 0.15, seed + 41);
      const fp = villageArea ? 0.07 : flowerField > 0.65 ? 0.2 : 0.035;
      if (r < fp) {
        decor[i] = isPlateau(x, y) ? pick([T.FLOWERS[2], T.FLOWERS[3], T.FLOWERS[3]]) : pick(T.FLOWERS);
        continue;
      }
      if (villageArea) continue;
      if (r < fp + 0.014) decor[i] = rand() < 0.3 ? T.BUSH_BERRY : T.BUSH;
      else if (r < fp + 0.024) decor[i] = T.ROCK;
      else if (r < fp + 0.05) decor[i] = T.TALL_GRASS;
      else if (g === T.FOREST && r < fp + 0.075) decor[i] = rand() < 0.5 ? T.MUSHROOM : T.STUMP;
    }

  // colisão nas bordas do mapa é feita pelos limites do mundo físico

  // ------------------------------------------------------------ spawns
  const spawns: MapData['spawns'] = [];
  const walkable = (x: number, y: number) =>
    inside(x, y) && !collision[idx(x, y)] && water[idx(x, y)] < 0 && cliffs[idx(x, y)] !== T.STAIRS;
  const roomy = (x: number, y: number) =>
    walkable(x, y) && walkable(x + 1, y) && walkable(x - 1, y) && walkable(x, y + 1) && walkable(x, y - 1);
  const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
  const farFromVillages = (x: number, y: number, d: number) => dist(x, y, BX, BY) > d && dist(x, y, PX, PY) > d;
  const place = (kind: SpawnKind, count: number, pred: (x: number, y: number) => boolean, cluster?: [number, number, number]) => {
    let placed = 0;
    for (let tries = 0; tries < 4000 && placed < count; tries++) {
      let x: number;
      let y: number;
      if (cluster) {
        x = Math.round(cluster[0] + (rand() - 0.5) * 2 * cluster[2]);
        y = Math.round(cluster[1] + (rand() - 0.5) * 2 * cluster[2]);
      } else {
        x = 2 + Math.floor(rand() * (W - 4));
        y = 2 + Math.floor(rand() * (H - 4));
      }
      if (!roomy(x, y) || !pred(x, y)) continue;
      spawns.push({ kind, x: x * TILE + 8, y: y * TILE + 8 });
      placed++;
    }
  };
  const valley = (x: number, y: number) => y > cliffY[x] + 3;
  const plateauOk = (x: number, y: number) => y < cliffY[x] - 1;
  // ovelhas em rebanhos perto de Brumavale
  place('sheep', 5, (x, y) => valley(x, y) && !reserved[idx(x, y)], [BX + 4, BY + 17, 5]);
  place('sheep', 4, (x, y) => valley(x, y) && !reserved[idx(x, y)], [BX + 20, BY + 8, 4]);
  place('sheep', 4, (x, y) => valley(x, y) && !reserved[idx(x, y)], [rx[BY] - 12, BY + 10, 5]);
  // cervos em florestas e no planalto
  place('deer', 6, (x, y) => valley(x, y) && ground[idx(x, y)] === T.FOREST && farFromVillages(x, y, 18));
  place('deer', 5, (x, y) => plateauOk(x, y) && farFromVillages(x, y, 14));
  // inimigos
  place('slime', 1, (x, y) => valley(x, y), [BX + 2, BY + 22, 3]);
  place('slime', 10, (x, y) => valley(x, y) && farFromVillages(x, y, 20));
  place('wolf', 1, (x, y) => valley(x, y), [BX + 26, BY - 10, 4]);
  place('wolf', 4, (x, y) => plateauOk(x, y) && farFromVillages(x, y, 16));
  place('wolf', 3, (x, y) => valley(x, y) && ground[idx(x, y)] === T.FOREST && farFromVillages(x, y, 22));
  place('bandit', 1, (x, y) => valley(x, y), [BX + 20, BY - 6, 3]);
  place('bandit', 4, (x, y) => !!road[idx(x, y)] && farFromVillages(x, y, 16));
  place('bandit', 2, (x, y) => valley(x, y) && farFromVillages(x, y, 26));
  // Errantes: seres de outra dimensão nas florestas fechadas
  place('wraith', 6, (x, y) => ground[idx(x, y)] === T.FOREST && farFromVillages(x, y, 18));

  return {
    width: W,
    height: H,
    ground,
    water,
    cliffs,
    decor,
    canopy,
    collision,
    houses,
    wells,
    torches,
    spawns,
    start: { x: startTx * TILE + 8, y: startTy * TILE + 8 },
    waterfall: { x0: (WX - 1) * TILE, x1: (WX + 2) * TILE, top: CY_WF * TILE, base: (CY_WF + 3) * TILE },
    villages: [
      { name: 'Brumavale', cx: BX * TILE, cy: BY * TILE },
      { name: 'Pedrafria', cx: PX * TILE, cy: PY * TILE },
    ],
  };
}
