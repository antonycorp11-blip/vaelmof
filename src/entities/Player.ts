import Phaser from 'phaser';
import { PLAYER } from '../config';
import { consume, inputState } from '../input/InputState';
import type { WorldScene } from '../scenes/WorldScene';
import { Creature } from './Creature';
import { Flame } from './Flame';
import { animTiming, HERO_META_KEY, HeroRig, heroTexture, type HeroMeta } from './HeroRig';

type PlayerState = 'normal' | 'attack' | 'cast' | 'roll' | 'hurt' | 'dead';

type Swing = (typeof PLAYER.combo)[number] & { dur: number; hit: number };

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
  /** Direção do sprite: 0 S, 1 SO, 2 O, 3 NO, 4 N, 5 NE, 6 L, 7 SE. */
  private dir = 0;
  readonly rig: HeroRig;
  private readonly meta: HeroMeta;
  private readonly swings: Swing[];
  private castRelease = 0;
  private castAngle = 0;
  private stateUntil = 0;
  private invulnUntil = 0;
  private combo = 0;
  private comboUntil = 0;
  private hitDone = true;
  private swingStart = 0;
  private currentSwing!: Swing;
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
    const meta = scene.cache.json.get(HERO_META_KEY) as HeroMeta;
    super(scene, x, y, heroTexture('body', meta.loadout.body), 8, 5, 'idle_0_0');
    this.meta = meta;
    // arte com o dobro da densidade do mapa: escala 0,5, pés em meta.feet
    const [fx, fy] = meta.feet;
    this.setScale(meta.scale);
    this.setOrigin(fx / meta.frame.w, fy / meta.frame.h);
    this.body.setSize(16, 10);
    this.body.setOffset(fx - 8, fy - 6);
    this.rig = new HeroRig(scene, this, meta);
    this.swings = PLAYER.combo.map((c) => {
      const t = animTiming(meta, c.anim, meta.anims[c.anim].hit);
      return { ...c, dur: t.total, hit: t.at };
    });
    this.currentSwing = this.swings[0];
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
    this.play('hero-idle-0');
  }

  setTintFill(color?: number): this {
    super.setTintFill(color);
    this.rig?.tintFill(color ?? 0xffffff);
    return this;
  }

  clearTint(): this {
    super.clearTint();
    this.rig?.clearTint();
    return this;
  }

  private anim(name: string) {
    this.anims.timeScale = 1;
    this.play(`hero-${name}-${this.dir}`, true);
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
    // ângulo de tela → 8 direções (0 = S, sentido horário)
    const k = Math.round(Math.atan2(y, x) / (Math.PI / 4));
    this.dir = (((k + 6) % 8) + 8) % 8;
  }

  update(time: number) {
    const move = this.readMove();
    const wantAttack = this.pressed('attack', time);
    const wantDodge = this.pressed('dodge', time);
    const wantFlame = this.pressed('flame', time);
    const st = this.state2;

    inputState.cooldowns.attack =
      st === 'attack' ? Phaser.Math.Clamp((this.stateUntil - time) / this.currentSwing.dur, 0, 1) : 0;
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
      if (st === 'normal') this.updateDir(move.x, move.y);
    }

    // ações — a esquiva cancela golpes; o golpe pode ser encadeado no fim da recuperação
    if (wantDodge && time - this.lastDodge >= PLAYER.dodge.cooldown) {
      this.startRoll(time, move);
      return;
    }
    // a Chama pode sair na recuperação de um golpe (depois do impacto)
    const flameOk = st === 'normal' || (st === 'attack' && this.hitDone);
    if (wantFlame && flameOk && time - this.lastFlame >= PLAYER.flame.cooldown) this.castFlame(time);
    // encadeia no fim da recuperação; depois do golpe final o combo termina
    const canChain = st === 'attack' && this.combo < this.swings.length - 1 && time >= this.stateUntil - 110;
    if (wantAttack && (this.state2 === 'normal' || canChain)) this.swing(time);

    if (this.state2 === 'attack') {
      // passo à frente no instante do impacto; quase parado no resto do golpe
      const S = this.currentSwing;
      const t = time - this.swingStart;
      const lunge = t > S.hit - 60 && t < S.hit + 40 ? S.lunge : 0;
      // impacto medido no mesmo relógio do estado (delayedCall atrasa com FPS baixo)
      if (!this.hitDone && t >= S.hit) {
        this.hitDone = true;
        this.resolveHit(S);
      }
      this.body.setVelocity(this.facing.x * lunge + move.x * PLAYER.speed * 0.15, this.facing.y * lunge + move.y * PLAYER.speed * 0.15);
      if (time >= this.stateUntil) this.toIdle();
    } else if (this.state2 === 'cast') {
      this.body.setVelocity(move.x * PLAYER.speed * 0.2, move.y * PLAYER.speed * 0.2);
      // a bola de fogo sai da mão no quadro de "soltar" da animação
      if (this.castRelease && time >= this.castRelease) {
        this.castRelease = 0;
        const a = this.castAngle;
        new Flame(this.scene, this.fx + Math.cos(a) * 10, this.fy - 12 + Math.sin(a) * 8, a);
      }
      if (time >= this.stateUntil) this.toIdle();
    } else {
      this.body.setVelocity(move.x * PLAYER.speed, move.y * PLAYER.speed);
      const key = move.lengthSq() > 0 ? `hero-run-${this.dir}` : `hero-idle-${this.dir}`;
      // troca de direção mantém a fase da corrida
      const cur = this.anims.currentAnim?.key;
      if (cur !== key || !this.anims.isPlaying) {
        const keep = cur?.startsWith('hero-run-') && key.startsWith('hero-run-') ? this.anims.currentFrame?.index : undefined;
        this.play({ key, startFrame: keep !== undefined ? keep - 1 : 0 }, true);
      }
      // ritmo da passada proporcional à velocidade (joystick parcial = passos mais lentos)
      this.anims.timeScale = move.lengthSq() > 0 ? Math.max(0.35, move.length()) : 1;
    }
    this.sortDepth();
  }

  private toIdle() {
    this.state2 = 'normal';
    this.anim('idle');
  }

  // ---------------------------------------------------------------- Golpe (combo de 3)
  private swing(time: number) {
    const chaining = this.state2 === 'attack' || time < this.comboUntil;
    const step = chaining && this.combo < this.swings.length - 1 ? this.combo + 1 : 0;
    const S = this.swings[step];
    this.combo = step;
    this.currentSwing = S;
    this.swingStart = time;
    this.buffered.attack = 0;
    this.state2 = 'attack';
    this.stateUntil = time + S.dur;
    this.comboUntil = step < this.swings.length - 1 ? time + S.dur + PLAYER.comboWindow : 0;
    this.updateDir(this.facing.x, this.facing.y);
    this.anim(S.anim);
    this.hitDone = false;
  }

  private resolveHit(S: Swing) {
    const s = this.scene;
    const angle = Math.atan2(this.facing.y, this.facing.x);
    const cx = this.fx;
    const cy = this.fy;
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
      const finisher = S === this.swings[this.swings.length - 1];
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
    this.anim('roll');
    this.setAlpha(1);
  }

  private endRoll() {
    this.toIdle();
  }

  private ghost(time: number) {
    this.lastGhost = time;
    this.rig.ghost(0x9fd8ff, 0.4, 220);
  }

  // ---------------------------------------------------------------- Chama
  private castFlame(time: number) {
    this.lastFlame = time;
    this.buffered.flame = 0;
    this.castAngle = Math.atan2(this.facing.y, this.facing.x);
    this.updateDir(this.facing.x, this.facing.y);
    const t = animTiming(this.meta, 'cast', this.meta.anims.cast.release);
    this.anim('cast');
    this.state2 = 'cast';
    this.castRelease = time + t.at;
    this.stateUntil = time + t.total;
  }

  // ---------------------------------------------------------------- Dano
  hurt(amount: number, fromX: number, fromY: number) {
    if (this.invulnerable) return;
    const s = this.scene;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = s.time.now + PLAYER.hurtInvuln;
    s.fx.damageText(this.x, this.y - 32, amount, '#ff6060');
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
    this.castRelease = 0;
    this.anim('hurt');
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
        this.toIdle();
        this.invulnUntil = s.time.now + 2000;
        s.cameras.main.fadeIn(500, 10, 8, 20);
      });
    });
  }
}
