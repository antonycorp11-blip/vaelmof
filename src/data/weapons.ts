import type { ProjectileDef } from '../entities/Projectile';
import type { WeaponId } from '../entities/heroSheets';

/**
 * Um movimento (golpe ou habilidade).
 * - `anim`: animação usada — 'slash' / 'rslash' / 'thrust' (quadros grandes da
 *   arma), 'spin' (giro de 360° com os quadros do golpe), 'shoot' (arco, folha
 *   base), 'flame' (projétil da Chama).
 * - `frames`: duração (ms) de cada passo; `cols`: quadro da animação em cada
 *   passo (padrão: 0, 1, 2…); `hit`: passo do impacto / disparo.
 */
export interface Move {
  anim: 'slash' | 'rslash' | 'thrust' | 'spin' | 'shoot' | 'cast';
  frames: number[];
  cols?: number[];
  hit: number;
  /** Corpo a corpo: dano, alcance, abertura do arco e empurrão. */
  damage: number;
  range: number;
  arcDeg: number;
  knockback: number;
  /** Avanço (px/s) em volta do impacto. */
  lunge: number;
  /** Sentido do rastro do corte (para o efeito visual). */
  sweep?: 1 | -1;
  /** À distância: o que dispara no impacto. */
  projectile?: ProjectileDef | 'flame';
  /** Quantos projéteis (em leque) e a abertura entre eles (graus). */
  count?: number;
  spread?: number;
  /** Efeito especial no impacto (substitui o corte / o disparo). */
  effect?: Effect;
}

/**
 * Efeitos das habilidades:
 * - buff: fortalece o herói por `ms` (grito de guerra, fúria);
 * - aoe: dano em área — em volta do herói (nova), à frente (golpe sísmico) ou
 *   no alvo (chuva de flechas), em uma ou mais ondas.
 */
export type Effect =
  | { kind: 'buff'; buff: BuffId; ms: number }
  | {
      kind: 'aoe';
      style: 'quake' | 'nova' | 'rain';
      at: 'self' | 'front' | 'target';
      radius: number;
      damage: number;
      knockback: number;
      waves?: number;
      every?: number;
      /** Atordoa (ms). */
      stun?: number;
      color: number;
    };

/** Fortalecimentos temporários: multiplicam dano, velocidade de ataque e defesa. */
export type BuffId = 'war' | 'fury';
export const BUFFS: Record<BuffId, { name: string; dmg: number; rate: number; defense: number; color: number }> = {
  war: { name: 'Grito de guerra', dmg: 1.35, rate: 1, defense: 0.25, color: 0xffd34a },
  fury: { name: 'Fúria', dmg: 1.3, rate: 1.4, defense: 0, color: 0xe04848 },
};

export interface Skill extends Move {
  label: string;
  icon: number;
  cooldown: number;
  /** Coreografia visual única desta habilidade. */
  fx: SkillFxId;
}

export type SkillFxId =
  | 'charge'
  | 'whirlwind'
  | 'warcry'
  | 'cleave'
  | 'quake'
  | 'fury'
  | 'fireball'
  | 'frostlance'
  | 'nova'
  | 'multishot'
  | 'piercing'
  | 'arrowrain';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** A arma define a classe (como no Albion): quem usa cajado é mago. */
  className: string;
  icon: number;
  attackLabel: string;
  attackIcon: number;
  combo: Move[];
  /** Três habilidades (botões 1, 2 e 3). */
  skills: Skill[];
}

const ARROW: ProjectileDef = { texture: 'arrow', speed: 320, range: 230, damage: 2, knockback: 90, color: 0xe8e2d0 };
const BOLT: ProjectileDef = { texture: 'bolt', speed: 215, range: 185, damage: 2, knockback: 120, color: 0xb46cec };
const ICE: ProjectileDef = { texture: 'bolt', speed: 260, range: 210, damage: 3, knockback: 60, color: 0x9fe8ff, pierce: true, slow: { k: 0.45, ms: 3000 }, tint: 0x9fe8ff };
const HEAVY_ARROW: ProjectileDef = { ...ARROW, speed: 440, range: 280, damage: 5, knockback: 200, pierce: true, color: 0xffe9a8 };
const CAST = [70, 70, 80, 90, 120, 90, 110];
const SHOT = [30, 30, 30, 35, 35, 35, 40, 40, 45, 40, 40, 40, 45];

