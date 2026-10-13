/**
 * Itens. Os recursos são **por região**: a madeira de um pinheiro do Snowland
 * não é a mesma de um carvalho de Greenland, e as receitas de craft vão pedir
 * o material específico. Ícones em items.png (16×16), na ordem de `icon`.
 */
import { HERO_SHEETS, OUTFITS, type OutfitId, type WeaponId } from '../entities/heroSheets';

export type Family = 'wood' | 'stone' | 'ore' | 'crystal' | 'fiber' | 'ice' | 'fruit' | 'weapon' | 'armor';
export type Region = 'green' | 'snow' | 'block' | 'black' | 'dust';

export interface ItemDef {
  id: string;
  name: string;
  icon: number;
  /** Folha do ícone (padrão: items). */
  sheet?: 'items' | 'ui-icons' | 'armor-icons';
  /** Equipável: arma ou armadura (sempre completa, corpo inteiro). */
  equip?: { kind: 'weapon'; id: WeaponId } | { kind: 'armor'; id: OutfitId };
  /** Linha de atributos para a mochila. */
  info?: string;
  /** kg por unidade. */
  weight: number;
  family: Family;
  region?: Region;
}

export const REGION_NAME: Record<Region, string> = {
  green: 'Greenland',
  snow: 'Snowland',
  block: 'Blockland',
  black: 'Blackland',
  dust: 'Dustland',
};

const FAMILY: Record<Exclude<Family, 'weapon' | 'armor'>, { name: string; weight: number; icon: Partial<Record<Region, number>> & { any: number } }> = {
  wood: { name: 'Madeira', weight: 1, icon: { any: 0, green: 0, snow: 1, black: 2, block: 2, dust: 3 } },
  stone: { name: 'Pedra', weight: 1.5, icon: { any: 4, green: 4, snow: 5, block: 6, black: 6, dust: 9 } },
  ore: { name: 'Minério', weight: 2, icon: { any: 7 } },
  crystal: { name: 'Cristal', weight: 0.5, icon: { any: 8 } },
  fiber: { name: 'Fibra', weight: 0.2, icon: { any: 10 } },
  ice: { name: 'Gelo', weight: 0.5, icon: { any: 11 } },
  fruit: { name: 'Frutas', weight: 0.1, icon: { any: 12 } },
};

export const ITEMS: Record<string, ItemDef> = {};
for (const family of Object.keys(FAMILY) as (keyof typeof FAMILY)[])
  for (const region of Object.keys(REGION_NAME) as Region[]) {
    const f = FAMILY[family];
    const id = `${family}_${region}`;
    ITEMS[id] = { id, name: `${f.name} de ${REGION_NAME[region]}`, icon: f.icon[region] ?? f.icon.any, weight: f.weight, family, region };
  }

export const itemId = (family: keyof typeof FAMILY, region: Region) => `${family}_${region}`;

// armas (a arma define a classe) — ícones de ui-icons.png
const WEAPON_ITEM: Record<WeaponId, { icon: number; weight: number; info: string }> = {
  sword: { icon: 0, weight: 3, info: 'combo de 3 cortes · Investida' },
  greatsword: { icon: 5, weight: 8, info: 'lento e forte · Giro' },
  staff: { icon: 6, weight: 2, info: 'raio arcano · Chama' },
  bow: { icon: 7, weight: 2, info: 'flechas de longe · Tiro triplo' },
};
for (const [id, w] of Object.entries(WEAPON_ITEM) as [WeaponId, (typeof WEAPON_ITEM)[WeaponId]][]) {
  const sh = HERO_SHEETS[id];
  ITEMS[`weapon_${id}`] = { id: `weapon_${id}`, name: `${sh.name} (${sh.class})`, icon: w.icon, sheet: 'ui-icons', weight: w.weight, family: 'weapon', equip: { kind: 'weapon', id }, info: w.info };
}
// armaduras completas — retratos em armor-icons.png
const ARMOR_WEIGHT: Record<OutfitId, number> = { leather: 4, plate: 22, legion: 14, arcane: 3, hunter: 6 };
for (const id of Object.keys(OUTFITS) as OutfitId[]) {
  const o = OUTFITS[id];
  const parts = [`defesa ${Math.round(o.defense * 100)}%`];
  if (o.speed !== 1) parts.push(`velocidade ${o.speed > 1 ? '+' : ''}${Math.round((o.speed - 1) * 100)}%`);
  if (o.bonus) parts.push(o.desc);
  ITEMS[`armor_${id}`] = { id: `armor_${id}`, name: o.name, icon: o.icon, sheet: 'armor-icons', weight: ARMOR_WEIGHT[id], family: 'armor', equip: { kind: 'armor', id }, info: parts.join(' · ') };
}
