import Phaser from 'phaser';
import { Biome } from './WorldGenerator';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

/**
 * Partículas de clima próprias de cada bioma, presas à área visível:
 * neve constante no Snowland, cinzas caindo e brasas subindo no Blackland,
 * vento de areia no Dustland. A intensidade de cada uma acompanha o peso do
 * bioma em volta do jogador (transição suave ao cruzar a fronteira).
 */
export class BiomeFx {
  private snow: Emitter;
  private ash: Emitter;
  private embers: Emitter;
  private sand: Emitter;
  /** Tamanho da visão para o qual a área de cada emissor foi ajustada. */
  private fitted = new Map<Emitter, string>();

  constructor(scene: Phaser.Scene, depth: number) {
    const base = { emitting: false, x: 0, y: 0 };
    this.snow = scene.add.particles(0, 0, 'pixel', {
      ...base,
      lifespan: { min: 2600, max: 4200 },
      speedY: { min: 14, max: 34 },
      speedX: { min: -14, max: 6 },
      scale: { min: 0.25, max: 0.5 },
      alpha: { start: 1, end: 0.6 },
      tint: [0xffffff, 0xf4f8ff, 0xe4ecfa],
      frequency: 20,
      maxAliveParticles: 260,
    });
    this.ash = scene.add.particles(0, 0, 'pixel', {
      ...base,
      lifespan: { min: 2400, max: 3600 },
      speedY: { min: 8, max: 20 },
      speedX: { min: -10, max: 10 },
      scale: { min: 0.25, max: 0.45 },
      alpha: { start: 0.9, end: 0.1 },
      tint: [0x8a8090, 0xa89eb0, 0x6a6070],
      frequency: 60,
      maxAliveParticles: 90,
    });
    this.embers = scene.add.particles(0, 0, 'pixel', {
      ...base,
      lifespan: { min: 1400, max: 2600 },
      speedY: { min: -26, max: -10 },
      speedX: { min: -6, max: 6 },
      scale: { start: 0.45, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff7a3a, 0xffd07a, 0xb46cec],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 90,
      maxAliveParticles: 50,
    });
    this.sand = scene.add.particles(0, 0, 'pixel', {
      ...base,
      lifespan: { min: 1200, max: 2000 },
      speedX: { min: 70, max: 130 },
      speedY: { min: -6, max: 8 },
      scale: { min: 0.2, max: 0.4 },
      alpha: { start: 0.55, end: 0 },
      tint: [0xeecb8a, 0xd4a65c, 0xf6dea6],
      frequency: 70,
      maxAliveParticles: 80,
    });
    for (const e of [this.snow, this.ash, this.embers, this.sand]) e.setDepth(depth);
  }

  /** `w[b]` = peso (0..1) de cada bioma em volta do jogador. */
  update(view: Phaser.Geom.Rectangle, w: number[]) {
    const size = `${Math.round(view.width)}x${Math.round(view.height)}`;
    const run = (e: Emitter, k: number, minFreq: number, maxFreq: number, zone: 'top' | 'all' | 'bottom') => {
      e.emitting = k > 0.05;
      if (!e.emitting) return;
      e.frequency = Phaser.Math.Linear(maxFreq, minFreq, k);
      e.setPosition(view.x, view.y);
      if (this.fitted.get(e) !== size) {
        this.fitted.set(e, size);
        const W = view.width;
        const H = view.height;
        const zy = zone === 'top' ? { min: -20, max: H * 0.6 } : zone === 'bottom' ? { min: H * 0.3, max: H + 10 } : { min: 0, max: H };
        e.ops.x.loadConfig({ x: { min: -30, max: W + 30 } });
        e.ops.y.loadConfig({ y: zy });
      }
    };
    run(this.snow, w[Biome.SNOW], 12, 90, 'top');
    run(this.ash, w[Biome.BLACK], 40, 160, 'top');
    run(this.embers, w[Biome.BLACK], 45, 200, 'bottom');
    run(this.sand, w[Biome.DUST] * 0.8, 40, 200, 'all');
  }
}
