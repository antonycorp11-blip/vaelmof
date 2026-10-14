import Phaser from 'phaser';
import { TILE } from '../config';
import { DEPTH } from '../entities/Creature';
import type { Hittable } from '../entities/Hittable';
import { HERO, LPC_DIR } from '../entities/heroSheet';
import { HERO_SHEETS } from '../entities/heroSheets';
import type { WorldScene } from '../scenes/WorldScene';

/** Tipos de soldado: a arma define o tipo, como no herói. */
export type SoldierType = 'sword' | 'greatsword' | 'bow' | 'staff';
export const SOLDIER_TYPES: SoldierType[] = ['sword', 'greatsword', 'bow', 'staff'];

interface SoldierDef {
  name: string;
  hp: number;
  damage: number;
  /** Alcance do ataque (px). */
  range: number;
  /** Intervalo entre ataques (ms). */
  cooldown: number;
  speed: number;
  /** Recrutas gastos para formar um. */
  cost: number;
  ranged?: 'arrow' | 'bolt';
  /** Dano em área do disparo (px). */
  aoe?: number;
}

export const SOLDIERS: Record<SoldierType, SoldierDef> = {
  sword: { name: 'Espadachim', hp: 14, damage: 2, range: 15, cooldown: 850, speed: 50, cost: 1 },
  greatsword: { name: 'Montante', hp: 20, damage: 3.5, range: 19, cooldown: 1250, speed: 44, cost: 2 },
  bow: { name: 'Arqueiro', hp: 10, damage: 2, range: 150, cooldown: 1400, speed: 50, cost: 1, ranged: 'arrow' },
  staff: { name: 'Mago', hp: 9, damage: 3, range: 125, cooldown: 1900, speed: 46, cost: 3, ranged: 'bolt', aoe: 20 },
};

/** Patentes dos soldados: sobem com abates; multiplicam vida e dano. */
export const SOLDIER_RANKS = [
  { name: 'Recruta', kills: 0, mul: 1 },
  { name: 'Soldado', kills: 2, mul: 1.25 },
  { name: 'Veterano', kills: 5, mul: 1.6 },
  { name: 'Elite', kills: 10, mul: 2.1 },
];
const rankOf = (kills: number) => SOLDIER_RANKS.reduce((r, R, i) => (kills >= R.kills ? i : r), 0);

/** Trajes de cada lado (o herói usa o mesmo sistema de camadas). */
const OUTFIT: Record<0 | 1, Record<SoldierType, string>> = {
  0: { sword: 'legion', greatsword: 'legion', bow: 'hunter', staff: 'arcane' },
  1: { sword: 'plate', greatsword: 'plate', bow: 'leather', staff: 'arcane' },
};
const TEAM_COLOR = [0x5aa0ff, 0xff5a5a];
const BACK: Record<string, boolean> = { leather: true, plate: false, legion: false, arcane: true, hunter: true };

/** Quadro do soldado: 96×96, pés em y = 77; 15 colunas (0 parado, 1–8 andar, 9–14 ataque) × 4 direções. */
const CELL = 96;
const FOOT = 77;
const COLS = 15;
/** Animação grande (folhas de 128/192 px do herói) usada no ataque. */
const ATTACK: Record<SoldierType, { big?: string; row: number; cols: number[] }> = {
  sword: { big: 'slash', row: HERO.rows.slash, cols: [0, 1, 2, 3, 4, 5] },
  greatsword: { big: 'slash', row: HERO.rows.slash, cols: [0, 1, 2, 3, 4, 5] },
  staff: { big: 'thrust', row: HERO.rows.thrust, cols: [0, 1, 2, 4, 5, 7] },
  bow: { row: HERO.rows.shoot, cols: [1, 3, 5, 7, 8, 10] },
};
/** Passo do ataque em que o golpe acerta / a flecha sai. */
const HIT_STEP = 3;
const STEP_MS = 80;

export type ArmyMode = 'follow' | 'attack' | 'hold';

const SAVE_KEY = 'vaelmor.army.v1';

/** Um soldado: objeto leve com um sprite (sem corpo de física). */
export class Soldier implements Hittable {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hp: number;
  maxHp: number;
  dead = false;
  kills = 0;
  dir = 0;
  animT = Math.random() * 8;
  attackAt = -1;
  hitDone = true;
  cdUntil = 0;
  thinkAt = 0;
  target: Hittable | null = null;
  flashUntil = 0;
  stunUntil = 0;
  slowUntil = 0;
  fleeing = false;
  slot = 0;
  /** Soldado que deu o último golpe (para creditar o abate). */
  lastBy: Soldier | null = null;
  /** Cor da casa (exércitos inimigos); -1 = sem tom. */
  baseTint = -1;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly ring: Phaser.GameObjects.Image;

