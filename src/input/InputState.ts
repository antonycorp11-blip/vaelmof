/**
 * Estado de entrada compartilhado entre UIScene (controles virtuais) e
 * WorldScene (jogador). Os "pressed" são consumidos pelo jogador a cada frame.
 */
export const inputState = {
  /** Vetor de movimento do joystick virtual, magnitude 0..1. */
  touchX: 0,
  touchY: 0,
  attack: false,
  dodge: false,
  flame: false,
  /** Cooldowns normalizados (0 = pronto, 1 = recém-usado) para o HUD. */
  cooldowns: { attack: 0, dodge: 0, flame: 0 },
  hp: 10,
  maxHp: 10,
};

export function consume(key: 'attack' | 'dodge' | 'flame'): boolean {
  const v = inputState[key];
  inputState[key] = false;
  return v;
}
