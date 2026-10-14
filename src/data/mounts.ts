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
}

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
  MOUNTS[a.id] = { id: a.id, name: a.name, row, seat: a.seat, glow: a.glow, ghost: a.ghost, speed, guard, power, price, biomes, desc };
});

/** Montarias raras que caem de personagens (líderes de clã, procurados fortes). */
export const RARE_MOUNTS: MountId[] = ['unicorn', 'polar', 'stag', 'panther', 'frostwolf', 'nightmare', 'griffin', 'emerald'];
/** O que cada campeão de duelo deixa (além da peça rara). */
export const CHAMPION_MOUNT: Record<string, MountId> = { brakk: 'boar', ysra: 'frostwolf', ulgar: 'griffin', morvath: 'ruby' };
