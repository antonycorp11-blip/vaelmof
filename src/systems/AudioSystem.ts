import type { Biome } from './WorldGenerator';

export interface GameSettings {
  music: boolean;
  sfx: boolean;
  reducedMotion: boolean;
  quality: 'high' | 'low';
}

const KEY = 'vaelmor.settings.v1';
const DEFAULTS: GameSettings = { music: true, sfx: true, reducedMotion: false, quality: 'high' };

/**
 * Camada de áudio sem downloads extras. Usa WebAudio para pequenos sons e
 * uma trilha ambiente discreta; começa somente após o primeiro toque/tecla,
 * como exigem navegadores móveis e iframes.
 */
export class AudioSystem {
  settings: GameSettings = { ...DEFAULTS };
  private ctx?: AudioContext;
  private nextNote = 0;
  private note = 0;

  constructor() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (d && typeof d === 'object') this.settings = { ...DEFAULTS, ...d };
    } catch {
      /* preferências padrão */
    }
  }

  unlock() {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx ??= new AC();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* áudio não é essencial para abrir o jogo */
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      /* sem espaço */
    }
  }

  toggle(key: keyof GameSettings) {
    if (key === 'quality') this.settings.quality = this.settings.quality === 'high' ? 'low' : 'high';
    else this.settings[key] = !this.settings[key];
    this.save();
  }

  private tone(freq: number, duration: number, volume: number, type: OscillatorType = 'triangle', slide = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.025, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }

  sfx(kind: 'hit' | 'gather' | 'reward' | 'danger' | 'ui') {
    if (!this.settings.sfx) return;
    this.unlock();
    if (kind === 'hit') this.tone(150, 0.07, 0.035, 'square', 0.55);
    else if (kind === 'gather') this.tone(310, 0.08, 0.025, 'triangle', 0.72);
    else if (kind === 'reward') {
      this.tone(520, 0.16, 0.035, 'sine', 1.5);
      window.setTimeout(() => this.tone(780, 0.2, 0.03, 'sine', 1.25), 110);
    } else if (kind === 'danger') this.tone(110, 0.45, 0.04, 'sawtooth', 0.6);
    else this.tone(440, 0.045, 0.018, 'square', 1.08);
  }

  update(time: number, biome: Biome) {
    if (!this.settings.music || !this.ctx || this.ctx.state !== 'running' || time < this.nextNote) return;
    const roots = [196, 220, 247, 174, 147, 165];
    const scale = [1, 1.125, 1.25, 1.5, 1.667];
    const root = roots[biome] ?? 196;
    const freq = root * scale[this.note++ % scale.length];
    this.tone(freq, 2.8, 0.012, biome === 4 ? 'sine' : 'triangle', 0.995);
    this.nextNote = time + 3200 + (this.note % 3) * 700;
  }
}
