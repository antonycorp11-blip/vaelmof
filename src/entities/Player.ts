import Phaser from 'phaser';
import { PLAYER } from '../config';
import { WEAPONS, WEAPON_ORDER, type Move, type WeaponDef } from '../data/weapons';
import { consume, inputState } from '../input/InputState';
import type { WorldScene } from '../scenes/WorldScene';
import { Creature } from './Creature';
import { Flame } from './Flame';
import { HERO, LPC_DIR, heroFrame } from './heroSheet';
import { HERO_SHEETS, type WeaponId } from './heroSheets';
import { Projectile } from './Projectile';

type PlayerState = 'normal' | 'attack' | 'roll' | 'hurt' | 'gather' | 'dead';
type Action = 'attack' | 'dodge' | 'flame' | 'gather';

interface Keys {
  up: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  attack: Phaser.Input.Keyboard.Key;
  dodge: Phaser.Input.Keyboard.Key;
  flame: Phaser.Input.Keyboard.Key;
  gather: Phaser.Input.Keyboard.Key;
}

/** Índice do passo em `frames` (durações em ms) após `t` ms. */
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

/** Giro: direções em sentido horário na tela (baixo, esquerda, cima, direita). */
const CW = [0, 1, 3, 2];
/** Coleta: golpe com o corpo (machadada / picaretada) em 6 passos. */
const GATHER_FRAMES = [70, 80, 60, 70, 110, 120];

/**
 * Teren: herói humano montado em camadas LPC (ver scripts/hero/recipe.json).
 * A **arma define a classe**, como no Albion: espada = Guerreiro, montante =
 * Guerreiro pesado, cajado = Mago, arco = Arqueiro. Cada arma traz o próprio
 * combo (botão de golpe) e a própria habilidade (terceiro botão); trocar de
 * arma troca a folha de sprites e os movimentos (data/weapons.ts).
 * As animações de arte vêm das folhas; o código cuida do tempo de cada
 * quadro, do avanço no golpe, dos projéteis, da poeira e do rastro.
 */
