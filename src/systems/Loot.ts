import Phaser from 'phaser';
import { RARITY } from '../data/gear';
import { ITEMS } from '../data/items';
import { DEPTH } from '../entities/Creature';
import type { WorldScene } from '../scenes/WorldScene';

interface Drop {
  id: string;
  x: number;
  y: number;
  until: number;
  icon: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  beam: Phaser.GameObjects.Rectangle;
}

const PICK_R = 20;
const LIFE = 180000;

/**
 * Saque no chão: a peça rara que um personagem deixa cair, com um facho de
 * luz na cor da raridade. Pega sozinha quando o herói passa por cima.
 */
export class Loot {
  readonly drops: Drop[] = [];

  constructor(private scene: WorldScene) {}

  drop(id: string, x: number, y: number) {
    const s = this.scene;
    const def = ITEMS[id];
    if (!def) return;
    const R = RARITY[def.tier ?? 0];
    const color = def.glow ?? R.frame;
    const sheet = def.sheet ?? 'items';
    const beam = s.add.rectangle(x, y - 26, 6, 60, color, 0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.entities + y - 1);
    const glow = s.add.image(x, y - 4, 'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.8).setDepth(DEPTH.entities + y - 2);
    const icon = s.add.image(x, y - 6, sheet, def.icon).setDepth(DEPTH.entities + y);
    icon.setScale(sheet === 'armor-icons' ? 16 / 54 : 1);
    if (def.tint) icon.setTint(def.tint);
    s.tweens.add({ targets: icon, y: y - 10, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    s.tweens.add({ targets: [glow, beam], alpha: { from: 0.9, to: 0.35 }, yoyo: true, repeat: -1, duration: 900 });
    this.drops.push({ id, x, y, until: s.time.now + LIFE, icon, glow, beam });
    s.fx.floatText(x, y - 30, def.name, R.color);
  }

  update(time: number) {
    const p = this.scene.player;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      const near = Math.abs(p.x - d.x) < PICK_R && Math.abs(p.y - d.y) < PICK_R;
      if (!near && time < d.until) continue;
      if (near) {
        const def = ITEMS[d.id];
        if (this.scene.inventory.add(d.id, 1) < 1) {
          this.scene.events.emit('toast', 'Mochila cheia: libere espaço para pegar o saque');
          d.until = Math.max(d.until, time + 30000);
          continue;
        }
        const R = RARITY[def.tier ?? 0];
        this.scene.events.emit('loot', def, R);
        this.scene.fx.burst(d.x, d.y - 6, def.glow ?? R.frame, 18);
      }
      this.scene.tweens.killTweensOf([d.icon, d.glow, d.beam]);
      d.icon.destroy();
      d.glow.destroy();
      d.beam.destroy();
      this.drops.splice(i, 1);
    }
  }
}
