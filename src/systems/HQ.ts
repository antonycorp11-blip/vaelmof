import Phaser from 'phaser';
import { TILE } from '../config';
import { HQ_ART } from '../data/hqArt';
import { ITEMS } from '../data/items';
import { SKIN_CELL, SKIN_COLS, SKIN_FOOT, SKINS } from '../data/skins';
import { DEPTH } from '../entities/Creature';
import type { Hittable } from '../entities/Hittable';
import type { WorldScene } from '../scenes/WorldScene';
import { allyTint, type Soldier } from './Army';
import type { Band } from './Bands';
import type { Clan } from './Clans';
import type { ItemStack } from './Inventory';
import { T } from './Tiles';

/** Tamanho da sede em tiles (muralha incluída) e largura do portão (ao sul). */
export const HQ_W = 30;
export const HQ_H = 24;
const GATE = 4;

export type Material = 'wood' | 'stone' | 'ore' | 'crystal' | 'fiber';
export const MATERIAL_NAME: Record<Material | 'gold', string> = { wood: 'madeira', stone: 'pedra', ore: 'minério', crystal: 'cristal', fiber: 'fibra', gold: 'ouro' };
export type Cost = Partial<Record<Material | 'gold', number>>;

export type BuildId = 'hall' | 'barracks' | 'arsenal' | 'infirmary' | 'warehouse' | 'treasury' | 'wall0' | 'wall1' | 'wall2' | 'wall3' | 'tower0' | 'tower1' | 'tower2' | 'tower3';

interface Def {
  name: string;
  /** O que faz, por nível (índice 1..max). */
  desc: string[];
  cost: Cost[];
  hp: number[];
  /** Onde fica a construção: tile do meio da base, relativo ao canto da sede. */
  at?: [number, number];
}

const SIDES = ['norte', 'leste', 'sul', 'oeste'];
const CORNERS = ['noroeste', 'nordeste', 'sudoeste', 'sudeste'];

export const DEFS: Record<BuildId, Def> = {
  hall: {
    name: 'Salão do Clã',
    desc: ['', 'Coração da sede: cura os soldados, recebe os chamados dos Lordes e rende 5 de ouro/min. Se cair, o clã acaba.', 'Mais resistente; 12 de ouro/min; libera construções de nível 2.', 'Fortaleza; 25 de ouro/min; libera o nível 3.'],
    cost: [{}, { wood: 40, stone: 30 }, { wood: 120, stone: 120, gold: 300 }, { wood: 250, stone: 300, ore: 40, gold: 1200 }],
    hp: [0, 600, 1500, 3200],
    at: [15, 9],
  },
  barracks: {
    name: 'Alojamento',
    desc: ['', 'Recrute na sede; até 15 soldados de guarda.', 'Até 40 de guarda.', 'Até 80 de guarda.'],
    cost: [{}, { wood: 50, stone: 20 }, { wood: 120, stone: 80, gold: 200 }, { wood: 200, stone: 200, gold: 600 }],
    hp: [0, 300, 700, 1200],
    at: [6, 9],
  },
  arsenal: {
    name: 'Arsenal',
    desc: ['', 'Treina ataque, defesa e vida dos soldados (até o nível 10).'],
    cost: [{}, { wood: 40, stone: 40, ore: 10 }],
    hp: [0, 450],
    at: [24, 9],
  },
  infirmary: {
    name: 'Enfermaria',
    desc: ['', 'Cura 16% da vida por segundo (sem ela, 8%).', 'Cura 28% por segundo.'],
    cost: [{}, { wood: 30, fiber: 10 }, { wood: 80, stone: 40, crystal: 10, gold: 200 }],
    hp: [0, 250, 500],
    at: [4, 16],
  },
  treasury: {
    name: 'Tesouraria',
    desc: ['', '+20 de ouro/min.', '+50 de ouro/min.', '+110 de ouro/min.'],
    cost: [{}, { stone: 40, wood: 20 }, { stone: 120, ore: 20, gold: 200 }, { stone: 250, ore: 60, crystal: 20, gold: 800 }],
    hp: [0, 300, 600, 1000],
    at: [9, 16],
  },
  warehouse: {
    name: 'Armazém',
    desc: ['', 'Baú com 24 espaços para guardar o que não quer carregar.', 'Baú com 48 espaços.'],
    cost: [{}, { wood: 40 }, { wood: 80, stone: 60, gold: 150 }],
    hp: [0, 250, 500],
    at: [22, 16],
  },
  ...(Object.fromEntries(
    SIDES.map((n, i) => [
      `wall${i}`,
      { name: `Muralha ${n}`, desc: ['', 'Paliçada de madeira.', 'Muralha de pedra.'], cost: [{}, { wood: 25 }, { stone: 40, wood: 10 }], hp: [0, 400, 1200] },
    ]),
  ) as Record<'wall0' | 'wall1' | 'wall2' | 'wall3', Def>),
  ...(Object.fromEntries(
    CORNERS.map((n, i) => [
      `tower${i}`,
      { name: `Torre ${n}`, desc: ['', 'Atira flechas (dano 3) em quem chega perto.', 'Torre de pedra: dano 6, mais vida.'], cost: [{}, { wood: 30, stone: 10 }, { stone: 40, ore: 10 }], hp: [0, 300, 800] },
    ]),
  ) as Record<'tower0' | 'tower1' | 'tower2' | 'tower3', Def>),
};

export const BUILD_ORDER: BuildId[] = ['hall', 'barracks', 'arsenal', 'infirmary', 'treasury', 'warehouse', 'wall0', 'wall1', 'wall2', 'wall3', 'tower0', 'tower1', 'tower2', 'tower3'];
const TOWER_AT: [number, number][] = [
  [2, 3],
  [HQ_W - 3, 3],
  [2, HQ_H - 3],
  [HQ_W - 3, HQ_H - 3],
];
const STATION_CAP = [0, 15, 40, 80];
const HEAL = [0.08, 0.16, 0.28];
const HALL_INCOME = [0, 5, 12, 25];
const TREASURY_INCOME = [0, 20, 50, 110];
const CHEST = [0, 24, 48];
export const TRAIN_MAX = 10;
export type Train = 'atk' | 'def' | 'hp';
export const MATERIALS: Material[] = ['wood', 'stone', 'fiber', 'ore', 'crystal'];
/** Quanto cada coletor junta por minuto. */
export const WORK_RATE: Record<Material, number> = { wood: 15, stone: 12, fiber: 15, ore: 7, crystal: 4 };
/** Coletores por nível do Salão e estoque por material por nível do Armazém. */
const WORKER_CAP = [0, 6, 12, 20];
const STOCK_CAP = [100, 300, 800];
export const hireCost = (n: number) => 60 + n * 15;
export const TRAIN_NAME: Record<Train, string> = { atk: 'Ataque', def: 'Defesa', hp: 'Vida' };
/** Custo do próximo nível de treino. */
export const trainCost = (lv: number): Cost => ({ gold: Math.round(60 * Math.pow(lv + 1, 1.6)), ore: 2 * (lv + 1) });

