import Phaser from 'phaser';
import { WEATHER } from '../config';
import { lerpColor } from './DayNightSystem';

export type WeatherState = 'clear' | 'rain' | 'fog';

const LABEL: Record<WeatherState, string> = { clear: 'Limpo', rain: 'Chuva', fog: 'Neblina' };

/**
 * Clima independente do ciclo de dia: alterna entre limpo, chuva e neblina
 * em intervalos aleatórios, com transição suave de intensidade. Contribui com
 * um tom multiplicativo que a WorldScene combina com a luz do dia.
 */
export class WeatherSystem {
  state: WeatherState = 'clear';
  rainLevel = 0;
  fogLevel = 0;
  /** 0..1: quanto o bioma atual permite chuva (neve e deserto: 0). */
  rainMask = 1;
  private nextChange: number;
  private rain: Phaser.GameObjects.Particles.ParticleEmitter;
  private splash: Phaser.GameObjects.Particles.ParticleEmitter;
  private fog: Phaser.GameObjects.TileSprite;
  private fogDrift = 0;
  private zoneW = -1;
  private zoneH = -1;

  constructor(scene: Phaser.Scene, depth: number) {
    this.rain = scene.add.particles(0, 0, 'raindrop', {
      x: { min: -40, max: 400 },
      y: { min: -60, max: 200 },
      lifespan: { min: 380, max: 620 },
      speedY: { min: 260, max: 330 },
      speedX: { min: -55, max: -40 },
      rotate: 9,
      alpha: { start: 0.9, end: 0.5 },
      frequency: 30,
      quantity: 2,
      maxAliveParticles: WEATHER.maxRainParticles,
      emitting: false,
    });
    this.rain.setDepth(depth);
    this.splash = scene.add.particles(0, 0, 'splash', {
      x: { min: 0, max: 360 },
      y: { min: 0, max: 220 },
      lifespan: 260,
      frame: [0, 1, 2],
      alpha: { start: 0.8, end: 0 },
      scale: { start: 0.6, end: 1.1 },
      frequency: 40,
      quantity: 1,
      maxAliveParticles: 30,
      emitting: false,
    });
    this.splash.setDepth(depth - 1);
    this.fog = scene.add.tileSprite(0, 0, 64, 64, 'fog').setOrigin(0).setDepth(depth + 1).setAlpha(0);
    this.fog.setTileScale(2, 2);
    if (WEATHER.forced) {
      this.state = WEATHER.forced;
      this.rainLevel = this.state === 'rain' ? 1 : 0;
      this.fogLevel = this.state === 'fog' ? 1 : 0;
    }
    this.nextChange = scene.time.now + Phaser.Math.Between(WEATHER.minIntervalMs, WEATHER.maxIntervalMs);
  }

  get label(): string {
    return LABEL[this.state];
  }

  set(state: WeatherState) {
    this.state = state;
  }

  /** Tom multiplicativo do clima (branco = sem efeito). */
  get tint(): number {
    let c = 0xffffff;
    const rain = this.rainLevel * this.rainMask;
    c = lerpColor(c, 0x98a4bf, rain);
    c = lerpColor(c, 0xdfe2ea, this.fogLevel * (1 - rain));
    return c;
  }

  update(time: number, delta: number, view: Phaser.Geom.Rectangle) {
    if (!WEATHER.forced && time >= this.nextChange) {
      const options: WeatherState[] =
        this.state === 'clear' ? ['rain', 'fog'] : Math.random() < 0.65 ? ['clear'] : [this.state === 'rain' ? 'fog' : 'rain'];
      this.state = Phaser.Utils.Array.GetRandom(options);
      this.nextChange = time + Phaser.Math.Between(WEATHER.minIntervalMs, WEATHER.maxIntervalMs);
    }
    const step = delta / WEATHER.transitionMs;
    const approach = (v: number, target: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
    this.rainLevel = approach(this.rainLevel, this.state === 'rain' ? 1 : 0);
    this.fogLevel = approach(this.fogLevel, this.state === 'fog' ? 1 : this.state === 'rain' ? 0.25 : 0);

    // chuva: emissor acompanha a área visível; densidade proporcional à intensidade
    const rainK = this.rainLevel * this.rainMask;
    const raining = rainK > 0.03;
    this.rain.setPosition(view.x, view.y);
    this.rain.emitting = raining;
    this.splash.emitting = rainK > 0.3;
    if (raining) {
      const freq = Phaser.Math.Linear(90, 14, rainK);
      this.rain.frequency = freq;
      this.splash.setPosition(view.x, view.y);
      // atualiza a zona de emissão só quando o tamanho da visão muda (zoom/resize)
      if (view.width !== this.zoneW || view.height !== this.zoneH) {
        this.zoneW = view.width;
        this.zoneH = view.height;
        this.rain.ops.x.loadConfig({ x: { min: -40, max: view.width + 60 } });
        this.rain.ops.y.loadConfig({ y: { min: -60, max: view.height } });
        this.splash.ops.x.loadConfig({ x: { min: 0, max: view.width } });
        this.splash.ops.y.loadConfig({ y: { min: 0, max: view.height } });
      }
    }

    // neblina: overlay de baixa opacidade, deriva lenta com o vento
    this.fogDrift += delta * 0.006;
    const fogAlpha = this.fogLevel * 0.42;
    this.fog.setVisible(fogAlpha > 0.01);
    if (fogAlpha > 0.01) {
      this.fog.setPosition(view.x - 48, view.y - 48);
      this.fog.setSize(view.width + 96, view.height + 96);
      this.fog.setTilePosition((view.x + this.fogDrift) / 2, (view.y + this.fogDrift * 0.3) / 2);
      this.fog.setAlpha(fogAlpha);
    }
  }
}
