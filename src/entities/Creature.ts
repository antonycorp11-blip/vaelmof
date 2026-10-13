import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';

export const DEPTH = {
  ground: 0,
  water: 1,
  cliffs: 2,
  decor: 3,
  birdShadow: 6,
  entities: 10, // + y (ordenação por profundidade)
  canopy: 3000,
  birds: 3100,
  weather: 3500,
  ambient: 4000,
  lights: 4100,
  fx: 4200,
} as const;

/** Sprite com corpo físico nos "pés" e ordenação por y. */
export class Creature extends Phaser.Physics.Arcade.Sprite {
  declare scene: WorldScene;
  declare body: Phaser.Physics.Arcade.Body;

  constructor(scene: WorldScene, x: number, y: number, texture: string, bodyW = 10, bodyH = 6, frame: string | number = 0) {
    super(scene, x, y, texture, frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 0.75);
    this.body.setSize(bodyW, bodyH);
    this.body.setOffset((this.width - bodyW) / 2, this.height - bodyH - 2);
    this.body.setCollideWorldBounds(true);
    this.sortDepth();
  }

  /** Centro do corpo físico (pés). */
  get fx(): number {
    return this.body.center.x;
  }

  get fy(): number {
    return this.body.center.y;
  }

  sortDepth() {
    this.setDepth(DEPTH.entities + this.y);
  }

  /** Tom fixo da variante (ex.: lobo da neve); -1 = sem tom. */
  baseTint = -1;

  /** Volta ao tom normal da criatura (após piscar). */
  restoreTint() {
    if (this.baseTint >= 0) this.setTint(this.baseTint);
    else this.clearTint();
  }

  flashWhite(ms = 90) {
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(ms, () => {
      if (this.active) this.restoreTint();
    });
  }
}
