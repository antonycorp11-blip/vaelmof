import Phaser from 'phaser';
import { DEBUG, FORCE_TOUCH } from '../config';
import { inputState } from '../input/InputState';
import { VirtualControls } from '../input/VirtualControls';
import type { WorldScene } from './WorldScene';

/** HUD (vida, relógio, clima, nome da área) + controles virtuais. */
export class UIScene extends Phaser.Scene {
  private controls!: VirtualControls;
  private hpBar!: Phaser.GameObjects.Graphics;
  private heart!: Phaser.GameObjects.Image;
  private info!: Phaser.GameObjects.Text;
  private areaText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private fps?: Phaser.GameObjects.Text;
  private u = 1;
  private lastHp = -1;

  constructor() {
    super('UI');
  }

  create() {
    const touch = this.sys.game.device.input.touch || FORCE_TOUCH;
    this.hpBar = this.add.graphics();
    this.heart = this.add.image(0, 0, 'ui-icons', 3).setOrigin(0, 0.5);
    const style = { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', fontStyle: 'bold', stroke: '#1e1a24', strokeThickness: 3 };
    this.info = this.add.text(0, 0, '', style).setOrigin(1, 0);
    this.areaText = this.add.text(0, 0, '', { ...style, fontSize: '20px', color: '#ffe9a8' }).setOrigin(0.5).setAlpha(0);
    this.toast = this.add.text(0, 0, '', { ...style, fontSize: '14px' }).setOrigin(0.5).setAlpha(0);
    if (DEBUG) this.fps = this.add.text(0, 0, '', { ...style, fontSize: '10px' });
    this.controls = new VirtualControls(this, touch);

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    const world = this.scene.get('World') as WorldScene;
    world.events.on('area', (name: string) => this.showArea(name));
    world.events.on('player-died', () => this.showToast('Teren caiu... retornando a Brumavale'));
    this.time.delayedCall(600, () => this.showArea('Brumavale'));
    if (!touch) this.time.delayedCall(2600, () => this.showToast('WASD mover · J golpe · K esquiva · L chama', 4200));
  }

  /** Fator px do jogo / px CSS, definido em main.ts. */
  private get uiScale(): number {
    return (this.registry.get('uiScale') as number) || 1;
  }

  private layout() {
    const { width, height } = this.scale;
    this.cameras.main.setSize(width, height);
    const u = (this.u = this.uiScale);
    const safeLeft = 12 * u;
    this.heart.setPosition(safeLeft, 22 * u).setScale(1.6 * u);
    this.info.setPosition(width - 14 * u, 10 * u).setFontSize(Math.round(12 * u)).setStroke('#1e1a24', 3 * u);
    this.areaText.setPosition(width / 2, height * 0.24).setFontSize(Math.round(20 * u)).setStroke('#1e1a24', 4 * u);
    this.toast.setPosition(width / 2, height * 0.36).setFontSize(Math.round(13 * u)).setStroke('#1e1a24', 3 * u);
    this.fps?.setPosition(safeLeft, 40 * u).setFontSize(Math.round(10 * u));
    this.controls.hudBottom = 44 * u;
    this.controls.layout(width, height, u);
    this.lastHp = -1;
  }

  private showArea(name: string) {
    this.areaText.setText(name).setAlpha(0);
    this.tweens.killTweensOf(this.areaText);
    this.tweens.chain({
      targets: this.areaText,
      tweens: [
        { alpha: 1, duration: 500 },
        { alpha: 1, duration: 1600 },
        { alpha: 0, duration: 700 },
      ],
    });
  }

  private showToast(msg: string, hold = 1800) {
    this.toast.setText(msg).setAlpha(0);
    this.tweens.killTweensOf(this.toast);
    this.tweens.chain({
      targets: this.toast,
      tweens: [
        { alpha: 1, duration: 300 },
        { alpha: 1, duration: hold },
        { alpha: 0, duration: 600 },
      ],
    });
  }

  private drawHp() {
    const u = this.u;
    const g = this.hpBar;
    const x = 12 * u + 30 * u;
    const y = 16 * u;
    const w = 130 * u;
    const h = 12 * u;
    const k = inputState.hp / inputState.maxHp;
    g.clear();
    g.fillStyle(0x1e1a24, 0.85).fillRoundedRect(x - 3 * u, y - 3 * u, w + 6 * u, h + 6 * u, 4 * u);
    g.fillStyle(0x7a1f2a, 1).fillRect(x, y, w, h);
    g.fillStyle(k > 0.3 ? 0xe04848 : 0xff7a3a, 1).fillRect(x, y, w * k, h);
    g.fillStyle(0xffffff, 0.25).fillRect(x, y, w * k, 3 * u);
    // divisões por ponto de vida
    g.fillStyle(0x1e1a24, 0.6);
    for (let i = 1; i < inputState.maxHp; i++) g.fillRect(x + (w * i) / inputState.maxHp - u / 2, y, Math.max(1, u), h);
  }

  update() {
    if (inputState.hp !== this.lastHp) {
      this.lastHp = inputState.hp;
      this.drawHp();
    }
    this.info.setText(`${this.registry.get('clock') ?? ''}  ${this.registry.get('weather') ?? ''}`);
    this.controls.update();
    if (this.fps) {
      const w = this.scene.get('World') as WorldScene;
      const active = w.enemies.filter((e) => !e.dead).length;
      this.fps.setText(`${Math.round(this.game.loop.actualFps)} fps · inimigos ${active} · objs ${w.children.length}`);
    }
  }
}
