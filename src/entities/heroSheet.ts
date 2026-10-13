/**
 * hero-<arma>.png (scripts/hero): folha universal LPC, 64×64 por quadro,
 * 13 colunas. Cada animação ocupa 4 linhas na ordem cima, esquerda, baixo,
 * direita. As animações grandes (hero-<arma>-<anim>.png) estão em heroSheets.ts.
 */
export const HERO = {
  frame: 64,
  cols: 13,
  /** Os pés ficam nesta linha do quadro. */
  footY: 61,
  /** 64 px da arte → ~22 px do mundo (1,4 tile); ajustado ao zoom em Player.fitPixels. */
  scale: 0.44,
  rows: { cast: 0, thrust: 4, walk: 8, slash: 12, shoot: 16, fall: 20 },
} as const;
/** Linha LPC por direção do jogo (0 baixo, 1 esquerda, 2 direita, 3 cima). */
export const LPC_DIR = [2, 1, 3, 0];
export const heroFrame = (row: number, dir: number, col: number) => (row + LPC_DIR[dir]) * HERO.cols + col;
