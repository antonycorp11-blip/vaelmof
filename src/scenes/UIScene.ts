import Phaser from 'phaser';
import { DEBUG, FORCE_TOUCH } from '../config';
import { inputState } from '../input/InputState';
import { VirtualControls } from '../input/VirtualControls';
import { DebugPanel } from '../ui/DebugPanel';
import { InventoryPanel } from '../ui/InventoryPanel';
import type { WeaponDef } from '../data/weapons';
import { OUTFITS, type OutfitId } from '../entities/heroSheets';
import type { WorldScene } from './WorldScene';

/** HUD (vida, relógio, clima, nome da área) + controles virtuais. */
export class UIScene extends Phaser.Scene {
  private controls!: VirtualControls;
  private debug!: DebugPanel;
  private bag!: InventoryPanel;
  private weaponBtn!: Phaser.GameObjects.Text;
  private bagBtn!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  private heart!: Phaser.GameObjects.Image;
  private info!: Phaser.GameObjects.Text;
  private areaText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private fps?: Phaser.GameObjects.Text;
  private version!: Phaser.GameObjects.Text;
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
    // versão (commit) — confere se o PWA pegou a atualização
    this.version = this.add.text(0, 0, `v ${__BUILD_ID__}`, { ...style, fontSize: '9px', color: '#d8d8d8' }).setOrigin(0.5, 0).setAlpha(0.7);
    this.controls = new VirtualControls(this, touch);
    const world0 = this.scene.get('World') as WorldScene;
    this.debug = new DebugPanel(this, world0);
    this.bag = new InventoryPanel(this, world0.inventory);
    // barra do topo (centro da tela: longe do notch e dos cantos arredondados do iPhone)
    const btn = { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#2a2234' };
    this.weaponBtn = this.add.text(0, 0, '', btn).setDepth(2000).setInteractive({ useHandCursor: true });
    this.weaponBtn.on('pointerdown', () => this.bag.toggle());
    this.bagBtn = this.add.text(0, 0, 'MOCHILA', { ...btn, backgroundColor: '#5a3a20' }).setDepth(2000).setInteractive({ useHandCursor: true });
    this.bagBtn.on('pointerdown', () => this.bag.toggle());
    const topUi = [this.weaponBtn, this.bagBtn];
    this.controls.blocker = (x, y) => this.debug.contains(x, y) || this.bag.contains(x, y) || topUi.some((b) => b.getBounds().contains(x, y));
    const onWeapon = (w: WeaponDef) => {
      this.weaponBtn.setText(`${w.className} · ${w.name}`);
      this.controls.setButton('attack', w.attackLabel, w.attackIcon);
      this.controls.setButton('flame', w.skill.label, w.skill.icon);
      this.layout();
    };
    world0.events.on('weapon', (w: WeaponDef) => {
      onWeapon(w);
      this.showToast(`Agora você é ${w.className} (${w.name})`);
    });
    onWeapon(world0.player.weapon);
    world0.events.on('outfit', (id: OutfitId) => this.showToast(`Vestiu: ${OUTFITS[id].name}`));

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
    this.fps?.setPosition(width - 14 * u, 30 * u).setOrigin(1, 0).setFontSize(Math.round(10 * u));
    // barra do topo: [classe · arma] [MOCHILA] [DEBUG], centralizada
    const pad = Math.round(10 * u);
    const py = Math.round(9 * u);
    for (const b of [this.weaponBtn, this.bagBtn]) b.setFontSize(Math.round(12 * u)).setPadding(pad, py, pad, py);
    const gap = 8 * u;
    const total = this.weaponBtn.width + this.bagBtn.width + this.debug.toggleWidth + gap * 2;
    let x = Math.round((width - total) / 2);
    const y = 20 * u;
    this.weaponBtn.setPosition(x, y);
    x += this.weaponBtn.width + gap;
    this.bagBtn.setPosition(x, y);
    x += this.bagBtn.width + gap;
    this.debug.layout(u, x, y);
    this.bag.layout(u);
    this.version.setPosition(width / 2, 6 * u).setFontSize(Math.round(9 * u)).setStroke('#1e1a24', 2 * u);
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
    this.debug.update();
    if (this.fps) {
      const w = this.scene.get('World') as WorldScene;
      const active = w.enemies.filter((e) => !e.dead).length;
      this.fps.setText(`${Math.round(this.game.loop.actualFps)} fps · inimigos ${active} · objs ${w.children.length}`);
    }
  }
}