  constructor(
    readonly army: Army,
    readonly team: 0 | 1,
    readonly type: SoldierType,
    x: number,
    y: number,
    kills = 0,
  ) {
    this.x = x;
    this.y = y;
    this.kills = kills;
    this.maxHp = this.hp = Math.round(SOLDIERS[type].hp * this.mul);
    const s = army.scene;
    this.ring = s.add.image(x, y, 'soldier-ring').setTint(TEAM_COLOR[team]).setAlpha(0.7);
    this.sprite = s.add.sprite(x, y, `sold-${team}-${type}`, 0).setOrigin(0.5, FOOT / CELL);
    this.sprite.setScale(army.scale);
    this.ring.setScale(army.scale * 2);
  }

  get rank() {
    return rankOf(this.kills);
  }

  get mul() {
    return SOLDIER_RANKS[this.rank].mul;
  }

  get fx() {
    return this.x;
  }

  get fy() {
    return this.y;
  }

  get targetable() {
    return !this.dead && !this.fleeing;
  }

  takeDamage(amount: number, fromX: number, fromY: number, knockback = 60) {
    if (this.dead) return;
    this.hp -= amount;
    this.flashUntil = this.army.scene.time.now + 70;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    const k = Math.min(140, knockback) * 0.5;
    this.vx += Math.cos(a) * k;
    this.vy += Math.sin(a) * k;
    const p = this.army.scene.player;
    // números de dano só perto do herói (com centenas de soldados, seria poluição)
    if (Math.abs(p.x - this.x) < 110 && Math.abs(p.y - this.y) < 80) this.army.scene.fx.damageText(this.x, this.y - 26, Math.round(amount), this.team === 0 ? '#ff9a9a' : '#ffffff');
    if (this.hp <= 0) this.army.kill(this, this.lastBy ?? undefined);
    this.lastBy = null;
  }

  stun(ms: number) {
    this.stunUntil = Math.max(this.stunUntil, this.army.scene.time.now + ms);
  }

  slow(ms: number) {
    this.slowUntil = this.army.scene.time.now + ms;
  }

  destroy() {
    this.sprite.destroy();
    this.ring.destroy();
  }
}

interface Shot {
  img: Phaser.GameObjects.Image;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t0: number;
  dur: number;
  damage: number;
  aoe: number;
  team: 0 | 1;
  target: Hittable;
  from: Soldier;
}

/** Guerra em andamento contra o exército de uma casa rival. */
export interface War {
  house: string;
  start: number;
  killed: number;
  lost: number;
}

/**
 * Exércitos: os soldados do herói (time 0) e os de casas inimigas (time 1).
 * Feito para centenas de unidades no celular: um sprite por soldado (as
 * camadas LPC são fundidas numa folha por tipo e lado), sem física do Phaser
 * (os soldados se afastam por uma grade espacial e checam o mapa de colisão
 * direto), IA pensando em turnos alternados e flechas num pool.
 */
export class Army extends Phaser.Events.EventEmitter {
  readonly soldiers: Soldier[] = [];
  mode: ArmyMode = 'follow';
  /** Recrutas disponíveis em Brumavale (renovam com o tempo). */
  pool = 40;
  readonly poolMax = 60;
  war: War | null = null;
  ready = false;
  scale: number = HERO.scale;
  private holdX = 0;
  private holdY = 0;
  private faceX = 0;
  private faceY = 1;
  private shots: Shot[] = [];
  private shotPool: Phaser.GameObjects.Image[] = [];
  private grid = new Map<number, Soldier[]>();
  private poolTimer = 0;
  private warCheck = 0;
  private heroT: Hittable;
  /** Soldados salvos esperando as folhas ficarem prontas. */
  private pending: { t: SoldierType; k: number }[] = [];

  constructor(readonly scene: WorldScene) {
    super();
    const p = scene.player;
    this.heroT = {
      get dead() {
        return p.dead;
      },
      get fx() {
        return p.fx;
      },
      get fy() {
        return p.fy;
      },
      get targetable() {
        return !p.dead;
      },
      takeDamage: (a, x, y) => p.hurt(a, x, y),
      stun: () => {},
      slow: () => {},
    };
    if (!scene.textures.exists('soldier-ring')) {
      const g = scene.make.graphics({}, false);
      g.lineStyle(2, 0xffffff, 1).strokeEllipse(8, 4, 14, 6);
      g.generateTexture('soldier-ring', 16, 8);
      g.destroy();
    }
    this.load();
    if (this.pending.length) this.prepare(() => {});
  }

