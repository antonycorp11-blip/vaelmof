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
  speed: 78, // px/s
  maxHp: 10,
  attack: { damage: 2, range: 24, arcDeg: 130, cooldown: 380, knockback: 160 },
  dodge: { speed: 210, duration: 260, cooldown: 650 },
  flame: { damage: 3, speed: 170, range: 150, radius: 30, cooldown: 4000 },
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