// ícones de ui-icons.png: 0 espada · 1 esquiva · 2 chama · 4 giro · 5 montante · 6 cajado · 7 arco · 8 tiro triplo · 9 estocada
// 13 grito · 14 sísmico · 15 fúria · 16 lança de gelo · 17 nova · 18 perfurante · 19 chuva
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Espada',
    className: 'Guerreiro',
    icon: 0,
    attackLabel: 'GOLPE',
    attackIcon: 0,
    combo: [
      // corte descendente (lâmina no alto → embaixo) e ascendente de volta, mais rápido
      { anim: 'slash', cols: [0, 1, 5, 4, 3, 2], frames: [40, 55, 45, 50, 70, 80], hit: 3, damage: 2, range: 22, arcDeg: 150, knockback: 150, lunge: 45, sweep: 1 },
      { anim: 'slash', cols: [0, 2, 3, 4, 5, 5], frames: [25, 35, 40, 50, 60, 80], hit: 3, damage: 2, range: 22, arcDeg: 150, knockback: 150, lunge: 50, sweep: -1 },
      { anim: 'spin', frames: [45, 45, 40, 45, 45, 45, 45, 110], hit: 3, damage: 3, range: 26, arcDeg: 360, knockback: 240, lunge: 70 },
    ],
    skills: [
      { label: 'INVESTIDA', fx: 'charge', icon: 9, cooldown: 3000, anim: 'slash', cols: [1, 2, 3, 4, 5, 5], frames: [40, 60, 50, 60, 70, 90], hit: 3, damage: 4, range: 26, arcDeg: 120, knockback: 260, lunge: 240, sweep: -1 },
      { label: 'REDEMOINHO', fx: 'whirlwind', icon: 4, cooldown: 5000, anim: 'spin', frames: [40, 40, 35, 40, 40, 40, 40, 100], hit: 3, damage: 5, range: 32, arcDeg: 360, knockback: 260, lunge: 150 },
      { label: 'GRITO', fx: 'warcry', icon: 13, cooldown: 14000, anim: 'cast', frames: CAST, hit: 3, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, effect: { kind: 'buff', buff: 'war', ms: 8000 } },
    ],
  },
  greatsword: {
    id: 'greatsword',
    name: 'Montante',
    className: 'Guerreiro pesado',
    icon: 5,
    attackLabel: 'GOLPE',
    attackIcon: 5,
    combo: [
      { anim: 'slash', frames: [60, 70, 55, 65, 90, 110], hit: 3, damage: 3, range: 30, arcDeg: 160, knockback: 210, lunge: 35, sweep: 1 },
      { anim: 'rslash', frames: [50, 60, 55, 65, 90, 110], hit: 3, damage: 3, range: 30, arcDeg: 160, knockback: 210, lunge: 35, sweep: -1 },
      { anim: 'thrust', frames: [55, 55, 60, 60, 90, 80, 70, 70], hit: 4, damage: 5, range: 36, arcDeg: 60, knockback: 320, lunge: 160 },
    ],
    skills: [
      { label: 'GIRO', fx: 'cleave', icon: 4, cooldown: 4000, anim: 'spin', frames: [60, 60, 50, 55, 55, 55, 55, 140], hit: 3, damage: 4, range: 34, arcDeg: 360, knockback: 280, lunge: 40 },
      { label: 'SÍSMICO', fx: 'quake', icon: 14, cooldown: 7000, anim: 'slash', frames: [90, 110, 70, 60, 130, 160], hit: 3, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 30, effect: { kind: 'aoe', style: 'quake', at: 'front', radius: 44, damage: 6, knockback: 220, stun: 1200, color: 0xc8a070 } },
      { label: 'FÚRIA', fx: 'fury', icon: 15, cooldown: 16000, anim: 'cast', frames: CAST, hit: 3, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, effect: { kind: 'buff', buff: 'fury', ms: 7000 } },
    ],
  },
  staff: {
    id: 'staff',
    name: 'Cajado',
    className: 'Mago',
    icon: 6,
    attackLabel: 'RAIO',
    attackIcon: 6,
    combo: [{ anim: 'thrust', frames: [30, 30, 35, 40, 70, 50, 40, 40], hit: 4, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: BOLT }],
    skills: [
      { label: 'CHAMA', fx: 'fireball', icon: 2, cooldown: 4000, anim: 'thrust', frames: [40, 40, 50, 60, 90, 60, 50, 50], hit: 4, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: 'flame' },
      { label: 'GELO', fx: 'frostlance', icon: 16, cooldown: 5000, anim: 'thrust', frames: [40, 40, 45, 50, 80, 60, 50, 50], hit: 4, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: ICE },
      { label: 'NOVA', fx: 'nova', icon: 17, cooldown: 9000, anim: 'cast', frames: CAST, hit: 4, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, effect: { kind: 'aoe', style: 'nova', at: 'self', radius: 48, damage: 4, knockback: 280, stun: 500, color: 0xb46cec } },
    ],
  },
  bow: {
    id: 'bow',
    name: 'Arco',
    className: 'Arqueiro',
    icon: 7,
    attackLabel: 'ATIRAR',
    attackIcon: 7,
    combo: [{ anim: 'shoot', frames: [25, 25, 25, 30, 30, 30, 35, 35, 40, 35, 35, 35, 40], hit: 8, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: ARROW }],
    skills: [
      { label: 'TRIPLO', fx: 'multishot', icon: 8, cooldown: 3500, anim: 'shoot', frames: SHOT, hit: 8, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: { ...ARROW, pierce: true }, count: 3, spread: 14 },
      { label: 'PERFURANTE', fx: 'piercing', icon: 18, cooldown: 4500, anim: 'shoot', frames: SHOT.map((f) => f * 1.25), hit: 8, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: HEAVY_ARROW },
      { label: 'CHUVA', fx: 'arrowrain', icon: 19, cooldown: 9000, anim: 'shoot', frames: SHOT, hit: 8, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, effect: { kind: 'aoe', style: 'rain', at: 'target', radius: 30, damage: 2, knockback: 40, waves: 6, every: 200, color: 0xe8e2d0 } },
    ],
  },
};

export const WEAPON_ORDER: WeaponId[] = ['sword', 'greatsword', 'staff', 'bow'];
