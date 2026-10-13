import Phaser from 'phaser';
import { TILE, WORLD_SEED } from '../config';
import type { Enemy } from '../entities/Enemy';
import type { WorldScene } from '../scenes/WorldScene';
import type { SpawnKind } from './MapGenerator';
import { Biome, BIOMES, type WorldData } from './WorldGenerator';

/** Nível de cada região: multiplica a vida, o dano e os pontos das criaturas. */
export const BIOME_TIER: Record<Biome, number> = {
  [Biome.VALE]: 1,
  [Biome.GREEN]: 1,
  [Biome.DUST]: 1.5,
  [Biome.SNOW]: 2,
  [Biome.BLOCK]: 2.5,
  [Biome.BLACK]: 3,
};

/** Variante (tom) que cada criatura ganha no bioma, como no resto do mundo. */
export const BIOME_VARIANT: Partial<Record<Biome, string>> = { [Biome.SNOW]: 'snow', [Biome.BLOCK]: 'stone', [Biome.BLACK]: 'void', [Biome.DUST]: 'sand' };

interface SpotTemplate {
  name: string;
  /** Criaturas sorteadas a cada reposição. */
  kinds: SpawnKind[];
  /** Quantas ficam vivas ao mesmo tempo. */
  max: number;
  /** Intervalo de reposição (ms). */
  every: number;
}

const TEMPLATES: Record<Biome, SpotTemplate[]> = {
  [Biome.VALE]: [{ name: 'Charco dos Slimes', kinds: ['slime'], max: 8, every: 3500 }],
  [Biome.GREEN]: [
    { name: 'Toca dos Javalis', kinds: ['boar', 'boar', 'slime'], max: 10, every: 4500 },
    { name: 'Covil dos Lobos', kinds: ['wolf'], max: 8, every: 5000 },
    { name: 'Acampamento Bandido', kinds: ['bandit'], max: 7, every: 6000 },
  ],
  [Biome.DUST]: [
    { name: 'Ninho de Escorpiões', kinds: ['scorpion'], max: 10, every: 4500 },
    { name: 'Caravana Saqueada', kinds: ['bandit'], max: 8, every: 6000 },
    { name: 'Dunas Uivantes', kinds: ['wolf', 'scorpion'], max: 9, every: 5000 },
  ],
  [Biome.SNOW]: [
    { name: 'Matilha da Nevasca', kinds: ['wolf'], max: 10, every: 5000 },
    { name: 'Gruta dos Ursos', kinds: ['bear'], max: 6, every: 7000 },
    { name: 'Vigília Gélida', kinds: ['wraith', 'wolf'], max: 8, every: 6000 },
  ],
  [Biome.BLOCK]: [
    { name: 'Pedreira dos Golens', kinds: ['golem'], max: 6, every: 7000 },
    { name: 'Ninho de Pedra', kinds: ['spider', 'slime'], max: 10, every: 4500 },
    { name: 'Forte Bandido', kinds: ['bandit'], max: 8, every: 6000 },
  ],
  [Biome.BLACK]: [
    { name: 'Cripta Errante', kinds: ['wraith'], max: 8, every: 6000 },
    { name: 'Teia do Vazio', kinds: ['spider'], max: 12, every: 4000 },
    { name: 'Poço do Vazio', kinds: ['slime', 'wraith'], max: 10, every: 5000 },
  ],
};

export interface Spot extends SpotTemplate {
  biome: Biome;
  tier: number;
  /** Centro e raio (px do mundo). */
  x: number;
  y: number;
  r: number;
  alive: Enemy[];
  nextAt: number;
}

/** Raio do spot (tiles) e distâncias de ativação. */
const SPOT_R = 6;
const ACTIVATE = 34 * TILE;
const RELEASE = 60 * TILE;

/**
 * Spots de up (como no MU): áreas fixas de cada bioma onde as criaturas
 * renascem sem parar — enquanto o herói está por perto, o spot repõe um bicho
 * a cada poucos segundos até o máximo. Longe, o spot se esvazia (memória).
 */
export class SpawnSpots {
  readonly spots: Spot[] = [];

  constructor(
    private scene: WorldScene,
    map: WorldData,
  ) {
    this.place(map);
  }