export class Player extends Creature {
  hp = PLAYER.maxHp;
  readonly maxHp = PLAYER.maxHp;
  state2: PlayerState = 'normal';
  /** Direção para onde Teren olha (unitário). */
  facing = new Phaser.Math.Vector2(0, 1);
  weapon: WeaponDef = WEAPONS.sword;
  /** 0 baixo, 1 esquerda, 2 direita, 3 cima. */
  private dir = 0;
  private stateUntil = 0;
  private stateStart = 0;
  private invulnUntil = 0;
  private combo = 0;
  private comboUntil = 0;
  private hitDone = true;
  private move: Move = WEAPONS.sword.combo[0];
  private moveDur = 0;
  private moveHitAt = 0;
  private lastDodge = -99999;
  private lastSkill = -99999;
  private lastGhost = 0;
  private rollDir = new Phaser.Math.Vector2();
  private keys?: Keys;
  /** Buffer de entrada: ação pedida fica válida por alguns ms (toques rápidos não se perdem). */
  private buffered: Record<Action, number> = { attack: 0, dodge: 0, flame: 0, gather: 0 };
  private readonly shadow: Phaser.GameObjects.Image;
  /** Animações em quadros grandes (golpes, arco andando): sprite à parte, no lugar do corpo. */
  private readonly big: Phaser.GameObjects.Sprite;
  private gatherDone?: () => void;
  private gatherAt = 0;
  readonly spawnX: number;
  readonly spawnY: number;
  /** Multiplicador de velocidade (modo voo do debug, peso da mochila). */
  speedMul = 1;
  /** Peso da mochila (1 = normal; menor = carregado demais). */
  weightMul = 1;
  /** Debug: não toma dano. */
  god = false;
  private artScale: number = HERO.scale;
  private lastUpdate = 0;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'hero-sword', 20, 10, heroFrame(HERO.rows.walk, 0, 0));
    const F = HERO.frame;
    this.setScale(this.artScale).setOrigin(0.5, HERO.footY / F);
    this.body.setSize(20, 10);
    this.body.setOffset((F - 20) / 2, HERO.footY - 8);
    this.shadow = scene.add.image(x, y, 'shadow').setScale(0.75, 0.65).setAlpha(0.7);
    this.big = scene.add.sprite(x, y, 'hero-sword-slash', 0).setScale(this.artScale).setVisible(false);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, () => {
      const bigOn = this.big.visible;
      this.shadow.setPosition(this.x, this.y).setDepth(this.depth - 2).setVisible((this.visible || bigOn) && this.state2 !== 'dead');
      if (bigOn) this.big.setPosition(this.x, this.y).setDepth(this.depth).setAlpha(this.alpha);
    });
    // poeira nos passos: quadros em que um pé toca o chão
    const step = (_a: unknown, frame: Phaser.Animations.AnimationFrame) => {
      if (this.state2 === 'normal' && (frame.index === 2 || frame.index === 6)) this.dust(1);
    };
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, step);
    this.big.on(Phaser.Animations.Events.ANIMATION_UPDATE, step);
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
        gather: k(K.E),
      };
      for (const action of ['attack', 'dodge', 'flame', 'gather'] as const) this.keys[action].on('down', () => this.queue(action));
      k(K.Q).on('down', () => this.cycleWeapon());
      [K.ONE, K.TWO, K.THREE, K.FOUR].forEach((c, i) => k(c).on('down', () => this.setWeapon(WEAPON_ORDER[i])));
    }
    this.stand();
  }

  /**
   * Ajusta a escala para que cada pixel da arte ocupe um número inteiro de
   * pixels da tela (sem isso a amostragem muda a cada quadro e o herói treme).
   */
  fitPixels(zoom: number) {
    this.artScale = Math.max(1, Math.round(zoom * HERO.scale)) / zoom;
    this.setScale(this.artScale);
    this.big.setScale(this.artScale);
  }

  get dead(): boolean {
    return this.state2 === 'dead';
  }

  get invulnerable(): boolean {
    return this.god || this.state2 === 'roll' || this.state2 === 'dead' || this.scene.time.now < this.invulnUntil;
  }

  get busy(): boolean {
    return this.state2 !== 'normal';
  }

  // ---------------------------------------------------------------- armas
  setWeapon(id: WeaponId) {
    if (this.weapon.id === id || this.state2 === 'dead') return;
    this.weapon = WEAPONS[id];
    this.combo = 0;
    this.comboUntil = 0;
    this.setTexture(`hero-${id}`);
    this.endBig();
    if (this.state2 === 'attack' || this.state2 === 'gather') this.state2 = 'normal';
    this.stand();
    this.scene.fx.burst(this.x, this.y - 10, 0xffe9a8, 8);
    this.scene.events.emit('weapon', this.weapon);
  }

  cycleWeapon() {
    const i = WEAPON_ORDER.indexOf(this.weapon.id);
    this.setWeapon(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]);
  }

  // ---------------------------------------------------------------- entrada
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
    // joystick analógico (direção livre); teclado já vem em 8 direções
    return v.normalize().scale(mag);
  }

  private queue(action: Action) {
    this.buffered[action] = this.scene.time.now + 200;
  }

  private pressed(action: Action, time: number): boolean {
    if (consume(action)) this.queue(action);
    // segurar o botão repete (golpe e coleta)
    if (action === 'attack' && (this.keys?.attack.isDown || inputState.held.attack)) this.queue(action);
    if (action === 'gather' && (this.keys?.gather.isDown || inputState.held.gather)) this.queue(action);
    return this.buffered[action] >= time;
  }

  private updateDir(x: number, y: number) {
    if (Math.abs(x) > 0.3) this.dir = x < 0 ? 1 : 2;
    else this.dir = y < 0 ? 3 : 0;
  }

  /** Parado. Com arco: o primeiro quadro do tiro (arco na mão). */
  private stand() {
    this.anims.stop();
    this.endBig();
    this.setFrame(heroFrame(this.weapon.id === 'bow' ? HERO.rows.shoot : HERO.rows.walk, this.dir, 0));
  }

  private walk() {
    const rate = Math.max(0.35, this.body.velocity.length() / (PLAYER.speed * Math.max(1, this.speedMul)));
    if (this.weapon.id === 'bow') {
      // o arco não cabe no quadro de 64: anda com a folha de 128
      const key = `hero-bow-bigwalk-${this.dir}`;
      this.showBig('hero-bow-walk', HERO_SHEETS.bow.big.walk.footY, HERO_SHEETS.bow.big.walk.frame);
      if (this.big.anims.currentAnim?.key !== key || !this.big.anims.isPlaying) this.big.play(key, true);
      this.big.anims.timeScale = rate;
      return;
    }
    const key = `hero-${this.weapon.id}-walk-${this.dir}`;
    if (this.anims.currentAnim?.key !== key || !this.anims.isPlaying) this.play(key, true);
    // a cadência acompanha a velocidade real (os pés não deslizam)
    this.anims.timeScale = rate;
  }

  /** Aceleração/desaceleração suave até a velocidade alvo. */
  private steer(tx: number, ty: number, dt: number) {
    const v = this.body.velocity;
    const accel = (tx * tx + ty * ty > 0 ? PLAYER.accel : PLAYER.decel) * Math.max(1, this.speedMul);
    const dx = tx - v.x;
    const dy = ty - v.y;
    const d = Math.hypot(dx, dy);
    const step = accel * dt;
    if (d <= step) this.body.setVelocity(tx, ty);
    else this.body.setVelocity(v.x + (dx / d) * step, v.y + (dy / d) * step);
  }

  private showBig(texture: string, footY: number, frame: number) {
    if (this.big.texture.key !== texture) this.big.setTexture(texture);
    this.big.setOrigin(0.5, footY / frame).setVisible(true);
    this.setVisible(false);
  }

  private endBig() {
    if (this.big.visible) {
      this.big.anims.stop();
      this.big.setVisible(false);
    }
    this.setVisible(true);
  }

  /** Nuvenzinha de poeira nos pés. */
  private dust(n: number, tint = 0xcbb89a) {
    const s = this.scene;
    for (let i = 0; i < n; i++) {
      const p = s.add
        .image(this.x + Phaser.Math.Between(-3, 3), this.y - 1, 'pixel')
        .setTint(tint)
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

  // ---------------------------------------------------------------- laço
  update(time: number) {
    const dt = Math.min(0.05, (time - (this.lastUpdate || time)) / 1000);
    this.lastUpdate = time;
    const move = this.readMove();
    const wantAttack = this.pressed('attack', time);
    const wantDodge = this.pressed('dodge', time);
    const wantSkill = this.pressed('flame', time);
    const st = this.state2;
    const W = this.weapon;

    inputState.cooldowns.attack = st === 'attack' ? Phaser.Math.Clamp((this.stateUntil - time) / this.moveDur, 0, 1) : 0;
    inputState.cooldowns.dodge = Phaser.Math.Clamp(1 - (time - this.lastDodge) / PLAYER.dodge.cooldown, 0, 1);
    inputState.cooldowns.flame = Phaser.Math.Clamp(1 - (time - this.lastSkill) / W.skill.cooldown, 0, 1);
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
    const speed = PLAYER.speed * this.speedMul * this.weightMul;

    // ações — a esquiva cancela tudo; o golpe pode ser encadeado no fim da recuperação
    if (wantDodge && time - this.lastDodge >= PLAYER.dodge.cooldown) {
      this.startRoll(time, move);
      return;
    }
    if (st === 'gather') {
      // andar cancela a coleta
      if (move.lengthSq() > 0.2) this.toIdle();
      else {
        this.body.velocity.scale(0.7);
        const t = time - this.stateStart;
        this.setFrame(heroFrame(HERO.rows.slash, this.dir, frameAt(GATHER_FRAMES, t)));
        if (this.gatherDone && time >= this.gatherAt) {
          const done = this.gatherDone;
          this.gatherDone = undefined;
          done();
        }
        if (time >= this.stateUntil) this.toIdle();
        this.sortDepth();
        return;
      }
    }
    // a habilidade pode interromper o golpe (fica mais responsivo no toque)
    const skillOk = this.state2 === 'normal' || (this.state2 === 'attack' && !this.isSkill);
    if (wantSkill && skillOk && time - this.lastSkill >= W.skill.cooldown) {
      this.endBig();
      this.lastSkill = time;
      this.buffered.flame = 0;
      this.startMove(time, W.skill);
      this.combo = 0;
      this.comboUntil = 0;
    }
    const canChain = this.state2 === 'attack' && !this.isSkill && this.combo < W.combo.length - 1 && time >= this.stateUntil - 120;
    if (wantAttack && (this.state2 === 'normal' || canChain)) this.swing(time);

    if (this.state2 === 'attack') {
      const M = this.move;
      const t = time - this.stateStart;
      const lunge = t > this.moveHitAt - 50 && t < this.moveHitAt + 50 ? M.lunge : 0;
      if (!this.hitDone && t >= this.moveHitAt) {
        this.hitDone = true;
        this.release(M);
      }
      const k = M.projectile ? 0.25 : 0.15;
      this.body.setVelocity(this.facing.x * lunge + move.x * speed * k, this.facing.y * lunge + move.y * speed * k);
      this.attackPose(M, t);
      this.sortDepth();
      if (time >= this.stateUntil) this.toIdle();
      return;
    }
    this.steer(move.x * speed, move.y * speed, dt);
    if (move.lengthSq() > 0) this.walk();
    else if (this.body.velocity.lengthSq() < 64) this.stand();
    this.sortDepth();
  }

  /** Quadro do movimento atual: animação grande da arma, giro ou tiro com arco. */
  private attackPose(M: Move, t: number) {
    const i = frameAt(M.frames, t);
    const id = this.weapon.id;
    if (M.anim === 'shoot') {
      this.endBig();
      this.setFrame(heroFrame(HERO.rows.shoot, this.dir, M.cols ? M.cols[i] : i));
      return;
    }
    const anim = M.anim === 'spin' ? 'slash' : M.anim;
    const b = (HERO_SHEETS[id].big as Record<string, { frame: number; frames: number; footY: number }>)[anim];
    let dir = this.dir;
    let col = M.cols ? M.cols[Math.min(i, M.cols.length - 1)] : Math.min(i, b.frames - 1);
    if (M.anim === 'spin') {
      // preparo em 3 quadros, a varredura passa pelas 4 direções, pose final
      if (i >= 3 && i <= 6) {
        dir = CW[(CW.indexOf(this.dir) + i - 2) % 4];
        col = 4;
      } else col = i < 3 ? i : 5;
    }
    this.showBig(`hero-${id}-${anim}`, b.footY, b.frame);
    this.big.setFrame(LPC_DIR[dir] * b.frames + col);
  }

  private toIdle() {
    this.endBig();
    this.state2 = 'normal';
    this.gatherDone = undefined;
    this.setAngle(0).setAlpha(1);
    this.anims.timeScale = 1;
    this.stand();
  }

  // ---------------------------------------------------------------- golpes
  private isSkill = false;

  private swing(time: number) {
    const W = this.weapon;
    const chaining = (this.state2 === 'attack' && !this.isSkill) || time < this.comboUntil;
    const step = chaining && this.combo < W.combo.length - 1 ? this.combo + 1 : 0;
    this.combo = step;
    this.buffered.attack = 0;
    this.startMove(time, W.combo[step]);
    this.isSkill = false;
    this.comboUntil = step < W.combo.length - 1 ? time + this.moveDur + PLAYER.comboWindow : 0;
  }

  private startMove(time: number, M: Move) {
    this.move = M;
    this.isSkill = M === this.weapon.skill;
    this.moveDur = sum(M.frames);
    this.moveHitAt = startOf(M.frames, M.hit);
    this.stateStart = time;
    this.state2 = 'attack';
    this.stateUntil = time + this.moveDur;
    this.updateDir(this.facing.x, this.facing.y);
    this.anims.stop();
    this.hitDone = false;
    if (M.projectile === 'flame') this.scene.fx.burst(this.x, this.y - 14, 0xffb040, 6);
  }

  /** Momento do impacto: corte em arco ou disparo. */
  private release(M: Move) {
    const a = Math.atan2(this.facing.y, this.facing.x);
    // sai do corpo (não à frente): um inimigo colado também é atingido
    const ox = this.fx + Math.cos(a) * 3;
    const oy = this.fy - 10 + Math.sin(a) * 2;
    if (M.projectile === 'flame') {
      new Flame(this.scene, ox, oy, a);
      return;
    }
    if (M.projectile) {
      const n = M.count ?? 1;
      const spread = Phaser.Math.DegToRad(M.spread ?? 0);
      for (let i = 0; i < n; i++) new Projectile(this.scene, ox, oy, a + (i - (n - 1) / 2) * spread, M.projectile);
      if (this.weapon.id === 'staff') this.scene.fx.burst(ox, oy, 0xb46cec, 6);
      return;
    }
    this.resolveHit(M);
  }

  private resolveHit(M: Move) {
    const s = this.scene;
    const angle = Math.atan2(this.facing.y, this.facing.x);
    const cx = this.fx;
    const cy = this.fy;
    // o rastro da lâmina já vem na arte; o giro ganha um anel de cortes
    if (M.anim === 'spin') {
      for (let k = 0; k < 4; k++) {
        const a = angle + (k * Math.PI) / 2;
        s.time.delayedCall(k * 45, () => {
          const fx = s.add
            .sprite(this.fx + Math.cos(a) * 13, this.fy - 7 + Math.sin(a) * 7, 'slash', 0)
            .setRotation(a + Math.PI / 2)
            .setDepth(this.depth + 1)
            .setAlpha(0.85);
          fx.play('slash');
          fx.once('animationcomplete', () => fx.destroy());
        });
      }
    }
    const half = Phaser.Math.DegToRad(M.arcDeg / 2);
    let hit = false;
    for (const e of s.enemies) {
      if (e.dead) continue;
      const d = Phaser.Math.Distance.Between(cx, cy, e.fx, e.fy);
      if (d > M.range + 6) continue;
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(cx, cy, e.fx, e.fy) - angle));
      if (diff <= half || d < 10) {
        e.takeDamage(M.damage, this.fx, this.fy, M.knockback);
        s.fx.burst((e.fx + cx) / 2 + (e.fx - cx) * 0.3, e.fy - 6, 0xffffff, 5);
        hit = true;
      }
    }
    if (hit) {
      const heavy = M.damage >= 3;
      s.cameras.main.shake(heavy ? 120 : 70, heavy ? 0.005 : 0.0025);
      s.hitStop(heavy ? 80 : 45);
    }
  }

  // ---------------------------------------------------------------- coleta
  /**
   * Golpeia um recurso em (x, y): toca a animação e chama `onHit` no impacto.
   * A WorldScene/Gathering decide o que sai do recurso.
   */
  startGather(x: number, y: number, onHit: () => void) {
    if (this.state2 !== 'normal') return false;
    const time = this.scene.time.now;
    this.buffered.gather = 0;
    this.updateDir(x - this.x, y - (this.y - 4));
    this.facing.set(x - this.x, y - this.y).normalize();
    this.state2 = 'gather';
    this.stateStart = time;
    this.stateUntil = time + sum(GATHER_FRAMES);
    this.gatherAt = time + startOf(GATHER_FRAMES, 4);
    this.gatherDone = onHit;
    this.anims.stop();
    this.endBig();
    return true;
  }

  wantsGather(time: number): boolean {
    return this.pressed('gather', time);
  }

  // ---------------------------------------------------------------- esquiva
  private startRoll(time: number, move: Phaser.Math.Vector2) {
    this.lastDodge = time;
    this.buffered.dodge = 0;
    this.state2 = 'roll';
    this.gatherDone = undefined;
    this.stateStart = time;
    this.stateUntil = time + PLAYER.dodge.duration;
    this.rollDir.copy(move.lengthSq() > 0 ? move : this.facing).normalize();
    this.endBig();
    this.updateDir(this.rollDir.x, this.rollDir.y);
    this.setAlpha(1);
    this.dust(4);
    // disparada: passos acelerados com rastro
    this.play(`hero-${this.weapon.id}-walk-${this.dir}`, true);
    this.anims.timeScale = 2.6;
  }

  private ghost(time: number) {
    this.lastGhost = time;
    const g = this.scene.add
      .image(this.x, this.y, this.texture.key, this.frame.name)
      .setOrigin(this.originX, this.originY)
      .setScale(this.scaleX, this.scaleY)
      .setAlpha(0.45)
      .setTintFill(0xbfe3ff)
      .setDepth(this.depth - 1);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  // ---------------------------------------------------------------- dano
  hurt(amount: number, fromX: number, fromY: number) {
    if (this.invulnerable) return;
    const s = this.scene;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = s.time.now + PLAYER.hurtInvuln;
    s.fx.damageText(this.x, this.y - 24, amount, '#ff6060');
    s.cameras.main.shake(120, 0.006);
    this.setTintFill(0xff4040);
    s.time.delayedCall(100, () => this.clearTint());
    const a = Phaser.Math.Angle.Between(fromX, fromY, this.fx, this.fy);
    this.body.setVelocity(Math.cos(a) * 150, Math.sin(a) * 150);
    this.gatherDone = undefined;
    this.endBig();
    if (this.hp <= 0) {
      this.die();
      return;
    }
    this.state2 = 'hurt';
    this.stateUntil = s.time.now + 180;
    // recuo: quadro de "encolher" da queda
    this.anims.stop();
    this.setFrame(HERO.rows.fall * HERO.cols + 1);
  }

  private die() {
    const s = this.scene;
    this.state2 = 'dead';
    this.body.setVelocity(0, 0);
    this.play(`hero-${this.weapon.id}-fall`, true);
    s.fx.burst(this.x, this.y - 12, 0xff6060, 10);
    s.events.emit('player-died');
    s.time.delayedCall(1400, () => {
      s.cameras.main.fadeOut(400, 10, 8, 20);
      s.cameras.main.once('camerafadeoutcomplete', () => {
        this.body.reset(this.spawnX, this.spawnY);
        this.setPosition(this.spawnX, this.spawnY);
        s.tiles.recenter(this.spawnX, this.spawnY);
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
