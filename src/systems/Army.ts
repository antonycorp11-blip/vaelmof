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
  sword: { name: 'Lâmina do Vale', hp: 14, damage: 2, range: 15, cooldown: 850, speed: 50, cost: 1 },
  greatsword: { name: 'Quebra-Escudos', hp: 20, damage: 3.5, range: 19, cooldown: 1250, speed: 44, cost: 2 },
  bow: { name: 'Flecha Cinzenta', hp: 10, damage: 2, range: 150, cooldown: 1400, speed: 50, cost: 1, ranged: 'arrow' },
  staff: { name: 'Arcanista', hp: 9, damage: 3, range: 125, cooldown: 1900, speed: 46, cost: 3, ranged: 'bolt', aoe: 20 },
};

/** Patentes dos soldados: sobem com abates; multiplicam vida e dano. */
// os nomes (e os ícones sobre a cabeça) são os quatro primeiros da escada do herói
export const SOLDIER_RANKS = [
  { name: 'Miliciano', kills: 0, mul: 1 },
  { name: 'Escudeiro', kills: 2, mul: 1.25 },
  { name: 'Lâmina Jurada', kills: 5, mul: 1.6 },
  { name: 'Guardião de Ferro', kills: 10, mul: 2.1 },
]
const rankOf = (kills: number) => SOLDIER_RANKS.reduce((r, R, i) => (kills >= R.kills ? i : r), 0);

/** Trajes de cada lado (o herói usa o mesmo sistema de camadas). */
const OUTFIT: Record<0 | 1, Record<SoldierType, string>> = {
  0: { sword: 'legion', greatsword: 'legion', bow: 'hunter', staff: 'arcane' },
  1: { sword: 'plate', greatsword: 'plate', bow: 'leather', staff: 'arcane' },
};
/** Cor do anel no chão: a do clã do jogador (muda ao fundar) e vermelho inimigo. */
export const TEAM_COLOR = [0x5aa0ff, 0xff5a5a];
/** Tom da arte dos aliados: a cor do clã clareada (para não escurecer demais). */
export const allyTint = (c: number) => {
  const k = 0.5;
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k);
};
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

/** Cura dos soldados fora de combate (fração da vida por segundo): no campo e dentro de uma cidade. */
/** Sem levar dano por este tempo (ms), o soldado começa a se curar. */
const HEAL_DELAY = 4000;
/** Raio (tiles) do campo de fluxo em volta do herói. */
const FLOW_R = 40;
/** Célula da grade de alvos (px). */
const TG = 64;

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
  /** Quadro (par/ímpar) em que atualiza quando está fora da tela. */
  readonly parity = Math.random() < 0.5 ? 0 : 1;
  /** Soldado que deu o último golpe (para creditar o abate). */
  lastBy: Soldier | null = null;
  /** Cor da casa (exércitos inimigos); -1 = sem tom. */
  baseTint = -1;
  /** Último dano levado (a cura espera um pouco). */
  lastHurt = -99999;
  /** O caminho reto até o herói está bloqueado: segue o campo de fluxo. */
  useFlow = false;
  /** Taxa de cura do lugar onde está (sede ou, sem sede, Brumavale); 0 = não cura. */
  healRate = 0;
  /** Postado na sede do clã: fica de guarda lá em vez de seguir o herói. */
  station = false;
  /** Posto (px) na sede. */
  postX = 0;
  postY = 0;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly ring: Phaser.GameObjects.Image;
  /** Insígnia da patente sobre a cabeça (azul aliado, vermelho inimigo). */
  readonly icon: Phaser.GameObjects.Image;

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
    this.maxHp = this.hp = Math.round(SOLDIERS[type].hp * this.hpMul);
    const s = army.scene;
    // anel no chão: profundidade fixa (abaixo de todos), não entra na reordenação por y
    this.ring = s.add.image(x, y, 'soldier-ring').setTint(TEAM_COLOR[team]).setAlpha(0.7).setDepth(DEPTH.birdShadow - 0.5);
    this.sprite = s.add.sprite(x, y, `sold-${team}-${type}`, 0).setOrigin(0.5, FOOT / CELL);
    this.sprite.setScale(army.scale);
    this.ring.setScale(army.scale * 2);
    this.icon = s.add.image(x, y, 'rank-icons', this.iconFrame).setDepth(DEPTH.fx - 50).setScale(army.iconScale);
    if (team === 0 && army.clanColor >= 0) {
      this.baseTint = allyTint(army.clanColor);
      this.sprite.setTint(this.baseTint);
    }
  }

  get iconFrame() {
    return this.team * 10 + this.rank;
  }

  /** Aliados não sobem de patente por abates: a insígnia mostra o treino da sede. Inimigos, por abates. */
  get rank() {
    return this.team === 0 ? this.army.upTier : rankOf(this.kills);
  }

  /** Multiplicador de dano. */
  get mul() {
    return this.team === 0 ? 1 + 0.1 * this.army.upg.atk : SOLDIER_RANKS[this.rank].mul;
  }

  /** Multiplicador de vida. */
  get hpMul() {
    return this.team === 0 ? 1 + 0.12 * this.army.upg.hp : SOLDIER_RANKS[this.rank].mul;
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
    // defesa treinada na sede (só aliados)
    if (this.team === 0) amount *= Math.max(0.5, 1 - 0.05 * this.army.upg.def);
    this.hp -= amount;
    this.lastHurt = this.army.scene.time.now;
    this.flashUntil = this.army.scene.time.now + 120;
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
    this.icon.destroy();
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
  from: Soldier | null;
}

