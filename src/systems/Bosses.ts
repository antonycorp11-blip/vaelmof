import Phaser from 'phaser';
import type { Enemy } from '../entities/Enemy';
import type { WorldScene } from '../scenes/WorldScene';

export interface BossSpec {
  name: string;
  x: number;
  y: number;
  hp: number;
  damage: number;
  tint: number;
  scale: number;
  points: number;
  /** Patente mostrada na insígnia vermelha (0–9). */
  rank: number;
  /** Peça rara que cai ao morrer. */
  loot?: string;
  onKill?: (e: Enemy) => void;
}

interface Live {
  spec: BossSpec;
  enemy: Enemy;
  label: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Image;
}

/**
 * Personagens nomeados (líderes de clã, procurados das missões): um bandido
 * forte, tingido, com nome e insígnia sobre a cabeça; ao morrer, deixa cair a
 * peça rara que carregava e avisa quem o chamou.
 */
export class Bosses {
  readonly list: Live[] = [];

  constructor(private scene: WorldScene) {
    scene.events.on('enemy-killed', (e: Enemy) => {
      const i = this.list.findIndex((l) => l.enemy === e);
      if (i < 0) return;
      const b = this.list[i];
      this.list.splice(i, 1);
      b.label.destroy();
      b.icon.destroy();
      if (b.spec.loot) scene.loot.drop(b.spec.loot, e.x, e.y);
      b.spec.onKill?.(e);
    });
  }

  spawn(spec: BossSpec): Enemy {
    const s = this.scene;
    const e = s.spawnEnemy('bandit', spec.x, spec.y);
    e.transient = true;
    e.maxHp = e.hp = spec.hp;
    e.dmgMul = spec.damage / 2;
    e.points = spec.points;
    e.knockbackScale = 0.3;
    e.baseTint = spec.tint;
    e.setTint(spec.tint).setScale(spec.scale);
    const label = s.add
      .text(spec.x, spec.y - 40, spec.name, { fontFamily: 'Tiny5, monospace', fontSize: '7px', color: '#ffd34a', stroke: '#1e1a24', strokeThickness: 2 })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(4250);
    const icon = s.add.image(spec.x, spec.y - 34, 'rank-icons', 10 + Math.max(0, Math.min(9, spec.rank))).setDepth(4150);
    this.list.push({ spec, enemy: e, label, icon });
    return e;
  }

  /** Remove sem recompensa (fim de guerra, missão cancelada, longe demais). */
  remove(e: Enemy) {
    const i = this.list.findIndex((l) => l.enemy === e);
    if (i < 0) return;
    const b = this.list[i];
    this.list.splice(i, 1);
    b.label.destroy();
    b.icon.destroy();
    if (e.active) this.scene.removeEnemy(e);
  }

  update() {
    const k = this.scene.army.iconScale * 1.2;
    for (const b of this.list) {
      const e = b.enemy;
      b.label.setPosition(Math.round(e.x), Math.round(e.y - 44)).setVisible(e.visible);
      b.icon.setPosition(Math.round(e.x), Math.round(e.y - 36)).setScale(k).setVisible(e.visible);
    }
  }
}
