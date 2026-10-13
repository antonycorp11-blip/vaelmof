import Phaser from 'phaser';
import { PLAYER } from '../config';
import { consume, inputState } from '../input/InputState';
import type { WorldScene } from '../scenes/WorldScene';
import { Creature } from './Creature';
import { Flame } from './Flame';
import { HERO, HERO_SLASH, heroFrame, slashFrame } from './heroSheet';

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

/** Índice do quadro em `frames` (durações em ms) após `t` ms. */
function frameAt(frames: readonly number[], t: number): number {
  let acc = 0;
  for (let i = 0; i < frames.length; i++) {
    acc += frames[i];
    if (t < acc) return i;
  }
  return frames.length - 1;
}
const sum = (a: readonly number[]) => a.reduce((s, v) => s + v, 0);
const startOf = (a: readonly number[], i: number) => sum(a.slice(0, i));

/** Giro do finalizador: direções em sentido horário na tela (baixo, esquerda, cima, direita). */
const CW = [0, 1, 3, 2];

/**
 * Teren: herói humano montado em camadas LPC (corpo, roupa, capa, cabelo,
 * espada — ver scripts/hero/recipe.json). As animações de arte (andar, golpe,
 * estocada, magia, queda) vêm da folha; o código cuida do resto: tempos de cada
 * quadro sincronizados com o impacto, avanço no golpe, poeira nos passos,
 * rastro na esquiva, recuo ao tomar dano.
 */
