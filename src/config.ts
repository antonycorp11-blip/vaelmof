// Constantes ajustáveis do protótipo. Alguns valores podem ser sobrescritos
// pela URL para teste rápido, ex.: ?cycle=60&time=0.8&weather=rain&debug=1
const params = new URLSearchParams(window.location.search);
const num = (key: string, fallback: number): number => {
  const v = params.get(key);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const TILE = 16;
export const MAP_W = 120;
export const MAP_H = 120;
export const WORLD_SEED = num('seed', 1337);

/** Área de mundo visível desejada (≈ 20×12 tiles); o zoom preserva essa área. */
export const VIEW_TILES_W = 20;
export const VIEW_TILES_H = 12;

export const PLAYER = {
  speed: 58, // px/s (casado com a passada da animação de andar)
  accel: 520, // px/s² até a velocidade alvo
  decel: 760, // px/s² ao soltar
  maxHp: 10,
  /**
   * Combo de 3 golpes: `frames` = duração (ms) de cada passo, `cols` = quadro
   * do golpe LPC usado em cada passo (0–2 preparo, 3–5 varredura de baixo para
   * cima; ao contrário vira um corte descendente), `hit` = passo do impacto,
   * `from`/`to` = varredura do arco de corte em graus relativos à direção do
   * herói, `lunge` = avanço (px/s) no impacto. A duração total é a soma dos quadros.
   */
  combo: [
    // 1º: corte descendente (lâmina no alto → embaixo)
    { kind: 'slash', cols: [0, 1, 5, 4, 3, 2], frames: [40, 55, 45, 50, 70, 80], hit: 3, from: -115, to: 75, damage: 2, range: 22, arcDeg: 150, knockback: 150, lunge: 45 },
    // 2º: corte ascendente de volta, mais rápido
    { kind: 'slash', cols: [0, 2, 3, 4, 5, 5], frames: [25, 35, 40, 50, 60, 80], hit: 3, from: 115, to: -75, damage: 2, range: 22, arcDeg: 150, knockback: 150, lunge: 50 },
    // finalizador: giro de 360° (preparo em 3 quadros, 4 varreduras, pose final)
    { kind: 'spin', cols: [], frames: [45, 45, 40, 45, 45, 45, 45, 110], hit: 3, from: 0, to: 360, damage: 3, range: 26, arcDeg: 360, knockback: 240, lunge: 70 },
  ],
  /** Janela (ms) após um golpe para encadear o próximo do combo. */
  comboWindow: 380,
  dodge: { speed: 210, duration: 260, cooldown: 650 },
  flame: { frames: [35, 35, 45, 55, 70, 60, 50], release: 4, damage: 3, speed: 170, range: 150, radius: 30, cooldown: 4000 },
  hurtInvuln: 900,
};

export const DAY_NIGHT = {
  /** Duração de um dia completo em ms (padrão 10 minutos reais). */
  cycleMs: num('cycle', 600) * 1000,
  /** Fração do dia no início (0 = meia-noite, 0.5 = meio-dia). */
  startTime: num('time', 0.36),
};

export const WEATHER = {
  minIntervalMs: 45_000,
  maxIntervalMs: 100_000,
  transitionMs: 6_000,
  maxRainParticles: 140,
  forced: params.get('weather') as 'clear' | 'rain' | 'fog' | null,
};

/** Raio (px) em torno da câmera em que a IA das criaturas é processada. */
export const ACTIVE_RADIUS = 360;

export const DEBUG = params.has('debug');
export const FORCE_TOUCH = params.get('touch') === '1';
