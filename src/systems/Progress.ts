import Phaser from 'phaser';

/**
 * Atributos no estilo MU: cada criatura derrotada rende pontos (0,5 nas
 * básicas, mais nas fortes) que o jogador distribui como quiser. Cada atributo
 * vai até 1000 — o up é longo de propósito. Armas e armaduras exigem um
 * mínimo de certos atributos para serem equipadas.
 */
export type Attr = 'str' | 'agi' | 'vit' | 'ene';

export const ATTRS: { id: Attr; name: string; short: string; desc: string }[] = [
  { id: 'str', name: 'Força', short: 'FOR', desc: 'dano corpo a corpo e carga da mochila' },
  { id: 'agi', name: 'Agilidade', short: 'AGI', desc: 'dano com arco, velocidade de ataque e de movimento' },
  { id: 'vit', name: 'Vitalidade', short: 'VIT', desc: 'pontos de vida' },
  { id: 'ene', name: 'Energia', short: 'ENE', desc: 'dano mágico e recarga das habilidades' },
];

export const ATTR_MAX = 1000;
/** 1,25 → "1,25"; 0,5 → "0,5". */
export const fmtPts = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',');
const BASE = 10;
const SAVE_KEY = 'vaelmor.progress.v1';

/** Requisitos de cada item equipável (atributo → mínimo). */
export const REQUIREMENTS: Record<string, Partial<Record<Attr, number>>> = {
  weapon_sword: {},
  weapon_greatsword: { str: 60 },
  weapon_staff: { ene: 25 },
  weapon_bow: { agi: 30 },
  armor_leather: {},
  armor_plate: { str: 80, vit: 40 },
  armor_legion: { str: 40, vit: 20 },
  armor_arcane: { ene: 50 },
  armor_hunter: { agi: 40 },
};

export class Progress extends Phaser.Events.EventEmitter {
  attrs: Record<Attr, number> = { str: BASE, agi: BASE, vit: BASE, ene: BASE };
  /** Pontos a distribuir (pode ter fração: 0,5 por criatura básica). */
  points = 0;
  kills = 0;
  /** Total de pontos já ganhos (o "nível" do herói). */
  earned = 0;

  constructor() {
    super();
    this.load();
  }

  get free(): number {
    return Math.floor(this.points + 1e-6);
  }

  /** Abate: soma os pontos da criatura. */
  addKill(points: number) {
    this.kills++;
    this.points += points;
    this.earned += points;
    this.emit('change');
    this.save();
  }

  /** Distribui `n` pontos no atributo (até o limite). Devolve quanto entrou. */
  spend(a: Attr, n: number): number {
    const k = Math.max(0, Math.min(n, this.free, ATTR_MAX - this.attrs[a]));
    if (!k) return 0;
    this.attrs[a] += k;
    this.points -= k;
    this.emit('change');
    this.save();
    return k;
  }

  /** Itens que faltam atributos: devolve o texto do que falta, ou '' se pode usar. */
  missing(itemId: string): string {
    const req = REQUIREMENTS[itemId] ?? {};
    const out: string[] = [];
    for (const a of ATTRS) {
      const need = req[a.id];
      if (need && this.attrs[a.id] < need) out.push(`${a.name} ${need}`);
    }
    return out.length ? `Requer ${out.join(', ')}` : '';
  }

  // ------------------------------------------------------------ efeitos
  /** Pontos de vida máximos. */
  get maxHp(): number {
    return 10 + Math.floor((this.attrs.vit - BASE) * 0.5);
  }
  /** Multiplicador de dano corpo a corpo / com arco / mágico. */
  get meleeMul(): number {
    return 1 + (this.attrs.str - BASE) / 100;
  }
  get rangedMul(): number {
    return 1 + (this.attrs.agi - BASE) / 100;
  }
  get magicMul(): number {
    return 1 + (this.attrs.ene - BASE) / 100;
  }
  /** Velocidade das animações de ataque (1 = normal; até 2,2× em AGI 1000). */
  get attackRate(): number {
    return 1 + (this.attrs.agi - BASE) / 825;
  }
  /** Velocidade de movimento (até +20% em AGI 1000). */
  get moveMul(): number {
    return 1 + (this.attrs.agi - BASE) / 5000;
  }
  /** Recarga das habilidades (até −50% em ENE 1000). */
  get cooldownMul(): number {
    return 1 - Math.min(0.5, (this.attrs.ene - BASE) / 1980);
  }
  /** Carga extra da mochila (kg). */
  get extraWeight(): number {
    return (this.attrs.str - BASE) * 0.5;
  }

  // ------------------------------------------------------------ salvar
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ attrs: this.attrs, points: this.points, kills: this.kills, earned: this.earned }));
    } catch {
      /* armazenamento indisponível (aba privada): segue sem salvar */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      for (const a of ATTRS) if (typeof d.attrs?.[a.id] === 'number') this.attrs[a.id] = Phaser.Math.Clamp(d.attrs[a.id], BASE, ATTR_MAX);
      this.points = Number(d.points) || 0;
      this.kills = Number(d.kills) || 0;
      this.earned = Number(d.earned) || 0;
    } catch {
      /* sem save */
    }
  }

  reset() {
    this.attrs = { str: BASE, agi: BASE, vit: BASE, ene: BASE };
    this.points = 0;
    this.kills = 0;
    this.earned = 0;
    this.emit('change');
    this.save();
  }
}
