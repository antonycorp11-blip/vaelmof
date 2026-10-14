import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { Enemy } from './Enemy';

/**
 * Como o bicho ataca:
 * - lunge: investida longa com dano por contato (javali, aranha);
 * - slam: para, se prepara e esmaga o chão à frente (urso, golem);
 * - strike: bote curto e rápido com dano no fim (escorpião).
 */
export type AttackKind = 'lunge' | 'slam' | 'strike';

export interface BeastDef {
  texture: string;
  hp: number;
  /** Tamanho do corpo físico (px). */
  body: [number, number];
  walkSpeed: number;
  chaseSpeed: number;
  detect: number;
  /** Distância para começar o ataque. */
  reach: number;
  windup: number;
  attack: AttackKind;
  damage: number;
  /** lunge/strike: velocidade e duração do bote. */
  dash?: [number, number];
  /** slam: raio do esmagamento. */
  radius?: number;
  recover: number;
  /** 0..1: quanto o knockback dos golpes o afeta. */
  knockback: number;
  fx: number;
  barOffset: number;
}

type Mode = 'patrol' | 'chase' | 'windup' | 'attack' | 'recover';

/**
 * Inimigo genérico dos biomas: patrulha, persegue, avisa (pisca e muda de
 * pose) e ataca do seu jeito. Quadros da folha: 0–1 andar, 2 preparo,
 * 3 ataque, 4 dano. A arte olha para a esquerda.
 */
export class Beast extends Enemy {
  readonly fxColor: number;
  private mode: Mode = 'patrol';
  private until = 0;
  private angle0 = 0;
  private struck = false;

  constructor(
    scene: WorldScene,
    x: number,
    y: number,
    readonly def: BeastDef,
  ) {
    super(scene, x, y, def.texture, def.hp, def.body[0], def.body[1]);
    this.fxColor = def.fx;
    this.barOffset = def.barOffset;
    this.knockbackScale = def.knockback;
    this.play(`${def.texture}-walk`);
  }

  protected onHurt() {
    if (this.mode === 'patrol') this.go('chase', 0);
    // golpes interrompem o preparo dos bichos leves; os pesados aguentam
    if (this.mode === 'windup' && this.def.knockback > 0.5) this.go('recover', 400);
  }

  protected onRespawn() {
    this.go('patrol', 0);
  }

  private go(m: Mode, ms: number) {
    this.mode = m;
    this.until = this.scene.time.now + ms;
    this.contactDamage = m === 'attack' && this.def.attack === 'lunge' ? this.def.damage : 0;
    if (m !== 'windup') this.restoreTint();
    if (m === 'windup') {
      this.anims.stop();
      this.setFrame(2);
    } else if (m === 'attack') {
      this.anims.stop();
      this.setFrame(3);
      this.struck = false;
    } else if (!this.anims.isPlaying) this.play(`${this.def.texture}-walk`);
  }

  protected think(time: number) {
    const D = this.def;
    const d = this.distToPlayer();
    const sees = this.playerTargetable() && d < D.detect;
    switch (this.mode) {
      case 'patrol': {
        const moving = this.patrol(time, D.walkSpeed, 70);
        if (!moving) this.anims.pause();
        else this.anims.resume();
        if (this.body.velocity.x !== 0) this.setFlipX(this.body.velocity.x > 0);
        if (sees) this.go('chase', 0);
        break;
      }
      case 'chase': {
        this.anims.resume();
        const a = this.angleToPlayer();
        this.body.setVelocity(Math.cos(a) * D.chaseSpeed, Math.sin(a) * D.chaseSpeed);
        this.setFlipX(Math.cos(a) > 0);
        if (!this.playerTargetable() || d > D.detect * 1.7) this.go('patrol', 0);
        else if (d < D.reach) {
          this.angle0 = a;
          this.go('windup', D.windup);
        }
        break;
      }
      case 'windup': {
        this.body.setVelocity(0, 0);
        if (Math.floor(time / 70) % 2) this.setTint(0xff9090);
        else this.restoreTint();
        if (D.attack !== 'slam') this.angle0 = this.angleToPlayer();
        this.setFlipX(Math.cos(this.angle0) > 0);
        if (time >= this.until) this.go('attack', D.attack === 'slam' ? 260 : D.dash![1]);
        break;
      }
      case 'attack': {
        if (D.attack === 'slam') {
          this.body.setVelocity(0, 0);
          if (!this.struck) {
            this.struck = true;
            this.slam();
          }
        } else {
          const [v] = D.dash!;
          this.body.setVelocity(Math.cos(this.angle0) * v, Math.sin(this.angle0) * v);
          if (D.attack === 'strike' && !this.struck && time >= this.until - 40) {
            this.struck = true;
            const p = this.scene.player;
            if (Phaser.Math.Distance.Between(this.fx, this.fy, p.fx, p.fy) < 16) p.hurt(D.damage * this.dmgMul, this.fx, this.fy);
          }
          if (D.attack === 'lunge' && !this.body.blocked.none) this.until = 0;
        }
        if (time >= this.until) this.go('recover', D.recover);
        break;
      }
      case 'recover': {
        this.body.velocity.scale(0.82);
        if (time >= this.until) this.go(sees ? 'chase' : 'patrol', 0);
        break;
      }
    }
  }

  /** Esmagamento: dano em área à frente, poeira e tremor da câmera. */
  private slam() {
    const s = this.scene;
    const D = this.def;
    const cx = this.fx + Math.cos(this.angle0) * 10;
    const cy = this.fy + Math.sin(this.angle0) * 8;
    s.fx.burst(cx, cy - 2, D.fx, 12);
    const p = s.player;
    if (Phaser.Math.Distance.Between(cx, cy, p.fx, p.fy) < (D.radius ?? 20)) p.hurt(D.damage * this.dmgMul, this.fx, this.fy);
  }
}

/** Fichas dos inimigos de cada bioma. */
export const BEASTS: Record<string, BeastDef> = {
  boar: { texture: 'boar', hp: 7, body: [10, 6], walkSpeed: 22, chaseSpeed: 40, detect: 104, reach: 70, windup: 420, attack: 'lunge', damage: 2, dash: [215, 420], recover: 800, knockback: 0.7, fx: 0x8a6040, barOffset: 16 },
  bear: { texture: 'bear', hp: 14, body: [16, 8], walkSpeed: 18, chaseSpeed: 34, detect: 96, reach: 26, windup: 560, attack: 'slam', damage: 3, radius: 22, recover: 900, knockback: 0.35, fx: 0xe8f0ff, barOffset: 24 },
  golem: { texture: 'golem', hp: 18, body: [14, 8], walkSpeed: 12, chaseSpeed: 24, detect: 88, reach: 26, windup: 700, attack: 'slam', damage: 3, radius: 24, recover: 1100, knockback: 0.15, fx: 0xa8a59e, barOffset: 25 },
  spider: { texture: 'spider', hp: 5, body: [10, 6], walkSpeed: 30, chaseSpeed: 58, detect: 112, reach: 58, windup: 300, attack: 'lunge', damage: 2, dash: [240, 300], recover: 650, knockback: 1, fx: 0xb46cec, barOffset: 15 },
  scorpion: { texture: 'scorpion', hp: 6, body: [10, 6], walkSpeed: 24, chaseSpeed: 46, detect: 96, reach: 22, windup: 340, attack: 'strike', damage: 2, dash: [110, 160], recover: 600, knockback: 0.8, fx: 0xc87a3a, barOffset: 15 },
};
