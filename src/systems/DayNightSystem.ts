import Phaser from 'phaser';
import { DAY_NIGHT } from '../config';

/** Paleta de luz ao longo do dia (t: 0 = meia-noite, 0.5 = meio-dia). */
const KEYS: { t: number; color: number }[] = [
  { t: 0.0, color: 0x34346e }, // noite: azul profundo
  { t: 0.18, color: 0x3c3a78 },
  { t: 0.24, color: 0x8a6c9c }, // alvorada violeta
  { t: 0.28, color: 0xffc29a }, // nascer do sol quente
  { t: 0.34, color: 0xfff0d2 },
  { t: 0.5, color: 0xfffaee }, // dia: quase neutro, levemente quente
  { t: 0.66, color: 0xfff0d2 },
  { t: 0.72, color: 0xffb27a }, // pôr do sol alaranjado
  { t: 0.77, color: 0xb87aa8 }, // crepúsculo rosa-violeta
  { t: 0.82, color: 0x4c4488 },
  { t: 1.0, color: 0x34346e },
];

export function lerpColor(a: number, b: number, k: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * k;
  const g = ag + (((b >> 8) & 255) - ag) * k;
  const bl = ab + ((b & 255) - ab) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export function mulColor(a: number, b: number): number {
  const r = (((a >> 16) & 255) * ((b >> 16) & 255)) / 255;
  const g = (((a >> 8) & 255) * ((b >> 8) & 255)) / 255;
  const bl = ((a & 255) * (b & 255)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/**
 * Ciclo de dia/noite. Não desenha nada sozinho: expõe a cor de luz ambiente
 * (usada num overlay MULTIPLY pela WorldScene) e a intensidade das luzes
 * artificiais (janelas/tochas, glow ADD).
 */
export class DayNightSystem {
  /** Fração do dia [0,1). */
  time: number;
  day = 1;
  readonly cycleMs: number;

  constructor(cycleMs = DAY_NIGHT.cycleMs, startTime = DAY_NIGHT.startTime) {
    this.cycleMs = Math.max(10_000, cycleMs);
    this.time = Phaser.Math.Wrap(startTime, 0, 1);
  }

  update(deltaMs: number) {
    this.time += deltaMs / this.cycleMs;
    if (this.time >= 1) {
      this.time -= 1;
      this.day++;
    }
  }

  /** Cor ambiente atual (multiplicativa). */
  get ambient(): number {
    const t = this.time;
    for (let i = 0; i < KEYS.length - 1; i++) {
      const a = KEYS[i];
      const b = KEYS[i + 1];
      if (t >= a.t && t <= b.t) return lerpColor(a.color, b.color, (t - a.t) / (b.t - a.t));
    }
    return KEYS[0].color;
  }

  /** 0 (dia) .. 1 (noite plena): intensidade de janelas e tochas. */
  get lightLevel(): number {
    const t = this.time;
    // acende entre 0.72 e 0.80; apaga entre 0.22 e 0.28
    if (t >= 0.8 || t <= 0.22) return 1;
    if (t > 0.72) return (t - 0.72) / 0.08;
    if (t < 0.28) return 1 - (t - 0.22) / 0.06;
    return 0;
  }

  get isNight(): boolean {
    return this.lightLevel > 0.5;
  }

  /** Relógio do jogo "HH:MM". */
  get clock(): string {
    const mins = Math.floor(this.time * 24 * 60);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m - (m % 5)).padStart(2, '0')}`;
  }
}
