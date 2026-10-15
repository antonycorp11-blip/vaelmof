import Phaser from 'phaser';
import { shade } from '../systems/MountFx';
import { PLAYER } from '../config';
import { BUFFS, WEAPONS, type BuffId, type Effect, type Move, type WeaponDef } from '../data/weapons';
import { ITEMS } from '../data/items';
import { RARITY } from '../data/gear';
import type { MountDef, MountSkill } from '../data/mounts';
import { consume, inputState } from '../input/InputState';
import type { WorldScene } from '../scenes/WorldScene';
import { Creature, DEPTH } from './Creature';
import { Flame } from './Flame';
import { HERO, LPC_DIR } from './heroSheet';
import { HERO_SHEETS, OUTFITS, type LookId, type OutfitId, type WeaponId } from './heroSheets';
import { Projectile } from './Projectile';

type PlayerState = 'normal' | 'attack' | 'roll' | 'hurt' | 'gather' | 'dead';
type Action = 'attack' | 'dodge' | 'flame' | 'skill2' | 'skill3' | 'gather';
/** Botão de cada habilidade (1, 2, 3). */
const SKILL_ACTIONS = ['flame', 'skill2', 'skill3'] as const;
interface BigAnim {
  frame: number;
  frames: number;
  footY: number;
  cols: readonly number[];
  row: number;
  bg: boolean;
  fg: boolean;
}