const SAVE_KEY = 'vaelmor.hq.v1';

interface State {
  founded: boolean;
  ox: number;
  oy: number;
  gold: number;
  lv: Record<BuildId, number>;
  hp: Record<BuildId, number>;
  chest: (ItemStack | null)[];
  train: Record<Train, number>;
  raid: { clan: string; at: number } | null;
  /** Coletores contratados por material e o que já juntaram (estoque do Armazém). */
  workers: Record<Material, number>;
  stock: Record<Material, number>;
}

const fresh = (): State => ({
  founded: false,
  ox: 0,
  oy: 0,
  gold: 0,
  lv: Object.fromEntries(BUILD_ORDER.map((b) => [b, 0])) as Record<BuildId, number>,
  hp: Object.fromEntries(BUILD_ORDER.map((b) => [b, 0])) as Record<BuildId, number>,
  chest: [],
  train: { atk: 0, def: 0, hp: 0 },
  raid: null,
  workers: { wood: 0, stone: 0, fiber: 0, ore: 0, crystal: 0 },
  stock: { wood: 0, stone: 0, fiber: 0, ore: 0, crystal: 0 },
});

/** Ponto que os inimigos atacam (um por construção; várias por lado de muralha). */
class Target implements Hittable {
  constructor(
    private hq: HQ,
    readonly id: BuildId,
    readonly fx: number,
    readonly fy: number,
  ) {}
  get dead() {
    return !this.targetable;
  }
  get targetable() {
    return this.hq.st.lv[this.id] > 0 && this.hq.st.hp[this.id] > 0;
  }
  takeDamage(amount: number) {
    this.hq.damage(this.id, amount);
  }
  stun() {}
  slow() {}
}

/**
 * Sede do clã: um quartel-general perto de uma cidade, construído com o que
 * se coleta. Muralhas (paliçada → pedra), torres que atiram, Salão (cura,
 * chamados dos Lordes, ouro), Alojamento (guarda), Arsenal (treino dos
 * soldados), Enfermaria, Tesouraria e Armazém (baú). Clãs rivais atacam a
 * sede; se o Salão cair, o clã acaba.
 */
export class HQ extends Phaser.Events.EventEmitter {
  st: State = fresh();
  private sprites = new Map<BuildId, Phaser.GameObjects.Image>();
  private labels = new Map<BuildId, Phaser.GameObjects.Text>();
  private banners: Phaser.GameObjects.GameObject[] = [];
  private targets: Target[] = [];
  private towerCd = [0, 0, 0, 0];
  private incomeFrac = 0;
  private raidCheck = 0;
  private returnAt = -1e9;

  constructor(private scene: WorldScene) {
    super();
    this.load();
    if (this.st.founded) {
      this.apply();
      this.makeWorkers();
    }
    const army = scene.army;
    army.healAt = (x, y) => this.healAt(x, y);
    army.structures = () => this.targets;
    army.postOf = (i) => this.postOf(i);
    army.setUpgrades(this.st.train);
  }

  get founded() {
    return this.st.founded;
  }

  get gold() {
    return Math.floor(this.st.gold);
  }

  level(b: BuildId) {
    return this.st.lv[b];
  }

  get chestSize() {
    return CHEST[this.st.lv.warehouse];
  }

  get stationCap() {
    return this.st.lv.hall > 0 ? STATION_CAP[this.st.lv.barracks] : 0;
  }

  get incomePerMin() {
    if (!this.founded || this.st.hp.hall <= 0) return 0;
    return HALL_INCOME[this.st.lv.hall] + (this.st.hp.treasury > 0 ? TREASURY_INCOME[this.st.lv.treasury] : 0);
  }

  /** Centro do pátio (px), em frente ao Salão. */
  get center(): { x: number; y: number } {
    return { x: (this.st.ox + HQ_W / 2) * TILE, y: (this.st.oy + 13) * TILE };
  }

  /** Lado de fora do portão (px). */
  get gate(): { x: number; y: number } {
    return { x: (this.st.ox + HQ_W / 2) * TILE, y: (this.st.oy + HQ_H + 1) * TILE + 8 };
  }

  /** (x, y) em px está dentro da sede? `pad` em tiles. */
  inside(x: number, y: number, pad = 1): boolean {
    if (!this.founded) return false;
    const tx = x / TILE - this.st.ox;
    const ty = y / TILE - this.st.oy;
    return tx >= -pad && ty >= -pad && tx <= HQ_W + pad && ty <= HQ_H + pad;
  }

  get heroInside() {
    const p = this.scene.player;
    return this.inside(p.x, p.y);
  }

  /** Cidade mais perto da sede (de onde vêm os chamados). */
  get city() {
    const c = this.center;
    return [...this.scene.map.cities].sort((a, b) => Math.hypot(a.cx * TILE - c.x, a.cy * TILE - c.y) - Math.hypot(b.cx * TILE - c.x, b.cy * TILE - c.y))[0];
  }

  // ------------------------------------------------------------ fundação
  /** Por que não dá para fundar aqui ('' = dá). */
  foundBlock(): string {
    const s = this.scene;
    if (this.founded) return 'O clã já tem sede';
    if (!s.clans.founded) return 'Funde o clã primeiro';
    if (s.clans.tier(s.clans.player) < 1) return 'Só um Clã (600 de Glória) pode erguer sede — hoje vocês são um Bando';
    const [ox, oy] = this.originHere();
    const m = s.map;
    if (ox < 3 || oy < 3 || ox + HQ_W > m.width - 3 || oy + HQ_H > m.height - 3) return 'Perto demais da borda do mundo';
    for (const c of m.cities) {
      if (ox < c.x1 + 4 && ox + HQ_W > c.x0 - 4 && oy < c.y1 + 4 && oy + HQ_H > c.y0 - 4) return 'Longe dos muros: a sede fica nas vizinhanças da cidade, não dentro';
    }
    const near = m.cities.some((c) => Math.max(c.x0 - (ox + HQ_W), ox - c.x1, c.y0 - (oy + HQ_H), oy - c.y1) < 60);
    if (!near) return 'Longe demais: a sede precisa ficar a até 60 tiles de uma cidade';
    let bad = 0;
    for (let y = oy - 1; y <= oy + HQ_H; y++)
      for (let x = ox - 1; x <= ox + HQ_W; x++) {
        const i = y * m.width + x;
        if (m.water[i] >= 0 || m.cliffs[i] >= 0) bad++;
      }
    if (bad > 0) return 'O terreno precisa ser plano e seco (sem água, montanha ou muralha)';
    const c = DEFS.hall.cost[1];
    const miss = this.missing(c);
    if (miss) return `Faltam ${miss} para o Salão`;
    return '';
  }

