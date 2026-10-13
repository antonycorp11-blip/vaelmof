import type { WorldScene } from '../scenes/WorldScene';
import { Enemy } from './Enemy';

type WolfState = 'patrol' | 'stalk' | 'windup' | 'lunge' | 'recover';

/** Lobo: patrulha; ao avistar o jogador se aproxima, agacha e dá uma investida. */
export class Wolf extends Enemy {
  readonly fxColor = 0x8a8f99;
  private mode: WolfState = 'patrol';
  private stateUntil = 0;
  private lungeAngle = 0;
  static readonly DETECT = 112;
  static readonly LUNGE_RANGE = 62;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'wolf', 6, 12, 6);
    this.contactDamage = 0;
    this.play('wolf-walk');
  }

  get lunging(): boolean {
    return this.mode === 'lunge';
  }

  protected onHurt() {
    if (this.mode === 'windup' || this.mode === 'lunge') this.setState2('recover', 500);
    else if (this.mode === 'patrol') this.setState2('stalk', 0);
  }

  protected onRespawn() {
    this.setState2('patrol', 0);
  }

  private setState2(s: WolfState, ms: number) {
    this.mode = s;
    this.stateUntil = this.scene.time.now + ms;
    this.contactDamage = s === 'lunge' ? 2 : 0;
    if (s !== 'windup') this.restoreTint();
    if (s === 'windup') {
      this.anims.stop();
      this.setFrame(2);
    } else if (s === 'lunge') {
      this.anims.stop();
      this.setFrame(3);
    } else if (!this.anims.isPlaying) this.play('wolf-walk');
  }

  protected think(time: number) {
    const d = this.distToPlayer();
    const sees = this.playerTargetable() && d < Wolf.DETECT;
    switch (this.mode) {
      case 'patrol': {
        const moving = this.patrol(time, 28, 70);
        this.anims.timeScale = 0.8;
        if (!moving) this.anims.pause();
        else this.anims.resume();
        if (this.body.velocity.x !== 0) this.setFlipX(this.body.velocity.x > 0);
        if (sees) this.setState2('stalk', 0);
        break;
      }
      case 'stalk': {
        this.anims.resume();
        this.anims.timeScale = 1.4;
        const a = this.angleToPlayer();
        this.body.setVelocity(Math.cos(a) * 46, Math.sin(a) * 46);
        this.setFlipX(Math.cos(a) > 0);
        if (!this.playerTargetable() || d > Wolf.DETECT * 1.6) this.setState2('patrol', 0);
        else if (d < Wolf.LUNGE_RANGE) this.setState2('windup', 380);
        break;
      }
      case 'windup': {
        // pisca em vermelho como aviso antes do bote
        this.body.setVelocity(0, 0);
        if (Math.floor(time / 70) % 2) this.setTint(0xff9090);
        else this.restoreTint();
        this.lungeAngle = this.angleToPlayer();
        this.setFlipX(Math.cos(this.lungeAngle) > 0);
        if (time >= this.stateUntil) this.setState2('lunge', 330);
        break;
      }
      case 'lunge': {
        this.body.setVelocity(Math.cos(this.lungeAngle) * 235, Math.sin(this.lungeAngle) * 235);
        if (time >= this.stateUntil || this.body.blocked.none === false) this.setState2('recover', 750);
        break;
      }
      case 'recover': {
        this.body.velocity.scale(0.85);
        if (time >= this.stateUntil) this.setState2(sees ? 'stalk' : 'patrol', 0);
        break;
      }
    }
  }
}
