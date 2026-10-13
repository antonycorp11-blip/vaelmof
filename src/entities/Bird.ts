import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { DEPTH } from './Creature';

/** Pássaro: sobrevoa o mapa em linha levemente ondulada, sem colisão. */
export class Bird extends Phaser.GameObjects.Sprite {
  declare scene: WorldScene;
  private shadow: Phaser.GameObjects.Image;
  private heading = 0;
  private speed = 40;
  private phase = Math.random() * 10;
  private altitude = 28;

  constructor(scene: WorldScene, private worldW: number, private worldH: number) {
    super(scene, 0, 0, 'bird', 0);
    scene.add.existing(this);
    this.setDepth(DEPTH.birds);
    this.shadow = scene.add.image(0, 0, 'shadow').setDepth(DEPTH.birdShadow).setScale(0.6, 0.5).setAlpha(0.5);
    this.play({ key: 'bird-flap', startFrame: Math.floor(Math.random() * 3) });
    this.respawn(true);
  }

  /** Reposiciona numa borda (ou em qualquer ponto, no início) com rumo para dentro do mapa. */
  respawn(anywhere = false) {
    const W = this.worldW;
    const H = this.worldH;
    if (anywhere) {
      this.setPosition(Math.random() * W, Math.random() * H);
      this.heading = Math.random() * Math.PI * 2;
    } else {
      const side = Math.floor(Math.random() * 4);
      const m = 30;
      const pos = [
        [Math.random() * W, -m],
        [W + m, Math.random() * H],
        [Math.random() * W, H + m],
        [-m, Math.random() * H],
      ][side];
      this.setPosition(pos[0], pos[1]);
      const toCenter = Phaser.Math.Angle.Between(pos[0], pos[1], W / 2 + (Math.random() - 0.5) * W * 0.6, H / 2 + (Math.random() - 0.5) * H * 0.6);
      this.heading = toCenter;
    }
    this.speed = Phaser.Math.Between(32, 52);
    this.altitude = Phaser.Math.Between(22, 40);
    this.anims.timeScale = 0.8 + Math.random() * 0.5;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    const dt = delta / 1000;
    this.phase += dt;
    const h = this.heading + Math.sin(this.phase * 0.9) * 0.35;
    this.x += Math.cos(h) * this.speed * dt;
    this.y += Math.sin(h) * this.speed * dt;
    this.setRotation(h);
    this.shadow.setPosition(this.x + this.altitude * 0.35, this.y + this.altitude);
    const m = 60;
    if (this.x < -m || this.y < -m || this.x > this.worldW + m || this.y > this.worldH + m) this.respawn();
  }
}
