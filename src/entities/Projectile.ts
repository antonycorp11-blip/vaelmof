import Phaser from 'phaser';
import { reachDist } from './Hittable';
import type { WorldScene } from '../scenes/WorldScene';
import { DEPTH } from './Creature';

export interface ProjectileDef {
  texture: 'arrow' | 'bolt';
  speed: number;
  range: number;
  damage: number;
  knockback: number;
  /** Atravessa inimigos (acerta cada um uma vez) em vez de parar no primeiro. */
  pierce?: boolean;
  /** Cor das faíscas e do brilho. */
  color: number;
  /** Deixa o alvo lento (gelo). */
  slow?: { k: number; ms: number };
  /** Tom do sprite (o raio de gelo usa o do raio arcano). */
  tint?: number;
}

/** Flecha do arco / raio arcano do cajado: voa reto e acerta o primeiro inimigo. */
export class Projectile extends Phaser.GameObjects.Sprite {
  declare scene: WorldScene;
  private vx: number;
  private vy: number;
  private traveled = 0;
  private hitSet = new Set<unknown>();
  private light?: Phaser.GameObjects.Image;

  constructor(
    scene: WorldScene,
    x: number,
    y: number,
    angle: number,
    private def: ProjectileDef,
    /** Multiplicador de dano (atributos e fortalecimentos do herói). */
    private mul = 1,
  ) {
    super(scene, x, y, def.texture, 0);
    scene.add.existing(this);
    this.setRotation(angle).setDepth(DEPTH.fx);
    if (def.texture === 'bolt') {
      this.play('bolt-fly');
      this.light = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(def.color).setScale(0.6).setDepth(DEPTH.lights);
    } else this.setScale(0.8);
    if (def.tint !== undefined) this.setTint(def.tint);
    if (def.slow) this.setScale(1.25, 0.9);
    this.vx = Math.cos(angle) * def.speed;
    this.vy = Math.sin(angle) * def.speed;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    const dt = delta / 1000;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.traveled += this.def.speed * dt;
    this.light?.setPosition(this.x, this.y).setAlpha(0.3 + this.scene.dayNight.lightLevel * 0.5);
    if (this.def.texture === 'bolt' || this.def.pierce) this.scene.mountFx.projectileTrail(this.x, this.y, this.def.color, this.def.texture, !!this.def.slow || !!this.def.pierce);
    for (const e of this.scene.hostiles) {
      if (e.dead || this.hitSet.has(e)) continue;
      if (reachDist(this.x, this.y + 6, e) < 11) {
        this.hitSet.add(e);
        e.takeDamage(Math.max(1, Math.round(this.def.damage * this.mul)), this.x - this.vx * 0.05, this.y - this.vy * 0.05, this.def.knockback);
        if (this.def.slow) e.slow(this.def.slow.ms);
        this.scene.fx.impact(e.fx, e.fy - 8);
        this.scene.fx.burst(this.x, this.y, this.def.color, 5);
        this.scene.mountFx.projectileImpact(this.x, this.y, this.def.color, this.def.texture, !!this.def.slow || (this.def.pierce && this.def.damage >= 5));
        if (!this.def.pierce) return this.end();
      }
    }
    if (this.traveled >= this.def.range || this.scene.blocksProjectile(this.x, this.y + 6)) this.end();
  }

  private end() {
    this.scene.fx.burst(this.x, this.y, this.def.color, 3);
    this.scene.mountFx.projectileImpact(this.x, this.y, this.def.color, this.def.texture);
    this.light?.destroy();
    this.destroy();
  }
}
