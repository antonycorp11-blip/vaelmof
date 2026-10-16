import { MOUNT_ART } from './mountsGen';

export type MountId = (typeof MOUNT_ART)[number]['id'];

export interface MountDef {
  id: MountId;
  name: string;
  /** Linha na folha mounts.png. */
  row: number;
  /** Altura da sela (px do mundo). */
  seat: number;
  glow: number;
  ghost: boolean;
  /** Multiplicador de velocidade do herói. */
  speed: number;
  /** Defesa e dano extras (0,1 = +10%). */
  guard: number;
  power: number;
  /** Preço no estábulo (0 = não se compra: só cai de personagens). */
  price: number;
  /** Biomas cujas cidades vendem (vazio = todas). */
  biomes: number[];
  desc: string;
  /** Habilidade da montaria (botão ao lado da esquiva, montado). */
  skill: MountSkill;
  /** Espécie (cavalo, lobo, dragão…). */
  kind: string;
  /** Voa: passa por cima de água, montanhas e muralhas. */
  flies: boolean;
  /** Bioma onde rende mais (+30% de velocidade), ou -1. */
  home: number;
}

/** Feras que correm melhor na terra delas. */
const HOME: Record<string, number> = { wolf: 2, frostwolf: 2, polar: 2, raptor: 5, sabre: 5, boar: 5, salamander: 4, nightmare: 4, bear: 1, stag: 1, rhino: 3 };

/** Habilidades das montarias: pisotear, rugir, curar, sopro de fogo, gelo, bote, rajada. */
export interface MountSkill {
  name: string;
  /** Ícone em ui-icons. */
  icon: number;
  cooldown: number;
  kind: 'stomp' | 'roar' | 'heal' | 'breath' | 'frost' | 'pounce' | 'gust';
  /** Força (escala dano, raio e duração). */
  power: number;
  color: number;
}

const SK = (name: string, icon: number, cooldown: number, kind: MountSkill['kind'], power: number, color: number): MountSkill => ({ name, icon, cooldown, kind, power, color });
/** Por espécie; algumas montarias mágicas têm a sua. */
const SKILL_BY_KIND: Record<string, MountSkill> = {
  horse: SK('COICE', 14, 8000, 'stomp', 1, 0xc8a070),
  stag: SK('BÊNÇÃO', 3, 16000, 'heal', 1, 0x8ef0ff),
  bear: SK('RUGIDO', 13, 12000, 'roar', 1.2, 0xffd34a),
  wolf: SK('UIVO', 13, 12000, 'roar', 1, 0xc8d8ff),
  rhino: SK('ESTOURO', 9, 9000, 'pounce', 1.6, 0xd8c8a8),
  boar: SK('INVESTIDA', 9, 8000, 'pounce', 1.1, 0xc89a70),
  cat: SK('BOTE', 9, 7000, 'pounce', 1.3, 0xffb050),
  raptor: SK('BOTE', 9, 6500, 'pounce', 1.1, 0xe8c070),
  lizard: SK('LAVA', 2, 10000, 'breath', 1, 0xff7a2a),
  griffin: SK('RAJADA', 4, 9000, 'gust', 1.3, 0xf0e0b0),
  dragon: SK('SOPRO', 2, 10000, 'breath', 1.5, 0xff6a2a),
};
const SKILL_BY_ID: Partial<Record<string, MountSkill>> = {
  unicorn: SK('LUZ CURATIVA', 3, 15000, 'heal', 1.4, 0xd8c8ff),
  nightmare: SK('CHAMAS', 2, 9000, 'breath', 1.1, 0xff7a2a),
  polar: SK('GELO', 16, 11000, 'frost', 1.2, 0x9ad8ff),
  frostwolf: SK('GELO', 16, 11000, 'frost', 1, 0xbfe6ff),
  panther: SK('BOTE SOMBRIO', 9, 6000, 'pounce', 1.5, 0xb070ff),
  emerald: SK('SOPRO', 2, 10000, 'breath', 1.4, 0x7aff8a),
  war: SK('ATROPELAR', 14, 8000, 'stomp', 1.5, 0xc8c8d8),
};

