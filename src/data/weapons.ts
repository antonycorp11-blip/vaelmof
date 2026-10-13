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
  anim: 'slash' | 'rslash' | 'thrust' | 'spin' | 'shoot';
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
}

export interface Skill extends Move {
  label: string;
  icon: number;
  cooldown: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** A arma define a classe (como no Albion): quem usa cajado é mago. */
  className: string;
  icon: number;
  attackLabel: string;
  attackIcon: number;
  combo: Move[];
  skill: Skill;
}

const ARROW: ProjectileDef = { texture: 'arrow', speed: 320, range: 230, damage: 2, knockback: 90, color: 0xe8e2d0 };
const BOLT: ProjectileDef = { texture: 'bolt', speed: 215, range: 185, damage: 2, knockback: 120, color: 0xb46cec };

// ícones de ui-icons.png: 0 espada · 1 esquiva · 2 chama · 4 giro · 5 montante · 6 cajado · 7 arco · 8 tiro triplo · 9 estocada
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
    skill: { label: 'INVESTIDA', icon: 9, cooldown: 3000, anim: 'slash', cols: [1, 2, 3, 4, 5, 5], frames: [40, 60, 50, 60, 70, 90], hit: 3, damage: 4, range: 26, arcDeg: 120, knockback: 260, lunge: 240, sweep: -1 },
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
    skill: { label: 'GIRO', icon: 4, cooldown: 4000, anim: 'spin', frames: [60, 60, 50, 55, 55, 55, 55, 140], hit: 3, damage: 4, range: 34, arcDeg: 360, knockback: 280, lunge: 40 },
  },
  staff: {
    id: 'staff',
    name: 'Cajado',
    className: 'Mago',
    icon: 6,
    attackLabel: 'RAIO',
    attackIcon: 6,
    combo: [{ anim: 'thrust', frames: [30, 30, 35, 40, 70, 50, 40, 40], hit: 4, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: BOLT }],
    skill: { label: 'CHAMA', icon: 2, cooldown: 4000, anim: 'thrust', frames: [40, 40, 50, 60, 90, 60, 50, 50], hit: 4, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: 'flame' },
  },
  bow: {
    id: 'bow',
    name: 'Arco',
    className: 'Arqueiro',
    icon: 7,
    attackLabel: 'ATIRAR',
    attackIcon: 7,
    combo: [{ anim: 'shoot', frames: [25, 25, 25, 30, 30, 30, 35, 35, 40, 35, 35, 35, 40], hit: 8, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: ARROW }],
    skill: { label: 'TRIPLO', icon: 8, cooldown: 3500, anim: 'shoot', frames: [30, 30, 30, 35, 35, 35, 40, 40, 45, 40, 40, 40, 45], hit: 8, damage: 0, range: 0, arcDeg: 0, knockback: 0, lunge: 0, projectile: { ...ARROW, pierce: true }, count: 3, spread: 14 },
  },
};

export const WEAPON_ORDER: WeaponId[] = ['sword', 'greatsword', 'staff', 'bow'];