  private place(m: WorldData) {
    const rnd = new Phaser.Math.RandomDataGenerator([`spots-${WORLD_SEED}`]);
    const walk = (x: number, y: number) => x > 1 && y > 1 && x < m.width - 2 && y < m.height - 2 && !m.collision[y * m.width + x] && m.water[y * m.width + x] < 0;
    const sx = Math.floor(m.start.x / TILE);
    const sy = Math.floor(m.start.y / TILE);
    const taken: [number, number][] = [];
    for (const b of Object.keys(TEMPLATES).map(Number) as Biome[]) {
      for (const t of TEMPLATES[b]) {
        let best: [number, number] | null = null;
        let bestScore = -1;
        for (let k = 0; k < 2500; k++) {
          let x: number;
          let y: number;
          if (b === Biome.VALE) {
            // o primeiro spot fica perto de Brumavale, para começar a upar
            const a = rnd.frac() * Math.PI * 2;
            const d = 16 + rnd.frac() * 18;
            x = Math.round(sx + Math.cos(a) * d);
            y = Math.round(sy + Math.sin(a) * d);
          } else {
            x = rnd.between(4, m.width - 5);
            y = rnd.between(4, m.height - 5);
          }
          if (m.biome[y * m.width + x] !== b || !walk(x, y)) continue;
          if (b !== Biome.VALE && Math.hypot(x - sx, y - sy) < 40) continue;
          if (taken.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < 42)) continue;
          // chão livre no círculo (e do mesmo bioma)
          let free = 0;
          let n = 0;
          for (let dy = -SPOT_R; dy <= SPOT_R; dy++)
            for (let dx = -SPOT_R; dx <= SPOT_R; dx++) {
              if (dx * dx + dy * dy > SPOT_R * SPOT_R) continue;
              n++;
              if (walk(x + dx, y + dy) && m.biome[(y + dy) * m.width + x + dx] === b) free++;
            }
          const score = free / n;
          if (score > bestScore) {
            bestScore = score;
            best = [x, y];
          }
          if (score > 0.85) break;
        }
        if (!best) continue;
        taken.push(best);
        this.spots.push({ ...t, biome: b, tier: BIOME_TIER[b], x: best[0] * TILE + 8, y: best[1] * TILE + 8, r: SPOT_R * TILE, alive: [], nextAt: 0 });
      }
    }
  }

  /** Spot que contém o ponto (com uma folga), se houver. */
  at(x: number, y: number, margin = 3 * TILE): Spot | undefined {
    return this.spots.find((s) => Math.hypot(s.x - x, s.y - y) < s.r + margin);
  }

  update(time: number) {
    const p = this.scene.player;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < ACTIVATE) {
        // chegou agora: o spot já está cheio; depois repõe um por vez
        if (!s.alive.length) {
          for (let i = 0; i < s.max; i++) this.spawn(s, false);
          s.nextAt = time + s.every;
        } else if (s.alive.length < s.max && time >= s.nextAt) {
          this.spawn(s, true);
          s.nextAt = time + (s.alive.length < s.max / 2 ? s.every / 2 : s.every);
        }
      } else if (d > RELEASE && s.alive.length) this.clear(s);
    }
  }

  private spawn(s: Spot, puff: boolean) {
    const m = this.scene.map;
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * s.r;
      const tx = Math.floor((s.x + Math.cos(a) * r) / TILE);
      const ty = Math.floor((s.y + Math.sin(a) * r) / TILE);
      const i = ty * m.width + tx;
      if (m.collision[i] || m.water[i] >= 0) continue;
      const kind = s.kinds[Math.floor(Math.random() * s.kinds.length)];
      const x = tx * TILE + 8;
      const y = ty * TILE + 8;
      const e = this.scene.spawnEnemy(kind, x, y, BIOME_VARIANT[s.biome], s.tier);
      e.transient = true;
      s.alive.push(e);
      if (puff) {
        this.scene.fx.burst(x, y - 4, 0xe6dcff, 10);
        e.setAlpha(0);
        this.scene.tweens.add({ targets: e, alpha: 1, duration: 400 });
      }
      return;
    }
  }

  /** Criatura de spot morreu (já some do mundo): libera a vaga. */
  release(e: Enemy) {
    for (const s of this.spots) Phaser.Utils.Array.Remove(s.alive, e);
  }

  private clear(s: Spot) {
    for (const e of s.alive) this.scene.removeEnemy(e);
    s.alive.length = 0;
  }

  get names(): string[] {
    return this.spots.map((s) => `${s.name} (${BIOMES[s.biome].name})`);
  }
}