/** Guerra em andamento contra o exército de uma casa rival. */
export interface War {
  house: string;
  /** Clã rival (guerra de clãs) — o painel de Clãs acerta as contas no fim. */
  clan?: string;
  color: number;
  /** De onde o inimigo veio (o líder aparece ali). */
  x: number;
  y: number;
  /** Cerco: o inimigo marcha para este ponto (a sede) e ataca as construções. */
  siege?: { x: number; y: number };
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
  /** Cor do clã do jogador (-1 = ainda sem clã). */
  clanColor = -1;
  /** Treino dos soldados na sede (níveis 0–10): ataque, defesa, vida. */
  upg = { atk: 0, def: 0, hp: 0 };
  /** Onde se curam: taxa por segundo no ponto (definido pela sede). */
  healAt: (x: number, y: number) => number = () => 0;
  /** Construções que o inimigo pode atacar (sede). */
  structures: () => Hittable[] = () => [];
  /** Posto do i-ésimo soldado de guarda na sede. */
  postOf: (i: number) => [number, number] | null = () => null;

  /** Insígnia dos aliados pelo treino total (0–3). */
  get upTier(): number {
    const t = this.upg.atk + this.upg.def + this.upg.hp;
    return t >= 24 ? 3 : t >= 14 ? 2 : t >= 6 ? 1 : 0;
  }

  /** Muda o treino: a vida máxima dos aliados acompanha (mantendo a proporção). */
  setUpgrades(u: { atk: number; def: number; hp: number }) {
    this.upg = { ...u };
    for (const s of this.soldiers) {
      if (s.team !== 0 || s.dead) continue;
      const k = s.hp / s.maxHp;
      s.maxHp = Math.round(SOLDIERS[s.type].hp * s.hpMul);
      s.hp = Math.max(1, Math.round(s.maxHp * k));
      s.icon.setFrame(s.iconFrame);
    }
    this.emit('change');
  }

  /** Soldados no campo com o herói (sem os de guarda na sede). */
  get field(): Soldier[] {
    return this.soldiers.filter((s) => s.team === 0 && !s.dead && !s.station);
  }

  get stationed(): Soldier[] {
    return this.soldiers.filter((s) => s.team === 0 && !s.dead && s.station);
  }

  /** Posta `n` soldados do campo na sede (vão andando até lá). */
  station(n: number): number {
    const list = this.field.slice(-n);
    for (const s of list) s.station = true;
    this.assignPosts();
    this.save();
    this.emit('change');
    return list.length;
  }

