import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { Enemy } from './Enemy';

type BanditState = 'patrol' | 'chase' | 'windup' | 'strike' | 'cooldown';

/** Bandoleiro: patrulha a estrada e ataca de perto com uma adaga. */
export class Bandit extends Enemy {
  readonly fxColor = 0xc0392b;
  private mode: BanditState = 'patrol';
  private stateUntil = 0;
  private strikeAngle = 0;
  private struck = false;
  private dir = 0;
  /** Colunas por direção em bandit.png: 0–3 parado, 4–9 andar, 10–14 golpe, 15 dano. */
  static readonly ROW = 16;
  private alert?: Phaser.GameObjects.Text;
  static readonly DETECT = 118;
  static readonly REACH = 22;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'bandit', 8, 10, 6);
    // frame 48×48 (mesmo rig do Teren), pés em y≈40
    this.setOrigin(0.5, 40 / 48);
    this.body.setOffset(19, 37);
    this.barOffset = 28;
    this.play('bandit-walk-0');
  }

  protected onHurt() {
    if (this.mode === 'patrol') this.go('chase', 0);
    if (this.mode === 'windup' || this.mode === 'strike') this.go('cooldown', 450);
    this.anims.stop();
    this.setFrame(this.dir * Bandit.ROW + 15);
  }

  protected onRespawn() {
    this.go('patrol', 0);
  }

  private go(s: BanditState, ms: number) {
    this.mode = s;
    this.stateUntil = this.scene.time.now + ms;
  }

  private face(vx: number, vy: number) {
    if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) return;
    this.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 1 : 2) : vy < 0 ? 3 : 0;
  }

  private walkAnim(moving: boolean) {
    const key = `bandit-walk-${this.dir}`;
    if (moving) {
      if (this.anims.currentAnim?.key !== key || !this.anims.isPlaying) this.play(key, true);
    } else {
      const idle = `bandit-idle-${this.dir}`;
      if (this.anims.currentAnim?.key !== idle || !this.anims.isPlaying) this.play(idle, true);
    }
  }

  private showAlert() {
    if (this.alert) return;
    this.alert = this.scene.add
      .text(this.x, this.y - 32, '!', { fontFamily: '"Pixelify Sans", monospace', fontSize: '12px', color: '#ffdd55', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(this.depth + 1);
    this.scene.tweens.add({
      targets: this.alert,
      y: this.y - 38,
      alpha: 0,
      duration: 700,
      onComplete: () => {
        this.alert?.destroy();
        this.alert = undefined;
      },
    });
  }

  protected think(time: number) {
    const d = this.distToPlayer();
    const a = this.angleToPlayer();
    const sees = this.playerTargetable() && d < Bandit.DETECT;
    switch (this.mode) {
      case 'patrol': {
        const moving = this.patrol(time, 26, 80);
        this.face(this.body.velocity.x, this.body.velocity.y);
        this.walkAnim(moving);
        if (sees) {
          this.showAlert();
          this.go('chase', 0);
        }
        break;
      }
      case 'chase': {
        const vx = Math.cos(a) * 54;
        const vy = Math.sin(a) * 54;
        this.body.setVelocity(vx, vy);
        this.face(vx, vy);
        this.walkAnim(true);
        if (!this.playerTargetable() || d > Bandit.DETECT * 1.7) this.go('patrol', 0);
        else if (d < Bandit.REACH) this.go('windup', 320);
        break;
      }
      case 'windup': {
        // preparo: adaga erguida, pisca em vermelho
        this.body.setVelocity(0, 0);
        this.face(Math.cos(a), Math.sin(a));
        this.anims.stop();
        this.setFrame(this.dir * Bandit.ROW + 10);
        if (Math.floor(time / 60) % 2) this.setTint(0xffa0a0);
        else this.restoreTint();
        if (time >= this.stateUntil) {
          this.restoreTint();
          this.strikeAngle = a;
          this.struck = false;
          this.play(`bandit-atk-${this.dir}`, true);
          this.go('strike', 300);
        }
        break;
      }
      case 'strike': {
        // investida curta e impacto no frame de contato
        const t = 300 - (this.stateUntil - time);
        const v = t < 120 ? 70 : 0;
        this.body.setVelocity(Math.cos(this.strikeAngle) * v, Math.sin(this.strikeAngle) * v);
        if (!this.struck && t >= 70) {
          this.struck = true;
          this.strike(this.strikeAngle);
        }
        if (time >= this.stateUntil) this.go('cooldown', 600);
        break;
      }
      case 'cooldown': {
        this.body.velocity.scale(0.8);
        this.walkAnim(false);
        if (time >= this.stateUntil) this.go(sees ? 'chase' : 'patrol', 0);
        break;
      }
    }
  }

  private strike(angle: number) {
    const p = this.scene.player;
    const d = Phaser.Math.Distance.Between(this.fx, this.fy, p.fx, p.fy);
    const diff = Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(this.fx, this.fy, p.fx, p.fy) - angle));
    if (d < Bandit.REACH + 10 && diff < Phaser.Math.DegToRad(80)) p.hurt(2 * this.dmgMul, this.fx, this.fy);
  }
}
