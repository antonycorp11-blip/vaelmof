/**
 * Equipamento raro: armas e armaduras que só se ganham derrotando
 * personagens (campeões, líderes de clã, procurados das missões e, raramente,
 * bandidos). Cada peça tem uma raridade, um nome próprio, um tom e — das
 * rúnicas para cima — um brilho. A arte é a mesma da peça base, tingida.
 */
import type { Attr } from '../systems/Progress';
import type { OutfitId, WeaponId } from '../entities/heroSheets';

export interface Rarity {
  name: string;
  /** Cor do nome e da moldura do espaço na mochila. */
  color: string;
  frame: number;
  /** Multiplicador de dano (armas). */
  power: number;
  /** Defesa extra (armaduras). */
  guard: number;
  /** Atributo principal exigido. */
  req: number;
}

export const RARITY: Rarity[] = [
  { name: 'Comum', color: '#c8c0b0', frame: 0x8a8278, power: 1, guard: 0, req: 0 },
  { name: 'Temperada', color: '#9cff8a', frame: 0x5fbf52, power: 1.25, guard: 0.04, req: 30 },
  { name: 'Rúnica', color: '#7fc4ff', frame: 0x4a8ee0, power: 1.6, guard: 0.08, req: 80 },
  { name: 'Ancestral', color: '#ffc84a', frame: 0xe0a030, power: 2.1, guard: 0.12, req: 170 },
  { name: 'Lendária', color: '#e08aff', frame: 0xb04ae0, power: 2.8, guard: 0.17, req: 320 },
];

export interface GearDef {
  id: string;
  name: string;
  kind: 'weapon' | 'armor';
  base: WeaponId | OutfitId;
  tier: number;
  /** Tom multiplicado na arte (0xffffff = sem tom). */
  tint: number;
  /** Cor do brilho (rúnicas para cima). */
  glow?: number;
}

/** Atributo principal de cada base (o requisito da raridade cai nele). */
export const MAIN_ATTR: Record<string, Attr> = {
  sword: 'str',
  greatsword: 'str',
  bow: 'agi',
  staff: 'ene',
  leather: 'agi',
  hunter: 'agi',
  plate: 'vit',
  legion: 'str',
  arcane: 'ene',
};

