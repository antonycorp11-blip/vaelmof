/**
 * hero.png (scripts/hero): folha universal LPC, 64×64 por quadro, 13 colunas.
 * Cada animação ocupa 4 linhas na ordem cima, esquerda, baixo, direita.
 */
export const HERO = {
  frame: 64,
  cols: 13,
  /** Os pés ficam nesta linha do quadro. */
  footY: 61,
  /** 64 px da arte → ~28 px do mundo (altura dos bandidos). */
  scale: 0.56,
  rows: { cast: 0, walk: 8, fall: 20 },
} as const;
/** hero-slash.png: golpe com espada em quadros 128×128, 6 colunas, mesma ordem de direções. */
export const HERO_SLASH = { frame: 128, cols: 6, footY: 32 + 61 } as const;
/** Linha LPC por direção do jogo (0 baixo, 1 esquerda, 2 direita, 3 cima). */
export const LPC_DIR = [2, 1, 3, 0];
export const heroFrame = (row: number, dir: number, col: number) => (row + LPC_DIR[dir]) * HERO.cols + col;
export const slashFrame = (dir: number, col: number) => LPC_DIR[dir] * HERO_SLASH.cols + col;
