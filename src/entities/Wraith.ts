import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { Enemy } from './Enemy';
import { WRAITH_SHEET } from './wraithSheet';

type WraithState = 'drift' | 'stalk' | 'charge' | 'lunge' | 'fade';

/** A arte tem o dobro da densidade do mapa e é exibida pela metade. */
const SCALE = 0.5;

/**
 * Errante: ser encapuzado de outra dimensão que vaga pelas florestas.
 * Flutua devagar; ao notar o herói, aproxima-se meio translúcido, concentra
 * luz nos olhos e avança num toque gélido. Mais forte e mais visível à noite.
 */
export class Wraith extends Enemy {
  readonly fxColor = 0xa8c0ff;
  private mode: WraithState = 'drift';
  private stateUntil = 0;
  private lungeAngle = 0;
  private touched = false;
  private dir = 0;
  private readonly eyeGlow: Phaser.GameObjects.Image;
  static readonly DETECT = 110;
  static readonly REACH = 26;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'wraith', 6, 12, 8);
    const { frameW, footY, frameH } = WRAITH_SHEET;
    this.setScale(SCALE).setOrigin(0.5, footY / frameH);
    this.body.setSize(16, 10);
    this.body.setOffset((frameW - 16) / 2, footY - 9);
    this.barOffset = 28;
    this.eyeGlow = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xb8ccff).setScale(0.22);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, () => {
      const night = scene.dayNight?.lightLevel ?? 0;
      const charging = this.mode === 'charge';
      const [ex, ey] = WRAITH_SHEET.eyes[this.dir];
      this.eyeGlow
        .setPosition(this.x + ex * SCALE, this.y + ey * SCALE)
        .setDepth(4150)
        .setScale(charging ? 0.4 : 0.22)
        .setAlpha((charging ? 1 : night * 0.85) * this.alpha)
        .setVisible(this.visible && !this.dead && this.dir !== 3 && (charging || night > 0.02));
    });
    this.play('wraith-idle-0');
  }

  protected onHurt() {
    if (this.mode === 'drift') this.go('stalk', 0);
    if (this.mode === 'charge' || this.mode === 'lunge') this.go('fade', 500);
  }

  protected onRespawn() {
    this.go('drift', 0);
  }

  private go(s: WraithState, ms: number) {
    this.mode = s;
    this.stateUntil = this.scene.time.now + ms;
  }

  private face(vx: number, vy: number) {
    if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) return;
    this.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 1 : 2) : vy < 0 ? 3 : 0;
  }

  private anim(moving: boolean) {
    const key = `wraith-${moving ? 'move' : 'idle'}-${this.dir}`;
    if (this.anims.currentAnim?.key !== key) this.play(key, true);
  }

  protected think(time: number) {
    const d = this.distToPlayer();
    const a = this.angleToPlayer();
    const night = this.scene.dayNight?.lightLevel ?? 0;
    const sees = this.playerTargetable() && d < Wraith.DETECT * (1 + night * 0.5);
    // presença intermitente: oscila a opacidade (some um pouco de dia)
    const base = 0.72 + night * 0.2;
    this.setAlpha(base + Math.sin(time / 260 + this.homeX) * 0.12);
    switch (this.mode) {
      case 'drift': {
        const moving = this.patrol(time, 14, 64);
        this.face(this.body.velocity.x, this.body.velocity.y);
        this.anim(moving);
        if (sees) this.go('stalk', 0);
        break;
      }
      case 'stalk': {
        const v = 34 + night * 14;
        const vx = Math.cos(a) * v;
        const vy = Math.sin(a) * v;
        this.body.setVelocity(vx, vy);
        this.face(vx, vy);
        this.anim(true);
        if (!this.playerTargetable() || d > Wraith.DETECT * 1.8) this.go('drift', 0);
        else if (d < Wraith.REACH + 8) {
          this.body.setVelocity(0, 0);
          this.go('charge', 480);
        }
        break;
      }
      case 'charge': {
        // concentra luz: para, olhos brilham, treme
        this.body.setVelocity(0, 0);
        this.face(Math.cos(a), Math.sin(a));
        this.anim(false);
        this.setTint(Math.floor(time / 70) % 2 ? 0xc8d8ff : 0xffffff);
        if (time >= this.stateUntil) {
          this.clearTint();
          this.lungeAngle = a;
          this.touched = false;
          this.go('lunge', 260);
        }
        break;
      }
      case 'lunge': {
        const v = 150;
        this.body.setVelocity(Math.cos(this.lungeAngle) * v, Math.sin(this.lungeAngle) * v);
        this.anim(true);
        const p = this.scene.player;
        if (!this.touched && Phaser.Math.Distance.Between(this.fx, this.fy, p.fx, p.fy) < 14) {
          this.touched = true;
          p.hurt(2, this.fx, this.fy);
          this.scene.fx.burst(p.x, p.y - 12, 0xa8c0ff, 8);
        }
        if (time >= this.stateUntil) this.go('fade', 700);
        break;
      }
      case 'fade': {
        // recua e fica quase invisível antes de voltar a caçar
        this.clearTint();
        this.body.setVelocity(-Math.cos(a) * 24, -Math.sin(a) * 24);
        this.anim(true);
        this.setAlpha(0.4);
        if (time >= this.stateUntil) this.go(sees ? 'stalk' : 'drift', 0);
        break;
      }
    }
  }
}