// [nome, tom, brilho] por raridade (1..4), duas peças por raridade
type Line = [string, number, number?];
const WEAPON_LINES: Record<WeaponId, Line[][]> = {
  sword: [
    [['Espada Temperada', 0xe8e0d0], ['Gládio do Vale', 0xd8f0d0]],
    [['Lâmina Rúnica', 0xc8e4ff, 0x5aa8ff], ['Espada da Geada', 0xd0f4ff, 0x9fe8ff]],
    [['Fio da Aurora', 0xffe8b0, 0xffc84a], ['Presa de Brakk', 0xffd0a0, 0xff9a3a]],
    [['Ceifadora Estelar', 0xe8c8ff, 0xc060ff], ['Juramento de Vaelmor', 0xfff0c0, 0xffe070]],
  ],
  greatsword: [
    [['Montante Temperado', 0xe8e0d0], ['Quebra-Elmos', 0xe0d8c8]],
    [['Montante Rúnico', 0xc8e4ff, 0x5aa8ff], ['Machado das Marcas', 0xd0ffd8, 0x6aff9a]],
    [['Rompe-Muralhas', 0xffd8a8, 0xff9a3a], ['Lâmina de Rochedo', 0xf0e0c0, 0xffc84a]],
    [['Fim dos Reis', 0xffb0b0, 0xff4a5a], ['Montante do Abismo', 0xd8b0ff, 0x9a4aff]],
  ],
  bow: [
    [['Arco Temperado', 0xe8e0d0], ['Arco de Teixo', 0xd8e8c0]],
    [['Arco Rúnico', 0xc8e4ff, 0x5aa8ff], ['Arco do Vento Norte', 0xd8f8ff, 0x9fe8ff]],
    [['Arco do Sol Poente', 0xffe0a0, 0xffb040], ['Sussurro de Ysra', 0xd0e8ff, 0x7ab8ff]],
    [['Arco da Lua Rubra', 0xffb8c8, 0xff5a7a], ['Corda das Estrelas', 0xf0d8ff, 0xd080ff]],
  ],
  staff: [
    [['Cajado Temperado', 0xe8e0d0], ['Bordão de Carvalho', 0xe0e8c8]],
    [['Cajado Rúnico', 0xc8e4ff, 0x5aa8ff], ['Vara do Pântano', 0xc8ffd0, 0x5aff8a]],
    [['Cetro da Brasa', 0xffd0a0, 0xff7a2a], ['Cajado de Âmbar', 0xffe8a8, 0xffc84a]],
    [['Olho de Morvath', 0xe0b0ff, 0xb040ff], ['Cetro do Primeiro Rei', 0xfff0c8, 0xffe070]],
  ],
};
const ARMOR_LINES: Record<OutfitId, Line[][]> = {
  leather: [
    [['Couro Curtido', 0xe0d8c8]],
    [['Gibão das Sombras', 0xb8c0e0, 0x6a7aff]],
    [['Manto do Andarilho Eterno', 0xd8f0c8, 0x9aff6a]],
    [['Pele do Lobo Branco', 0xf0f0ff, 0xc0e0ff]],
  ],
  hunter: [
    [['Couraça Reforçada', 0xe0d8c8]],
    [['Couraça Rúnica', 0xc8e4ff, 0x5aa8ff]],
    [['Couraça do Falcão', 0xffe0b0, 0xffc84a]],
    [['Couraça da Caçada Selvagem', 0xc8ffc8, 0x4aff7a]],
  ],
  plate: [
    [['Placas Temperadas', 0xe8e8f0]],
    [['Placas Rúnicas', 0xc8e4ff, 0x5aa8ff]],
    [['Placas de Rochedo', 0xffe8c0, 0xffc84a]],
    [['Armadura do Dragão Negro', 0xc8a8d8, 0xb040ff]],
  ],
  legion: [
    [['Bronze Polido', 0xfff0d0]],
    [['Legionária das Marcas', 0xd0ffd8, 0x6aff9a]],
    [['Legionária do Sol', 0xffe0a0, 0xffb040]],
    [['Couraça do Imperador', 0xfff4c0, 0xffe070]],
  ],
  arcane: [
    [['Vestes do Aprendiz', 0xe0d8f0]],
    [['Vestes Rúnicas', 0xc8e4ff, 0x5aa8ff]],
    [['Vestes da Chama Velada', 0xffc8a8, 0xff7a2a]],
    [['Vestes do Vazio', 0xd0a8ff, 0x9a4aff]],
  ],
};

export const GEAR: Record<string, GearDef> = {};
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
for (const [base, tiers] of Object.entries(WEAPON_LINES) as [WeaponId, Line[][]][])
  tiers.forEach((list, i) =>
    list.forEach(([name, tint, glow]) => {
      const id = `g_${slug(name)}`;
      GEAR[id] = { id, name, kind: 'weapon', base, tier: i + 1, tint, glow };
    }),
  );
for (const [base, tiers] of Object.entries(ARMOR_LINES) as [OutfitId, Line[][]][])
  tiers.forEach((list, i) =>
    list.forEach(([name, tint, glow]) => {
      const id = `g_${slug(name)}`;
      GEAR[id] = { id, name, kind: 'armor', base, tier: i + 1, tint, glow };
    }),
  );

/** Uma peça sorteada da raridade `tier` (opcionalmente só armas ou só armaduras). */
export function rollGear(tier: number, kind?: 'weapon' | 'armor'): string {
  const t = Math.max(1, Math.min(4, Math.round(tier)));
  const list = Object.values(GEAR).filter((g) => g.tier === t && (!kind || g.kind === kind));
  return list[Math.floor(Math.random() * list.length)].id;
}