  get allies(): Soldier[] {
    return this.soldiers.filter((s) => s.team === 0 && !s.dead);
  }

  get foes(): Soldier[] {
    return this.soldiers.filter((s) => s.team === 1 && !s.dead);
  }

  /** Soldados aliados vivos (inclui os que ainda vão aparecer). */
  get size(): number {
    let n = this.pending.length;
    for (const s of this.soldiers) if (s.team === 0 && !s.dead) n++;
    return n;
  }

  // ------------------------------------------------------------------ folhas
  /** Carrega as camadas que faltam e funde uma folha por tipo e lado. */
  prepare(done: () => void) {
    if (this.ready) return done();
    const s = this.scene;
    const keys = new Set<string>();
    const sizes = new Map<string, number>();
    for (const team of [0, 1] as const)
      for (const t of SOLDIER_TYPES) {
        const o = OUTFIT[team][t];
        keys.add(`outfit-${o}`);
        if (BACK[o]) keys.add(`outfit-${o}-back`);
      }
    for (const t of SOLDIER_TYPES) {
      const w = HERO_SHEETS[t];
      if (w.bg) keys.add(`wpn-${t}-bg`);
      if (w.fg) keys.add(`wpn-${t}-fg`);
      const A = ATTACK[t];
      if (A.big) {
        const b = (w.big as unknown as Record<string, { frame: number; bg: boolean; fg: boolean }>)[A.big];
        for (const side of ['bg', 'fg'] as const)
          if (b[side]) {
            keys.add(`wpn-${t}-${A.big}-${side}`);
            sizes.set(`wpn-${t}-${A.big}-${side}`, b.frame);
          }
      }
    }
    const missing = [...keys].filter((k) => !s.textures.exists(k));
    const finish = () => {
      for (const team of [0, 1] as const) for (const t of SOLDIER_TYPES) this.compose(team, t);
      this.ready = true;
      const p = this.scene.player;
      for (const r of this.pending.splice(0)) this.addAlly(r.t, p.x, p.y + 30, r.k, false);
      this.regroup();
      done();
    };
    if (!missing.length) return finish();
    for (const k of missing) {
      const F = sizes.get(k) ?? HERO.frame;
      s.load.spritesheet(k, `assets/sprites/${k}.png`, { frameWidth: F, frameHeight: F });
    }
    s.load.once(Phaser.Loader.Events.COMPLETE, finish);
    s.load.start();
  }

