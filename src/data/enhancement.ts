export type JewelId = 'jewel_forge' | 'jewel_rune' | 'jewel_ancestral';

export interface EnhancementRule {
  /** Nível que esta tentativa procura alcançar. */
  target: number;
  jewel: JewelId;
  jewels: number;
  chance: number;
  gold: number;
  /** Depois de tantas falhas na mesma peça, a próxima tentativa é garantida. */
  pity: number;
}

export const MAX_ENHANCEMENT = 15;

const CHANCE = [1, 1, 1, 0.9, 0.8, 0.75, 0.68, 0.6, 0.52, 0.45, 0.38, 0.32, 0.26, 0.2, 0.15];
const PITY = [1, 1, 1, 4, 4, 5, 5, 6, 7, 8, 8, 9, 10, 12, 14];

export const ENHANCEMENT_RULES: EnhancementRule[] = Array.from({ length: MAX_ENHANCEMENT }, (_, i) => {
  const target = i + 1;
  const jewel: JewelId = target <= 5 ? 'jewel_forge' : target <= 10 ? 'jewel_rune' : 'jewel_ancestral';
  const band = (target - 1) % 5;
  return {
    target,
    jewel,
    jewels: band < 2 ? 1 : band < 4 ? 2 : 3,
    chance: CHANCE[i],
    gold: Math.round((25 + target * target * 4) / 5) * 5,
    pity: PITY[i],
  };
});

export const JEWEL_INFO: Record<JewelId, { name: string; color: number; colorCss: string; band: string }> = {
  jewel_forge: { name: 'Joia de Forja', color: 0x78e58b, colorCss: '#78e58b', band: '+1 a +5' },
  jewel_rune: { name: 'Joia Rúnica', color: 0x62b9ff, colorCss: '#62b9ff', band: '+6 a +10' },
  jewel_ancestral: { name: 'Joia Ancestral', color: 0xd77cff, colorCss: '#d77cff', band: '+11 a +15' },
};

export function ruleFor(level: number): EnhancementRule | null {
  return ENHANCEMENT_RULES[level] ?? null;
}

/** Multiplicador de dano dado pelo aprimoramento da arma. */
export function weaponEnhancementPower(level: number): number {
  const n = Math.max(0, Math.min(MAX_ENHANCEMENT, level));
  return 1 + n * 0.035 + Math.max(0, n - 10) * 0.015;
}

/** Defesa adicional dada pelo aprimoramento da armadura. */
export function armorEnhancementGuard(level: number): number {
  const n = Math.max(0, Math.min(MAX_ENHANCEMENT, level));
  return n * 0.008 + Math.max(0, n - 10) * 0.004;
}

/** Em +5/+10/+15 a arma também acelera as três habilidades. */
export function enhancementCooldownMul(level: number): number {
  return 1 - Math.floor(Math.max(0, Math.min(MAX_ENHANCEMENT, level)) / 5) * 0.03;
}

export function enhancementColor(level: number): number | undefined {
  if (level >= 15) return 0xff5ad8;
  if (level >= 13) return 0xc06cff;
  if (level >= 10) return 0xffd34a;
  if (level >= 6) return 0x5aa8ff;
  if (level >= 3) return 0x78e58b;
  if (level > 0) return 0xd8f4ff;
  return undefined;
}

export type JewelSource = 'chest' | 'battle' | 'boss' | 'dungeon' | 'giant';

/** Sorteia a categoria; fontes mais perigosas acessam as joias altas. */
export function rollJewel(source: JewelSource, power = 0): JewelId {
  const r = Math.random();
  if (source === 'giant') return r < 0.58 ? 'jewel_ancestral' : 'jewel_rune';
  if (source === 'dungeon') return r < 0.42 + Math.min(0.25, power * 0.03) ? 'jewel_ancestral' : 'jewel_rune';
  if (source === 'boss') {
    if (power >= 7 && r < 0.25) return 'jewel_ancestral';
    return r < 0.35 + Math.min(0.35, power * 0.04) ? 'jewel_rune' : 'jewel_forge';
  }
  if (source === 'battle') return power >= 3 && r < 0.28 ? 'jewel_rune' : 'jewel_forge';
  if (power >= 4 && r < 0.12) return 'jewel_ancestral';
  return power >= 2 && r < 0.32 ? 'jewel_rune' : 'jewel_forge';
}