  /** Chama `n` guardas da sede de volta para o herói. */
  unstation(n: number): number {
    const list = this.stationed.slice(-n);
    for (const s of list) s.station = false;
    this.assignPosts();
    this.regroup(false);
    this.save();
    this.emit('change');
    return list.length;
  }

  /** Ataque à sede: os aquartelados saem para os postos de guarda. */
  garrisonToPosts(): number {
    let n = 0;
    for (const g of this.garrison.splice(0)) {
      const p = this.postOf(this.stationed.length);
      if (!p) {
        this.garrison.push(g);
        continue;
      }
      const s = this.addAlly(g.t, p[0], p[1], g.k, false, true);
      s.postX = p[0];
      s.postY = p[1];
      n++;
    }
    this.assignPosts();
    this.save();
    this.emit('change');
    return n;
  }

  assignPosts() {
    this.stationed.forEach((s, i) => {
      const p = this.postOf(i);
      if (p) [s.postX, s.postY] = p;
      // sem vaga (Alojamento menor ou destruído): volta para o herói
      else if (this.scene.hq?.founded) s.station = false;
    });
  }

  /** Disparo de fora do exército (torres da sede). */
  fire(sx: number, sy: number, t: Hittable, damage: number, team: 0 | 1) {
    const img = this.shotPool.pop() ?? this.scene.add.image(0, 0, 'arrow');
    img.setTexture('arrow', 0).setVisible(true).setScale(0.7).setDepth(DEPTH.fx).clearTint();
    const tx = t.fx;
    const ty = t.fy - 6;
    const d = Math.hypot(tx - sx, ty - sy);
    img.setPosition(sx, sy).setRotation(Math.atan2(ty - sy, tx - sx));
    this.shots.push({ img, sx, sy, tx, ty, t0: this.scene.time.now, dur: (d / 300) * 1000, damage, aoe: 0, team, target: t, from: null });
  }

  /** Pinta o exército do jogador com a cor do clã. */
  setClanColor(c: number) {
    this.clanColor = c;
    TEAM_COLOR[0] = c;
    for (const s of this.soldiers) {
      if (s.team !== 0) continue;
      s.baseTint = allyTint(c);
      s.sprite.setTint(s.baseTint);
      s.ring.setTint(c);
    }
  }

