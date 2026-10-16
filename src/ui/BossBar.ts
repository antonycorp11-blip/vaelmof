import Phaser from 'phaser';
import { TILE } from '../config';
import type { WorldScene } from '../scenes/WorldScene';
import { COLOR, fit, label } from './kit';

/**
 * Barra de vida do gigante (alto da tela, no meio): nome, título, vida com
 * as marcas das fases e o aviso de fúria.
 */
export class BossBar {
  private g: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;
  private info: Phaser.GameObjects.Text;
  private u = 1;
  private x = 0;
  private y = 0;
  private w = 0;
  /** Vida mostrada (desce suave, com o rastro do dano). */
  private shown = 1;
  private trail = 1;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.g = scene.add.graphics().setDepth(900);
    this.name = label(scene, '', 11, COLOR.gold).setOrigin(0.5, 1).setDepth(901);
    this.info = label(scene, '', 8, COLOR.text, 1, false).setOrigin(0.5, 0).setDepth(901);
    this.setVisible(false);
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.name.setVisible(v);
    this.info.setVisible(v);
  }

  layout(u: number, y: number) {
    this.u = u;
    const { width } = this.scene.scale;
    this.w = Math.min(320 * u, width * 0.36);
    this.x = (width - this.w) / 2;
    this.y = y;
    fit(this.name, 11, u).setPosition(width / 2, y - 2 * u);
    fit(this.info, 8, u).setPosition(width / 2, y + 12 * u);
  }

  update() {
    const w = this.world;
    const gi = w.giants?.giant;
    const p = w.player;
    const on = !!gi && !gi.dead && Math.hypot(gi.x - p.x, gi.y - p.y) < 45 * TILE;
    this.setVisible(on);
    if (!on || !gi) {
      this.shown = this.trail = gi ? gi.hp / gi.maxHp : 1;
      return;
    }
    const k = Math.max(0, gi.hp / gi.maxHp);
    this.shown += (k - this.shown) * 0.35;
    this.trail = this.trail > this.shown ? this.trail - 0.004 : this.shown;
    const u = this.u;
    const g = this.g;
    const h = 8 * u;
    const b = Math.max(1, Math.round(u));
    g.clear();
    g.fillStyle(0x0b0d14, 0.9).fillRect(this.x - 3 * b, this.y - 3 * b, this.w + 6 * b, h + 6 * b);
    g.fillStyle(0x8a3a1a, 1).fillRect(this.x - 2 * b, this.y - 2 * b, this.w + 4 * b, h + 4 * b);
    g.fillStyle(0x1a1018, 1).fillRect(this.x, this.y, this.w, h);
    g.fillStyle(0xffe0a0, 0.85).fillRect(this.x, this.y, this.w * this.trail, h);
    const col = gi.phase >= 3 ? 0xff3a2a : gi.phase === 2 ? 0xff8a2a : 0xd8402a;
    g.fillStyle(col, 1).fillRect(this.x, this.y, this.w * this.shown, h);
    g.fillStyle(0xffffff, 0.25).fillRect(this.x, this.y, this.w * this.shown, Math.max(1, h * 0.3));
    // marcas das fases (2/3 e 1/3)
    for (const m of [0.66, 0.33]) g.fillStyle(0x0b0d14, 1).fillRect(this.x + this.w * m - b, this.y - b, 2 * b, h + 2 * b);
    const d = gi.def;
    this.name.setText(`${d.name}, ${d.title}`);
    const fury = gi.phase >= 3 ? ' · FURIOSO' : gi.phase === 2 ? ' · enfurecido' : '';
    this.info.setText(`${Math.ceil(gi.hp).toLocaleString('pt-BR')} / ${gi.maxHp.toLocaleString('pt-BR')}${fury}`).setColor(gi.phase >= 3 ? '#ff8a6a' : COLOR.text);
  }
}
