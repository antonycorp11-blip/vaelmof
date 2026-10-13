import type { WorldScene } from '../scenes/WorldScene';
import { Enemy } from './Enemy';

/** Limo: persegue o jogador aos pulinhos quando ele entra no raio de detecção. */
export class Slime extends Enemy {
  readonly fxColor = 0x6ad04a;
  private hopPhase = Math.random() * 1000;
  private chasing = false;
  static readonly DETECT = 88;
  static readonly LOSE = 150;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'slime', 4, 10, 6);
    this.contactDamage = 1;
    this.play({ key: 'slime-hop', startFrame: Math.floor(Math.random() * 4) });
  }

  protected think(time: number, delta: number) {
    const d = this.distToPlayer();
    if (!this.chasing && d < Slime.DETECT && this.playerTargetable()) this.chasing = true;
    if (this.chasing && (d > Slime.LOSE || !this.playerTargetable())) this.chasing = false;

    // move-se apenas na fase "no ar" do pulo
    this.hopPhase = (this.hopPhase + delta) % 700;
    const airborne = this.hopPhase < 380;
    this.anims.timeScale = this.chasing ? 1.6 : 1;
    if (this.chasing) {
      const a = this.angleToPlayer();
      const s = airborne ? 52 : 6;
      this.body.setVelocity(Math.cos(a) * s, Math.sin(a) * s);
      this.setFlipX(Math.cos(a) > 0);
    } else if (airborne) {
      this.patrol(time, 16, 40);
    } else {
      this.body.setVelocity(0, 0);
    }
  }
}
