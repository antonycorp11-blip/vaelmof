import Phaser from 'phaser';
import { TILE } from '../config';
import { rollJewel } from '../data/enhancement';
import { rollGear } from '../data/gear';
import { DEPTH } from '../entities/Creature';
import type { WorldScene } from '../scenes/WorldScene';

const KEY = 'vaelmor.chests.v1';
const RESPAWN = 18 * 60000;

interface Chest {
  id: string;
  x: number;
  y: number;
  power: number;
  openedAt: number;
  icon: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/** Baús rúnicos persistentes nas estradas de cada cidade. */
export class TreasureChests {
  readonly list: Chest[] = [];
  private saved = new Map<string, number>();
  private checkAt = 0;

  constructor(readonly scene: WorldScene) {
    this.load();
    scene.map.cities.forEach((c, i) => {
      const at = this.freeNear(c.x1 + 5 + (i % 3), c.cy + ((i % 2) * 2 - 1) * 4);
      const id = `city:${c.name}`;
      const icon = scene.add.image(at.x, at.y - 7, 'ui-menu', 24).setScale(0.85).setDepth(DEPTH.entities + at.y);
      const glow = scene.add.image(at.x, at.y - 7, 'glow').setTint(c.biome >= 4 ? 0xd77cff : c.biome >= 2 ? 0x62b9ff : 0x78e58b).setBlendMode(Phaser.BlendModes.ADD).setScale(0.36).setAlpha(0.65).setDepth(DEPTH.entities + at.y - 1);
      const label = scene.add
        .text(at.x, at.y - 20, 'Baú Rúnico', { fontFamily: 'Tiny5, monospace', fontSize: '6px', color: '#ffd77a', stroke: '#1e1a24', strokeThickness: 2 })
        .setOrigin(0.5)
        .setResolution(4)
        .setDepth(DEPTH.fx);
      const chest = { id, x: at.x, y: at.y, power: c.biome, openedAt: this.saved.get(id) ?? -1e12, icon, glow, label };
      this.list.push(chest);
      scene.tweens.add({ targets: glow, alpha: { from: 0.35, to: 0.75 }, scale: { from: 0.3, to: 0.43 }, yoyo: true, repeat: -1, duration: 1100 + i * 35 });
      this.sync(chest);
    });
  }

  get available() {
    const now = this.scene.clans.now;
    return this.list.filter((c) => now - c.openedAt >= RESPAWN);
  }

  near(r = 25): Chest | null {
    const p = this.scene.player;
    return this.available.find((c) => Math.abs(c.x - p.x) < r && Math.abs(c.y - p.y) < r) ?? null;
  }

  openNear(): string {
    const c = this.near();
    if (!c) return 'Nenhum baú para abrir aqui';
    if (this.scene.army.war) return 'Derrote os inimigos antes de abrir o baú';
    c.openedAt = this.scene.clans.now;
    this.saved.set(c.id, c.openedAt);
    this.sync(c);
    const s = this.scene;
    const rankPower = Math.floor(s.progress.rankIdx / 3);
    const power = Math.max(c.power, rankPower);
    const first = rollJewel('chest', power);
    s.loot.drop(first, c.x - 8, c.y);
    if (Math.random() < 0.18 + power * 0.035) s.time.delayedCall(220, () => s.loot.drop(rollJewel('chest', power), c.x + 8, c.y));
    if (Math.random() < 0.08 + power * 0.02) s.time.delayedCall(420, () => s.loot.drop(rollGear(Math.min(4, 1 + Math.floor(power / 2))), c.x, c.y + 5));
    const gold = 35 + power * 25 + Math.floor(Math.random() * 31);
    s.hq.addGold(gold);
    s.mountFx.flash(c.x, c.y - 8, 0xffd77a, 72, 420);
    s.fx.burst(c.x, c.y - 8, 0xffd77a, 18);
    s.audio.sfx('reward');
    s.events.emit('area', 'BAÚ RÚNICO ABERTO!', `${gold} ouro · ${first === 'jewel_ancestral' ? 'Joia Ancestral' : first === 'jewel_rune' ? 'Joia Rúnica' : 'Joia de Forja'}`);
    this.save();
    return '';
  }

  update(time: number) {
    if (time < this.checkAt) return;
    this.checkAt = time + 1000;
    for (const c of this.list) this.sync(c);
  }

  private sync(c: Chest) {
    const on = this.scene.clans.now - c.openedAt >= RESPAWN;
    c.icon.setVisible(on).setFrame(24);
    c.glow.setVisible(on);
    c.label.setVisible(on);
  }

  private freeNear(tx: number, ty: number) {
    const m = this.scene.map;
    for (let r = 0; r < 18; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = Phaser.Math.Clamp(tx + dx, 2, m.width - 3);
          const y = Phaser.Math.Clamp(ty + dy, 2, m.height - 3);
          const i = y * m.width + x;
          if (!m.collision[i] && m.water[i] < 0 && m.cliffs[i] < 0) return { x: x * TILE + 8, y: y * TILE + 8 };
        }
    return { x: tx * TILE + 8, y: ty * TILE + 8 };
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.saved.entries()]));
    } catch {
      /* armazenamento bloqueado */
    }
  }

  private load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      if (Array.isArray(d)) for (const row of d) if (Array.isArray(row) && typeof row[0] === 'string' && Number.isFinite(row[1])) this.saved.set(row[0], row[1]);
    } catch {
      /* todos fechados */
    }
  }
}