  private originHere(): [number, number] {
    const p = this.scene.player;
    return [Math.floor(p.x / TILE) - (HQ_W >> 1), Math.floor(p.y / TILE) - 13];
  }

  found(): string {
    const why = this.foundBlock();
    if (why) return why;
    this.pay(DEFS.hall.cost[1]);
    const [ox, oy] = this.originHere();
    this.st.founded = true;
    this.st.ox = ox;
    this.st.oy = oy;
    this.st.lv.hall = 1;
    this.st.hp.hall = DEFS.hall.hp[1];
    this.apply();
    this.scene.clans.log(`O ${this.scene.clans.player.name} ergueu sua sede perto de ${this.city.name}.`, true);
    this.save();
    this.emit('change');
    return '';
  }

  // ------------------------------------------------------------ custos
  /** Texto do que falta ('' = tem tudo). */
  missing(c: Cost): string {
    const out: string[] = [];
    for (const [k, n] of Object.entries(c) as [Material | 'gold', number][]) {
      const have = this.have(k);
      if (have < n) out.push(`${n - have} de ${MATERIAL_NAME[k]}`);
    }
    return out.join(', ');
  }

  /** Material no baú da sede (de qualquer região). */
  chestCount(f: string): number {
    return this.st.chest.reduce((n, s) => n + (s && ITEMS[s.id]?.family === f ? s.qty : 0), 0);
  }

  /** Quanto há para gastar: estoque dos coletores + baú da sede + mochila (ouro: o cofre). */
  have(k: Material | 'gold'): number {
    if (k === 'gold') return this.gold;
    return Math.floor(this.st.stock[k] ?? 0) + this.chestCount(k) + this.scene.inventory.countFamily(k);
  }

  private pay(c: Cost) {
    const inv = this.scene.inventory;
    for (const [k, n] of Object.entries(c) as [Material | 'gold', number][]) {
      if (k === 'gold') {
        this.st.gold -= n;
        continue;
      }
      // primeiro o estoque dos coletores, depois o baú da sede, por fim a mochila
      let left = n;
      const fromStock = Math.min(left, Math.floor(this.st.stock[k] ?? 0));
      this.st.stock[k] -= fromStock;
      left -= fromStock;
      const chest = this.st.chest;
      for (let i = chest.length - 1; i >= 0 && left > 0; i--) {
        const s = chest[i];
        if (!s || ITEMS[s.id]?.family !== k) continue;
        const q = Math.min(left, s.qty);
        s.qty -= q;
        left -= q;
        if (!s.qty) chest[i] = null;
      }
      if (left > 0) inv.removeFamily(k, left);
    }
  }

  static costText(c: Cost): string {
    return (Object.entries(c) as [Material | 'gold', number][]).map(([k, n]) => `${n} ${MATERIAL_NAME[k]}`).join(' · ');
  }

  /** O que construir/melhorar `b` custa agora (null = no máximo). */
  nextCost(b: BuildId): Cost | null {
    return DEFS[b].cost[this.st.lv[b] + 1] ?? null;
  }

  buildBlock(b: BuildId): string {
    if (!this.founded) return 'Sem sede';
    if (!this.heroInside) return 'Construa estando na sede';
    const lv = this.st.lv[b];
    if (this.st.hp[b] <= 0 && lv > 0) return '';
    const c = this.nextCost(b);
    if (!c) return 'Nível máximo';
    if (b !== 'hall' && this.st.lv.hall < lv + 1) return `Precisa do Salão nível ${lv + 1}`;
    if (this.scene.army.war?.siege) return 'Não dá para construir durante o ataque';
    const miss = this.missing(c);
    return miss ? `Faltam ${miss}` : '';
  }

  /** Constrói, melhora ou (se destruída) repara. */
  build(b: BuildId): string {
    const lv = this.st.lv[b];
    if (lv > 0 && this.st.hp[b] < DEFS[b].hp[lv]) return this.repair(b);
    const why = this.buildBlock(b);
    if (why) return why;
    this.pay(this.nextCost(b)!);
    this.st.lv[b] = lv + 1;
    this.st.hp[b] = DEFS[b].hp[lv + 1];
    this.apply();
    const p = this.pos(b);
    this.scene.fx.burst(p.x, p.y - 20, 0xe8d8a8, 24);
    this.scene.cameras.main.flash(120, 255, 240, 200);
    this.save();
    this.emit('change');
    return '';
  }

  /** Reparo: metade do custo do nível 1, proporcional ao dano. */
  repairCost(b: BuildId): Cost {
    const lv = this.st.lv[b];
    const k = 1 - this.st.hp[b] / DEFS[b].hp[lv];
    const out: Cost = {};
    for (const [m, n] of Object.entries(DEFS[b].cost[1]) as [Material | 'gold', number][]) if (m !== 'gold') out[m] = Math.max(1, Math.ceil(n * 0.5 * k * lv));
    return out;
  }

  repair(b: BuildId): string {
    if (!this.heroInside) return 'Repare estando na sede';
    if (this.scene.army.war?.siege) return 'Não dá para reparar durante o ataque';
    const c = this.repairCost(b);
    const miss = this.missing(c);
    if (miss) return `Faltam ${miss}`;
    this.pay(c);
    this.st.hp[b] = DEFS[b].hp[this.st.lv[b]];
    this.apply();
    this.save();
    this.emit('change');
    return '';
  }

  // ------------------------------------------------------------ treino
  trainBlock(t: Train): string {
    if (this.st.lv.arsenal < 1 || this.st.hp.arsenal <= 0) return 'Construa o Arsenal';
    if (!this.heroInside) return 'Treine estando na sede';
    if (this.st.train[t] >= TRAIN_MAX) return 'Nível máximo';
    const miss = this.missing(trainCost(this.st.train[t]));
    return miss ? `Faltam ${miss}` : '';
  }

  train(t: Train): string {
    const why = this.trainBlock(t);
    if (why) return why;
    this.pay(trainCost(this.st.train[t]));
    const tierWas = this.scene.army.upTier;
    this.st.train[t]++;
    this.scene.army.setUpgrades(this.st.train);
    // o exército mostra que ficou mais forte: brilho e número sobre cada soldado
    const n = this.st.train[t];
    const tag = t === 'atk' ? `+${n * 10}% dano` : t === 'def' ? `−${Math.min(50, n * 5)}% dano levado` : `+${n * 12}% vida`;
    for (const s2 of this.scene.army.allies) {
      this.scene.fx.burst(s2.x, s2.y - 10, t === 'atk' ? 0xff8a5a : t === 'def' ? 0x8ac8ff : 0x7aff8a, 6);
      this.scene.fx.floatText(s2.x, s2.y - 22, t === 'atk' ? 'ATQ ▲' : t === 'def' ? 'DEF ▲' : 'VIDA ▲', t === 'atk' ? '#ff9a6a' : t === 'def' ? '#9ad0ff' : '#8aff9a');
    }
    const tier = this.scene.army.upTier;
    if (tier > tierWas) this.scene.events.emit('area', 'EXÉRCITO PROMOVIDO', `Seus soldados agora são ${['Recrutas', 'Veteranos', 'Elite', 'Campeões'][tier]}: equipamento novo`);
    else this.scene.events.emit('toast', `${TRAIN_NAME[t]} do exército nível ${n}: ${tag}`);
    this.save();
    this.emit('change');
    return '';
  }

