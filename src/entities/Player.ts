import Phaser from 'phaser';
import { PLAYER } from '../config';
import { consume, inputState } from '../input/InputState';
import type { WorldScene } from '../scenes/WorldScene';
import { Creature } from './Creature';
import { Flame } from './Flame';

type PlayerState = 'normal' | 'attack' | 'roll' | 'hurt' | 'dead';

interface Keys {
  up: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  attack: Phaser.Input.Keyboard.Key;
  dodge: Phaser.Input.Keyboard.Key;
  flame: Phaser.Input.Keyboard.Key;
}

/** Teren: movimento em 8 direções, Golpe, Esquiva e Chama. */
export class Player extends Creature {
  hp = PLAYER.maxHp;
  readonly maxHp = PLAYER.maxHp;
  state2: PlayerState = 'normal';
  /** Direção para onde Teren olha (unitário, 8 direções). */
  facing = new Phaser.Math.Vector2(0, 1);
  /** Linha do spritesheet: 0 baixo, 1 esquerda, 2 direita, 3 cima. */
  private dir = 0;
  private stateUntil = 0;
  private invulnUntil = 0;
  private lastAttack = -99999;
  private lastDodge = -99999;
  private lastFlame = -99999;
  private lastGhost = 0;
  private rollDir = new Phaser.Math.Vector2();
  private keys?: Keys;
  /** Buffer de entrada: ação pedida fica válida por alguns ms (toques rápidos não se perdem). */
  private buffered: Record<'attack' | 'dodge' | 'flame', number> = { attack: 0, dodge: 0, flame: 0 };
  readonly spawnX: number;
  readonly spawnY: number;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'teren', 8, 5);
    this.spawnX = x;
    this.spawnY = y;
    const kb = scene.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const k = (c: number) => kb.addKey(c, true, false);
      this.keys = {
        up: [k(K.W), k(K.UP)],
        down: [k(K.S), k(K.DOWN)],
        left: [k(K.A), k(K.LEFT)],
        right: [k(K.D), k(K.RIGHT)],
        attack: k(K.J),
        dodge: k(K.K),
        flame: k(K.L),
      };
      for (const action of ['attack', 'dodge', 'flame'] as const) this.keys[action].on('down', () => this.queue(action));
    }
    this.setFrame(0);
  }

  get dead(): boolean {
    return this.state2 === 'dead';
  }

  get invulnerable(): boolean {
    return this.state2 === 'roll' || this.state2 === 'dead' || this.scene.time.now < this.invulnUntil;
  }

  private readMove(): Phaser.Math.Vector2 {
    const v = new Phaser.Math.Vector2();
    const any = (ks: Phaser.Input.Keyboard.Key[]) => ks.some((key) => key.isDown);
    if (this.keys) {
      if (any(this.keys.left)) v.x -= 1;
      if (any(this.keys.right)) v.x += 1;
      if (any(this.keys.up)) v.y -= 1;
      if (any(this.keys.down)) v.y += 1;
    }
    let mag = v.lengthSq() > 0 ? 1 : 0;
    if (!mag) {
      v.set(inputState.touchX, inputState.touchY);
      mag = Math.min(1, v.length());
    }
    if (mag < 0.05) return v.set(0, 0);
    // quantiza em 8 direções (45°)
    const a = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) * (Math.PI / 4);
    return v.set(Math.cos(a) * mag, Math.sin(a) * mag);
  }

  private queue(action: 'attack' | 'dodge' | 'flame') {
    this.buffered[action] = this.scene.time.now + 200;
  }

  private pressed(action: 'attack' | 'dodge' | 'flame', time: number): boolean {
    if (consume(action)) this.queue(action);
    // segurar J repete o golpe
    if (action === 'attack' && this.keys?.attack.isDown) this.queue(action);
    return this.buffered[action] >= time;
  }

  private updateDir(x: number, y: number) {
    if (Math.abs(x) > 0.3) this.dir = x < 0 ? 1 : 2;
    else this.dir = y < 0 ? 3 : 0;
  }

  update(time: number) {
    const move = this.readMove();
    const wantAttack = this.pressed('attack', time);
    const wantDodge = this.pressed('dodge', time);
    const wantFlame = this.pressed('flame', time);
    const st = this.state2;

    inputState.cooldowns.attack = Phaser.Math.Clamp(1 - (time - this.lastAttack) / PLAYER.attack.cooldown, 0, 1);
    inputState.cooldowns.dodge = Phaser.Math.Clamp(1 - (time - this.lastDodge) / PLAYER.dodge.cooldown, 0, 1);
    inputState.cooldowns.flame = Phaser.Math.Clamp(1 - (time - this.lastFlame) / PLAYER.flame.cooldown, 0, 1);
    inputState.hp = this.hp;
    inputState.maxHp = this.maxHp;

    if (st === 'dead') {
      this.body.setVelocity(0, 0);
      return;
    }

    // piscar durante invulnerabilidade pós-dano
    this.setAlpha(time < this.invulnUntil && st !== 'roll' ? (Math.floor(time / 70) % 2 ? 0.35 : 1) : 1);

    if (st === 'roll') {
      this.body.setVelocity(this.rollDir.x * PLAYER.dodge.speed, this.rollDir.y * PLAYER.dodge.speed);
      if (time - this.lastGhost > 55) this.ghost(time);
      if (time >= this.stateUntil) this.endRoll();
      this.sortDepth();
      return;
    }
    if (st === 'hurt') {
      this.body.velocity.scale(0.86);
      if (time >= this.stateUntil) this.state2 = 'normal';
      this.sortDepth();
      return;
    }

    if (move.lengthSq() > 0) {
      this.facing.copy(move).normalize();
      if (st !== 'attack') this.updateDir(move.x, move.y);
    }

    // ações
    if (wantDodge && time - this.lastDodge >= PLAYER.dodge.cooldown) {
      this.startRoll(time, move);
      return;
    }
    if (wantFlame && st === 'normal' && time - this.lastFlame >= PLAYER.flame.cooldown) this.castFlame(time);
    if (wantAttack && st === 'normal' && time - this.lastAttack >= PLAYER.attack.cooldown) this.swing(time);

    const speedMul = this.state2 === 'attack' ? 0.35 : 1;
    this.body.setVelocity(move.x * PLAYER.speed * speedMul, move.y * PLAYER.speed * speedMul);

    if (this.state2 === 'attack') {
      this.anims.stop();
      this.setFrame(this.dir * 5 + 3);
      if (time >= this.stateUntil) this.state2 = 'normal';
    } else if (move.lengthSq() > 0) {
      const key = `teren-walk-${this.dir}`;
      if (this.anims.currentAnim?.key !== key || !this.anims.isPlaying) this.play(key, true);
      this.anims.timeScale = 0.6 + move.length() * 0.6;
    } else {
      this.anims.stop();
      this.setFrame(this.dir * 5);
    }
    this.sortDepth();
  }

  // ---------------------------------------------------------------- Golpe
  private swing(time: number) {
    this.lastAttack = time;
    this.buffered.attack = 0;
    this.state2 = 'attack';
    this.stateUntil = time + 170;
    const angle = Math.atan2(this.facing.y, this.facing.x);
    this.updateDir(this.facing.x, this.facing.y);
    const cx = this.fx;
    const cy = this.fy - 4;
    const s = this.scene;
    const slash = s.add
      .sprite(cx + Math.cos(angle) * 11, cy + Math.sin(angle) * 11, 'slash', 0)
      .setRotation(angle)
      .setDepth(this.depth + 5);
    slash.play('slash');
    slash.once('animationcomplete', () => slash.destroy());

    const A = PLAYER.attack;
    const half = Phaser.Math.DegToRad(A.arcDeg / 2);
    let hit = false;
    for (const e of s.enemies) {
      if (e.dead) continue;
      const d = Phaser.Math.Distance.Between(cx, cy + 4, e.fx, e.fy);
      if (d > A.range + 6) continue;
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(cx, cy + 4, e.fx, e.fy) - angle));
      if (diff <= half || d < 10) {
        e.takeDamage(A.damage, this.fx, this.fy, A.knockback);
        hit = true;
      }
    }
    if (hit) {
      s.cameras.main.shake(70, 0.0025);
      s.hitStop(45);
    }
  }

  // ---------------------------------------------------------------- Esquiva
  private startRoll(time: number, move: Phaser.Math.Vector2) {
    this.lastDodge = time;
    this.buffered.dodge = 0;
    this.state2 = 'roll';
    this.stateUntil = time + PLAYER.dodge.duration;
    this.rollDir.copy(move.lengthSq() > 0 ? move : this.facing).normalize();
    this.updateDir(this.rollDir.x, this.rollDir.y);
    this.play('teren-roll');
    this.setAlpha(1);
  }

  private endRoll() {
    this.state2 = 'normal';
    this.anims.stop();
    this.setFrame(this.dir * 5);
  }

  private ghost(time: number) {
    this.lastGhost = time;
    const g = this.scene.add
      .image(this.x, this.y, 'teren', this.frame.name)
      .setOrigin(this.originX, this.originY)
      .setAlpha(0.45)
      .setTint(0x9fd8ff)
      .setDepth(this.depth - 1);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  // ---------------------------------------------------------------- Chama
  private castFlame(time: number) {
    this.lastFlame = time;
    this.buffered.flame = 0;
    const a = Math.atan2(this.facing.y, this.facing.x);
    new Flame(this.scene, this.fx + Math.cos(a) * 8, this.fy - 4 + Math.sin(a) * 8, a);
    this.state2 = 'attack';
    this.stateUntil = time + 150;
  }

  // ---------------------------------------------------------------- Dano
  hurt(amount: number, fromX: number, fromY: number) {
    if (this.invulnerable) return;
    const s = this.scene;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = s.time.now + PLAYER.hurtInvuln;
    s.fx.damageText(this.x, this.y - 16, amount, '#ff6060');
    s.cameras.main.shake(120, 0.006);
    this.setTintFill(0xff4040);
    s.time.delayedCall(100, () => this.clearTint());
    const a = Phaser.Math.Angle.Between(fromX, fromY, this.fx, this.fy);
    this.body.setVelocity(Math.cos(a) * 150, Math.sin(a) * 150);
    if (this.hp <= 0) {
      this.die();
      return;
    }
    this.state2 = 'hurt';
    this.stateUntil = s.time.now + 180;
  }

  private die() {
    const s = this.scene;
    this.state2 = 'dead';
    this.body.setVelocity(0, 0);
    this.anims.stop();
    s.fx.burst(this.x, this.y - 4, 0x2f8a7e, 16);
    s.tweens.add({ targets: this, angle: 90, alpha: 0.6, duration: 400 });
    s.events.emit('player-died');
    s.time.delayedCall(1400, () => {
      s.cameras.main.fadeOut(400, 10, 8, 20);
      s.cameras.main.once('camerafadeoutcomplete', () => {
        this.body.reset(this.spawnX, this.spawnY);
        this.setPosition(this.spawnX, this.spawnY);
        this.setAngle(0).setAlpha(1);
        this.hp = this.maxHp;
        this.dir = 0;
        this.setFrame(0);
        this.state2 = 'normal';
        this.invulnUntil = s.time.now + 2000;
        s.cameras.main.fadeIn(500, 10, 8, 20);
      });
    });
  }
}
