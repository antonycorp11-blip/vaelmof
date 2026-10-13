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
  /** Habilidades 1, 2 e 3 da arma (a 1 se chama "flame" por herança). */
  flame: false,
  skill2: false,
  skill3: false,
  gather: false,
  /** Botões mantidos pressionados (segurar repete o golpe e a coleta). */
  held: { attack: false, dodge: false, flame: false, skill2: false, skill3: false, gather: false },
  /** Mira manual: o botão de ataque arrastado (direção unitária enquanto ativo). */
  aim: { x: 0, y: 0, active: false },
  /** Mira da habilidade: o botão arrastado e solto (null = mira automática). */
  skillAim: null as { x: number; y: number } | null,
  /** Desktop: posição do mouse no mundo (null = mouse parado/fora). */
  mouseAim: null as { x: number; y: number } | null,
  /** Há um recurso ao alcance: mostra o botão COLETAR. */
  canGather: false,
  /** Cooldowns normalizados (0 = pronto, 1 = recém-usado) para o HUD. */
  cooldowns: { attack: 0, dodge: 0, flame: 0, skill2: 0, skill3: 0 },
  hp: 10,
  maxHp: 10,
};

export function consume(key: 'attack' | 'dodge' | 'flame' | 'skill2' | 'skill3' | 'gather'): boolean {
  const v = inputState[key];
  inputState[key] = false;
  return v;
}
