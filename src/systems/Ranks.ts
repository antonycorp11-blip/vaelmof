/**
 * Patentes: Teren não tem nível — sobe de patente quando TODOS os atributos
 * chegam ao mínimo da patente (e, em algumas, depois de derrotar um campeão
 * específico em duelo). A patente define quantos soldados ele pode comandar.
 */
export type ChampionId = 'brakk' | 'ysra' | 'ulgar' | 'morvath';

export interface Rank {
  id: string;
  name: string;
  /** Mínimo em cada um dos 4 atributos. */
  min: number;
  /** Campeão que precisa ter sido derrotado. */
  duel?: ChampionId;
  /** Soldados que pode ter no exército. */
  army: number;
}

export const RANKS: Rank[] = [
  { id: 'recruta', name: 'Recruta', min: 10, army: 5 },
  { id: 'soldado', name: 'Soldado', min: 20, army: 10 },
  { id: 'cabo', name: 'Cabo', min: 40, army: 20 },
  { id: 'sargento', name: 'Sargento', min: 70, duel: 'brakk', army: 35 },
  { id: 'tenente', name: 'Tenente', min: 110, army: 50 },
  { id: 'capitao', name: 'Capitão', min: 170, duel: 'ysra', army: 80 },
  { id: 'major', name: 'Major', min: 250, army: 120 },
  { id: 'coronel', name: 'Coronel', min: 380, duel: 'ulgar', army: 180 },
  { id: 'general', name: 'General', min: 600, army: 250 },
  { id: 'marechal', name: 'Marechal', min: 1000, duel: 'morvath', army: 300 },
];

export interface ChampionDef {
  name: string;
  /** Cidade perto da qual espera (fora dos muros, ao sul). */
  city: string;
  hp: number;
  /** Dano por golpe (o bandido comum dá 2). */
  damage: number;
  /** Tom do sprite e escala. */
  tint: number;
  scale: number;
  points: number;
}

export const CHAMPIONS: Record<ChampionId, ChampionDef> = {
  brakk: { name: 'Brakk, o Saqueador', city: 'Brumavale', hp: 90, damage: 3, tint: 0xd9a066, scale: 1.25, points: 5 },
  ysra: { name: 'Ysra da Lâmina Fria', city: 'Pedrafria', hp: 260, damage: 5, tint: 0xa8d8ff, scale: 1.35, points: 12 },
  ulgar: { name: 'Ulgar de Rochedo', city: 'Rochedo', hp: 600, damage: 8, tint: 0x9a9a9a, scale: 1.45, points: 25 },
  morvath: { name: 'Morvath, o Arauto', city: 'Umbravale', hp: 1500, damage: 13, tint: 0xb46cec, scale: 1.6, points: 60 },
};

/** Índice da patente atual: a mais alta cujos requisitos (e os de todas abaixo) estão cumpridos. */
export function rankIndex(attrs: Record<string, number>, duels: Set<string>): number {
  let r = 0;
  for (let i = 1; i < RANKS.length; i++) {
    const R = RANKS[i];
    const ok = Object.values(attrs).every((v) => v >= R.min) && (!R.duel || duels.has(R.duel));
    if (!ok) break;
    r = i;
  }
  return r;
}