interface Keys {
  up: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  attack: Phaser.Input.Keyboard.Key;
  dodge: Phaser.Input.Keyboard.Key;
  flame: Phaser.Input.Keyboard.Key;
  skill2: Phaser.Input.Keyboard.Key;
  skill3: Phaser.Input.Keyboard.Key;
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
const WALK_FPS = 24;

/**
 * Pose desenhada: linha e coluna da folha universal (o corpo é sempre um
 * quadro de 64 px) e, se a arma usa uma animação grande, qual e em que passo.
 */
interface Pose {
  row: number;
  col: number;
  dir: number;
  big?: { anim: string; i: number };
}

/** Recarga da disparada montado (ms). */
const MOUNT_DASH_CD = 2600;
const bigOf = (w: LookId, anim: string) => (HERO_SHEETS[w].big as unknown as Record<string, BigAnim | undefined>)[anim];

/**
 * Teren: herói humano em camadas LPC (scripts/hero/recipe.json). Desenhado
 * como 4 sprites sobrepostos e sincronizados quadro a quadro — o fundo do traje
 * (capa), a arma atrás do corpo, o corpo com o traje/armadura e a arma na
 * frente —, então qualquer armadura combina com qualquer arma.
 *
 * A **arma define a classe** (como no Albion) e traz combo e habilidade
 * próprios (data/weapons.ts); a **armadura** é sempre completa e muda defesa,
 * velocidade e um bônus. Armas à distância miram sozinhas no inimigo mais
 * próximo, ou para onde o jogador arrastar o botão; andando, disparam sem parar.
 */
export class Player extends Creature {
  hp = 0;
  state2: PlayerState = 'normal';
  /** Direção para onde Teren olha (unitário). */
  facing = new Phaser.Math.Vector2(0, 1);
  weapon: WeaponDef = WEAPONS.sword;
  outfit: OutfitId = 'squire';
  /** Aparência da arma (a forma: sabre, maça, foice…); a classe vem de `weapon`. */
  look: LookId = 'sword';
  /** 0 baixo, 1 esquerda, 2 direita, 3 cima. */
  private dir = 0;
  private pose: Pose = { row: HERO.rows.walk, col: 0, dir: 0 };
  private stateUntil = 0;
  private stateStart = 0;
  private invulnUntil = 0;
  private combo = 0;
  private comboUntil = 0;
  private hitDone = true;
  private move: Move = WEAPONS.sword.combo[0];
  private isSkill = false;
  private moveDur = 0;
  private moveHitAt = 0;
  /** Direção do disparo/golpe atual (mira). */
  private aim = new Phaser.Math.Vector2(0, 1);
  private lastDodge = -99999;
  private lastSkill = [-99999, -99999, -99999];
  /** Fortalecimentos ativos (até quando). */
  private buffs = new Map<BuffId, number>();
  private lastBuffFx = 0;
  /** Velocidade do movimento atual (atributos × fúria). */
  private moveRate = 1;
  private lastHurt = -99999;
  private regen = 0;
  private lastGhost = 0;
  private nextShot = 0;
  private pendingShot?: { at: number; move: Move; aim: Phaser.Math.Vector2 };
  private rollDir = new Phaser.Math.Vector2();
  private walkT = 0;
  private lastWalkCol = -1;
  private keys?: Keys;
  /** Buffer de entrada: ação pedida fica válida por alguns ms (toques rápidos não se perdem). */
  private buffered: Record<Action, number> = { attack: 0, dodge: 0, flame: 0, skill2: 0, skill3: 0, gather: 0 };
  private readonly shadow: Phaser.GameObjects.Image;
  /** Camadas: fundo do traje, arma atrás, arma na frente. */
  private readonly back: Phaser.GameObjects.Sprite;
  private readonly wBg: Phaser.GameObjects.Sprite;
  private readonly wFg: Phaser.GameObjects.Sprite;
  private gatherDone?: () => void;
  private gatherAt = 0;
  spawnX: number;
  spawnY: number;
  /** Multiplicador de velocidade (modo voo do debug). */
  speedMul = 1;
  /** Peso da mochila (1 = normal; menor = carregado demais). */
  weightMul = 1;
  /** Debug: não toma dano. */
  god = false;
  /** Montaria em uso (null = a pé), o sprite dela e a sela em px da arte do herói. */
  mount: MountDef | null = null;
  private mountSpr?: Phaser.GameObjects.Sprite;
  private mountAura?: Phaser.GameObjects.Image;
  private seatArt = 0;
  private mountT = 0;
  private artScale: number = HERO.scale;
  private lastUpdate = 0;

  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'outfit-squire', 20, 10, 0);
    const F = HERO.frame;
    this.setOrigin(0.5, HERO.footY / F);
    this.body.setSize(20, 10);
    this.body.setOffset((F - 20) / 2, HERO.footY - 8);
    this.shadow = scene.add.image(x, y, 'shadow').setScale(0.75, 0.65).setAlpha(0.7);
    const layer = (key: string) => scene.add.sprite(x, y, key, 0).setOrigin(0.5, HERO.footY / F);
    this.back = layer('outfit-leather-back');
    this.wBg = layer('wpn-sword-bg');
    this.wFg = layer('wpn-sword-fg');
    this.setScale(this.artScale);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, () => this.syncLayers());
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
        skill2: k(K.U),
        skill3: k(K.I),
        gather: k(K.E),
      };
      for (const action of ['attack', 'dodge', 'flame', 'skill2', 'skill3', 'gather'] as const) this.keys[action].on('down', () => this.queue(action));
    }
    this.hp = this.maxHp;
    this.stand();
  }

  /** Vida máxima: cresce com a Vitalidade. */
  get maxHp(): number {
    return this.scene.progress.maxHp;
  }

  /** Multiplicador de dano: Força (espadas), Agilidade (arco) ou Energia (cajado), × fortalecimentos. */
  get dmgMul(): number {
    const P = this.scene.progress;
    const id = this.weapon.id;
    const base = id === 'bow' ? P.rangedMul : id === 'staff' ? P.magicMul : P.meleeMul;
    let k = base * RARITY[ITEMS[this.scene.inventory.gear.weapon]?.tier ?? 0].power * (1 + (this.mount?.power ?? 0));
    for (const b of this.activeBuffs) k *= BUFFS[b].dmg;
    return k;
  }

  /** Velocidade de ataque: Agilidade × fúria. */
  get attackRate(): number {
    let k = this.scene.progress.attackRate;
    for (const b of this.activeBuffs) k *= BUFFS[b].rate;
    return k;
  }

  /** Quanto do dano a armadura (e o grito de guerra) absorve. */
  get defense(): number {
    let d = OUTFITS[this.outfit].defense + RARITY[ITEMS[this.scene.inventory.gear.armor]?.tier ?? 0].guard + (this.mount?.guard ?? 0);
    for (const b of this.activeBuffs) d += BUFFS[b].defense;
    return Math.min(0.8, d);
  }

  get activeBuffs(): BuffId[] {
    const now = this.scene.time.now;
    return [...this.buffs].filter(([, until]) => until > now).map(([b]) => b);
  }

  /** Quanto falta de cada fortalecimento (ms), para o HUD. */
  buffLeft(b: BuffId): number {
    return Math.max(0, (this.buffs.get(b) ?? 0) - this.scene.time.now);
  }

  setScale(x: number, y?: number): this {
    super.setScale(x, y);
    for (const s of [this.back, this.wBg, this.wFg]) s?.setScale(x, y ?? x);
    return this;
  }

  /**
   * Ajusta a escala para que cada pixel da arte ocupe um número inteiro de
   * pixels da tela (sem isso a amostragem muda a cada quadro e o herói treme).
   */
  fitPixels(zoom: number) {
    this.artScale = Math.max(1, Math.round(zoom * HERO.scale)) / zoom;
    this.setScale(this.artScale);
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

  /** Arma à distância (arco, cajado)? */
  get ranged(): boolean {
    return !!this.weapon.combo[0].projectile;
  }

  /** Alcance para mirar automaticamente. */
  get aimRange(): number {
    const p = this.weapon.combo[0].projectile;
    return p && p !== 'flame' ? p.range * 0.9 : 46;
  }

  /** Recarga da habilidade `i`: traje arcano −30%, Energia até −50%. */
  skillCooldown(i: number): number {
    return this.weapon.skills[i].cooldown * (OUTFITS[this.outfit].bonus === 'cooldown' ? 0.7 : 1) * this.scene.progress.cooldownMul;
  }

  private get dodgeCooldown(): number {
    return PLAYER.dodge.cooldown * (OUTFITS[this.outfit].bonus === 'dodge' ? 0.75 : 1);
  }

  // ---------------------------------------------------------------- camadas
  /** Coloca as 4 camadas na pose atual (quadros, origem, profundidade). */
  private syncLayers() {
    const p = this.pose;
    const visible = this.visible;
    // a queda só existe numa direção (linha única)
    const row = p.row === HERO.rows.fall ? p.row : p.row + LPC_DIR[p.dir];
    const frame = row * HERO.cols + p.col;
    this.setFrame(frame);
    const o = OUTFITS[this.outfit];
    this.back.setVisible(visible && o.back);
    if (o.back) this.back.setFrame(frame);
    const w = this.look;
    const big = p.big ? bigOf(w, p.big.anim) : undefined;
    for (const [s, side] of [
      [this.wBg, 'bg'],
      [this.wFg, 'fg'],
    ] as const) {
      if (big && p.big) {
        const has = big[side];
        s.setVisible(visible && has);
        if (!has) continue;
        const key = `wpn-${w}-${p.big.anim}-${side}`;
        if (s.texture.key !== key) s.setTexture(key);
        s.setOrigin(0.5, (big.footY + this.seatArt) / big.frame).setFrame(LPC_DIR[p.dir] * big.frames + p.big.i);
      } else {
        const has = HERO_SHEETS[w][side];
        s.setVisible(visible && has);
        if (!has) continue;
        const key = `wpn-${w}-${side}`;
        if (s.texture.key !== key) s.setTexture(key);
        s.setOrigin(0.5, (HERO.footY + this.seatArt) / HERO.frame).setFrame(frame);
      }
    }
    const d = this.depth;
    for (const [s, k] of [
      [this.back, -0.3],
      [this.wBg, -0.2],
      [this.wFg, 0.2],
    ] as const) s.setPosition(this.x, this.y).setDepth(d + k).setAlpha(this.alpha);
    this.shadow.setPosition(this.x, this.y).setDepth(d - 2).setVisible(visible && this.state2 !== 'dead');
    // montaria por cima do herói (que está erguido na sela): cobre as pernas, como montado
    const m = this.mount;
    if (m && this.mountSpr) {
      const moving = this.body.velocity.lengthSq() > 100;
      const f = moving ? Math.floor(this.mountT) : 0;
      // atrás do herói (e da capa); o herói, com as pernas recortadas, fica sentado na sela
      const ready = this.mountSpr.texture.key === `mount-${m.id}`;
      if (ready) this.mountSpr.setFrame(p.dir * 6 + f);
      this.mountSpr.setPosition(Math.round(this.x), Math.round(this.y)).setDepth(d - 0.4).setVisible(visible && ready).setAlpha(this.alpha * (m.ghost ? 0.85 : 1));
      this.shadow.setScale(1.4, 0.8);
      if (this.mountAura && m.glow) {
        const k = 0.75 + 0.08 * Math.sin(this.scene.time.now / 260);
        this.mountAura.setPosition(this.x, this.y - 14).setScale(k, k * 0.8).setAlpha(0.45).setDepth(d - 0.5).setVisible(visible);
      }
    } else this.shadow.setScale(0.75, 0.65);
  }

  private setPose(row: number, col: number, big?: Pose['big'], dir = this.dir) {
    this.pose = { row, col, dir, big };
  }

  /** Pisca todas as camadas numa cor (dano). */
  private flash(color: number, ms: number) {
    const all = [this, this.back, this.wBg, this.wFg];
    for (const s of all) s.setTintFill(color);
    this.scene.time.delayedCall(ms, () => {
      all.forEach((s) => s.clearTint());
      this.applyLook();
    });
  }

  /** Tom e brilho do equipamento raro (arma nas camadas da arma, armadura no corpo). */
  applyLook() {
    const inv = this.scene.inventory;
    const w = ITEMS[inv.gear.weapon];
    const a = ITEMS[inv.gear.armor];
    for (const s of [this.wBg, this.wFg]) {
      if (w?.tint) s.setTint(w.tint);
      else s.clearTint();
    }
    for (const s of [this as Phaser.GameObjects.Sprite, this.back]) {
      if (a?.tint) s.setTint(a.tint);
      else s.clearTint();
    }
    // brilho (WebGL): contorno luminoso na arma e, nas armaduras raras, no corpo
    const glow = (s: Phaser.GameObjects.Sprite, color?: number, k = 1) => {
      const fx = s.preFX;
      if (!fx) return;
      fx.clear();
      if (color) fx.addGlow(color, 3 * k, 0, false, 0.1, 6);
    };
    glow(this.wFg, w?.glow);
    glow(this.wBg, w?.glow);
    glow(this, a?.glow, 0.6);
  }

  // ---------------------------------------------------------------- equipamento
  /** Carrega as texturas que faltam e chama `done` (carga sob demanda: poupa memória no celular). */
  private ensure(keys: string[], done: () => void) {
    const s = this.scene;
    const missing = keys.filter((k) => !s.textures.exists(k));
    if (!missing.length) return done();
    for (const k of missing) s.load.atlas(k, `assets/sprites/${k}.png`, `assets/sprites/${k}.json`);
    s.load.once(Phaser.Loader.Events.COMPLETE, done);
    s.load.start();
  }

  /**
   * Tira da memória de vídeo as folhas do herói que saíram de uso (arma ou
   * traje anterior). No celular, acumular folhas a cada troca acabava
   * estourando o limite do WebGL e o jogo congelava.
   */
  private release(prefix: 'wpn-' | 'outfit-', keep: string[]) {
    const tm = this.scene.textures;
    const busy = new Set([...keep, 'outfit-leather-back']);
    for (const s of [this, this.back, this.wBg, this.wFg]) busy.add(s.texture.key);
    for (const k of tm.getTextureKeys()) if (k.startsWith(prefix) && !busy.has(k)) tm.remove(k);
  }

  private weaponKeys(id: LookId): string[] {
    const w = HERO_SHEETS[id];
    const keys: string[] = [];
    for (const side of ['bg', 'fg'] as const) if (w[side]) keys.push(`wpn-${id}-${side}`);
    for (const [anim, b] of Object.entries(w.big as unknown as Record<string, BigAnim>))
      for (const side of ['bg', 'fg'] as const) if (b[side]) keys.push(`wpn-${id}-${anim}-${side}`);
    return keys;
  }

  /** Monta (def) ou desmonta (null). A sela ergue o herói; a física fica no chão. */
  setMount(def: MountDef | null) {
    const s = this.scene;
    this.mount = def;
    this.seatArt = def ? def.seat / this.artScale : 0;
    const F = HERO.frame;
    this.setOrigin(0.5, (HERO.footY + this.seatArt) / F);
    this.back.setOrigin(0.5, (HERO.footY + this.seatArt) / F);
    this.body.setOffset((F - 20) / 2, HERO.footY - 8 + this.seatArt);
    // montado: corta as pernas do herói (do quadril para baixo) — parece sentado
    if (def) {
      this.setCrop(0, 0, F, HERO.footY - 15);
      this.back.setCrop(0, 0, F, HERO.footY - 15);
    } else {
      this.setCrop();
      this.back.setCrop();
    }
    if (def) {
      if (!this.mountSpr) this.mountSpr = s.add.sprite(this.x, this.y, 'mount-icons', 0).setOrigin(0.5, 76 / 80).setScale(0.5).setVisible(false);
      // cada montaria tem o seu atlas, carregado ao montar (e a anterior sai da memória)
      const key = `mount-${def.id}`;
      const show = () => {
        if (this.mount !== def || !this.mountSpr) return;
        this.mountSpr.setTexture(key, 0);
        // a anterior sai da memória na limpeza periódica (Army.gcSkins), se ninguém
        // mais a usar — um líder inimigo pode estar montado nela agora
      };
      if (s.textures.exists(key)) show();
      else {
        s.load.atlas(key, `assets/sprites/mounts/${key}.png`, `assets/sprites/mounts/${key}.json`);
        s.load.once(`filecomplete-atlasjson-${key}`, show);
        s.load.start();
      }
      // aura das montarias mágicas (atrás dela; o preFX bagunçaria a ordem com o herói)
      if (!this.mountAura) this.mountAura = s.add.image(this.x, this.y, 'glow').setBlendMode(Phaser.BlendModes.ADD);
      this.mountAura.setVisible(!!def.glow).setTint(def.glow || 0xffffff);
      s.fx.burst(this.x, this.y - 8, 0xe8d8a8, 10);
    } else {
      this.mountSpr?.setVisible(false);
      this.mountAura?.setVisible(false);
    }
    s.events.emit('mount', def);
  }

  setWeapon(id: WeaponId, look: LookId = id) {
    if (this.state2 === 'dead') return;
    if (!HERO_SHEETS[look]) look = id;
    const keys = this.weaponKeys(look);
    this.ensure(keys, () => {
      this.weapon = WEAPONS[id];
      this.look = look;
      // as camadas passam para a arma nova já no próximo quadro; a velha sai da memória
      this.syncLayers();
      this.release('wpn-', keys);
      this.combo = 0;
      this.comboUntil = 0;
      this.pendingShot = undefined;
      if (this.state2 === 'attack' || this.state2 === 'gather') this.state2 = 'normal';
      this.stand();
      this.scene.fx.burst(this.x, this.y - 10, 0xffe9a8, 8);
      this.scene.events.emit('weapon', this.weapon);
    });
  }

  setOutfit(id: OutfitId) {
    if (this.state2 === 'dead') return;
    const keys = [`outfit-${id}`];
    if (OUTFITS[id].back) keys.push(`outfit-${id}-back`);
    this.ensure(keys, () => {
      this.outfit = id;
      this.setTexture(`outfit-${id}`);
      if (OUTFITS[id].back) this.back.setTexture(`outfit-${id}-back`);
      this.syncLayers();
      this.release('outfit-', keys);
      this.scene.fx.burst(this.x, this.y - 10, 0xbfe6ff, 10);
      this.scene.events.emit('outfit', id);
    });
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

  /** Inimigo vivo mais próximo dentro do alcance (preferindo o que está à frente). */
  nearestTarget(range: number) {
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (const e of this.scene.hostiles) {
      if (!e.targetable) continue;
      const dx = e.fx - this.fx;
      const dy = e.fy - this.fy;
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      const front = (dx * this.facing.x + dy * this.facing.y) / (d || 1);
      const score = d * (1.4 - front * 0.4);
      if (score < bestScore) {
        bestScore = score;
        best = { x: e.fx, y: e.fy };
      }
    }
    return best;
  }

  /**
   * Para onde vai o golpe/disparo: o botão arrastado (mira manual), o mouse
   * (desktop), o inimigo mais próximo (mira automática) ou a frente.
   */
  private resolveAim(manual?: { x: number; y: number } | null): Phaser.Math.Vector2 {
    const v = new Phaser.Math.Vector2(this.facing.x, this.facing.y);
    if (manual) return v.set(manual.x, manual.y).normalize();
    if (inputState.aim.active) return v.set(inputState.aim.x, inputState.aim.y).normalize();
    if (inputState.mouseAim) {
      const m = inputState.mouseAim;
      return v.set(m.x - this.fx, m.y - (this.fy - 8)).normalize();
    }
    const t = this.nearestTarget(this.aimRange);
    if (t) v.set(t.x - this.fx, t.y - this.fy).normalize();
    return v;
  }

  // ---------------------------------------------------------------- poses básicas
  /** Parado. Com arco: o primeiro quadro do tiro (arco na mão). */
  private stand() {
    this.setPose(this.weapon.id === 'bow' ? HERO.rows.shoot : HERO.rows.walk, 0);
  }

  /** Passos casados com a velocidade real (os pés não deslizam). */
  private walk(dt: number) {
    if (this.mount) {
      // montado: o herói fica sentado (quadro parado); quem anda é a montaria
      this.mountT = (this.mountT + dt * 12 * Math.min(1.6, this.body.velocity.length() / 90)) % 6;
      this.setPose(HERO.rows.walk, 0);
      return;
    }
    const rate = Math.max(0.35, this.body.velocity.length() / (PLAYER.speed * Math.max(1, this.speedMul)));
    this.walkT = (this.walkT + dt * WALK_FPS * rate) % 8;
    const col = 1 + Math.floor(this.walkT);
    if (col !== this.lastWalkCol && (col === 2 || col === 6) && this.state2 === 'normal') this.dust(1);
    this.lastWalkCol = col;
    const bowWalk = this.weapon.id === 'bow' ? { anim: 'walk', i: col - 1 } : undefined;
    this.setPose(HERO.rows.walk, col, bowWalk);
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
    let wantAttack = this.pressed('attack', time);
    // perto de alguém, o golpe vira ação (abrir a loja do mercador…)
    if (wantAttack && inputState.action && this.state2 === 'normal') {
      this.scene.events.emit('action', inputState.action.id);
      wantAttack = false;
    }
    const wantDodge = this.pressed('dodge', time);
    const wantSkill = SKILL_ACTIONS.map((a) => this.pressed(a, time));
    const st = this.state2;
    const W = this.weapon;
    const O = OUTFITS[this.outfit];

    inputState.cooldowns.attack = st === 'attack' && !this.isSkill ? Phaser.Math.Clamp((this.stateUntil - time) / this.moveDur, 0, 1) : 0;
    inputState.cooldowns.dodge = Phaser.Math.Clamp(1 - (time - this.lastDodge) / this.dodgeCooldown, 0, 1);
    SKILL_ACTIONS.forEach((a, i) => (inputState.cooldowns[a] = Phaser.Math.Clamp(1 - (time - this.lastSkill[i]) / this.skillCooldown(i), 0, 1)));
    this.regenerate(time, dt);
    this.buffFx(time);
    inputState.hp = this.hp;
    inputState.maxHp = this.maxHp;

    if (st === 'dead') {
      this.body.setVelocity(0, 0);
      const i = Math.min(5, Math.floor((time - this.stateStart) / 100));
      this.setPose(HERO.rows.fall, i);
      return;
    }

    // disparo andando (arco/cajado): sai um instante depois do toque
    if (this.pendingShot && time >= this.pendingShot.at) {
      const s = this.pendingShot;
      this.pendingShot = undefined;
      this.fire(s.move, s.aim);
    }

    // piscar durante invulnerabilidade pós-dano
    this.setAlpha(time < this.invulnUntil && st !== 'roll' ? (Math.floor(time / 70) % 2 ? 0.35 : 1) : 1);

    if (st === 'roll') {
      this.body.setVelocity(this.rollDir.x * PLAYER.dodge.speed, this.rollDir.y * PLAYER.dodge.speed);
      // disparada: passos acelerados com rastro
      this.walkT = (this.walkT + dt * WALK_FPS * 2.6) % 8;
      this.setPose(HERO.rows.walk, 1 + Math.floor(this.walkT), this.weapon.id === 'bow' ? { anim: 'walk', i: Math.floor(this.walkT) } : undefined);
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

    const moving = move.lengthSq() > 0.04;
    if (moving) {
      this.facing.copy(move).normalize();
      if (st === 'normal') this.updateDir(move.x, move.y);
    }
    let speed = PLAYER.speed * O.speed * this.speedMul * this.weightMul * this.scene.progress.moveMul * (this.mount ? this.mount.speed : 1);

    // montado: galope (andando um tempo, acelera), disparada (botão de esquiva) e habilidade da montaria
    const m = this.mount;
    if (m) {
      // em combate (guerra ou inimigo perto) o botão de coletar vira a habilidade da montaria
      if (time - this.combatCheck > 250) {
        this.combatCheck = time;
        const sc = this.scene;
        this.mountCombat = !!sc.army.war || sc.enemies.some((e) => e.targetable && Math.abs(e.fx - this.x) < 150 && Math.abs(e.fy - this.y) < 110);
      }
      this.gallopT = moving ? Math.min(1, this.gallopT + dt / 1.4) : Math.max(0, this.gallopT - dt * 3);
      speed *= 1 + 0.35 * this.gallopT;
      if (this.gallopT > 0.9 && moving && time - this.lastGhost > 160) {
        this.lastGhost = time;
        this.dust(1);
      }
      inputState.cooldowns.dodge = Phaser.Math.Clamp(1 - (time - this.lastMountDash) / MOUNT_DASH_CD, 0, 1);
      inputState.mountSkill = { label: m.skill.name, icon: m.skill.icon, cd: Phaser.Math.Clamp(1 - (time - this.lastMountSkill) / m.skill.cooldown, 0, 1) };
      if (wantDodge && st === 'normal' && time - this.lastMountDash >= MOUNT_DASH_CD) this.startCharge(time, moving ? move : this.facing, 420, 2.3, 2, 1);
      if (!inputState.canGather && st === 'normal' && this.pressed('gather', time) && time - this.lastMountSkill >= m.skill.cooldown) {
        this.lastMountSkill = time;
        this.mountSkill(m.skill, moving ? move.clone().normalize() : this.facing.clone());
      }
      if (time < this.chargeUntil) {
        const v = speed * this.chargeK;
        this.body.setVelocity(this.chargeDir.x * v, this.chargeDir.y * v);
        this.updateDir(this.chargeDir.x, this.chargeDir.y);
        this.walk(dt * 1.8);
        if (time - this.lastGhost > 50) {
          this.ghost(time);
          this.scene.mountFx.chargeTrail(this.x, this.y, this.chargeDir, this.chargeColor);
        }
        this.trample(time);
        this.sortDepth();
        return;
      }
    } else {
      inputState.mountSkill = null;
      this.mountCombat = false;
    }

    // ações — a esquiva cancela tudo; o golpe pode ser encadeado no fim da recuperação
    if (wantDodge && !this.mount && time - this.lastDodge >= this.dodgeCooldown) {
      this.startRoll(time, move);
      return;
    }
    if (st === 'gather') {
      if (moving) this.toIdle();
      else {
        this.body.velocity.scale(0.7);
        this.setPose(HERO.rows.slash, frameAt(GATHER_FRAMES, time - this.stateStart));
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
    const skillOk = this.state2 === 'normal' || (this.state2 === 'attack' && !this.isSkill);
    const si = wantSkill.findIndex((w, i) => w && time - this.lastSkill[i] >= this.skillCooldown(i));
    if (si >= 0 && skillOk) {
      this.lastSkill[si] = time;
      this.buffered[SKILL_ACTIONS[si]] = 0;
      this.startMove(time, W.skills[si], this.resolveAim(inputState.skillAim));
      inputState.skillAim = null;
      this.combo = 0;
      this.comboUntil = 0;
    }
    if (wantAttack && this.state2 === 'normal' && this.ranged && moving) {
      // à distância e andando: atira sem parar de andar
      if (time >= this.nextShot) {
        this.buffered.attack = 0;
        const M = W.combo[0];
        this.nextShot = time + (sum(M.frames) * 0.8) / this.attackRate;
        this.pendingShot = { at: time + 70, move: M, aim: this.resolveAim() };
      }
    } else {
      const canChain = this.state2 === 'attack' && !this.isSkill && this.combo < W.combo.length - 1 && time >= this.stateUntil - 120;
      if (wantAttack && (this.state2 === 'normal' || canChain) && time >= this.nextShot) this.swing(time);
    }

    if (this.state2 === 'attack') {
      const M = this.move;
      const t = time - this.stateStart;
      // à distância: começar a andar solta o disparo na hora e volta a andar
      if (M.projectile && moving && !this.isSkill) {
        if (!this.hitDone) {
          this.hitDone = true;
          this.fire(M, this.aim);
        }
        this.toIdle();
      } else {
        const lunge = t > this.moveHitAt - 50 && t < this.moveHitAt + 50 ? M.lunge : 0;
        if (!this.hitDone && t >= this.moveHitAt) {
          this.hitDone = true;
          this.fire(M, this.aim);
        }
        const k = M.projectile ? 0.45 : 0.15;
        this.body.setVelocity(this.aim.x * lunge + move.x * speed * k, this.aim.y * lunge + move.y * speed * k);
        this.attackPose(M, t * this.moveRate);
        this.sortDepth();
        if (time >= this.stateUntil) this.toIdle();
        return;
      }
    }
    this.steer(move.x * speed, move.y * speed, dt);
    if (moving) this.walk(dt);
    else if (this.body.velocity.lengthSq() < 64) this.stand();
    this.sortDepth();
  }

  /** Pose do movimento atual: animação grande da arma, giro ou tiro com arco. */
  private attackPose(M: Move, t: number) {
    const i = frameAt(M.frames, t);
    if (M.anim === 'cast') {
      this.setPose(HERO.rows.cast, Math.min(6, M.cols ? M.cols[i] : i));
      return;
    }
    if (M.anim === 'shoot') {
      this.setPose(HERO.rows.shoot, M.cols ? M.cols[i] : i);
      return;
    }
    const anim = M.anim === 'spin' ? 'slash' : M.anim;
    const b = bigOf(this.look, anim)!;
    let dir = this.dir;
    let step = M.cols ? M.cols[Math.min(i, M.cols.length - 1)] : Math.min(i, b.frames - 1);
    if (M.anim === 'spin') {
      // preparo em 3 quadros, a varredura passa pelas 4 direções, pose final
      if (i >= 3 && i <= 6) {
        dir = CW[(CW.indexOf(this.dir) + i - 2) % 4];
        step = 4;
      } else step = i < 3 ? i : 5;
    }
    this.setPose(b.row, b.cols[step], { anim, i: step }, dir);
  }

  private toIdle() {
    this.state2 = 'normal';
    this.gatherDone = undefined;
    this.setAngle(0).setAlpha(1);
    this.stand();
  }

  // ---------------------------------------------------------------- golpes
  private swing(time: number) {
    const W = this.weapon;
    const chaining = (this.state2 === 'attack' && !this.isSkill) || time < this.comboUntil;
    const step = chaining && this.combo < W.combo.length - 1 ? this.combo + 1 : 0;
    this.combo = step;
    this.buffered.attack = 0;
    this.startMove(time, W.combo[step], this.resolveAim());
    this.comboUntil = step < W.combo.length - 1 ? time + this.moveDur + PLAYER.comboWindow : 0;
    if (W.combo[step].projectile) this.nextShot = time + this.moveDur;
  }

  private startMove(time: number, M: Move, aim: Phaser.Math.Vector2) {
    this.move = M;
    this.isSkill = this.weapon.skills.includes(M as never);
    this.moveRate = this.attackRate;
    this.moveDur = sum(M.frames) / this.moveRate;
    this.moveHitAt = startOf(M.frames, M.hit) / this.moveRate;
    this.stateStart = time;
    this.state2 = 'attack';
    this.stateUntil = time + this.moveDur;
    this.aim.copy(aim);
    this.facing.copy(aim);
    this.updateDir(aim.x, aim.y);
    this.hitDone = false;
    if (M.projectile === 'flame') this.scene.fx.burst(this.x, this.y - 14, 0xffb040, 6);
  }

  /** Momento do impacto: corte em arco ou disparo na direção `aim`. */
  private fire(M: Move, aim: Phaser.Math.Vector2) {
    const a = Math.atan2(aim.y, aim.x);
    // sai do corpo (não à frente): um inimigo colado também é atingido
    const ox = this.fx + Math.cos(a) * 3;
    const oy = this.fy - 10 + Math.sin(a) * 2;
    if (M.effect) {
      this.effect(M.effect, aim);
      return;
    }
    const mul = this.dmgMul;
    if (M.projectile === 'flame') {
      new Flame(this.scene, ox, oy, a, mul);
      return;
    }
    if (M.projectile) {
      const n = M.count ?? 1;
      const spread = Phaser.Math.DegToRad(M.spread ?? 0);
      for (let i = 0; i < n; i++) new Projectile(this.scene, ox, oy, a + (i - (n - 1) / 2) * spread, M.projectile, mul);
      if (this.weapon.id === 'staff') this.scene.fx.burst(ox, oy, 0xb46cec, 6);
      return;
    }
    this.resolveHit(M, a);
  }

  private resolveHit(M: Move, angle: number) {
    const s = this.scene;
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
    const dmg = Math.max(1, Math.round(M.damage * this.dmgMul));
    for (const e of s.hostiles) {
      if (e.dead) continue;
      const d = Phaser.Math.Distance.Between(cx, cy, e.fx, e.fy);
      if (d > M.range + 6) continue;
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(cx, cy, e.fx, e.fy) - angle));
      if (diff <= half || d < 10) {
        e.takeDamage(dmg, this.fx, this.fy, M.knockback);
        // sem tremer a câmera nem congelar: o acerto aparece no alvo (faísca, flash e número)
        s.fx.impact(e.fx, e.fy - 8);
        s.fx.burst((e.fx + cx) / 2 + (e.fx - cx) * 0.3, e.fy - 6, 0xffffff, 5);
      }
    }
  }

  // ---------------------------------------------------------------- habilidades especiais
  /** Fortalecimento ou dano em área (habilidades 2 e 3 de cada arma). */
  private effect(E: Effect, aim: Phaser.Math.Vector2) {
    const s = this.scene;
    if (E.kind === 'buff') {
      const B = BUFFS[E.buff];
      this.buffs.set(E.buff, s.time.now + E.ms);
      this.ring(this.fx, this.fy - 6, 34, B.color, 380);
      s.fx.burst(this.x, this.y - 14, B.color, 16);
      s.fx.floatText(this.x, this.y - 30, `${B.name}!`, '#' + B.color.toString(16).padStart(6, '0'));
      return;
    }
    let cx = this.fx;
    let cy = this.fy;
    if (E.at === 'front') {
      cx += aim.x * 22;
      cy += aim.y * 22;
    } else if (E.at === 'target') {
      const t = this.targetAlong(aim, 160);
      cx = t.x;
      cy = t.y;
    }
    const mul = this.dmgMul;
    const waves = E.waves ?? 1;
    for (let w = 0; w < waves; w++)
      s.time.delayedCall(w * (E.every ?? 0), () => {
        if (E.style === 'rain') {
          // flechas caindo em pontos sorteados; o dano sai na queda
          for (let k = 0; k < 4; k++) {
            const r = Math.sqrt(Math.random()) * E.radius;
            const a = Math.random() * Math.PI * 2;
            this.fallingArrow(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7);
          }
          s.time.delayedCall(130, () => this.areaHit(cx, cy, E.radius, E.damage * mul, E.knockback, E.stun));
          return;
        }
        this.areaHit(cx, cy, E.radius, E.damage * mul, E.knockback, E.stun);
        this.ring(cx, cy, E.radius, E.color, E.style === 'quake' ? 320 : 420);
        if (E.style === 'quake') {
          s.cameras.main.shake(140, 0.003);
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            s.fx.burst(cx + Math.cos(a) * E.radius * 0.6, cy + Math.sin(a) * E.radius * 0.45, E.color, 2);
          }
          this.cracks(cx, cy, E.radius);
        } else {
          s.fx.burst(cx, cy - 6, E.color, 22);
        }
      });
    if (E.style === 'rain') this.ring(cx, cy, E.radius, 0xff6060, 1300, true);
  }

  /** Ponto do alvo na direção da mira: o inimigo mais alinhado, ou ~90 px à frente. */
  private targetAlong(aim: Phaser.Math.Vector2, range: number) {
    let best = { x: this.fx + aim.x * 90, y: this.fy + aim.y * 90 };
    let bestScore = Infinity;
    for (const e of this.scene.hostiles) {
      if (!e.targetable) continue;
      const dx = e.fx - this.fx;
      const dy = e.fy - this.fy;
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      const cos = (dx * aim.x + dy * aim.y) / (d || 1);
      if (cos < 0.6) continue;
      const score = d * (2 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = { x: e.fx, y: e.fy };
      }
    }
    return best;
  }

  private areaHit(x: number, y: number, r: number, dmg: number, kb: number, stun?: number) {
    const s0 = this.scene;
    let hit = false;
    for (const e of this.scene.hostiles) {
      if (!e.targetable) continue;
      if (Phaser.Math.Distance.Between(x, y, e.fx, e.fy) > r) continue;
      e.takeDamage(Math.max(1, Math.round(dmg)), x, y, kb);
      if (stun) e.stun(stun);
      s0.fx.impact(e.fx, e.fy - 8);
      hit = true;
    }
    return hit;
  }

  /** Anel que se expande (onda de choque) — ou que pisca no lugar (`hold`). */
  private ring(x: number, y: number, r: number, color: number, ms: number, hold = false) {
    const s = this.scene;
    const c = s.add.ellipse(x, y, r * 2, r * 1.4).setStrokeStyle(1.5, color, 0.9).setDepth(DEPTH.fx);
    if (hold) {
      c.setFillStyle(color, 0.08);
      s.tweens.add({ targets: c, alpha: 0.25, yoyo: true, repeat: 2, duration: ms / 6, onComplete: () => c.destroy() });
      return;
    }
    c.setScale(0.15);
    s.tweens.add({ targets: c, scale: 1, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
  }

  /** Rachaduras no chão do golpe sísmico. */
  private cracks(x: number, y: number, r: number) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(this.depth - 3);
    g.lineStyle(1, 0x2a2018, 0.8);
    for (let k = 0; k < 7; k++) {
      let a = (k / 7) * Math.PI * 2 + Math.random() * 0.4;
      let px = x;
      let py = y;
      for (let j = 0; j < 4; j++) {
        const l = (r / 4) * (0.7 + Math.random() * 0.5);
        const nx = px + Math.cos(a) * l;
        const ny = py + Math.sin(a) * l * 0.7;
        g.lineBetween(px, py, nx, ny);
        px = nx;
        py = ny;
        a += (Math.random() - 0.5) * 0.8;
      }
    }
    s.tweens.add({ targets: g, alpha: 0, delay: 900, duration: 700, onComplete: () => g.destroy() });
  }

  private fallingArrow(x: number, y: number) {
    const s = this.scene;
    const a = s.add.image(x + 6, y - 46, 'arrow').setRotation(Math.PI / 2 + 0.15).setScale(0.8).setDepth(DEPTH.fx);
    s.tweens.add({
      targets: a,
      x,
      y,
      duration: 130,
      ease: 'Quad.easeIn',
      onComplete: () => {
        s.fx.burst(x, y, 0xcbb89a, 3);
        s.tweens.add({ targets: a, alpha: 0, delay: 250, duration: 250, onComplete: () => a.destroy() });
      },
    });
  }

  /** Brilho nos pés enquanto houver fortalecimento ativo. */
  private buffFx(time: number) {
    if (time - this.lastBuffFx < 160) return;
    const b = this.activeBuffs;
    if (!b.length) return;
    this.lastBuffFx = time;
    for (const id of b) this.scene.fx.burst(this.x + Phaser.Math.Between(-5, 5), this.y - 2, BUFFS[id].color, 1);
  }

  /** Fora de combate (6 s sem levar dano) a vida volta aos poucos. */
  private regenerate(time: number, dt: number) {
    if (this.dead || this.hp >= this.maxHp || time - this.lastHurt < 6000) {
      this.regen = 0;
      return;
    }
    this.regen += dt * Math.max(0.5, this.maxHp * 0.03);
    if (this.regen >= 1) {
      const k = Math.floor(this.regen);
      this.regen -= k;
      this.hp = Math.min(this.maxHp, this.hp + k);
    }
  }

  // ---------------------------------------------------------------- coleta
  /** Golpeia um recurso em (x, y): toca a animação e chama `onHit` no impacto. */
  startGather(x: number, y: number, onHit: () => void) {
    if (this.state2 !== 'normal') return false;
    // para coletar, desce da montaria
    if (this.mount) this.scene.stable.toggle();
    const time = this.scene.time.now;
    this.buffered.gather = 0;
    this.updateDir(x - this.x, y - (this.y - 4));
    this.facing.set(x - this.x, y - this.y).normalize();
    this.state2 = 'gather';
    this.stateStart = time;
    this.stateUntil = time + sum(GATHER_FRAMES);
    this.gatherAt = time + startOf(GATHER_FRAMES, 4);
    this.gatherDone = onHit;
    return true;
  }

  wantsGather(time: number): boolean {
    return this.pressed('gather', time);
  }

  // ---------------------------------------------------------------- montaria
  private gallopT = 0;
  private combatCheck = 0;
  /** Montado e com inimigos por perto: a habilidade da montaria tem a vez no botão de coletar. */
  mountCombat = false;
  private lastMountDash = -99999;
  private lastMountSkill = -99999;
  private chargeUntil = 0;
  private chargeK = 1;
  private chargeDmg = 0;
  private chargeStun = 0;
  private chargeDir = new Phaser.Math.Vector2(1, 0);
  private trampled = new Set<unknown>();

  /** Disparada montado: avança rápido e atropela quem estiver no caminho. */
  /** Cor do rastro e se quem é atropelado leva garras (felinos, raptor) ou impacto. */
  private chargeColor = 0xffffff;
  private chargeClaws = false;

  private startCharge(time: number, dir: Phaser.Math.Vector2, ms: number, k: number, dmg: number, stunK: number, color = 0xdfe8ff, claws = false) {
    this.chargeColor = color;
    this.chargeClaws = claws;
    this.lastMountDash = time;
    this.buffered.dodge = 0;
    this.chargeUntil = time + ms;
    this.chargeK = k;
    this.chargeDmg = dmg;
    this.chargeStun = 500 * stunK;
    this.chargeDir.copy(dir).normalize();
    if (this.chargeDir.lengthSq() < 0.5) this.chargeDir.set(this.dir === 1 ? -1 : this.dir === 2 ? 1 : 0, this.dir === 0 ? 1 : this.dir === 3 ? -1 : 0);
    this.trampled.clear();
    this.dust(4);
    this.scene.mountFx.chargeStart(this.x, this.y, this.chargeDir, color);
  }

  private trample(time: number) {
    const s = this.scene;
    for (const e of s.hostiles) {
      if (!e.targetable || this.trampled.has(e)) continue;
      if (Phaser.Math.Distance.Between(this.fx, this.fy, e.fx, e.fy) > 16) continue;
      this.trampled.add(e);
      e.takeDamage(Math.max(1, Math.round(this.chargeDmg * this.dmgMul)), this.fx, this.fy, 260);
      if (this.chargeStun) e.stun(this.chargeStun);
      s.fx.impact(e.fx, e.fy - 8);
      s.mountFx.chargeHit(e.fx, e.fy, this.chargeDir, this.chargeColor, this.chargeClaws);
    }
    void time;
  }

  /** Habilidade da montaria: o efeito em src/systems/MountFx.ts, o dano aqui. */
  private mountSkill(K: MountSkill, aim: Phaser.Math.Vector2) {
    const s = this.scene;
    const p = K.power;
    const F = s.mountFx;
    const x = this.fx;
    const y = this.fy;
    const mul = this.dmgMul;
    s.fx.floatText(this.x, this.y - 40, `${K.name}!`, '#' + shade(K.color, 0.35).toString(16).padStart(6, '0'));
    const near = (r: number) => s.army.allies.filter((a) => Math.abs(a.x - x) < r && Math.abs(a.y - y) < r * 0.8);
    switch (K.kind) {
      case 'stomp': {
        const r = 30 + p * 8;
        s.hitStop(45);
        F.stomp(x, y, r, K.color, p);
        this.areaHit(x, y, r, (2 + p * 2) * mul, 280, 900 * p);
        break;
      }
      case 'roar': {
        const r = 44 + p * 6;
        this.buffs.set('war', s.time.now + 6000 + p * 2000);
        const allies = near(90);
        F.roar(x, y, r, K.color, allies);
        this.areaHit(x, y, r, 1 * mul, 120, 1400 * p);
        // o exército perto também se anima: cura um pouco
        for (const a of allies) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.15);
        break;
      }
      case 'heal': {
        const k = Math.round(this.maxHp * 0.3 * p);
        this.hp = Math.min(this.maxHp, this.hp + k);
        inputState.hp = Math.ceil(this.hp);
        s.fx.floatText(this.x, this.y - 26, `+${k}`, '#8aff9a');
        const allies = near(100);
        for (const a of allies) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.4 * p);
        F.heal(x, y, K.color, allies);
        break;
      }
      case 'breath': {
        // cone de fogo saindo da boca da montaria; queima quem estiver no cone
        const range = 70 + p * 12;
        const dir = aim.clone().normalize();
        const mouth = () => ({ x: this.x + dir.x * 16, y: this.y - 13 + dir.y * 8 });
        F.breath(mouth, dir, K.color, 650 + p * 150, range, (mx, my, ang) => {
          for (const e of s.hostiles) {
            if (!e.targetable) continue;
            const dx = e.fx - mx;
            const dy = e.fy - 6 - my;
            const d = Math.hypot(dx, dy);
            if (d > range || Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - ang)) > 0.5) continue;
            e.takeDamage(Math.max(1, Math.round((0.45 + 0.25 * p) * mul)), mx, my, 40);
            s.fx.ember(e.fx, e.fy - 10);
          }
        });
        break;
      }
      case 'frost': {
        const r = 46 + p * 8;
        F.frost(x, y, r, K.color);
        const stun = 2200 * p;
        s.time.delayedCall(90, () => {
          for (const e of s.hostiles) {
            if (!e.targetable || Phaser.Math.Distance.Between(x, y, e.fx, e.fy) > r) continue;
            e.takeDamage(Math.max(1, Math.round(2 * p * mul)), x, y, 60);
            e.stun(stun);
            F.freeze(e, stun);
          }
        });
        break;
      }
      case 'pounce':
        // bote: disparada longa e forte, atordoa quem atropela
        this.startCharge(s.time.now, aim, 300 + p * 80, 3, 3 + p * 2.5, 1.6 * p, K.color, K.name.startsWith('BOTE'));
        this.lastMountDash = s.time.now - MOUNT_DASH_CD;
        break;
      case 'gust': {
        const r = 40 + p * 6;
        const dir = aim.clone().normalize();
        F.gust(x, y, dir, r, K.color);
        this.areaHit(x + dir.x * 22, y + dir.y * 22, r, (2 + p) * mul, 480);
        break;
      }
    }
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
    this.updateDir(this.rollDir.x, this.rollDir.y);
    this.setAlpha(1);
    this.dust(4);
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
  /**
   * Dano no herói. Criaturas dão um tempo de invulnerabilidade depois do golpe;
   * `swarm` (soldados de exército) não: cada soldado que acerta conta — cercado
   * por muitos, o herói cai rápido (antes, 0,9 s de invulnerabilidade a cada
   * golpe o deixava quase imortal contra um exército).
   */
  hurt(amount: number, fromX: number, fromY: number, swarm = false) {
    const s = this.scene;
    if (swarm ? this.god || this.state2 === 'roll' || this.state2 === 'dead' : this.invulnerable) return;
    // a armadura absorve parte do dano (mínimo 1)
    const dmg = Math.max(1, Math.round(amount * (1 - this.defense)));
    this.hp = Math.max(0, this.hp - dmg);
    this.lastHurt = s.time.now;
    if (!swarm) this.invulnUntil = s.time.now + PLAYER.hurtInvuln;
    s.fx.damageText(this.x, this.y - 24, dmg, '#ff6060');
    this.flash(0xff4040, 120);
    const a = Phaser.Math.Angle.Between(fromX, fromY, this.fx, this.fy);
    const kb = swarm ? 60 : 150;
    this.body.setVelocity(Math.cos(a) * kb, Math.sin(a) * kb);
    if (!swarm) {
      this.gatherDone = undefined;
      this.pendingShot = undefined;
    }
    if (this.hp <= 0) {
      this.die();
      return;
    }
    // golpe de soldado não atordoa (senão, cercado, o herói nunca mais ataca)
    if (swarm) return;
    this.state2 = 'hurt';
    this.stateUntil = s.time.now + 180;
    // recuo: quadro de "encolher" da queda
    this.setPose(HERO.rows.fall, 1);
  }

  private die() {
    const s = this.scene;
    this.state2 = 'dead';
    this.stateStart = s.time.now;
    this.body.setVelocity(0, 0);
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
        this.buffs.clear();
        this.dir = 0;
        this.toIdle();
        this.invulnUntil = s.time.now + 2000;
        s.cameras.main.fadeIn(500, 10, 8, 20);
      });
    });
  }
}
