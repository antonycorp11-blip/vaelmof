// Índices do tileset public/assets/tilesets/vaelmor-tiles.png (16 colunas).
// Precisam bater com scripts/generate-assets.mjs.
export const T = {
  GRASS: [0, 1, 2],
  HIGH: [3, 4, 5],
  DIRT: 6,
  SAND: 7,
  ROCK_GROUND: 8,
  COBBLE: 9,
  BRIDGE: 10,
  STAIRS: 11,
  FOREST: 12,
  RAMP: 13,
  WATER: 16, // +0..3 frames
  WATERFALL: 20, // +0..3
  FOAM: 24, // +0..3
  WATER_LIP: 28, // +0..3
  CLIFF_LIP: 32,
  CLIFF_FACE: 33,
  CLIFF_BASE: 34,
  CLIFF_FACE_ALT: 35,
  FLOWERS: [48, 49, 50, 51],
  BUSH: 52,
  BUSH_BERRY: 53,
  ROCK: 54,
  TALL_GRASS: 55,
  MUSHROOM: 56,
  REEDS: 57,
  FENCE_H: 58,
  FENCE_V: 59,
  FENCE_POST: 60,
  STUMP: 61,
  LILY: 62,
  SIGN: 63,
  // copas 3×2: índice do canto superior esquerdo; linha de baixo = +16
  CANOPY_OAK: 64,
  CANOPY_PINE: 67,
  CANOPY_WILLOW: 70,
  TRUNK_OAK: 96,
  TRUNK_PINE: 97,
  TRUNK_WILLOW: 98,
  COLLISION: 112,
} as const;

export const ANIM_FRAMES = 4;
