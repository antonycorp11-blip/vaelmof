/**
 * Patentes: Teren não tem nível — sobe de patente quando TODOS os atributos
 * chegam ao mínimo da patente, quando tem a Glória exigida (e, em algumas,
 * depois de derrotar um campeão específico em duelo). A patente define
 * quantos soldados ele pode comandar.
 *
 * Glória sobe com abates e vitórias e cai com derrotas, baixas e mortes. Os
 * pontos de atributo vêm da Glória NOVA: 1 ponto a cada 10 de Glória acima do
 * recorde. Perder Glória não tira pontos, mas trava a próxima patente até ela
 * se recuperar — e só vale ponto de novo depois de bater o recorde.
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
  /** Glória mínima (o saldo atual, não o recorde). */
  glory: number;
}

/** Glória nova por ponto de atributo. */
export const GLORY_PER_POINT = 10;

export const RANKS: Rank[] = [
  { id: 'recruta', name: 'Andarilho', min: 10, glory: 0, army: 5 },
  { id: 'soldado', name: 'Escudeiro', min: 20, glory: 150, army: 10 },
  { id: 'cabo', name: 'Lâmina Jurada', min: 40, glory: 600, army: 20 },
  { id: 'sargento', name: 'Guardião de Ferro', min: 70, glory: 1500, duel: 'brakk', army: 35 },
  { id: 'tenente', name: 'Cavaleiro Rúnico', min: 110, glory: 3000, army: 50 },
  { id: 'capitao', name: 'Paladino das Marcas', min: 170, glory: 5000, duel: 'ysra', army: 80 },
  { id: 'major', name: 'Senhor da Guerra', min: 250, glory: 8000, army: 120 },
  { id: 'coronel', name: 'Lorde Estandarte', min: 380, glory: 12000, duel: 'ulgar', army: 180 },
  { id: 'general', name: 'Grão-Senhor', min: 600, glory: 20000, army: 250 },
  { id: 'marechal', name: 'Soberano de Vaelmor', min: 1000, glory: 30000, duel: 'morvath', army: 300 },
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
  /** Patente que ostenta (ícone sobre a cabeça). */
  rank: number;
}

export const CHAMPIONS: Record<ChampionId, ChampionDef> = {
  brakk: { name: 'Brakk, o Saqueador', city: 'Brumavale', hp: 90, damage: 3, tint: 0xd9a066, scale: 1.25, points: 5, rank: 3 },
  ysra: { name: 'Ysra da Lâmina Fria', city: 'Pedrafria', hp: 260, damage: 5, tint: 0xa8d8ff, scale: 1.35, points: 12, rank: 5 },
  ulgar: { name: 'Ulgar de Rochedo', city: 'Rochedo', hp: 600, damage: 8, tint: 0x9a9a9a, scale: 1.45, points: 25, rank: 7 },
  morvath: { name: 'Morvath, o Arauto', city: 'Umbravale', hp: 1500, damage: 13, tint: 0xb46cec, scale: 1.6, points: 60, rank: 9 },
};

/** Índice da patente atual: a mais alta cujos requisitos (e os de todas abaixo) estão cumpridos. */
export function rankIndex(attrs: Record<string, number>, duels: Set<string>, glory: number, keep = 0): number {
  let r = 0;
  for (let i = 1; i < RANKS.length; i++) {
    const R = RANKS[i];
    // patente já conquistada não se perde (a Glória baixa só trava a próxima)
    const ok = i <= keep || (Object.values(attrs).every((v) => v >= R.min) && glory >= R.glory && (!R.duel || duels.has(R.duel)));
    if (!ok) break;
    r = i;
  }
  return r;
}