export class Player extends Creature {
  hp = PLAYER.maxHp;
  readonly maxHp = PLAYER.maxHp;
  state2: PlayerState = 'normal';
  /** Direção para onde Teren olha (unitário, 8 direções de movimento). */
  facing = new Phaser.Math.Vector2(0, 1);
  /** 0 baixo, 1 esquerda, 2 direita, 3 cima. */
  private dir = 0;
  private stateUntil = 0;
  private stateStart = 0;
  private invulnUntil = 0;
  private combo = 0;
  private comboUntil = 0;
  private hitDone = true;
  private currentSwing: Swing = PLAYER.combo[0];
  private swingDur: number = sum(PLAYER.combo[0].frames);
  private swingHitAt = 0;
  private lastDodge = -99999;
  private lastFlame = -99999;
  private lastGhost = 0;
  private castRelease = 0;
  private rollDir = new Phaser.Math.Vector2();
  private keys?: Keys;
  /** Buffer de entrada: ação pedida fica válida por alguns ms (toques rápidos não se perdem). */
  private buffered: Record<'attack' | 'dodge' | 'flame', number> = { attack: 0, dodge: 0, flame: 0 };
  /** Sombra no chão. */
  private readonly shadow: Phaser.GameObjects.Image;
  /** Golpes com espada usam quadros maiores (128×128): sprite à parte, no lugar do corpo. */
  private readonly attackSprite: Phaser.GameObjects.Sprite;
  readonly spawnX: number;
  readonly spawnY: number;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'hero', 20, 10, heroFrame(HERO.rows.walk, 0, 0));
    const F = HERO.frame;
    this.setScale(HERO.scale).setOrigin(0.5, HERO.footY / F);
    this.body.setSize(20, 10);
    this.body.setOffset((F - 20) / 2, HERO.footY - 8);
    this.shadow = scene.add.image(x, y, 'shadow').setScale(0.95, 0.8).setAlpha(0.7);
    this.attackSprite = scene.add
      .sprite(x, y, 'hero-slash', 0)
      .setScale(HERO.scale)
      .setOrigin(0.5, HERO_SLASH.footY / HERO_SLASH.frame)
      .setVisible(false);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, () => {
      const attacking = this.attackSprite.visible;
      this.shadow.setPosition(this.x, this.y).setDepth(this.depth - 2).setVisible((this.visible || attacking) && this.state2 !== 'dead');
      if (attacking) this.attackSprite.setPosition(this.x, this.y).setDepth(this.depth).setAlpha(this.alpha);
    });
    // poeira nos passos: quadros em que um pé toca o chão
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: unknown, frame: Phaser.Animations.AnimationFrame) => {
      if (this.state2 === 'normal' && (frame.index === 2 || frame.index === 6)) this.dust(1);
    });
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
    this.stand();
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

  /** Parado: primeiro quadro do andar (de pé). */
  private stand() {
    this.anims.stop();
    this.setFrame(heroFrame(HERO.rows.walk, this.dir, 0));
  }

  private walk(speed: number) {
    const key = `hero-walk-${this.dir}`;
    if (this.anims.currentAnim?.key !== key || !this.anims.isPlaying) this.play(key, true);
    // a cadência acompanha a velocidade (joystick parcial = passos mais lentos)
    this.anims.timeScale = Math.max(0.45, speed);
  }

  /** Quadro da animação `row` conforme o tempo decorrido na ação. */
  private pose(row: number, frames: readonly number[], t: number) {
    this.setFrame(heroFrame(row, this.dir, frameAt(frames, t)));
  }

  /** Nuvenzinha de poeira nos pés. */
  private dust(n: number) {
    const s = this.scene;
    for (let i = 0; i < n; i++) {
      const p = s.add
        .image(this.x + Phaser.Math.Between(-3, 3), this.y - 1, 'pixel')
        .setTint(0xcbb89a)
        .setAlpha(0.75)
        .setScale(0.6)
        .setDepth(this.depth - 1);
      s.tweens.add({
        targets: p,
        x: p.x - this.facing.x * Phaser.Math.Between(2, 6) + Phaser.Math.Between(-2, 2),
        y: p.y - Phaser.Math.Between(2, 5),
        alpha: 0,
        scale: 1.1,
        duration: Phaser.Math.Between(260, 420),
        onComplete: () => p.destroy(),
      });
    }
  }

  update(time: number) {
    const move = this.readMove();
    const wantAttack = this.pressed('attack', time);
    const wantDodge = this.pressed('dodge', time);
    const wantFlame = this.pressed('flame', time);
    const st = this.state2;

    inputState.cooldowns.attack = st === 'attack' ? Phaser.Math.Clamp((this.stateUntil - time) / this.swingDur, 0, 1) : 0;
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
      if (time - this.lastGhost > 45) this.ghost(time);
      if (time >= this.stateUntil) {
        this.dust(3);
        this.toIdle();
      }
      this.sortDepth();
      return;
    }
    if (st === 'hurt') {
      this.body.velocity.scale(0.86);
      if (time >= this.stateUntil) this.toIdle();
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
    const canChain = st === 'attack' && this.combo < PLAYER.combo.length - 1 && time >= this.stateUntil - 120;
    if (wantAttack && (this.state2 === 'normal' || canChain)) this.swing(time);

    if (this.state2 === 'attack') {
      const S = this.currentSwing;
      const t = time - this.stateStart;
      const lunge = t > this.swingHitAt - 50 && t < this.swingHitAt + 50 ? S.lunge : 0;
      if (!this.hitDone && t >= this.swingHitAt) {
        this.hitDone = true;
        this.resolveHit(S);
      }
      this.body.setVelocity(this.facing.x * lunge + move.x * PLAYER.speed * 0.15, this.facing.y * lunge + move.y * PLAYER.speed * 0.15);
      this.attackPose(S, t);
      this.sortDepth();
      if (time >= this.stateUntil) this.toIdle();
      return;
    }
    if (this.state2 === 'cast') {
      this.body.setVelocity(move.x * PLAYER.speed * 0.2, move.y * PLAYER.speed * 0.2);
      this.pose(HERO.rows.cast, PLAYER.flame.frames, time - this.stateStart);
      if (this.castRelease && time >= this.castRelease) {
        this.castRelease = 0;
        const a = Math.atan2(this.facing.y, this.facing.x);
        new Flame(this.scene, this.fx + Math.cos(a) * 10, this.fy - 14 + Math.sin(a) * 5, a);
      }
      if (time >= this.stateUntil) this.toIdle();
    } else {
      this.body.setVelocity(move.x * PLAYER.speed, move.y * PLAYER.speed);
      if (move.lengthSq() > 0) this.walk(move.length());
      else this.stand();
    }
    this.sortDepth();
  }

  /** Quadro do golpe: varredura LPC; no giro, a varredura passa pelas 4 direções. */
  private attackPose(S: Swing, t: number) {
    const i = frameAt(S.frames, t);
    let dir = this.dir;
    let col = Math.min(i, 5);
    if (S.kind === 'spin') {
      if (i >= 3 && i <= 6) {
        dir = CW[(CW.indexOf(this.dir) + i - 2) % 4];
        col = 4;
      } else col = i < 3 ? i : 5;
    }
    this.attackSprite.setVisible(true).setFrame(slashFrame(dir, col));
    this.setVisible(false);
  }

  private endAttackPose() {
    this.attackSprite.setVisible(false);
    this.setVisible(true);
  }

  private toIdle() {
    this.endAttackPose();
    this.state2 = 'normal';
    this.setAngle(0).setAlpha(1);
    this.anims.timeScale = 1;
    this.stand();
  }

  // ---------------------------------------------------------------- Golpe (combo de 3)
  private swing(time: number) {
    const chaining = this.state2 === 'attack' || time < this.comboUntil;
    const step = chaining && this.combo < PLAYER.combo.length - 1 ? this.combo + 1 : 0;
    const S = PLAYER.combo[step];
    this.combo = step;
    this.currentSwing = S;
    this.swingDur = sum(S.frames);
    this.swingHitAt = startOf(S.frames, S.hit);
    this.stateStart = time;
    this.buffered.attack = 0;
    this.state2 = 'attack';
    this.stateUntil = time + this.swingDur;
    this.comboUntil = step < PLAYER.combo.length - 1 ? time + this.swingDur + PLAYER.comboWindow : 0;
    this.updateDir(this.facing.x, this.facing.y);
    this.anims.stop();
    this.hitDone = false;
  }

  private resolveHit(S: Swing) {
    const s = this.scene;
    const angle = Math.atan2(this.facing.y, this.facing.x);
    const cx = this.fx;
    const cy = this.fy;
    // o rastro da lâmina já vem na arte do golpe; o giro ganha um anel de cortes
    if (S.kind === 'spin') {
      for (let k = 0; k < 4; k++) {
        const a = angle + (k * Math.PI) / 2;
        s.time.delayedCall(k * 45, () => {
          const fx = s.add
            .sprite(this.fx + Math.cos(a) * 13, this.fy - 9 + Math.sin(a) * 8, 'slash', 0)
            .setRotation(a + Math.PI / 2)
            .setDepth(this.depth + 1)
            .setAlpha(0.85);
          fx.play('slash');
          fx.once('animationcomplete', () => fx.destroy());
        });
      }
    }
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
    this.stateStart = time;
    this.stateUntil = time + PLAYER.dodge.duration;
    this.rollDir.copy(move.lengthSq() > 0 ? move : this.facing).normalize();
    this.endAttackPose();
    this.updateDir(this.rollDir.x, this.rollDir.y);
    this.setAlpha(1);
    this.dust(4);
    // disparada: passos acelerados com rastro
    this.play(`hero-walk-${this.dir}`, true);
    this.anims.timeScale = 2.6;
  }

  private ghost(time: number) {
    this.lastGhost = time;
    const g = this.scene.add
      .image(this.x, this.y, 'hero', this.frame.name)
      .setOrigin(this.originX, this.originY)
      .setScale(this.scaleX, this.scaleY)
      .setAlpha(0.45)
      .setTintFill(0xbfe3ff)
      .setDepth(this.depth - 1);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  // ---------------------------------------------------------------- Chama
  private castFlame(time: number) {
    this.lastFlame = time;
    this.buffered.flame = 0;
    this.updateDir(this.facing.x, this.facing.y);
    this.anims.stop();
    this.state2 = 'cast';
    this.stateStart = time;
    this.castRelease = time + startOf(PLAYER.flame.frames, PLAYER.flame.release);
    this.stateUntil = time + sum(PLAYER.flame.frames);
    this.scene.fx.burst(this.x, this.y - 18, 0xffb040, 6);
  }

  // ---------------------------------------------------------------- Dano
  hurt(amount: number, fromX: number, fromY: number) {
    if (this.invulnerable) return;
    const s = this.scene;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = s.time.now + PLAYER.hurtInvuln;
    s.fx.damageText(this.x, this.y - 30, amount, '#ff6060');
    s.cameras.main.shake(120, 0.006);
    this.setTintFill(0xff4040);
    s.time.delayedCall(100, () => this.clearTint());
    const a = Phaser.Math.Angle.Between(fromX, fromY, this.fx, this.fy);
    this.body.setVelocity(Math.cos(a) * 150, Math.sin(a) * 150);
    this.castRelease = 0;
    this.endAttackPose();
    if (this.hp <= 0) {
      this.die();
      return;
    }
    this.state2 = 'hurt';
    this.stateUntil = s.time.now + 180;
    // recuo: quadro de "encolher" da queda, de frente para o golpe
    this.anims.stop();
    this.setFrame(HERO.rows.fall * HERO.cols + 1);
  }

  private die() {
    const s = this.scene;
    this.state2 = 'dead';
    this.body.setVelocity(0, 0);
    this.play('hero-fall', true);
    s.fx.burst(this.x, this.y - 12, 0xff6060, 10);
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