// [velocidade, defesa, dano, preço, biomas, descrição]
const STATS: Record<MountId, [number, number, number, number, number[], string]> = {
  bay: [1.8, 0, 0, 350, [], 'Cavalo de estrada, fiel e barato.'],
  pinto: [1.8, 0, 0, 400, [], 'Malhado das fazendas do Vale.'],
  black: [1.95, 0, 0, 600, [], 'Corcel veloz das estradas reais.'],
  white: [1.95, 0, 0, 650, [0, 1], 'Égua das pastagens de Greenland.'],
  war: [1.8, 0.06, 0, 1400, [0, 1, 3], 'Barda de aço: aguenta a linha de frente.'],
  bear: [1.6, 0.1, 0.03, 1200, [1], 'Urso treinado para a guerra.'],
  wolf: [2.05, 0, 0.03, 900, [2], 'Lobo das montanhas geladas.'],
  rhino: [1.5, 0.15, 0.04, 1800, [3], 'Muralha que anda.'],
  boar: [1.75, 0.04, 0.02, 700, [5, 3], 'Javali bravo do deserto e das pedreiras.'],
  sabre: [2.05, 0, 0.06, 1600, [5], 'Felino de presas longas.'],
  raptor: [2.15, 0, 0.03, 1300, [5], 'Corredor das dunas.'],
  salamander: [1.8, 0.04, 0.06, 2000, [4], 'Couro de brasa de Blackland.'],
  unicorn: [2.25, 0.05, 0.04, 0, [], 'Lendária. Dizem que cura a quem a monta.'],
  nightmare: [2.35, 0, 0.08, 0, [], 'Lendária. Crina de fogo vivo.'],
  polar: [1.75, 0.14, 0.05, 0, [], 'Rara. Runas de gelo no pelo.'],
  frostwolf: [2.25, 0.04, 0.05, 0, [], 'Rara. Corre sobre a neve sem afundar.'],
  stag: [2.35, 0.03, 0.03, 0, [], 'Rara. Um espírito da floresta.'],
  panther: [2.4, 0, 0.07, 0, [], 'Rara. Some nas sombras.'],
  griffin: [2.45, 0.05, 0.06, 0, [], 'Lendária. Meio águia, meio leão.'],
  emerald: [2.5, 0.08, 0.1, 0, [], 'Lendária. Dragão das florestas antigas.'],
  ruby: [2.6, 0.08, 0.12, 0, [], 'Lendária. Dragão de fogo.'],
};

export const MOUNTS: Record<string, MountDef> = {};
MOUNT_ART.forEach((a, row) => {
  const [speed, guard, power, price, biomes, desc] = STATS[a.id];
  MOUNTS[a.id] = { id: a.id, name: a.name, row, seat: a.seat, glow: a.glow, ghost: a.ghost, speed, guard, power, price, biomes, desc, skill: SKILL_BY_ID[a.id] ?? SKILL_BY_KIND[a.kind] ?? SKILL_BY_KIND.horse, kind: a.kind, flies: a.kind === 'dragon' || a.kind === 'griffin', home: HOME[a.id] ?? -1 };
});

/** Montarias raras que caem de personagens (líderes de clã, procurados fortes). */
export const RARE_MOUNTS: MountId[] = ['unicorn', 'polar', 'stag', 'panther', 'frostwolf', 'nightmare', 'griffin', 'emerald'];
/** O que cada campeão de duelo deixa (além da peça rara). */
export const CHAMPION_MOUNT: Record<string, MountId> = { brakk: 'boar', ysra: 'frostwolf', ulgar: 'griffin', morvath: 'ruby' };

/**
 * Montaria de um personagem inimigo (líder de clã, procurado): cavalos para os
 * pequenos, a fera do bioma para os médios, uma rara para os mais fortes.
 * Sorteio fixo por nome (o mesmo líder sempre na mesma montaria).
 */
export function mountFor(seed: string, tier: number, faction: number): MountId {
  const POOLS: MountId[][][] = [
    // [comuns, da região, raras] por povo (bioma 0–5)
    [['bay', 'pinto', 'black'], ['war', 'black'], ['unicorn', 'griffin']],
    [['white', 'bay', 'pinto'], ['bear', 'war'], ['stag', 'emerald']],
    [['black', 'white'], ['wolf', 'war'], ['frostwolf', 'polar']],
    [['bay', 'black'], ['rhino', 'boar'], ['griffin', 'polar']],
    [['black', 'pinto'], ['salamander', 'boar'], ['nightmare', 'ruby']],
    [['pinto', 'bay'], ['sabre', 'raptor'], ['panther', 'emerald']],
  ];
  const pool = POOLS[Math.max(0, Math.min(5, faction))][tier >= 3 ? 2 : tier >= 2 ? 1 : 0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}
