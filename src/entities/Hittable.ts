/**
 * O que os golpes, flechas e magias do herói podem atingir: criaturas
 * (Enemy) e soldados de exércitos inimigos (systems/Army).
 */
export interface Hittable {
  readonly dead: boolean;
  /** Pés (centro do corpo) no mundo. */
  readonly fx: number;
  readonly fy: number;
  /** Vivo e ativo (dá para mirar). */
  readonly targetable: boolean;
  takeDamage(amount: number, fromX: number, fromY: number, knockback?: number): void;
  stun(ms: number): void;
  slow(ms: number): void;
  /** Raio do corpo (px) dos alvos enormes (chefes gigantes): os golpes alcançam a borda. */
  readonly size?: number;
}

/** Distância até a borda do alvo (o centro, para alvos comuns). */
export function reachDist(x: number, y: number, e: Hittable): number {
  return Math.max(0, Math.hypot(e.fx - x, e.fy - y) - (e.size ?? 0));
}
