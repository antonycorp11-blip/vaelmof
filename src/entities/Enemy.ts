import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { Creature } from './Creature';

const RESPAWN_MS = 45_000;

/**
 * Base dos inimigos: HP, dano por golpe/chama, piscar branco, knockback,
 * animação de morte e respawn no ponto de origem (longe do jogador).
 */
export abstract class Enemy extends Creature {
  maxHp: number;
  hp: number;
  dead = false;
  /** 0..1: quanto o knockback dos golpes empurra (bichos pesados resistem). */
  knockbackScale = 1;
  /** Dano causado ao encostar no jogador (0 = não causa). */
  contactDamage = 0;
  /** Altura (px acima de y) da barra de vida e do número de dano. */
  barOffset = 16;
  readonly homeX: number;
  readonly homeY: number;
  protected stunUntil = 0;
  private respawnAt = 0;
  /** Escala normal do sprite (a animação de morte achata a partir dela). */
  private baseScale = 1;
  abstract readonly fxColor: number;

  constructor(scene: WorldScene, x: number, y: number, texture: string, hp: number, bodyW = 10, bodyH = 6) {
    super(scene, x, y, texture, bodyW, bodyH);
    this.maxHp = hp;
    this.hp = hp;
    this.homeX = x;
    this.homeY = y;
  }

  get stunned(): boolean {
    return this.scene.time.now < this.stunUntil;
  }

  takeDamage(amount: number, fromX: number, fromY: number, knockback = 150) {
    if (this.dead) return;
    this.hp -= amount;
    this.onHurt();
    this.flashWhite();
    this.scene.fx.damageText(this.x, this.y - this.barOffset + 2, amount);
    const a = Phaser.Math.Angle.Between(fromX, fromY, this.fx, this.fy);
    this.body.setVelocity(Math.cos(a) * knockback * this.knockbackScale, Math.sin(a) * knockback * this.knockbackScale);
    this.stunUntil = this.scene.time.now + 220;
    if (this.hp <= 0) this.die();
  }

  protected onHurt() {}

  die() {
    this.dead = true;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.scene.fx.burst(this.x, this.y - 4, this.fxColor, 14);
    this.setTintFill(0xffffff);
    this.baseScale = this.scaleX;
    this.scene.tweens.add({
      targets: this,
      scaleX: this.baseScale * 1.5,
      scaleY: this.baseScale * 0.1,
      alpha: 0,
      angle: Phaser.Math.Between(-25, 25),
      duration: 380,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.setVisible(false);
        this.restoreTint();
        this.respawnAt = this.scene.time.now + RESPAWN_MS;
      },
    });
  }

  private tryRespawn(time: number) {
    if (!this.respawnAt || time < this.respawnAt) return;
    const p = this.scene.player;
    if (Phaser.Math.Distance.Between(p.x, p.y, this.homeX, this.homeY) < 260) {
      this.respawnAt = time + 5000;
      return;
    }
    this.respawnAt = 0;
    this.dead = false;
    this.hp = this.maxHp;
    this.body.enable = true;
    this.body.reset(this.homeX, this.homeY);
    this.setPosition(this.homeX, this.homeY);
    this.setScale(this.baseScale).setAngle(0).setAlpha(1).setVisible(true);
    this.onRespawn();
  }

  protected onRespawn() {}

  /** Chamado todo frame pela WorldScene. `active` = dentro do raio de simulação. */
  tick(time: number, delta: number, active: boolean) {
    if (this.dead) {
      this.tryRespawn(time);
      return;
    }
    // longe da câmera: física desligada (o mundo tem centenas de criaturas)
    if (!active) {
      if (this.body.enable) {
        this.body.setVelocity(0, 0);
        this.body.enable = false;
      }
      return;
    }
    if (!this.body.enable) this.body.enable = true;
    if (!this.stunned) this.think(time, delta);
    else this.body.velocity.scale(0.86);
    this.sortDepth();
  }

  protected abstract think(time: number, delta: number): void;

  protected distToPlayer(): number {
    const p = this.scene.player;
    return Phaser.Math.Distance.Between(this.fx, this.fy, p.fx, p.fy);
  }

  protected angleToPlayer(): number {
    const p = this.scene.player;
    return Phaser.Math.Angle.Between(this.fx, this.fy, p.fx, p.fy);
  }

  protected playerTargetable(): boolean {
    return !this.scene.player.dead;
  }

  /** Movimento de patrulha: vai até um ponto aleatório perto de casa e espera. */
  protected patrolTarget: Phaser.Math.Vector2 | null = null;
  protected patrolWaitUntil = 0;
  protected patrol(time: number, speed: number, radius: number): boolean {
    if (time < this.patrolWaitUntil) {
      this.body.setVelocity(0, 0);
      return false;
    }
    if (!this.patrolTarget) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.patrolTarget = new Phaser.Math.Vector2(this.homeX + Math.cos(a) * r, this.homeY + Math.sin(a) * r);
    }
    const dx = this.patrolTarget.x - this.x;
    const dy = this.patrolTarget.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 4 || this.body.blocked.left || this.body.blocked.right || this.body.blocked.up || this.body.blocked.down) {
      if (d < 4 || Math.random() < 0.05) {
        this.patrolTarget = null;
        this.patrolWaitUntil = time + Phaser.Math.Between(700, 2200);
      }
      if (d < 4) {
        this.body.setVelocity(0, 0);
        return false;
      }
    }
    this.body.setVelocity((dx / d) * speed, (dy / d) * speed);
    return true;
  }
}