  /** Tamanho das insígnias (acompanha o ajuste de pixels do herói). */
  get iconScale(): number {
    return this.scale * 1.6;
  }
  private holdX = 0;
  private holdY = 0;
  private faceX = 0;
  private faceY = 1;
  private shots: Shot[] = [];
  private shotPool: Phaser.GameObjects.Image[] = [];
  private grid = new Map<number, Soldier[]>();
  /** Grade grossa por lado (células de TG px) para achar o inimigo mais perto sem varrer todos. */
  private tgrid: [Map<number, Soldier[]>, Map<number, Soldier[]>] = [new Map(), new Map()];
  private poolTimer = 0;
  private frameN = 0;
  private warCheck = 0;
  private heroT: Hittable;
  /** Soldados salvos esperando as folhas ficarem prontas. */
  private pending: { t: SoldierType; k: number; st?: boolean }[] = [];
  /** Aquartelados em Brumavale (fora do campo; voltam com Convocar, curados). */
  garrison: { t: SoldierType; k: number }[] = [];
  /** Campo de fluxo (distância em passos até o herói) para contornar obstáculos. */
  private flow = new Uint16Array((FLOW_R * 2 + 1) ** 2);
  private flowOX = 0;
  private flowOY = 0;
  private flowTile = -1;
  private flowAt = 0;
  private flowQ = new Int32Array((FLOW_R * 2 + 1) ** 2);

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
    let n = this.pending.length + this.garrison.length;
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
      for (const r of this.pending.splice(0)) {
        const s = this.addAlly(r.t, p.x, p.y + 30, r.k, false, !!r.st);
        if (s.station) {
          // guardas nascem no posto
          this.assignPosts();
          if (s.station) {
            s.x = s.postX;
            s.y = s.postY;
          }
        }
      }
      this.assignPosts();
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
      }
    }
    // cada quadro recortado ao desenho: a GPU não pinta os ~70% transparentes da célula
    const px = ctx.getImageData(0, 0, COLS * CELL, 4 * CELL).data;
    const rowW = COLS * CELL * 4;
    for (let d = 0; d < 4; d++)
      for (let c = 0; c < COLS; c++) {
        const cx = c * CELL;
        const cy = d * CELL;
        let x0 = CELL;
        let y0 = CELL;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < CELL; y++) {
          const base = (cy + y) * rowW + cx * 4 + 3;
          for (let x = 0; x < CELL; x++)
            if (px[base + x * 4] > 0) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) {
          x0 = y0 = 0;
          x1 = y1 = 0;
        }
        const f = ct.add(d * COLS + c, 0, cx + x0, cy + y0, x1 - x0 + 1, y1 - y0 + 1);
        f?.setTrim(CELL, CELL, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      }
    ct.refresh();
  }

  // ------------------------------------------------------------------ elenco
  private addAlly(type: SoldierType, x: number, y: number, kills = 0, save = true, station = false) {
    const s = new Soldier(this, 0, type, x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-6, 6), kills);
    s.station = station;
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
    const hq = this.scene.hq;
    const atHq = hq.founded && hq.heroInside && hq.level('barracks') > 0;
    if (!this.inCapital && !atHq) return hq.founded ? 'Recrute em Brumavale ou no Alojamento da sede' : 'Recrute no quartel de Brumavale';
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
  declareWar(n: number, house?: { name: string; color: number; clan?: string }, opts: { origin?: { x: number; y: number }; vet?: number; siege?: { x: number; y: number } } = {}) {
    if (this.war) return;
    const p = opts.origin ?? this.scene.player;
    // cada casa rival tem a sua cor (tingindo o exército inteiro)
    const houses: [string, number][] = [
      ['Casa do Corvo Rubro', 0xe08a8a],
      ['Casa Varanth', 0xb0a0e0],
      ['Casa de Ferro Velho', 0xa8a8a8],
      ['Casa das Dunas Negras', 0x9a8a70],
      ['Casa Morvane', 0x90c8a0],
    ];
    const [name, color] = house ? [house.name, allyTint(house.color)] : Phaser.Utils.Array.GetRandom(houses);
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
      const vet = opts.vet ?? 0;
      const kills = SOLDIER_RANKS[Math.max(0, Math.min(3, vet - (Math.random() < 0.4 ? 1 : 0)))].kills;
      const s = new Soldier(this, 1, type, x, y, kills);
      s.thinkAt = this.scene.time.now + Math.random() * 600;
      s.baseTint = color;
      s.sprite.setTint(color);
      this.soldiers.push(s);
    }
    this.war = { house: name, clan: house?.clan, color, x: cx, y: cy, siege: opts.siege, start: n, killed: 0, lost: 0 };
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
      if (by.team === 1 && by.rank > before) {
        const k = by.mul / SOLDIER_RANKS[before].mul;
        by.maxHp = Math.round(by.maxHp * k);
        by.hp = Math.min(by.maxHp, Math.round(by.hp * k));
        by.icon.setFrame(by.iconFrame);
      }
    }
    if (s.team === 1) {
      if (this.war) this.war.killed++;
      // abate do herói vale mais (e mais ainda contra soldados graduados); do exército, 1
      sc.gainGlory(by ? 1 : 3 + 2 * s.rank, s.x, s.y - 30, true);
    } else {
      if (this.war) this.war.lost++;
      // cada baixa custa Glória
      sc.gainGlory(-1, s.x, s.y - 30);
    }
    s.sprite.setTintFill(0xffffff);
    sc.tweens.add({ targets: [s.sprite, s.ring, s.icon], alpha: 0, duration: 500, onComplete: () => s.destroy() });
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

  /** Manda o exército para o quartel de Brumavale: o herói anda sozinho. */
  quarter(): boolean {
    if (this.war) return false;
    const sc = this.scene;
    for (const s of this.soldiers) {
      if (s.team !== 0 || s.dead || s.station) continue;
      this.garrison.push({ t: s.type, k: s.kills });
      s.dead = true;
      sc.fx.burst(s.x, s.y - 10, 0xbfe0ff, 3);
      sc.tweens.add({ targets: [s.sprite, s.ring, s.icon], alpha: 0, duration: 400, onComplete: () => s.destroy() });
    }
    this.save();
    this.emit('change');
    return this.garrison.length > 0;
  }

  /** Chama o exército aquartelado: chegam marchando por trás do herói, curados. */
  summon(): number {
    if (!this.garrison.length) return 0;
    const p = this.scene.player;
    const n = this.garrison.length;
    const bx = p.x - this.faceX * 140;
    const by = p.y - this.faceY * 140;
    for (const g of this.garrison.splice(0)) {
      const s = this.addAlly(g.t, bx + Phaser.Math.Between(-30, 30), by + Phaser.Math.Between(-20, 20), g.k, false);
      // se nasceu dentro de algo, nasce junto do herói
      if (this.solidAt(s.x, s.y)) {
        s.x = p.x;
        s.y = p.y;
      }
      s.sprite.setAlpha(0);
      this.scene.tweens.add({ targets: [s.sprite, s.ring, s.icon], alpha: 1, duration: 500 });
    }
    this.regroup(false);
    this.save();
    this.emit('change');
    return n;
  }

  /** Traz os aliados para perto do herói (teleporte, renascimento). */
  regroup(all = true) {
    const p = this.scene.player;
    this.faceX = p.facing.x;
    this.faceY = p.facing.y;
    this.field.forEach((s, i) => {
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
      s.icon.setScale(this.iconScale);
    }
  }

  // ------------------------------------------------------------------ simulação
  private solidAt(x: number, y: number) {
    return this.scene.collision.solid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Caminho reto livre entre dois pontos (amostrado a cada 6 px)? */
  private los(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) if (this.solidAt(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
    return true;
  }

  /**
   * Campo de fluxo: BFS a partir do tile do herói (raio de 40 tiles). Cada tile
   * guarda quantos passos faltam até ele; quem está com o caminho reto
   * bloqueado desce esse gradiente e contorna árvores, muros e rios.
   */
  private buildFlow(time: number) {
    const p = this.scene.player;
    const htx = Math.floor(p.x / TILE);
    const hty = Math.floor(p.y / TILE);
    const key = hty * 65536 + htx;
    if (key === this.flowTile && time - this.flowAt < 1500) return;
    if (time - this.flowAt < 200) return;
    this.flowTile = key;
    this.flowAt = time;
    const S = FLOW_R * 2 + 1;
    this.flowOX = htx - FLOW_R;
    this.flowOY = hty - FLOW_R;
    const f = this.flow;
    f.fill(65535);
    const q = this.flowQ;
    let head = 0;
    let tail = 0;
    const col = this.scene.collision;
    const start = FLOW_R * S + FLOW_R;
    f[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const c = q[head++];
      const cx = c % S;
      const cy = (c - cx) / S;
      const d = f[c] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        const ni = ny * S + nx;
        if (f[ni] <= d || col.solid(this.flowOX + nx, this.flowOY + ny)) continue;
        f[ni] = d;
        q[tail++] = ni;
      }
    }
  }

  /** Direção (unitária) para descer o campo de fluxo a partir de (x, y); null fora dele. */
  private flowDir(x: number, y: number): [number, number] | null {
    const S = FLOW_R * 2 + 1;
    const cx = Math.floor(x / TILE) - this.flowOX;
    const cy = Math.floor(y / TILE) - this.flowOY;
    if (cx < 1 || cy < 1 || cx >= S - 1 || cy >= S - 1) return null;
    const f = this.flow;
    let best = f[cy * S + cx];
    let bx = 0;
    let by = 0;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        // diagonal só se as duas laterais estiverem livres (não corta quina)
        if (ox && oy && (f[cy * S + cx + ox] === 65535 || f[(cy + oy) * S + cx] === 65535)) continue;
        const v = f[(cy + oy) * S + cx + ox];
        if (v < best) {
          best = v;
          bx = ox;
          by = oy;
        }
      }
    if (!bx && !by) return null;
    // mira o centro do tile vizinho
    const tx = (this.flowOX + cx + bx) * TILE + 8 - x;
    const ty = (this.flowOY + cy + by) * TILE + 8 - y;
    const l = Math.hypot(tx, ty) || 1;
    return [tx / l, ty / l];
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
    // anéis de células em volta, do mais perto para o mais longe; para quando o
    // anel já está mais longe que o melhor achado
    const grid = this.tgrid[s.team === 0 ? 1 : 0];
    if (grid.size) {
      const cx = Math.floor(s.x / TG);
      const cy = Math.floor(s.y / TG);
      const R = Math.ceil(range / TG);
      for (let r = 0; r <= R; r++) {
        if (best && (r - 1) * TG > Math.sqrt(bd)) break;
        for (let oy = -r; oy <= r; oy++)
          for (let ox = -r; ox <= r; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
            const list = grid.get(((cx + ox) & 0xffff) | ((cy + oy) << 16));
            if (list) for (const o of list) consider(o);
          }
      }
    }
    if (s.team === 1) {
      consider(this.heroT);
      if (this.war?.siege) for (const t of this.structures()) consider(t);
    }
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
    const dt0 = Math.min(0.05, delta / 1000);
    const dt = dt0;
    const p = this.scene.player;
    this.frameN++;
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
    // células vazias de lugares por onde o exército já passou: limpa de vez em quando
    if (this.grid.size > 3000) this.grid.clear();
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
    for (const g of this.tgrid) {
      if (g.size > 1500) g.clear();
      for (const list of g.values()) list.length = 0;
    }
    for (const s of this.soldiers) {
      if (s.dead) continue;
      const g = this.tgrid[s.team];
      const k = (Math.floor(s.x / TG) & 0xffff) | (Math.floor(s.y / TG) << 16);
      let list = g.get(k);
      if (!list) g.set(k, (list = []));
      list.push(s);
    }
    const view = this.scene.cameras.main.worldView;
    this.buildFlow(time);
    let slot = 0;
    for (const s of this.soldiers) {
      if (s.dead) continue;
      const D = SOLDIERS[s.type];
      if (s.team === 0 && !s.station) s.slot = slot++;
      // fora da tela: anda em quadros alternados, com passo dobrado (metade do custo)
      const off = !s.sprite.visible;
      if (off && ((this.frameN + s.parity) & 1)) continue;
      const dt = off ? Math.min(0.1, dt0 * 2) : dt0;
      // decide o alvo de vez em quando (turnos alternados)
      if (time >= s.thinkAt) {
        s.thinkAt = time + 140 + Math.random() * 120;
        if (s.fleeing) s.target = null;
        else if (s.station) {
          // guarda: só sai do posto atrás de quem chega perto da sede
          const t = this.nearest(s, 170);
          s.target = t && Math.hypot(t.fx - s.postX, t.fy - s.postY) < 230 ? t : null;
        } else if (s.team === 1) s.target = this.nearest(s, this.war?.siege ? 160 : 520);
        else if (this.mode === 'attack') s.target = this.nearest(s, 260);
        else s.target = this.nearest(s, this.mode === 'hold' ? 90 : 70);
        // caminho reto até o herói bloqueado? então contorna pelo campo de fluxo
        s.useFlow = !s.target && !s.station && !(s.team === 1 && this.war?.siege) && Math.hypot(s.x - p.x, s.y - p.y) > 30 && !this.los(s.x, s.y, p.x, p.y);
        s.healRate = s.team === 0 ? this.healAt(s.x, s.y) : 0;
        // longe demais do herói: alcança a formação
        if (s.team === 0 && !s.station && Math.hypot(s.x - p.x, s.y - p.y) > 520) {
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
      } else if (s.station) {
        gx = s.postX;
        gy = s.postY;
      } else if (s.team === 0) {
        const [x, y] = this.mode === 'hold' ? this.slotPos(s.slot, this.holdX, this.holdY) : this.slotPos(s.slot, p.x, p.y);
        gx = x;
        gy = y;
      } else if (this.war?.siege) {
        gx = this.war.siege.x;
        gy = this.war.siege.y;
      } else {
        gx = p.x;
        gy = p.y;
      }
      // contornando obstáculo: segue o gradiente do campo de fluxo até o herói
      if (s.useFlow && !s.target && !s.fleeing && !(s.team === 0 && this.mode === 'hold')) {
        const fd = this.flowDir(s.x, s.y);
        if (fd) {
          gx = s.x + fd[0] * 24;
          gy = s.y + fd[1] * 24;
        }
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
        let ux = ddx / dd;
        let uy = ddy / dd;
        // desvio local: se a frente está bloqueada, tenta girar para os lados
        if (this.solidAt(s.x + ux * 8, s.y + uy * 8)) {
          for (const a of [0.7, -0.7, 1.4, -1.4]) {
            const c = Math.cos(a);
            const sn = Math.sin(a);
            const rx = ux * c - uy * sn;
            const ry = ux * sn + uy * c;
            if (!this.solidAt(s.x + rx * 8, s.y + ry * 8)) {
              ux = rx;
              uy = ry;
              break;
            }
          }
        }
        tx = ux * speed * k;
        ty = uy * speed * k;
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
      // cura fora de combate (mais rápida dentro das cidades)
      // cura só na sede (ou, antes de ter sede, em Brumavale)
      if (s.team === 0 && s.healRate > 0 && s.hp < s.maxHp && time - s.lastHurt > HEAL_DELAY) {
        s.hp = Math.min(s.maxHp, s.hp + s.maxHp * s.healRate * dt);
        if (!off && Math.random() < dt * 1.2) this.scene.fx.burst(s.x, s.y - 14, 0x7dff8a, 2);
      }
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
      s.icon.setVisible(vis);
      if (!vis) continue;
      s.icon.setPosition(Math.round(s.x), Math.round(s.y - 25));
      s.sprite.setFrame(s.dir * COLS + col).setPosition(s.x, s.y).setDepth(DEPTH.entities + s.y);
      if (time < s.flashUntil) s.sprite.setTintFill(0xffffff);
      else if (s.sprite.tintFill) {
        s.sprite.clearTint();
        if (s.baseTint >= 0) s.sprite.setTint(s.baseTint);
      }
      s.ring.setPosition(s.x, s.y - 1);
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
    if (t instanceof Soldier && sh.from && !sh.from.dead) t.lastBy = sh.from;
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
      this.scene.gainGlory(-w.start, p.x, p.y - 40);
      this.emit('war-end', { ...w, won: false, glory: -w.start });
      return;
    }
    // moral: com 30% do exército de pé, o resto foge
    if (alive <= Math.floor(w.start * 0.3)) {
      this.rout();
      this.war = null;
      const glory = w.start * 2;
      this.scene.gainGlory(glory, p.x, p.y - 40);
      this.emit('war-end', { ...w, won: true, glory });
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
      sc.tweens.add({ targets: [s.sprite, s.ring, s.icon], alpha: 0, delay: 1500 + Math.random() * 1500, duration: 600, onComplete: () => s.destroy() });
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
      const roster = this.soldiers.filter((s) => s.team === 0 && !s.dead).map((s) => ({ t: s.type, k: s.kills, st: s.station || undefined }));
      localStorage.setItem(SAVE_KEY, JSON.stringify({ roster: [...roster, ...this.pending], garrison: this.garrison, pool: this.pool }));
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
      if (Array.isArray(d.roster)) for (const r of d.roster) if (SOLDIER_TYPES.includes(r.t)) this.pending.push({ t: r.t, k: Number(r.k) || 0, st: !!r.st });
      if (Array.isArray(d.garrison)) for (const r of d.garrison) if (SOLDIER_TYPES.includes(r.t)) this.garrison.push({ t: r.t, k: Number(r.k) || 0 });
    } catch {
      /* sem save */
    }
  }

  /** Dispensa todo o exército (debug / zerar). */
  disband() {
    for (const s of this.soldiers) s.destroy();
    this.soldiers.length = 0;
    this.pending.length = 0;
    this.garrison.length = 0;
    this.war = null;
    this.save();
    this.emit('change');
  }
}
