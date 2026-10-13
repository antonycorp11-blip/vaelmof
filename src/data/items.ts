/**
 * Itens. Os recursos são **por região**: a madeira de um pinheiro do Snowland
 * não é a mesma de um carvalho de Greenland, e as receitas de craft vão pedir
 * o material específico. Ícones em items.png (16×16), na ordem de `icon`.
 */
export type Family = 'wood' | 'stone' | 'ore' | 'crystal' | 'fiber' | 'ice' | 'fruit';
export type Region = 'green' | 'snow' | 'block' | 'black' | 'dust';

export interface ItemDef {
  id: string;
  name: string;
  icon: number;
  /** kg por unidade. */
  weight: number;
  family: Family;
  region: Region;
}

export const REGION_NAME: Record<Region, string> = {
  green: 'Greenland',
  snow: 'Snowland',
  block: 'Blockland',
  black: 'Blackland',
  dust: 'Dustland',
};

const FAMILY: Record<Family, { name: string; weight: number; icon: Partial<Record<Region, number>> & { any: number } }> = {
  wood: { name: 'Madeira', weight: 1, icon: { any: 0, green: 0, snow: 1, black: 2, block: 2, dust: 3 } },
  stone: { name: 'Pedra', weight: 1.5, icon: { any: 4, green: 4, snow: 5, block: 6, black: 6, dust: 9 } },
  ore: { name: 'Minério', weight: 2, icon: { any: 7 } },
  crystal: { name: 'Cristal', weight: 0.5, icon: { any: 8 } },
  fiber: { name: 'Fibra', weight: 0.2, icon: { any: 10 } },
  ice: { name: 'Gelo', weight: 0.5, icon: { any: 11 } },
  fruit: { name: 'Frutas', weight: 0.1, icon: { any: 12 } },
};

export const ITEMS: Record<string, ItemDef> = {};
for (const family of Object.keys(FAMILY) as Family[])
  for (const region of Object.keys(REGION_NAME) as Region[]) {
    const f = FAMILY[family];
    const id = `${family}_${region}`;
    ITEMS[id] = { id, name: `${f.name} de ${REGION_NAME[region]}`, icon: f.icon[region] ?? f.icon.any, weight: f.weight, family, region };
  }

export const itemId = (family: Family, region: Region) => `${family}_${region}`;
