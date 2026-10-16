import Phaser from 'phaser';
import { reachDist } from './Hittable';
import { PLAYER } from '../config';
import type { WorldScene } from '../scenes/WorldScene';
import { DEPTH } from './Creature';

/** Projétil da Chama: explode ao tocar inimigo/obstáculo ou no fim do alcance. */
export class Flame extends Phaser.GameObjects.Sprite {
  declare scene: WorldScene;
  private vx: number;
  private vy: number;
  private traveled = 0;
  private light: Phaser.GameObjects.Image;

  constructor(
    scene: WorldScene,
    x: number,
    y: number,
    angle: number,
    private mul = 1,
  ) {
    super(scene, x, y, 'flame', 0);
    scene.add.existing(this);
    this.setRotation(angle).setDepth(DEPTH.fx);
    this.play('flame-fly');
    this.vx = Math.cos(angle) * PLAYER.flame.speed;
    this.vy = Math.sin(angle) * PLAYER.flame.speed;
    this.light = scene.add
      .image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xff9a40)
      .setScale(0.9)
      .setDepth(DEPTH.lights);
    scene.flames.push(this);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    const dt = delta / 1000;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.traveled += Math.hypot(this.vx, this.vy) * dt;
    this.light.setPosition(this.x, this.y).setAlpha(0.35 + this.scene.dayNight.lightLevel * 0.5);
    if (Math.random() < 0.5) this.scene.fx.ember(this.x, this.y);
    const hitEnemy = this.scene.hostiles.some((e) => !e.dead && reachDist(this.x, this.y + 4, e) < 10);
    if (hitEnemy || this.traveled >= PLAYER.flame.range || this.scene.blocksProjectile(this.x, this.y + 4)) this.explode();
  }

  explode() {
    const s = this.scene;
    const R = PLAYER.flame.radius;
    for (const e of s.hostiles) {
      if (e.dead) continue;
      if (reachDist(this.x, this.y + 4, e) <= R) e.takeDamage(Math.max(1, Math.round(PLAYER.flame.damage * this.mul)), this.x, this.y, 190);
    }
    const boom = s.add.sprite(this.x, this.y, 'explosion', 0).setDepth(DEPTH.fx);
    boom.play('explosion');
    boom.once('animationcomplete', () => boom.destroy());
    s.fx.burst(this.x, this.y, 0xff9a2a, 12);
    const light = this.light;
    light.setScale(2.2).setAlpha(0.5 + s.dayNight.lightLevel * 0.5);
    s.tweens.add({ targets: light, alpha: 0, scale: 2.8, duration: 450, onComplete: () => light.destroy() });
    Phaser.Utils.Array.Remove(s.flames, this);
    this.destroy();
  }
}
