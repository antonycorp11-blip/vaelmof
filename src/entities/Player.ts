import Phaser from 'phaser';
import { PLAYER } from '../config';
import { consume, inputState } from '../input/InputState';
import type { WorldScene } from '../scenes/WorldScene';
import { Creature } from './Creature';
import { Flame } from './Flame';

type PlayerState = 'normal' | 'attack' | 'cast' | 'roll' | 'hurt' | 'dead';
type Swing = (typeof PLAYER.combo)[number];

interface Keys {
  up: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  attack: Phaser.Input.Keyboard.Key;
  dodge: Phaser.Input.Keyboard.Key;
  flame: Phaser.Input.Keyboard.Key;
}

/** Quadros do teren.png: 6 colunas por direção (0 baixo, 1 esquerda, 2 direita, 3 cima). */
const COLS = 6;
const SWORD_ANGLES = 32;
/** Ombro da mão da espada, relativo aos pés, por direção. */
const SHOULDER: [number, number][] = [
  [-6, -16],
  [-3, -16],
  [3, -16],
  [6, -17],
];

/**
 * Teren: sprite desenhado à mão (scripts/hero2) com a espada como peça
 * separada (teren-sword.png, 32 ângulos), que aparece nos golpes.
 */
export class Player extends Creature {
  hp = PLAYER.maxHp;
  readonly maxHp = PLAYER.maxHp;
  state2: PlayerState = 'normal';
  /** Direção para onde Teren olha (unitário, 8 direções de movimento). */
  facing = new Phaser.Math.Vector2(0, 1);
  /** Linha do sprite: 0 baixo, 1 esquerda, 2 direita, 3 cima. */
  private dir = 0;
  private stateUntil = 0;
  private invulnUntil = 0;
  private combo = 0;
  private comboUntil = 0;
  private hitDone = true;
  private swingStart = 0;
  private swingAngle = 90;
  private currentSwing: Swing = PLAYER.combo[0];
  private lastDodge = -99999;
  private lastFlame = -99999;
  private lastGhost = 0;
  private castRelease = 0;
  private rollDir = new Phaser.Math.Vector2();
  private keys?: Keys;
  /** Buffer de entrada: ação pedida fica válida por alguns ms (toques rápidos não se perdem). */
  private buffered: Record<'attack' | 'dodge' | 'flame', number> = { attack: 0, dodge: 0, flame: 0 };
  /** Arma equipada (camada separada; trocar a textura troca a arma). */
  readonly sword: Phaser.GameObjects.Sprite;
  readonly spawnX: number;
  readonly spawnY: number;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'teren', 10, 6, 0);
    // quadro 32×40 com os pés na linha 37
    this.setOrigin(0.5, 37 / 40);
    this.body.setOffset(11, 32);
    this.sword = scene.add.sprite(x, y, 'teren-sword', 0).setVisible(false);
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
    this.play('teren-idle-0');
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

  private anim(name: 'idle' | 'walk') {
    const key = `teren-${name}-${this.dir}`;
    if (this.anims.currentAnim?.key !== key || !this.anims.isPlaying) this.play(key, true);
  }

  private still() {
    this.anims.stop();
    this.setFrame(this.dir * COLS);
  }

  update(time: number) {
    const move = this.readMove();
    const wantAttack = this.pressed('attack', time);
    const wantDodge = this.pressed('dodge', time);
    const wantFlame = this.pressed('flame', time);
    const st = this.state2;

    inputState.cooldowns.attack = st === 'attack' ? Phaser.Math.Clamp((this.stateUntil - time) / this.currentSwing.dur, 0, 1) : 0;
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
      if (time >= this.stateUntil) this.toIdle();
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
      if (st === 'normal') this.updateDir(move.x, move.y);
    }

    // ações — a esquiva cancela golpes; o golpe pode ser encadeado no fim da recuperação
    if (wantDodge && time - this.lastDodge >= PLAYER.dodge.cooldown) {
      this.startRoll(time, move);
      return;
    }
    const flameOk = st === 'normal' || (st === 'attack' && this.hitDone);
    if (wantFlame && flameOk && time - this.lastFlame >= PLAYER.flame.cooldown) this.castFlame(time);
    const canChain = st === 'attack' && this.combo < PLAYER.combo.length - 1 && time >= this.stateUntil - 110;
    if (wantAttack && (this.state2 === 'normal' || canChain)) this.swing(time);

    if (this.state2 === 'attack') {
      const S = this.currentSwing;
      const t = time - this.swingStart;
      const lunge = t > S.hit - 60 && t < S.hit + 40 ? S.lunge : 0;
      if (!this.hitDone && t >= S.hit) {
        this.hitDone = true;
        this.resolveHit(S);
      }
      this.body.setVelocity(this.facing.x * lunge + move.x * PLAYER.speed * 0.15, this.facing.y * lunge + move.y * PLAYER.speed * 0.15);
      this.sortDepth();
      this.updateSword(t / S.dur);
      if (time >= this.stateUntil) this.toIdle();
      return;
    }
    if (this.state2 === 'cast') {
      this.body.setVelocity(move.x * PLAYER.speed * 0.2, move.y * PLAYER.speed * 0.2);
      if (this.castRelease && time >= this.castRelease) {
        this.castRelease = 0;
        const a = Math.atan2(this.facing.y, this.facing.x);
        new Flame(this.scene, this.fx + Math.cos(a) * 10, this.fy - 14 + Math.sin(a) * 8, a);
      }
      if (time >= this.stateUntil) this.toIdle();
    } else {
      this.body.setVelocity(move.x * PLAYER.speed, move.y * PLAYER.speed);
      if (move.lengthSq() > 0) {
        this.anim('walk');
        // ritmo dos passos acompanha a velocidade (joystick parcial = passos mais lentos)
        this.anims.timeScale = Math.max(0.4, move.length());
      } else {
        this.anim('idle');
        this.anims.timeScale = 1;
      }
    }
    this.sortDepth();
  }

  private toIdle() {
    this.state2 = 'normal';
    this.sword.setVisible(false);
    this.setAngle(0).setScale(1);
    this.anim('idle');
  }

  // ---------------------------------------------------------------- Golpe (combo de 3)
  private swing(time: number) {
    const chaining = this.state2 === 'attack' || time < this.comboUntil;
    const step = chaining && this.combo < PLAYER.combo.length - 1 ? this.combo + 1 : 0;
    const S = PLAYER.combo[step];
    this.combo = step;
    this.currentSwing = S;
    this.swingStart = time;
    this.buffered.attack = 0;
    this.state2 = 'attack';
    this.stateUntil = time + S.dur;
    this.comboUntil = step < PLAYER.combo.length - 1 ? time + S.dur + PLAYER.comboWindow : 0;
    this.updateDir(this.facing.x, this.facing.y);
    this.swingAngle = Phaser.Math.RadToDeg(Math.atan2(this.facing.y, this.facing.x));
    this.still();
    this.hitDone = false;
    this.updateSword(0);
  }

  /** Posiciona a espada ao longo do golpe (k = 0..1 da duração). */
  private updateSword(k: number) {
    const S = this.currentSwing;
    const ease = 1 - Math.pow(1 - Math.min(1, k / 0.55), 3);
    let rel: number;
    let r: number;
    if (S.kind === 'thrust') {
      rel = 0;
      r = k < 0.3 ? 3 - k * 6 : k < 0.6 ? 1 + (k - 0.3) * 40 : 13 - (k - 0.6) * 12;
    } else {
      rel = S.from + (S.to - S.from) * ease;
      r = 6;
    }
    const ang = this.swingAngle + rel;
    const [sx, sy] = SHOULDER[this.dir];
    const a = Phaser.Math.DegToRad(ang);
    const frame = ((Math.round((ang / 360) * SWORD_ANGLES) % SWORD_ANGLES) + SWORD_ANGLES) % SWORD_ANGLES;
    this.sword
      .setVisible(true)
      .setFrame(frame)
      .setPosition(Math.round(this.x + sx + Math.cos(a) * r), Math.round(this.y + sy + Math.sin(a) * r * 0.8));
    // atrás do corpo quando olha para cima ou a lâmina aponta para longe
    const behind = this.dir === 3 || Math.sin(a) < -0.45;
    this.sword.setDepth(this.depth + (behind ? -0.5 : 0.5));
  }

  private resolveHit(S: Swing) {
    const s = this.scene;
    const angle = Math.atan2(this.facing.y, this.facing.x);
    const cx = this.fx;
    const cy = this.fy;
    // arco de corte (achatado na estocada)
    const fx = s.add
      .sprite(cx + Math.cos(angle) * 12, cy - 10 + Math.sin(angle) * 10, 'slash', 0)
      .setRotation(angle)
      .setDepth(this.depth + 1)
      .setFlipY(S.from > S.to);
    if (S.kind === 'thrust') fx.setScale(1.2, 0.45);
    fx.play('slash');
    fx.once('animationcomplete', () => fx.destroy());
    const half = Phaser.Math.DegToRad(S.arcDeg / 2);
    let hit = false;
    for (const e of s.enemies) {
      if (e.dead) continue;
      const d = Phaser.Math.Distance.Between(cx, cy, e.fx, e.fy);
      if (d > S.range + 6) continue;
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(cx, cy, e.fx, e.fy) - angle));
      if (diff <= half || d < 10) {
        e.takeDamage(S.damage, this.fx, this.fy, S.knockback);
        s.fx.burst((e.fx + cx) / 2 + (e.fx - cx) * 0.3, e.fy - 6, 0xffffff, 5);
        hit = true;
      }
    }
    if (hit) {
      const finisher = S === PLAYER.combo[PLAYER.combo.length - 1];
      s.cameras.main.shake(finisher ? 120 : 70, finisher ? 0.005 : 0.0025);
      s.hitStop(finisher ? 80 : 45);
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
    this.sword.setVisible(false);
    this.still();
    this.setAlpha(1);
    // cambalhota: giro completo com o corpo encolhido
    const spin = this.rollDir.x < 0 ? -360 : 360;
    this.scene.tweens.add({ targets: this, angle: spin, duration: PLAYER.dodge.duration, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({ targets: this, scaleY: 0.75, scaleX: 1.08, duration: PLAYER.dodge.duration / 2, yoyo: true });
  }

  private ghost(time: number) {
    this.lastGhost = time;
    const g = this.scene.add
      .image(this.x, this.y, 'teren', this.frame.name)
      .setOrigin(this.originX, this.originY)
      .setAngle(this.angle)
      .setAlpha(0.4)
      .setTint(0x9fd8ff)
      .setDepth(this.depth - 1);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  // ---------------------------------------------------------------- Chama
  private castFlame(time: number) {
    this.lastFlame = time;
    this.buffered.flame = 0;
    this.updateDir(this.facing.x, this.facing.y);
    this.sword.setVisible(false);
    this.still();
    this.state2 = 'cast';
    this.castRelease = time + 90;
    this.stateUntil = time + 240;
    const a = Math.atan2(this.facing.y, this.facing.x);
    this.scene.fx.burst(this.x + Math.cos(a) * 8, this.y - 14, 0xffb040, 6);
  }

  // ---------------------------------------------------------------- Dano
  hurt(amount: number, fromX: number, fromY: number) {
    if (this.invulnerable) return;
    const s = this.scene;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = s.time.now + PLAYER.hurtInvuln;
    s.fx.damageText(this.x, this.y - 38, amount, '#ff6060');
    s.cameras.main.shake(120, 0.006);
    this.setTintFill(0xff4040);
    s.time.delayedCall(100, () => this.clearTint());
    const a = Phaser.Math.Angle.Between(fromX, fromY, this.fx, this.fy);
    this.body.setVelocity(Math.cos(a) * 150, Math.sin(a) * 150);
    this.sword.setVisible(false);
    this.castRelease = 0;
    if (this.hp <= 0) {
      this.die();
      return;
    }
    this.state2 = 'hurt';
    this.stateUntil = s.time.now + 180;
    this.still();
  }

  private die() {
    const s = this.scene;
    this.state2 = 'dead';
    this.body.setVelocity(0, 0);
    this.anims.stop();
    s.fx.burst(this.x, this.y - 10, 0x36507e, 16);
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
        this.toIdle();
        this.invulnUntil = s.time.now + 2000;
        s.cameras.main.fadeIn(500, 10, 8, 20);
      });
    });
  }
}
