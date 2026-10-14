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
}