  // ------------------------------------------------------------ coletores
  get workerCap() {
    return this.st.hp.hall > 0 ? WORKER_CAP[this.st.lv.hall] : 0;
  }

  get workerCount() {
    return MATERIALS.reduce((n, m) => n + this.st.workers[m], 0);
  }

  get stockCap() {
    return STOCK_CAP[this.st.hp.warehouse > 0 ? this.st.lv.warehouse : 0];
  }

  hireBlock(): string {
    if (!this.heroInside) return 'Contrate estando na sede';
    if (this.workerCount >= this.workerCap) return `O Salão nível ${this.st.lv.hall} comporta ${this.workerCap} coletores`;
    if (this.gold < hireCost(this.workerCount)) return `Faltam ${hireCost(this.workerCount) - this.gold} de ouro`;
    return '';
  }

  hire(m: Material): string {
    const why = this.hireBlock();
    if (why) return why;
    this.st.gold -= hireCost(this.workerCount);
    this.st.workers[m]++;
    this.makeWorkers();
    this.save();
    this.emit('change');
    return '';
  }

  dismiss(m: Material): string {
    if (this.st.workers[m] <= 0) return '';
    this.st.workers[m]--;
    this.makeWorkers();
    this.save();
    this.emit('change');
    return '';
  }

  /**
   * Coletores na sede: cada ofício tem a sua pilha (toras, pedras, fibra,
   * carrinho de minério, cristais). Eles trabalham na pilha e levam a carga
   * até o Armazém (a coleta em si é contada no tempo, em update).
   */
  private walkers: { s: Phaser.GameObjects.Sprite; job: number; state: 'pile' | 'work' | 'store'; t: number; anim: number; tx: number; ty: number }[] = [];
  private piles: Phaser.GameObjects.Image[] = [];
  private static PILE: [number, number][] = [
    [5, 19],
    [24, 19],
    [9, 20],
    [20, 20],
    [8, 12],
  ];
  private pileAt(job: number) {
    const [x, y] = HQ.PILE[job];
    return { x: (this.st.ox + x) * TILE + 8, y: (this.st.oy + y) * TILE + 8 };
  }
  private storeAt() {
    const o = this.st;
    const [x, y] = o.lv.warehouse > 0 ? [22, 17] : [15, 12];
    return { x: (o.ox + x) * TILE + 8, y: (o.oy + y) * TILE + 8 };
  }
  private makeWorkers() {
    for (const w of this.walkers) w.s.destroy();
    for (const p of this.piles) p.destroy();
    this.walkers = [];
    this.piles = [];
    if (!this.founded) return;
    const s = this.scene;
    const gen = ++this.workerGen;
    // cada ofício com a sua gente e ferramenta (machado, picareta, enxada, martelo)
    const keys = MATERIALS.filter((m) => this.st.workers[m]).map((m) => `sk-${SKINS.workers[m]}`);
    s.army.need(keys, () => {
      if (gen !== this.workerGen || !this.founded) return;
      MATERIALS.forEach((m, job) => {
        const n = this.st.workers[m];
        if (!n) return;
        const p = this.pileAt(job);
        this.piles.push(s.add.image(p.x, p.y + 6, 'workers-props', job).setOrigin(0.5, 1).setDepth(DEPTH.entities + p.y + 6));
        for (let i = 0; i < Math.min(3, n); i++) {
          const spr = s.add.sprite(p.x + (i - 1) * 14, p.y + 10, `sk-${SKINS.workers[m]}`, 0).setOrigin(0.5, SKIN_FOOT / SKIN_CELL).setScale(s.army.scale);
          this.walkers.push({ s: spr, job, state: 'work', t: Math.random() * 3000, anim: Math.random() * 1000, tx: p.x, ty: p.y });
        }
      });
    });
  }
  private workerGen = 0;



  // ------------------------------------------------------------ baú
  /** Passa a pilha do espaço `i` da mochila para o baú (ou do baú para a mochila). */
  move(from: 'bag' | 'chest', i: number): string {
    if (!this.heroInside) return 'O baú fica no Armazém da sede';
    if (this.chestSize <= 0 || this.st.hp.warehouse <= 0) return 'Construa o Armazém';
    const inv = this.scene.inventory;
    const chest = this.st.chest;
    while (chest.length < this.chestSize) chest.push(null);
    if (from === 'bag') {
      const s = inv.slots[i];
      if (!s) return '';
      const stack = ITEMS[s.id].equip ? 1 : 999;
      let left = s.qty;
      for (const c of chest) if (c && c.id === s.id && c.qty < stack && left > 0) {
        const k = Math.min(left, stack - c.qty);
        c.qty += k;
        left -= k;
      }
      for (let k = 0; k < this.chestSize && left > 0; k++)
        if (!chest[k]) {
          const n = Math.min(left, stack);
          chest[k] = { id: s.id, qty: n };
          left -= n;
        }
      if (left === s.qty) return 'Baú cheio';
      inv.remove(s.id, s.qty - left);
    } else {
      const c = chest[i];
      if (!c) return '';
      const got = inv.add(c.id, c.qty);
      if (!got) return 'Mochila cheia';
      c.qty -= got;
      if (!c.qty) chest[i] = null;
    }
    this.save();
    this.emit('change');
    return '';
  }

  // ------------------------------------------------------------ guarda e cura
  private healAt(x: number, y: number): number {
    if (!this.founded) {
      // antes da sede, o exército se cura no quartel de Brumavale
      const c = this.scene.map.cities.find((c) => c.capital);
      if (c && x > c.x0 * TILE && x < c.x1 * TILE && y > c.y0 * TILE && y < c.y1 * TILE) return 0.15;
      return 0;
    }
    if (this.st.hp.hall <= 0 || !this.inside(x, y, 2)) return 0;
    return HEAL[this.st.hp.infirmary > 0 ? this.st.lv.infirmary : 0];
  }