  private compose(team: 0 | 1, type: SoldierType) {
    const s = this.scene;
    const key = `sold-${team}-${type}`;
    if (s.textures.exists(key)) return;
    const o = OUTFIT[team][type];
    const img = (k: string) => (s.textures.exists(k) ? (s.textures.get(k).getSourceImage() as HTMLImageElement) : null);
    const body = img(`outfit-${o}`)!;
    const back = BACK[o] ? img(`outfit-${o}-back`) : null;
    const wbg = img(`wpn-${type}-bg`);
    const wfg = img(`wpn-${type}-fg`);
    const A = ATTACK[type];
    const big = A.big ? (HERO_SHEETS[type].big as unknown as Record<string, { frame: number; footY: number; frames: number }>)[A.big] : undefined;
    const bbg = A.big ? img(`wpn-${type}-${A.big}-bg`) : null;
    const bfg = A.big ? img(`wpn-${type}-${A.big}-fg`) : null;
    const ct = s.textures.createCanvas(key, COLS * CELL, 4 * CELL)!;
    const ctx = ct.getContext();
    ctx.imageSmoothingEnabled = false;
    const F = HERO.frame;
    const uni = (src: HTMLImageElement | null, row: number, col: number, cx: number, cy: number) => {
      if (src) ctx.drawImage(src, col * F, row * F, F, F, cx + (CELL - F) / 2, cy + FOOT - HERO.footY, F, F);
    };
    for (let d = 0; d < 4; d++) {
      const lr = LPC_DIR[d];
      for (let c = 0; c < COLS; c++) {
        const cx = c * CELL;
        const cy = d * CELL;
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx, cy, CELL, CELL);
        ctx.clip();
        if (c <= 8) {
          // parado (coluna 0) e andando (1–8): folha universal
          const row = HERO.rows.walk + lr;
          for (const src of [back, wbg, body, wfg]) uni(src, row, c, cx, cy);
        } else {
          const i = c - 9;
          const row = A.row + lr;
          const col = A.cols[i];
          uni(back, row, col, cx, cy);
          if (big && bbg) ctx.drawImage(bbg, i * big.frame, lr * big.frame, big.frame, big.frame, cx + CELL / 2 - big.frame / 2, cy + FOOT - big.footY, big.frame, big.frame);
          else if (!big) uni(wbg, row, col, cx, cy);
          uni(body, row, col, cx, cy);
          if (big && bfg) ctx.drawImage(bfg, i * big.frame, lr * big.frame, big.frame, big.frame, cx + CELL / 2 - big.frame / 2, cy + FOOT - big.footY, big.frame, big.frame);
          else if (!big) uni(wfg, row, col, cx, cy);
        }
        ctx.restore();
        ct.add(d * COLS + c, 0, cx, cy, CELL, CELL);
      }
    }
    ct.refresh();
  }

  // ------------------------------------------------------------------ elenco
  private addAlly(type: SoldierType, x: number, y: number, kills = 0, save = true) {
    const s = new Soldier(this, 0, type, x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-6, 6), kills);
    this.soldiers.push(s);
    if (save) this.save();
    return s;
  }

  /** O herói está em Brumavale (onde se recruta)? */
  get inCapital(): boolean {
    const c = this.scene.map.cities.find((c) => c.capital);
    const p = this.scene.player;
    if (!c) return false;
    const tx = p.x / TILE;
    const ty = p.y / TILE;
    return tx >= c.x0 - 2 && tx <= c.x1 + 2 && ty >= c.y0 - 2 && ty <= c.y1 + 2;
  }

  /** Por que não dá para recrutar agora ('' = dá). */
  recruitBlock(type: SoldierType, n: number): string {
    if (!this.inCapital) return 'Recrute no quartel de Brumavale';
    if (this.size + n > this.scene.progress.armyCap) return `Sua patente comanda até ${this.scene.progress.armyCap} soldados`;
    if (this.pool < SOLDIERS[type].cost * n) return 'Faltam recrutas (renovam com o tempo)';
    return '';
  }

  /** Recruta `n` soldados do tipo (gasta recrutas). Devolve quantos entraram. */
  recruit(type: SoldierType, n: number, force = false): number {
    let k = 0;
    const p = this.scene.player;
    for (; k < n; k++) {
      if (!force && this.recruitBlock(type, 1)) break;
      if (!force) this.pool -= SOLDIERS[type].cost;
      this.addAlly(type, p.x - p.facing.x * 30, p.y - p.facing.y * 30, 0, false);
    }
    if (k) {
      this.regroup(false);
      this.save();
      this.emit('change');
    }
    return k;
  }

  // ------------------------------------------------------------------ guerra
  /** Uma casa rival manda um exército de `n` soldados contra o herói. */
  declareWar(n: number, house?: string) {
    if (this.war) return;
    const p = this.scene.player;
    // cada casa rival tem a sua cor (tingindo o exército inteiro)
    const houses: [string, number][] = [
      ['Casa do Corvo Rubro', 0xe08a8a],
      ['Casa Varanth', 0xb0a0e0],
      ['Casa de Ferro Velho', 0xa8a8a8],
      ['Casa das Dunas Negras', 0x9a8a70],
      ['Casa Morvane', 0x90c8a0],
    ];
    const [name, color] = house ? [house, 0xe08a8a] : Phaser.Utils.Array.GetRandom(houses);
    // de onde vêm: o lado mais livre a ~300 px
    let ang = 0;
    let best = -1;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      let free = 0;
      for (let r = 120; r <= 320; r += 40) if (!this.solidAt(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r)) free++;
      if (free > best) {
        best = free;
        ang = a;
      }
    }
    const cx = p.x + Math.cos(ang) * 300;
    const cy = p.y + Math.sin(ang) * 300;
    const fx = -Math.cos(ang);
    const fy = -Math.sin(ang);
    const rx = -fy;
    const ry = fx;
    const per = 16;
    const mirror = this.allies.map((s) => s.type);
    for (let i = 0; i < n; i++) {
      // espelha a composição do exército do herói (batalha justa); sem exército, um misto
      const r = Math.random();
      const type: SoldierType = mirror.length ? mirror[Math.floor(Math.random() * mirror.length)] : r < 0.5 ? 'sword' : r < 0.7 ? 'greatsword' : r < 0.9 ? 'bow' : 'staff';
      const row = Math.floor(i / per);
      const col = (i % per) - (per - 1) / 2;
      // arqueiros e magos atrás
      const back = type === 'bow' || type === 'staff' ? 2 : 0;
      const x = cx + rx * col * 13 - fx * (row + back) * 13;
      const y = cy + ry * col * 13 - fy * (row + back) * 13;
      // um ou outro veterano: o exército rival é tão experiente quanto o seu, em média
      const kills = mirror.length ? this.allies[i % this.allies.length].kills : Math.random() < 0.15 ? 2 : 0;
      const s = new Soldier(this, 1, type, x, y, kills);
      s.thinkAt = this.scene.time.now + Math.random() * 600;
      s.baseTint = color;
      s.sprite.setTint(color);
      this.soldiers.push(s);
    }
    this.war = { house: name, start: n, killed: 0, lost: 0 };
    // o exército do herói parte para o ataque
    if (this.mode === 'follow') this.setMode('attack');
    this.emit('war', this.war);
  }

  /** Remove todos os soldados inimigos (debug). */
  clearFoes() {
    for (const s of this.soldiers) if (s.team === 1) s.destroy();
    this.soldiers.splice(0, this.soldiers.length, ...this.soldiers.filter((s) => s.team === 0));
    this.war = null;
  }

  /** Soldado morto: some do campo; abates contam para quem matou. */
  kill(s: Soldier, by?: Soldier) {
    s.dead = true;
    s.target = null;
    const sc = this.scene;
    if (by && !by.dead) {
      const before = by.rank;
      by.kills++;
      if (by.rank > before) {
        const k = by.mul / SOLDIER_RANKS[before].mul;
        by.maxHp = Math.round(by.maxHp * k);
        by.hp = Math.min(by.maxHp, Math.round(by.hp * k));
        if (by.team === 0) sc.fx.floatText(by.x, by.y - 30, SOLDIER_RANKS[by.rank].name, '#ffd34a');
      }
    }
    if (s.team === 1) {
      if (this.war) this.war.killed++;
      // inimigo derrubado (pelo herói ou pelo exército) rende pontos de atributo
      sc.progress.addKill(0.5);
    } else if (this.war) this.war.lost++;
    s.sprite.setTintFill(0xffffff);
    sc.tweens.add({ targets: [s.sprite, s.ring], alpha: 0, duration: 500, onComplete: () => s.destroy() });
    if (s.team === 0) {
      this.save();
      this.emit('change');
    }
  }

  // ------------------------------------------------------------------ comandos
  setMode(m: ArmyMode) {
    this.mode = m;
    const p = this.scene.player;
    if (m === 'hold') {
      this.holdX = p.x;
      this.holdY = p.y;
    }
    for (const s of this.soldiers) if (s.team === 0) s.thinkAt = 0;
    this.emit('mode', m);
  }

  /** Traz os aliados para perto do herói (teleporte, renascimento). */
  regroup(all = true) {
    const p = this.scene.player;
    this.faceX = p.facing.x;
    this.faceY = p.facing.y;
    this.allies.forEach((s, i) => {
      s.slot = i;
      if (!all) return;
      const [x, y] = this.slotPos(i, p.x, p.y);
      s.x = x;
      s.y = y;
      s.vx = s.vy = 0;
    });
  }

  private slotPos(i: number, ox: number, oy: number): [number, number] {
    const per = 10;
    const row = Math.floor(i / per);
    const col = (i % per) - (per - 1) / 2;
    const bx = -this.faceX;
    const by = -this.faceY;
    return [ox + bx * (26 + row * 13) - by * col * 13, oy + by * (26 + row * 13) + bx * col * 13];
  }

  setScale(k: number) {
    this.scale = k;
    for (const s of this.soldiers) {
      s.sprite.setScale(k);
      s.ring.setScale(k * 2);
    }
  }

  // ------------------------------------------------------------------ simulação
  private solidAt(x: number, y: number) {
    return this.scene.collision.solid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  private nearest(s: Soldier, range: number): Hittable | null {
    let best: Hittable | null = null;
    let bd = range * range;
    const consider = (t: Hittable) => {
      if (!t.targetable) return;
      const dx = t.fx - s.x;
      const dy = t.fy - s.y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = t;
      }
    };
    for (const o of this.soldiers) if (o.team !== s.team) consider(o);
    if (s.team === 1) consider(this.heroT);
    // o exército do herói também enfrenta as criaturas do mapa — menos em guerra,
    // quando só um bicho colado nele tira o foco do exército inimigo
    else if (!this.war) for (const e of this.scene.enemies) consider(e);
    else if (!best) {
      bd = 30 * 30;
      for (const e of this.scene.enemies) consider(e);
    }
    return best;
  }

  update(time: number, delta: number) {
    if (!this.ready || !this.soldiers.length) {
      this.regenPool(delta);
      return;
    }
    const dt = Math.min(0.05, delta / 1000);
    const p = this.scene.player;
    this.regenPool(delta);
    // direção da formação acompanha o herói devagar
    if (p.body.velocity.lengthSq() > 100) {
      this.faceX += (p.facing.x - this.faceX) * Math.min(1, dt * 3);
      this.faceY += (p.facing.y - this.faceY) * Math.min(1, dt * 3);
      const l = Math.hypot(this.faceX, this.faceY) || 1;
      this.faceX /= l;
      this.faceY /= l;
    }
    // grade espacial (separação entre vizinhos)
    for (const list of this.grid.values()) list.length = 0;
    const G = 20;
    const cellKey = (x: number, y: number) => (Math.floor(x / G) & 0xffff) | (Math.floor(y / G) << 16);
    for (const s of this.soldiers) {
      if (s.dead) continue;
      const k = cellKey(s.x, s.y);
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(s);
    }
    const view = this.scene.cameras.main.worldView;
    let slot = 0;
    for (const s of this.soldiers) {
      if (s.dead) continue;
      const D = SOLDIERS[s.type];
      if (s.team === 0) s.slot = slot++;
      // decide o alvo de vez em quando (turnos alternados)
      if (time >= s.thinkAt) {
        s.thinkAt = time + 140 + Math.random() * 120;
        if (s.fleeing) s.target = null;
        else if (s.team === 1) s.target = this.nearest(s, 520);
        else if (this.mode === 'attack') s.target = this.nearest(s, 260);
        else s.target = this.nearest(s, this.mode === 'hold' ? 90 : 70);
        // longe demais do herói: alcança a formação
        if (s.team === 0 && Math.hypot(s.x - p.x, s.y - p.y) > 520) {
          const [x, y] = this.slotPos(s.slot, p.x, p.y);
          s.x = x;
          s.y = y;
        }
      }
      // para onde andar
      let gx = s.x;
      let gy = s.y;
      let wantAttack = false;
      const t = s.target;
      if (t && !t.targetable) s.target = null;
      if (s.fleeing) {
        gx = s.x + (s.x - p.x);
        gy = s.y + (s.y - p.y);
      } else if (s.target) {
        const dx = s.target.fx - s.x;
        const dy = s.target.fy - s.y;
        const d = Math.hypot(dx, dy);
        if (d > D.range * 0.85) {
          gx = s.target.fx;
          gy = s.target.fy;
        } else wantAttack = true;
        s.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
      } else if (s.team === 0) {
        const [x, y] = this.mode === 'hold' ? this.slotPos(s.slot, this.holdX, this.holdY) : this.slotPos(s.slot, p.x, p.y);
        gx = x;
        gy = y;
      } else {
        gx = p.x;
        gy = p.y;
      }
      // ataque
      const stunned = time < s.stunUntil;
      if (wantAttack && s.attackAt < 0 && time >= s.cdUntil && !stunned) {
        s.attackAt = time;
        s.hitDone = false;
        s.cdUntil = time + D.cooldown * (0.85 + Math.random() * 0.3);
      }
      if (s.attackAt >= 0) {
        const step = Math.floor((time - s.attackAt) / STEP_MS);
        if (!s.hitDone && step >= HIT_STEP) {
          s.hitDone = true;
          this.strike(s, time);
        }
        if (step >= 6) s.attackAt = -1;
      }
      // movimento
      const speed = D.speed * (time < s.slowUntil ? 0.45 : 1) * (s.fleeing ? 1.3 : 1);
      let tx = 0;
      let ty = 0;
      const ddx = gx - s.x;
      const ddy = gy - s.y;
      const dd = Math.hypot(ddx, ddy);
      if (dd > 3 && s.attackAt < 0 && !stunned) {
        const k = Math.min(1, dd / 18);
        tx = (ddx / dd) * speed * k;
        ty = (ddy / dd) * speed * k;
      }
      // separação dos vizinhos
      const cx = Math.floor(s.x / G);
      const cy = Math.floor(s.y / G);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const list = this.grid.get(((cx + ox) & 0xffff) | ((cy + oy) << 16));
          if (!list) continue;
          for (const o of list) {
            if (o === s) continue;
            const ex = s.x - o.x;
            const ey = s.y - o.y;
            const e2 = ex * ex + ey * ey;
            if (e2 < 100 && e2 > 0.01) {
              const e = Math.sqrt(e2);
              tx += (ex / e) * (10 - e) * 6;
              ty += (ey / e) * (10 - e) * 6;
            }
          }
        }
      // velocidade suavizada (o empurrão do golpe decai)
      s.vx += (tx - s.vx) * Math.min(1, dt * 8);
      s.vy += (ty - s.vy) * Math.min(1, dt * 8);
      const nx = s.x + s.vx * dt;
      const ny = s.y + s.vy * dt;
      if (!this.solidAt(nx, s.y)) s.x = nx;
      else s.vx = 0;
      if (!this.solidAt(s.x, ny)) s.y = ny;
      else s.vy = 0;
      const moving = s.vx * s.vx + s.vy * s.vy > 30;
      if (moving && !s.target) s.dir = Math.abs(s.vx) > Math.abs(s.vy) ? (s.vx < 0 ? 1 : 2) : s.vy < 0 ? 3 : 0;
      // quadro
      let col = 0;
      if (s.attackAt >= 0) col = 9 + Math.min(5, Math.floor((time - s.attackAt) / STEP_MS));
      else if (moving) {
        s.animT = (s.animT + dt * 10 * (Math.hypot(s.vx, s.vy) / D.speed)) % 8;
        col = 1 + Math.floor(s.animT);
      }
      const vis = s.x > view.x - 48 && s.x < view.right + 48 && s.y > view.y - 48 && s.y < view.bottom + 64;
      s.sprite.setVisible(vis);
      s.ring.setVisible(vis);
      if (!vis) continue;
      s.sprite.setFrame(s.dir * COLS + col).setPosition(s.x, s.y).setDepth(DEPTH.entities + s.y);
      if (time < s.flashUntil) s.sprite.setTintFill(0xffffff);
      else if (s.sprite.tintFill) {
        s.sprite.clearTint();
        if (s.baseTint >= 0) s.sprite.setTint(s.baseTint);
      }
      s.ring.setPosition(s.x, s.y - 1).setDepth(DEPTH.entities + s.y - 3);
    }
    this.updateShots(time);
    // mortos saem da lista depois do fade
    if (this.soldiers.some((s) => s.dead && !s.sprite.active)) this.soldiers.splice(0, this.soldiers.length, ...this.soldiers.filter((s) => s.sprite.active));
    if (time - this.warCheck > 400) {
      this.warCheck = time;
      this.checkWar();
    }
  }

  private regenPool(delta: number) {
    if (this.pool >= this.poolMax) return;
    this.poolTimer += delta;
    if (this.poolTimer >= 3000) {
      this.poolTimer = 0;
      this.pool++;
      this.emit('change');
    }
  }

  /** Golpe ou disparo no passo de impacto. */
  private strike(s: Soldier, time: number) {
    const t = s.target;
    if (!t || !t.targetable) return;
    const D = SOLDIERS[s.type];
    const dmg = D.damage * s.mul;
    if (!D.ranged) {
      if (Math.hypot(t.fx - s.x, t.fy - s.y) <= D.range + 8) this.hit(t, dmg, s);
      return;
    }
    // flecha / raio: voa até o ponto onde o alvo estava
    const img = this.shotPool.pop() ?? this.scene.add.image(0, 0, 'arrow');
    const bolt = D.ranged === 'bolt';
    img.setTexture(bolt ? 'bolt' : 'arrow', 0).setVisible(true).setScale(bolt ? 0.8 : 0.7).setDepth(DEPTH.fx);
    if (bolt) img.setTint(s.team === 0 ? 0x9fd0ff : 0xff9a9a);
    else img.clearTint();
    const sx = s.x;
    const sy = s.y - 12;
    const tx = t.fx;
    const ty = t.fy - 6;
    const d = Math.hypot(tx - sx, ty - sy);
    img.setPosition(sx, sy).setRotation(Math.atan2(ty - sy, tx - sx));
    this.shots.push({ img, sx, sy, tx, ty, t0: time, dur: (d / (bolt ? 200 : 280)) * 1000, damage: dmg, aoe: D.aoe ?? 0, team: s.team, target: t, from: s });
  }

  private hit(t: Hittable, dmg: number, by: Soldier) {
    if (t instanceof Soldier) t.lastBy = by;
    t.takeDamage(dmg, by.x, by.y, 50);
  }

  private updateShots(time: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      const k = (time - sh.t0) / sh.dur;
      if (k < 1) {
        // arco leve na trajetória
        sh.img.setPosition(sh.sx + (sh.tx - sh.sx) * k, sh.sy + (sh.ty - sh.sy) * k - Math.sin(k * Math.PI) * 10);
        continue;
      }
      if (sh.aoe) {
        this.scene.fx.burst(sh.tx, sh.ty, sh.team === 0 ? 0x9fd0ff : 0xff9a9a, 6);
        for (const o of this.soldiers) if (o.team !== sh.team && o.targetable && Math.hypot(o.x - sh.tx, o.y - sh.ty - 6) < sh.aoe) this.damageFrom(o, sh.damage, sh);
        if (sh.team === 1 && Math.hypot(this.heroT.fx - sh.tx, this.heroT.fy - sh.ty - 6) < sh.aoe) this.heroT.takeDamage(sh.damage, sh.sx, sh.sy);
      } else if (sh.target.targetable && Math.hypot(sh.target.fx - sh.tx, sh.target.fy - sh.ty - 6) < 16) this.damageFrom(sh.target, sh.damage, sh);
      sh.img.setVisible(false);
      this.shotPool.push(sh.img);
      this.shots.splice(i, 1);
    }
  }

  private damageFrom(t: Hittable, dmg: number, sh: Shot) {
    if (t instanceof Soldier && !sh.from.dead) t.lastBy = sh.from;
    t.takeDamage(dmg, sh.sx, sh.sy, 30);
  }

  private checkWar() {
    const w = this.war;
    if (!w) return;
    const p = this.scene.player;
    const alive = this.foes.length;
    if (p.dead) {
      // o herói caiu: o inimigo vence e vai embora
      this.rout();
      this.war = null;
      this.emit('war-end', { ...w, won: false });
      return;
    }
    // moral: com 30% do exército de pé, o resto foge
    if (alive <= Math.floor(w.start * 0.3)) {
      this.rout();
      this.war = null;
      const bonus = Math.round(w.start * 0.25);
      this.scene.progress.grant(bonus);
      this.emit('war-end', { ...w, won: true, bonus });
      this.save();
    }
  }

  private rout() {
    const sc = this.scene;
    for (const s of this.soldiers) {
      if (s.team !== 1 || s.dead) continue;
      s.fleeing = true;
      s.target = null;
      s.dead = true;
      sc.tweens.add({ targets: [s.sprite, s.ring], alpha: 0, delay: 1500 + Math.random() * 1500, duration: 600, onComplete: () => s.destroy() });
    }
  }

  /** Barras de vida dos soldados feridos visíveis. */
  drawBars(g: Phaser.GameObjects.Graphics, view: Phaser.Geom.Rectangle) {
    for (const s of this.soldiers) {
      if (s.dead || s.hp >= s.maxHp || !view.contains(s.x, s.y)) continue;
      const w = 10;
      const x = Math.round(s.x - w / 2);
      const y = Math.round(s.y - 27);
      g.fillStyle(0x1e1a24, 0.8).fillRect(x - 1, y - 1, w + 2, 3);
      g.fillStyle(s.team === 0 ? 0x5aa0ff : 0xe04848, 1).fillRect(x, y, Math.max(1, (w * s.hp) / s.maxHp), 1.5);
    }
  }

  // ------------------------------------------------------------------ salvar
  save() {
    try {
      const roster = this.soldiers.filter((s) => s.team === 0 && !s.dead).map((s) => ({ t: s.type, k: s.kills }));
      localStorage.setItem(SAVE_KEY, JSON.stringify({ roster: [...roster, ...this.pending], pool: this.pool }));
    } catch {
      /* sem armazenamento */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d.pool === 'number') this.pool = Phaser.Math.Clamp(d.pool, 0, this.poolMax);
      if (Array.isArray(d.roster)) for (const r of d.roster) if (SOLDIER_TYPES.includes(r.t)) this.pending.push({ t: r.t, k: Number(r.k) || 0 });
    } catch {
      /* sem save */
    }
  }

  /** Dispensa todo o exército (debug / zerar). */
  disband() {
    for (const s of this.soldiers) s.destroy();
    this.soldiers.length = 0;
    this.pending.length = 0;
    this.war = null;
    this.save();
    this.emit('change');
  }
}
