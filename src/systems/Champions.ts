import Phaser from 'phaser';
import { TILE } from '../config';
import type { Enemy } from '../entities/Enemy';
import type { WorldScene } from '../scenes/WorldScene';
import { CHAMPIONS, RANKS, type ChampionId } from './Ranks';

interface Live {
  id: ChampionId;
  x: number;
  y: number;
  enemy?: Enemy;
  label?: Phaser.GameObjects.Text;
  icon?: Phaser.GameObjects.Image;
}

/**
 * Campeões dos duelos de patente: cada um espera fora dos muros de uma cidade
 * (ao sul). Aparecem quando o herói chega perto; derrotados, nunca voltam.
 */
export class Champions {
  readonly list: Live[] = [];
  private lastCheck = 0;

  constructor(private scene: WorldScene) {
    const m = scene.map;
    for (const id of Object.keys(CHAMPIONS) as ChampionId[]) {
      const c = m.cities.find((c) => c.name === CHAMPIONS[id].city) ?? m.cities[0];
      // primeiro chão livre ao sul do portão, além das fazendas
      let tx = c.cx;
      let ty = c.y1 + 22;
      for (let r = 0; r < 30; r++) {
        const i = (ty + r) * m.width + tx;
        if (!m.collision[i] && m.water[i] < 0) {
          ty += r;
          break;
        }
      }
      this.list.push({ id, x: tx * TILE + 8, y: ty * TILE + 8 });
    }
    scene.events.on('enemy-killed', (e: Enemy) => {
      const c = this.list.find((l) => l.enemy === e);
      if (!c) return;
      c.label?.destroy();
      c.label = undefined;
      c.icon?.destroy();
      c.icon = undefined;
      // duelo vencido vale muita Glória
      scene.gainGlory(CHAMPIONS[c.id].points * 16, e.x, e.y - 50);
      c.enemy = undefined;
      scene.progress.defeat(c.id);
      const unlock = RANKS.find((r) => r.duel === c.id);
      scene.events.emit('toast', `Você derrotou ${CHAMPIONS[c.id].name}!${unlock ? ` Duelo da patente ${unlock.name} vencido.` : ''}`);
    });
  }

  update(time: number) {
    const s = this.scene;
    const p = s.player;
    for (const c of this.list) {
      if (c.enemy && c.label) c.label.setPosition(c.enemy.x, c.enemy.y - 46).setVisible(c.enemy.visible);
      if (c.enemy && c.icon) c.icon.setPosition(Math.round(c.enemy.x), Math.round(c.enemy.y - 36)).setScale(s.army.iconScale * 1.2).setVisible(c.enemy.visible);
    }
    if (time - this.lastCheck < 500) return;
    this.lastCheck = time;
    for (const c of this.list) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (!c.enemy && !s.progress.duels.has(c.id) && d < 40 * TILE) this.spawn(c);
      else if (c.enemy && d > 70 * TILE) this.despawn(c);
    }
  }

  private spawn(c: Live) {
    const s = this.scene;
    const D = CHAMPIONS[c.id];
    const e = s.spawnEnemy('bandit', c.x, c.y);
    e.transient = true;
    e.maxHp = e.hp = D.hp;
    e.dmgMul = D.damage / 2;
    e.points = D.points;
    e.knockbackScale = 0.25;
    e.baseTint = D.tint;
    e.setTint(D.tint).setScale(D.scale);
    c.enemy = e;
    c.label = s.add
      .text(c.x, c.y - 38, D.name, { fontFamily: 'monospace', fontSize: '7px', fontStyle: 'bold', color: '#ffd34a', stroke: '#1e1a24', strokeThickness: 2 })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(4250);
    // insígnia vermelha: a patente do campeão, para saber contra quem se luta
    c.icon = s.add.image(c.x, c.y - 42, 'rank-icons', 10 + D.rank).setDepth(4150);
  }

  private despawn(c: Live) {
    if (c.enemy?.active) this.scene.removeEnemy(c.enemy);
    c.label?.destroy();
    c.label = undefined;
    c.icon?.destroy();
    c.icon = undefined;
    c.enemy = undefined;
  }
}
