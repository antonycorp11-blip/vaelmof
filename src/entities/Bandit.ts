import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { Enemy } from './Enemy';

type BanditState = 'patrol' | 'chase' | 'windup' | 'strike' | 'cooldown';

/** Bandoleiro: patrulha a estrada e ataca de perto com uma adaga. */
export class Bandit extends Enemy {
  readonly fxColor = 0xc0392b;
  private mode: BanditState = 'patrol';
  private stateUntil = 0;
  private dir = 0;
  private alert?: Phaser.GameObjects.Text;
  static readonly DETECT = 118;
  static readonly REACH = 22;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'bandit', 8, 10, 6);
    this.play('bandit-walk-0');
  }

  protected onHurt() {
    if (this.mode === 'patrol') this.go('chase', 0);
    if (this.mode === 'windup') this.go('cooldown', 450);
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
      this.anims.stop();
      this.setFrame(this.dir * 4);
    }
  }

  private showAlert() {
    if (this.alert) return;
    this.alert = this.scene.add
      .text(this.x, this.y - 22, '!', { fontFamily: 'monospace', fontSize: '12px', color: '#ffdd55', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setResolution(4)
      .setDepth(this.depth + 1);
    this.scene.tweens.add({
      targets: this.alert,
      y: this.y - 28,
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
        this.body.setVelocity(0, 0);
        this.face(Math.cos(a), Math.sin(a));
        this.anims.stop();
        this.setFrame(this.dir * 4);
        if (Math.floor(time / 60) % 2) this.setTint(0xffa0a0);
        else this.clearTint();
        if (time >= this.stateUntil) {
          this.clearTint();
          this.strike(a);
          this.go('strike', 180);
        }
        break;
      }
      case 'strike': {
        this.body.setVelocity(0, 0);
        this.setFrame(this.dir * 4 + 3);
        if (time >= this.stateUntil) this.go('cooldown', 650);
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
    const s = this.scene;
    const fxs = s.add
      .sprite(this.fx + Math.cos(angle) * 10, this.fy - 4 + Math.sin(angle) * 10, 'slash', 0)
      .setRotation(angle)
      .setScale(0.8)
      .setTint(0xff7060)
      .setDepth(this.depth + 2);
    fxs.play('slash');
    fxs.once('animationcomplete', () => fxs.destroy());
    const p = s.player;
    const d = Phaser.Math.Distance.Between(this.fx, this.fy, p.fx, p.fy);
    const diff = Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(this.fx, this.fy, p.fx, p.fy) - angle));
    if (d < Bandit.REACH + 8 && diff < Phaser.Math.DegToRad(75)) p.hurt(2, this.fx, this.fy);
  }
}