  /** Postos de guarda: um anel por dentro da muralha. */
  private postsCache: [number, number][] = [];
  private postOf(i: number): [number, number] | null {
    if (i >= this.stationCap) return null;
    if (!this.postsCache.length) {
      const pts: [number, number][] = [];
      const add = (tx: number, ty: number) => pts.push([(this.st.ox + tx) * TILE + 8, (this.st.oy + ty) * TILE + 8]);
      for (let x = 4; x <= HQ_W - 5; x += 2) add(x, 3);
      for (let y = 5; y <= HQ_H - 5; y += 2) {
        add(2, y);
        add(HQ_W - 3, y);
      }
      for (let x = 3; x <= HQ_W - 4; x += 2) if (Math.abs(x - HQ_W / 2) > GATE) add(x, HQ_H - 4);
      // o resto em fila dupla no pátio, na frente do Salão
      for (let r = 0; r < 4; r++) for (let x = 11; x <= 19; x += 1) add(x, 13 + r);
      this.postsCache = pts;
    }
    return this.postsCache[i % this.postsCache.length] ?? null;
  }

  // ------------------------------------------------------------ desenho e colisão
  private pos(b: BuildId): { x: number; y: number } {
    const o = this.st;
    if (b.startsWith('tower')) {
      const [tx, ty] = TOWER_AT[Number(b[5])];
      return { x: (o.ox + tx) * TILE + 16, y: (o.oy + ty + 1) * TILE };
    }
    if (b.startsWith('wall')) {
      const k = Number(b[4]);
      const cx = (o.ox + HQ_W / 2) * TILE;
      const cy = (o.oy + HQ_H / 2) * TILE;
      return [
        { x: cx, y: (o.oy + 2) * TILE },
        { x: (o.ox + HQ_W) * TILE, y: cy },
        { x: cx, y: (o.oy + HQ_H) * TILE },
        { x: o.ox * TILE, y: cy },
      ][k];
    }
    const wt = this.footW(b);
    const [ax, ay] = DEFS[b].at!;
    return { x: (o.ox + ax) * TILE + (wt % 2 ? 8 : 0), y: (o.oy + ay + 1) * TILE };
  }

  /** Largura (tiles) da base da construção no nível atual. */
  private footW(b: BuildId): number {
    const A = HQ_ART[b as keyof typeof HQ_ART];
    return Math.ceil(A.widths[Math.max(0, Math.min(A.frames, this.st.lv[b] || 1) - 1)] / TILE);
  }

