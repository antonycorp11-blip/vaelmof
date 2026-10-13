import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { Creature } from './Creature';

export interface AnimalTraits {
  wanderSpeed: number;
  fleeSpeed: number;
  /** Distância do jogador que dispara a fuga (px). */
  fleeRadius: number;
  /** Raio de vagar em torno do ponto de origem (px). */
  leash: number;
  walkAnim: string;
  idleFrame: number;
  alertFrame: number;
  runAnim: string;
  /** Tempo de "susto" antes de começar a fugir (ms). */
  reaction: number;
}

type Mode = 'idle' | 'wander' | 'alert' | 'flee';

/** Fauna pacífica: vaga aleatoriamente e foge quando o jogador se aproxima. */
export class Animal extends Creature {
  private mode: Mode = 'idle';
  private until = 0;
  private dirV = new Phaser.Math.Vector2();
  private home: Phaser.Math.Vector2;

  constructor(scene: WorldScene, x: number, y: number, texture: string, readonly traits: AnimalTraits) {
    super(scene, x, y, texture, 10, 5);
    this.home = new Phaser.Math.Vector2(x, y);
    this.until = scene.time.now + Math.random() * 2000;
    this.setFrame(traits.idleFrame);
  }

  private go(mode: Mode, ms: number) {
    this.mode = mode;
    this.until = this.scene.time.now + ms;
  }

  tick(time: number, active: boolean) {
    if (!active) {
      this.body.setVelocity(0, 0);
      return;
    }
    const t = this.traits;
    const p = this.scene.player;
    const d = Phaser.Math.Distance.Between(this.fx, this.fy, p.fx, p.fy);
    const blocked = !this.body.blocked.none;

    if (d < t.fleeRadius && !p.dead && this.mode !== 'flee' && this.mode !== 'alert') {
      this.go('alert', t.reaction);
      this.body.setVelocity(0, 0);
      this.anims.stop();
      this.setFrame(t.alertFrame);
      this.setFlipX(p.fx > this.fx);
    }

    switch (this.mode) {
      case 'idle':
        this.body.setVelocity(0, 0);
        if (time > this.until) {
          // escolhe direção; se estiver longe de casa, tende a voltar
          const away = Phaser.Math.Distance.Between(this.x, this.y, this.home.x, this.home.y);
          const a =
            away > t.leash
              ? Phaser.Math.Angle.Between(this.x, this.y, this.home.x, this.home.y) + (Math.random() - 0.5)
              : Math.random() * Math.PI * 2;
          this.dirV.setToPolar(a, 1);
          this.go('wander', Phaser.Math.Between(700, 2200));
          this.play(t.walkAnim, true);
        }
        break;
      case 'wander':
        this.body.setVelocity(this.dirV.x * t.wanderSpeed, this.dirV.y * t.wanderSpeed);
        this.setFlipX(this.dirV.x > 0);
        if (time > this.until || blocked) {
          this.go('idle', Phaser.Math.Between(900, 3500));
          this.anims.stop();
          this.setFrame(Math.random() < 0.5 ? t.idleFrame : t.alertFrame === 2 ? 2 : t.idleFrame);
        }
        break;
      case 'alert':
        if (time > this.until) {
          const a = Phaser.Math.Angle.Between(p.fx, p.fy, this.fx, this.fy) + (Math.random() - 0.5) * 0.6;
          this.dirV.setToPolar(a, 1);
          this.go('flee', 600);
          this.play(t.runAnim, true);
        }
        break;
      case 'flee': {
        if (blocked) {
          // contorna obstáculo girando ~90° para o lado mais afastado do jogador
          const a = Math.atan2(this.dirV.y, this.dirV.x);
          const left = a + Math.PI / 2;
          const right = a - Math.PI / 2;
          const dl = Phaser.Math.Distance.Between(this.fx + Math.cos(left) * 8, this.fy + Math.sin(left) * 8, p.fx, p.fy);
          const dr = Phaser.Math.Distance.Between(this.fx + Math.cos(right) * 8, this.fy + Math.sin(right) * 8, p.fx, p.fy);
          this.dirV.setToPolar(dl > dr ? left : right, 1);
        } else if (time > this.until) {
          const a = Phaser.Math.Angle.Between(p.fx, p.fy, this.fx, this.fy);
          this.dirV.setToPolar(a + (Math.random() - 0.5) * 0.5, 1);
          this.until = time + 500;
        }
        this.body.setVelocity(this.dirV.x * t.fleeSpeed, this.dirV.y * t.fleeSpeed);
        this.setFlipX(this.dirV.x > 0);
        if (d > t.fleeRadius * 2.2) {
          this.go('idle', Phaser.Math.Between(600, 1600));
          this.anims.stop();
          this.setFrame(t.idleFrame);
        }
        break;
      }
    }
    this.sortDepth();
  }
}