  /** Redesenha tudo (tiles da muralha, colisão, sprites, alvos) a partir do estado. */
  apply() {
    const s = this.scene;
    const o = this.st;
    const m = s.map;
    this.postsCache = [];
    // terreno: pátio limpo dentro, sem árvores nem pedras
    for (let y = o.oy - 1; y <= o.oy + HQ_H; y++)
      for (let x = o.ox - 1; x <= o.ox + HQ_W; x++) {
        const i = y * m.width + x;
        if (m.decor[i] >= 0) s.tiles.set('decor', x, y, -1);
        if (m.canopy[i] >= 0) s.tiles.set('canopy', x, y, -1);
        // chão natural; só a estrada de terra do portão ao Salão e o largo em frente
        const lx = x - o.ox;
        const ly = y - o.oy;
        // pátio calçado: rua de pedras do portão ao Salão, largo na frente dele e calçadas das casas
        const road = Math.abs(lx + 0.5 - HQ_W / 2) <= GATE / 2 && ly >= 10 && ly <= HQ_H;
        const plaza = lx >= 10 && lx <= 19 && ly >= 10 && ly <= 13;
        const walk = ly >= 1 && ly < HQ_H - 2 && lx >= 1 && lx < HQ_W - 1 && (ly === 10 || ly === 17);
        const t = plaza ? T.PLAZA : road || walk ? T.COBBLE : -1;
        if (t >= 0) {
          if (m.edge[i] >= 0) s.tiles.set('edge', x, y, -1);
          if (m.ground[i] !== t) s.tiles.set('ground', x, y, t);
        }
        s.setSolid(x, y, false);
        if (m.cliffs[i] >= 0) s.tiles.set('cliffs', x, y, -1);
      }
    // muralhas
    const side = (x: number, y: number): number => {
      if (y <= 1) return 0;
      if (y >= HQ_H - 2) return Math.abs(x + 0.5 - HQ_W / 2) < GATE / 2 + 0.5 ? -1 : 2;
      if (x === HQ_W - 1) return 1;
      if (x === 0) return 3;
      return -1;
    };
    const isWall = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= HQ_W || y >= HQ_H) return false;
      const k = side(x, y);
      return k >= 0 && o.lv[`wall${k}` as BuildId] > 0 && o.hp[`wall${k}` as BuildId] > 0;
    };
    for (let y = 0; y < HQ_H; y++)
      for (let x = 0; x < HQ_W; x++) {
        if (!isWall(x, y)) continue;
        const k = side(x, y);
        const stone = o.lv[`wall${k}` as BuildId] >= 2;
        const top = stone ? T.WALL + 4 : T.PALISADE;
        const face = stone ? T.WALL + 5 : T.PALISADE_FACE;
        s.tiles.set('cliffs', o.ox + x, o.oy + y, isWall(x, y + 1) ? top : face);
        s.setSolid(o.ox + x, o.oy + y, true);
      }
    // construções
    for (const b of BUILD_ORDER) {
      const lv = o.lv[b];
      const alive = lv > 0 && o.hp[b] > 0;
      let spr = this.sprites.get(b);
      if (!alive) {
        spr?.destroy();
        this.sprites.delete(b);
        this.labels.get(b)?.destroy();
        this.labels.delete(b);
        continue;
      }
      if (b.startsWith('wall')) continue;
      const p = this.pos(b);
      const tower = b.startsWith('tower');
      const key = tower ? 'hq-tower' : `hq-${b}`;
      const A = HQ_ART[(tower ? 'tower' : b) as keyof typeof HQ_ART];
      const frame = Math.min(A.frames, lv) - 1;
      if (!spr) {
        spr = s.add.image(p.x, p.y, key, frame).setOrigin(0.5, 1);
        this.sprites.set(b, spr);
      }
      spr.setTexture(key, frame).setPosition(p.x, p.y).setDepth(DEPTH.entities + p.y);
      // colisão na base (o telhado fica por cima de quem passa atrás)
      const wt = tower ? 2 : this.footW(b);
      const rows = tower ? 1 : b === 'hall' ? 3 : 2;
      const x0 = Math.round(p.x / TILE - wt / 2);
      const yb = Math.round(p.y / TILE) - 1;
      for (let y = yb - rows + 1; y <= yb; y++) for (let x = x0; x < x0 + wt; x++) s.setSolid(x, y, true);
      let lab = this.labels.get(b);
      if (!lab) {
        lab = s.add.text(0, 0, '', { fontFamily: 'Tiny5, monospace', fontSize: '7px', color: '#ffe9a8', stroke: '#1e1a24', strokeThickness: 2 }).setOrigin(0.5).setResolution(4).setDepth(4240);
        this.labels.set(b, lab);
      }
      lab.setText(`${DEFS[b].name}${lv > 1 ? ` ${lv}` : ''}`).setPosition(p.x, p.y - (spr.displayHeight + 4));
    }
    // guarita do portão (vem com a muralha sul): abre sozinha para o herói e o exército
    const gateUp = o.lv.wall2 > 0 && o.hp.wall2 > 0;
    if (!gateUp) {
      this.gateSpr?.destroy();
      this.gateSpr = undefined;
    } else {
      const gx = (o.ox + HQ_W / 2) * TILE;
      const gy = (o.oy + HQ_H) * TILE;
      if (!this.gateSpr) this.gateSpr = s.add.image(gx, gy, 'hq-gate', 0).setOrigin(0.5, 1);
      this.gateSpr.setPosition(gx, gy).setDepth(DEPTH.entities + gy);
    }
    this.gateFrame = -1;
    this.gateShut = null;
    this.syncGate();
    // estandartes do clã no portão
    for (const g of this.banners) g.destroy();
    this.banners = [];
    const clan = s.clans.player;
    for (const dx of [-GATE / 2 - 1.5, GATE / 2 + 1.5]) {
      const x = (o.ox + HQ_W / 2 + dx) * TILE;
      const y = (o.oy + HQ_H - 3) * TILE;
      const pole = s.add.rectangle(x, y, 2, 30, 0x6e4426).setOrigin(0.5, 1).setDepth(DEPTH.entities + y);
      const shield = s.add.image(x, y - 30, 'crest-shield').setTint(clan.color).setDepth(DEPTH.entities + y + 1);
      const emblem = s.add.image(x, y - 31, 'crests', clan.crest).setDepth(DEPTH.entities + y + 2);
      this.banners.push(pole, shield, emblem);
    }
    // alvos do inimigo
    this.targets = [];
    for (const b of BUILD_ORDER) {
      if (!b.startsWith('wall')) {
        if (o.lv[b] > 0) {
          const p = this.pos(b);
          this.targets.push(new Target(this, b, p.x, p.y + 4));
        }
        continue;
      }
      const k = Number(b[4]);
      // vários pontos ao longo do lado
      for (let t = 2; t < (k % 2 ? HQ_H : HQ_W) - 2; t += 5) {
        const x = k === 0 || k === 2 ? (o.ox + t) * TILE + 8 : (o.ox + (k === 1 ? HQ_W - 1 : 0)) * TILE + 8;
        const y = k === 1 || k === 3 ? (o.oy + t) * TILE + 8 : (o.oy + (k === 0 ? 2 : HQ_H)) * TILE + 4;
        if (k === 2 && Math.abs(t - HQ_W / 2) < GATE) continue;
        this.targets.push(new Target(this, b, x, y));
      }
      // o portão fechado também é alvo (é parte da muralha sul)
      if (k === 2) this.targets.push(new Target(this, b, (o.ox + HQ_W / 2) * TILE, (o.oy + HQ_H) * TILE + 4));
    }
    // o herói renasce na sede
    const g = this.gate;
    s.player.spawnX = g.x;
    s.player.spawnY = (o.oy + HQ_H - 5) * TILE + 8;
    s.army.assignPosts();
  }

  // ------------------------------------------------------------ portão
  private gateSpr?: Phaser.GameObjects.Image;
  /** 0 = fechado … 1 = aberto. */
  private gateK = 0;
  private gateFrame = -1;
  private gateShut: boolean | null = null;

  /** Quadro e colisão do portão a partir de gateK. */
  private syncGate() {
    const o = this.st;
    const up = !!this.gateSpr;
    const f = up ? (o.lv.wall2 >= 2 ? 4 : 0) + Math.round(this.gateK * 3) : -1;
    if (up && f !== this.gateFrame) this.gateSpr!.setFrame(f);
    this.gateFrame = f;
    // fechado (ou quase): o vão vira parede
    const shut = up && this.gateK < 0.5;
    if (shut === this.gateShut) return;
    this.gateShut = shut;
    for (let y = HQ_H - 2; y < HQ_H; y++)
      for (let x = 0; x < HQ_W; x++) if (Math.abs(x + 0.5 - HQ_W / 2) < GATE / 2 + 0.5) this.scene.setSolid(o.ox + x, o.oy + y, shut);
  }

  /** Abre quando o herói ou um soldado aliado chega perto; fecha com inimigos na porta. */
  private updateGate(delta: number) {
    if (!this.gateSpr) return;
    const s = this.scene;
    const gx = (this.st.ox + HQ_W / 2) * TILE;
    const gy = (this.st.oy + HQ_H - 1) * TILE;
    const near = (x: number, y: number, r: number) => Math.abs(x - gx) < r * TILE && Math.abs(y - gy) < r * TILE;
    // alguém do lado de cá parado no vão: não fecha em cima dele (ficaria preso na parede)
    const inDoor = (x: number, y: number) => Math.abs(x - gx) < (GATE / 2 + 0.4) * TILE && y > (this.st.oy + HQ_H - 2.4) * TILE && y < (this.st.oy + HQ_H + 0.4) * TILE;
    const p = s.player;
    let blocked = inDoor(p.x, p.y);
    for (const a of s.army.allies) if (!blocked && inDoor(a.x, a.y)) blocked = true;
    // o herói sempre consegue abrir quando chega no portão; soldados, só sem inimigos na porta
    let want = near(p.x, p.y, 4);
    let foes = false;
    if (s.army.war) for (const f of s.army.soldiers) if (f.team === 1 && f.targetable && near(f.x, f.y, 5)) {
      foes = true;
      break;
    }
    if (want && foes && !near(p.x, p.y, 2)) want = false;
    if (!want && !foes) for (const a of s.army.allies) if (near(a.x, a.y, 3.5)) {
      want = true;
      break;
    }
    if (blocked) want = true;
    const k = Phaser.Math.Clamp(this.gateK + ((want ? 1 : -1) * delta) / 450, 0, 1);
    if (k === this.gateK) return;
    // rangido ao começar a abrir/fechar
    if ((this.gateK === 0 || this.gateK === 1) && near(s.player.x, s.player.y, 10)) s.fx.burst(gx, gy + 10, 0x8a6a4a, 4);
    this.gateK = k;
    this.syncGate();
  }

  private clear() {
    const s = this.scene;
    const o = this.st;
    for (let y = 0; y < HQ_H; y++)
      for (let x = 0; x < HQ_W; x++) {
        if (s.map.cliffs[(o.oy + y) * s.map.width + o.ox + x] >= 0) s.tiles.set('cliffs', o.ox + x, o.oy + y, -1);
        s.setSolid(o.ox + x, o.oy + y, false);
      }
    for (const spr of this.sprites.values()) spr.destroy();
    for (const l of this.labels.values()) l.destroy();
    for (const g of this.banners) g.destroy();
    this.gateSpr?.destroy();
    this.gateSpr = undefined;
    this.sprites.clear();
    this.labels.clear();
    this.banners = [];
    this.targets = [];
  }

  /** Dano de um ataque numa construção. */
  damage(b: BuildId, amount: number) {
    if (this.st.lv[b] <= 0 || this.st.hp[b] <= 0) return;
    this.st.hp[b] = Math.max(0, this.st.hp[b] - amount);
    const spr = this.sprites.get(b);
    if (spr) {
      spr.setTintFill(0xffffff);
      this.scene.time.delayedCall(70, () => spr.active && spr.clearTint());
    }
    if (this.st.hp[b] <= 0) {
      const p = this.pos(b);
      this.scene.fx.burst(p.x, p.y - 16, 0x8a6a4a, 30);
      this.scene.events.emit('toast', `${DEFS[b].name} foi destruída!`);
      if (b === 'hall') return this.fall();
      this.apply();
    }
    this.emit('change');
  }

  // ------------------------------------------------------------ ataques de rivais
  /** O rival que ataca e quando chega. */
  scheduleRaid(c: Clan, etaSec = 120) {
    if (!this.founded || this.st.raid) return;
    this.st.raid = { clan: c.id, at: this.scene.clans.now + etaSec * 1000 };
    const min = Math.max(1, Math.round(etaSec / 60));
    this.scene.clans.log(`${c.name} marcha contra a sede do ${this.scene.clans.player.name}! Chega em uns ${min} min (veja no minimapa).`, true);
    this.save();
    this.emit('change');
  }

  /** O bando do rival chegou à sede. */
  raidArrived(c: Clan, band: Band) {
    const s = this.scene;
    const r = this.st.raid ?? { clan: c.id, at: s.clans.now };
    const p = s.player;
    const n = band.n;
    const vet = Math.min(3, s.clans.tier(c));
    const ctr = this.center;
    // herói perto: a batalha acontece de verdade, nos muros
    if (Math.hypot(p.x - ctr.x, p.y - ctr.y) < 70 * TILE) {
      if (s.army.war) {
        r.at = s.clans.now + 30000;
        return;
      }
      this.st.raid = null;
      s.bands.engaged = band;
      s.army.prepare(() => {
        s.army.garrisonToPosts();
        s.army.declareWar(n, { name: c.name, color: c.color, clan: c.id }, { origin: { x: band.x, y: band.y }, exact: true, vet, siege: { x: ctr.x, y: (this.st.oy + 11) * TILE } });
        s.events.emit('area', 'A SEDE ESTÁ SOB ATAQUE!', `${c.name} chega com ${n} soldados`);
      });
      this.save();
      return;
    }
    // longe: o combate é resolvido pela força da defesa
    this.st.raid = null;
    // depois do ataque, o bando volta a patrulhar
    band.goal = 'patrol';
    band.tx = band.x;
    band.ty = band.y;
    const guards = s.army.stationed.length + s.army.garrison.length;
    const tr = 1 + (this.st.train.atk + this.st.train.def + this.st.train.hp) * 0.04;
    let def = guards * tr + this.st.lv.hall * 5;
    for (let k = 0; k < 4; k++) {
      if (this.st.hp[`tower${k}` as BuildId] > 0) def += this.st.lv[`tower${k}` as BuildId] * 7;
      if (this.st.hp[`wall${k}` as BuildId] > 0) def += this.st.lv[`wall${k}` as BuildId] * 5;
    }
    const att = n * (1 + vet * 0.2);
    const roll = def * (0.8 + Math.random() * 0.4);
    if (roll >= att) {
      const lost = Math.min(guards, Math.round(guards * 0.25 * (att / Math.max(1, def))));
      this.loseGuards(lost);
      c.soldiers = Math.max(0, c.soldiers - Math.round(n * 0.6));
      band.n = Math.max(1, Math.round(n * 0.4));
      s.gainGlory(Math.round(n * 1.5), p.x, p.y - 40);
      s.clans.log(`A sede do ${s.clans.player.name} resistiu ao ataque do ${c.name} (${lost} baixas).`, true);
    } else {
      let dmg = (att - roll) * 40;
      this.loseGuards(Math.round(guards * 0.7));
      // a muralha e as torres seguram primeiro; o que passar chega ao Salão
      const order: BuildId[] = ['wall2', 'tower2', 'tower3', 'wall1', 'wall3', 'tower0', 'tower1', 'wall0', 'barracks', 'treasury', 'warehouse', 'infirmary', 'arsenal', 'hall'];
      for (const b of order) {
        if (dmg <= 0) break;
        const hp = this.st.lv[b] > 0 ? this.st.hp[b] : 0;
        if (hp <= 0) continue;
        const k = Math.min(hp, dmg);
        this.st.hp[b] -= k;
        dmg -= k;
      }
      c.glory += Math.round(n * 2);
      s.gainGlory(-Math.round(n), p.x, p.y - 40);
      if (this.st.hp.hall <= 0) return this.fall();
      s.clans.log(`O ${c.name} saqueou a sede do ${s.clans.player.name}! Volte para reparar.`, true);
      this.apply();
    }
    this.save();
    this.emit('change');
  }

  private loseGuards(n: number) {
    const a = this.scene.army;
    let left = n;
    while (left > 0 && a.garrison.length) {
      a.garrison.pop();
      left--;
    }
    for (const s of a.stationed.slice(0, left) as Soldier[]) a.kill(s);
    a.save();
    a.emit('change');
  }

  /** O Salão caiu: o clã acaba. */
  private fall() {
    const s = this.scene;
    const name = s.clans.player.name;
    s.army.war && s.army.clearFoes();
    s.army.disband();
    s.progress.penalize(0.5, 0.25);
    this.clear();
    for (const w of this.walkers) w.s.destroy();
    for (const p of this.piles) p.destroy();
    this.walkers = [];
    this.piles = [];
    const gold = this.st.gold;
    this.st = fresh();
    this.st.gold = Math.floor(gold * 0.3);
    s.army.setUpgrades(this.st.train);
    const cap = s.map.cities.find((c) => c.capital)!;
    s.player.spawnX = cap.cx * TILE + 8;
    s.player.spawnY = (cap.cy + 3) * TILE + 8;
    s.missions.reset();
    s.clans.disband();
    s.clans.log(`A sede caiu. O ${name} se desfez: os soldados se dispersaram e a Glória se perdeu.`, true);
    this.save();
    this.emit('change');
    this.emit('fall', name);
  }

  /** Minutos fora do jogo contados na última abertura (para avisar). */
  awayMin = 0;
  private saveAt = 0;

  // ------------------------------------------------------------ tempo
  update(time: number, delta: number) {
    if (!this.founded) return;
    const s = this.scene;
    // o estoque dos coletores e o ouro vão para o save de tempos em tempos
    if (time > this.saveAt) {
      this.saveAt = time + 10000;
      this.save();
    }
    // receita
    this.incomeFrac += (this.incomePerMin * delta) / 60000;
    if (this.incomeFrac >= 1) {
      const k = Math.floor(this.incomeFrac);
      this.st.gold += k;
      this.incomeFrac -= k;
      this.emit('gold');
    }
    // coletores juntam material no estoque (até o limite do Armazém)
    const cap = this.stockCap;
    for (const m of MATERIALS) {
      const w = this.st.workers[m];
      if (w) this.st.stock[m] = Math.min(cap, (this.st.stock[m] ?? 0) + (w * WORK_RATE[m] * delta) / 60000);
    }
    for (const w of this.walkers) {
      w.anim += delta;
      if (w.state === 'work') {
        // golpes na pilha (quadros de trabalho, virado para ela)
        w.t -= delta;
        const face = w.s.x > this.pileAt(w.job).x ? 1 : 2;
        w.s.setFrame(face * SKIN_COLS + 9 + (Math.floor(w.anim / 120) % 6));
        if (w.t <= 0) {
          w.state = 'store';
          const st = this.storeAt();
          w.tx = st.x + (Math.random() - 0.5) * 20;
          w.ty = st.y + (Math.random() - 0.5) * 10;
        }
        w.s.setDepth(DEPTH.entities + w.s.y);
        continue;
      }
      const dx = w.tx - w.s.x;
      const dy = w.ty - w.s.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) {
        if (w.state === 'store') {
          w.state = 'pile';
          const p = this.pileAt(w.job);
          w.tx = p.x + (Math.random() - 0.5) * 24;
          w.ty = p.y + 8 + Math.random() * 6;
        } else {
          w.state = 'work';
          w.t = 1200 + Math.random() * 1200;
        }
        continue;
      }
      const v = (62 * delta) / 1000;
      // contorna o que estiver no caminho de um jeito simples: tenta de lado
      let ux = dx / d;
      let uy = dy / d;
      if (s.collision.solid(Math.floor((w.s.x + ux * 6) / TILE), Math.floor((w.s.y + uy * 6) / TILE))) {
        [ux, uy] = Math.abs(ux) > Math.abs(uy) ? [0, Math.sign(dy) || 1] : [Math.sign(dx) || 1, 0];
        if (s.collision.solid(Math.floor((w.s.x + ux * 6) / TILE), Math.floor((w.s.y + uy * 6) / TILE))) {
          w.s.setPosition(w.tx, w.ty);
          continue;
        }
      }
      w.s.x += ux * v;
      w.s.y += uy * v;
      const dir = Math.abs(ux) > Math.abs(uy) ? (ux < 0 ? 1 : 2) : uy < 0 ? 3 : 0;
      w.s.setFrame(dir * SKIN_COLS + 1 + (Math.floor(w.anim / 75) % 8)).setDepth(DEPTH.entities + w.s.y);
    }
    this.updateGate(delta);
    // torres
    const foes = s.army.war ? s.army.soldiers : null;
    for (let k = 0; k < 4; k++) {
      const b = `tower${k}` as BuildId;
      const lv = this.st.lv[b];
      if (!lv || this.st.hp[b] <= 0 || time < this.towerCd[k]) continue;
      const p = this.pos(b);
      const sx = p.x;
      const sy = p.y - 40;
      let best: Hittable | null = null;
      let bd = 160 * 160;
      if (foes)
        for (const f of foes) {
          if (f.team !== 1 || !f.targetable) continue;
          const d = (f.x - sx) ** 2 + (f.y - p.y) ** 2;
          if (d < bd) {
            bd = d;
            best = f;
          }
        }
      for (const e of s.enemies) {
        if (!e.targetable) continue;
        const d = (e.fx - sx) ** 2 + (e.fy - p.y) ** 2;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) continue;
      this.towerCd[k] = time + 1300;
      s.army.fire(sx, sy, best, lv >= 2 ? 6 : 3, 0);
    }
    // rótulos só de perto
    const p = s.player;
    const near = this.inside(p.x, p.y, 12);
    for (const l of this.labels.values()) l.setVisible(near);
    // ataque sem bando a caminho (save antigo, clã desfeito): cancela
    if (this.st.raid && time - this.raidCheck > 5000) {
      this.raidCheck = time;
      const b = s.bands.byClan(this.st.raid.clan);
      if (!b || b.goal !== 'raid' || b.n <= 0) this.st.raid = null;
    }
  }

  /** Volta para a sede (corneta), com espera. */
  returnBlock(): string {
    if (!this.founded) return 'Sem sede';
    if (this.scene.army.war) return 'Não durante uma guerra';
    const left = this.returnAt + 90000 - this.scene.time.now;
    if (left > 0) return `A corneta recarrega em ${Math.ceil(left / 1000)} s`;
    return '';
  }

  returnHome(): string {
    const why = this.returnBlock();
    if (why) return why;
    this.returnAt = this.scene.time.now;
    // dentro do pátio, na rua de pedras (não no vão do portão, que pode estar fechado)
    this.scene.teleport(this.gate.x, (this.st.oy + HQ_H - 5) * TILE + 8);
    return '';
  }

  /** Recompensa de missão, etc. */
  addGold(n: number) {
    this.st.gold += n;
    this.save();
    this.emit('gold');
  }

  // ------------------------------------------------------------ salvar
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.st, savedAt: Date.now() }));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      const st = fresh();
      Object.assign(st, d);
      st.lv = { ...fresh().lv, ...(d.lv ?? {}) };
      st.hp = { ...fresh().hp, ...(d.hp ?? {}) };
      st.train = { ...fresh().train, ...(d.train ?? {}) };
      st.workers = { ...fresh().workers, ...(d.workers ?? {}) };
      st.stock = { ...fresh().stock, ...(d.stock ?? {}) };
      st.chest = Array.isArray(d.chest) ? d.chest.map((c: ItemStack | null) => (c && ITEMS[c.id] ? c : null)) : [];
      delete (st as { savedAt?: number }).savedAt;
      this.st = st;
      // fora do jogo os coletores continuam (até 4 h) e a sede rende metade do ouro
      const away = Math.min(4 * 3600000, Math.max(0, Date.now() - (Number(d.savedAt) || Date.now())));
      if (st.founded && away > 60000) {
        const cap = this.stockCap;
        for (const m of MATERIALS) if (st.workers[m]) st.stock[m] = Math.min(cap, (st.stock[m] ?? 0) + (st.workers[m] * WORK_RATE[m] * away) / 60000);
        st.gold += Math.floor((this.incomePerMin * away) / 60000 / 2);
        this.awayMin = Math.round(away / 60000);
      }
    } catch {
      /* começa sem sede */
    }
  }

  /** Cor do clã nos estandartes (ao fundar de novo, etc.). */
  refreshBanners() {
    if (this.founded) this.apply();
  }

  /** Tom para os rivais que atacam. */
  static rivalTint(c: Clan) {
    return allyTint(c.color);
  }
}
