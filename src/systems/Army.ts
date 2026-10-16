import Phaser from 'phaser';
import { TILE } from '../config';
import { ITEMS } from '../data/items';
import { MOUNTS, type MountDef } from '../data/mounts';
import { SKIN_CELL, SKIN_COLS, SKIN_FOOT, SKINS } from '../data/skins';
import { DEPTH } from '../entities/Creature';
import { reachDist, type Hittable } from '../entities/Hittable';
import { HERO } from '../entities/heroSheet';
import type { WorldScene } from '../scenes/WorldScene';
import type { City } from './Cities';

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

/** Cor do anel no chão: a do clã do jogador (muda ao fundar) e vermelho inimigo. */
export const TEAM_COLOR = [0x5aa0ff, 0xff5a5a];
/** Tom da arte dos aliados: a cor do clã clareada (para não escurecer demais). */
export const allyTint = (c: number, k = 0.75) => {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k);
};
/** Quadro do soldado: 96×96, pés em y = 77; 15 colunas (0 parado, 1–8 andar, 9–14 ataque) × 4 direções. */
const CELL = SKIN_CELL;
const FOOT = SKIN_FOOT;
const COLS = SKIN_COLS;
/** Pele pronta para quem ainda espera a sua carregar. */
const FALLBACK = 'sk-ally-0-sword-0';
const pickOf = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
/** Passo do ataque em que o golpe acerta / a flecha sai. */
const HIT_STEP = 3;
const STEP_MS = 80;

export type ArmyMode = 'follow' | 'attack' | 'hold';

/**
 * Formações: onde cada tipo de soldado fica em volta do herói (frente = para
 * onde o herói anda). Arqueiros atrás, quebra-escudos na frente, arcanos nos
 * flancos — e variações.
 */
export type Formation = 'line' | 'wedge' | 'flank' | 'ring';
export const FORMATIONS: Record<Formation, { name: string; desc: string }> = {
  line: { name: 'LINHA', desc: 'quebra-escudos na frente, espadas logo atrás, arqueiros na retaguarda, arcanos nos flancos' },
  wedge: { name: 'CUNHA', desc: 'ponta de lança: quebra-escudos na ponta, espadas nas asas, atiradores no miolo' },
  flank: { name: 'FLANCOS', desc: 'espadas e quebra-escudos pelos lados, arqueiros e arcanos atrás do herói' },
  ring: { name: 'ANEL', desc: 'defesa em círculo: corpo a corpo por fora, atiradores protegidos por dentro' },
};
export const FORMATION_ORDER: Formation[] = ['line', 'wedge', 'flank', 'ring'];

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
  /** Pele (textura) em uso. */
  skin = '';
  /** Último dano levado (a cura espera um pouco). */
  lastHurt = -99999;
  /** O caminho reto até o herói está bloqueado: segue o campo de fluxo. */
  useFlow = false;
  /** Personagem nomeado: dano extra, tamanho, casa (sem guerra fica perto dela) e aviso de morte. */
  dmgK = 1;
  sizeK = 1;
  champion = false;
  /** Montado (líder de clã, procurado forte ou cavaleiro do herói). */
  mount: MountDef | null = null;
  /** Cavaleiro do herói: dano extra (o dos inimigos vem de dmgK). */
  cavK = 1;
  /** Cavaleiro nomeado: nome (com o da casa), arma e armadura que recebeu e a qualidade delas. */
  knight: Knight | null = null;
  nameTag?: Phaser.GameObjects.Text;
  mountSpr?: Phaser.GameObjects.Sprite;
  home: { x: number; y: number } | null = null;
  onDeath?: () => void;
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
    /** Povo (bioma 0–5) dos inimigos: define roupa, arma e até a raça. */
    readonly faction = 0,
  ) {
    this.x = x;
    this.y = y;
    this.kills = kills;
    this.maxHp = this.hp = Math.round(SOLDIERS[type].hp * this.hpMul);
    const s = army.scene;
    // anel no chão: profundidade fixa (abaixo de todos), não entra na reordenação por y
    this.ring = s.add.image(x, y, 'soldier-ring').setTint(TEAM_COLOR[team]).setAlpha(0.7).setDepth(DEPTH.birdShadow - 0.5);
    this.sprite = s.add.sprite(x, y, s.textures.exists(FALLBACK) ? FALLBACK : '__MISSING', 0).setOrigin(0.5, FOOT / CELL);
    this.sprite.setScale(army.scale);
    this.ring.setScale(army.scale * 2);
    this.icon = s.add.image(x, y, 'rank-icons', this.iconFrame).setDepth(DEPTH.fx - 50).setScale(army.iconScale);
    // traje: aliados pelo treino da sede; inimigos pelo povo (bioma) e pela experiência
    army.dress(this, team === 0 ? army.upTier : rankOf(kills));
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
    return this.team === 0 ? (1 + 0.1 * this.army.upg.atk) * this.cavK : SOLDIER_RANKS[this.rank].mul * this.dmgK;
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
    // montaria com barda/couro: defesa extra
    if (this.mount) amount *= 1 - this.mount.guard;
    // a armadura do cavaleiro nomeado segura mais um quarto do golpe
    if (this.knight) amount *= 0.75;
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
    this.mountSpr?.destroy();
    this.nameTag?.destroy();
  }
}

/** Cavaleiro nomeado: nome completo, itens recebidos e a qualidade (0–4) de cada um. */
export interface Knight {
  name: string;
  w: string;
  a: string;
  wt: number;
  at: number;
}

const KNIGHT_M = ['Aldric', 'Bertrand', 'Cedric', 'Dorian', 'Edmund', 'Gareth', 'Hugo', 'Ivar', 'Leoric', 'Merek', 'Osric', 'Roland', 'Tristan', 'Ulric', 'Wilhelm'];
const KNIGHT_F = ['Adela', 'Brienne', 'Catrin', 'Elara', 'Freya', 'Gwen', 'Isolde', 'Lyra', 'Maren', 'Rowena', 'Sigrid', 'Ysolde'];

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
  /** Recrutas disponíveis no quartel de cada cidade (renovam com o tempo). */
  private pools = new Map<string, number>();
  war: War | null = null;
  ready = false;
  scale: number = HERO.scale;
  /** Cor do clã do jogador (-1 = ainda sem clã). */
  clanColor = -1;
  /** Treino dos soldados na sede (níveis 0–10): ataque, defesa, vida. */
  upg = { atk: 0, def: 0, hp: 0 };
  /** Onde se curam: taxa por segundo no ponto (definido pela sede). */
  healAt: (x: number, y: number) => number = () => 0;
  /** Construções que o inimigo pode atacar (sede, fortes do herói). */
  structures: () => Hittable[] = () => [];
  /** Duelo 1x1 em curso: todos param em roda e só o duelista luta com o herói. */
  duel: { x: number; y: number; r: number; champ: Soldier } | null = null;
  /** Construções inimigas que o exército do herói ataca (forte rival sob cerco). */
  siegeTargets: () => Hittable[] = () => [];
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
      this.dress(s, this.upTier);
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
      const s = this.addAlly(g.t, p[0], p[1], g.k, false, true, g.m, g.kn);
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
  readonly heroT: Hittable;
  /** Soldados salvos esperando as folhas ficarem prontas. */
  private pending: { t: SoldierType; k: number; st?: boolean; m?: string; kn?: Knight }[] = [];
  /** Aquartelados em Brumavale (fora do campo; voltam com Convocar, curados). */
  garrison: { t: SoldierType; k: number; m?: string; kn?: Knight }[] = [];
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
      takeDamage: (a, x, y) => p.hurt(a, x, y, true),
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

  // ------------------------------------------------------------------ peles
  /**
   * Peles prontas (scripts/chars): corpo, roupa e arma já montados num atlas
   * com cada quadro recortado. Carregadas sob demanda (poupa memória no
   * celular): a dos aliados no começo, a de cada povo quando ele aparece.
   */
  private loading = new Map<string, (() => void)[]>();

  /** Carrega as peles que faltam e chama `done`. */
  need(keys: string[], done: () => void) {
    const s = this.scene;
    const missing = [...new Set(keys)].filter((k) => !s.textures.exists(k));
    if (!missing.length) return done();
    let left = missing.length;
    const one = () => {
      if (--left === 0) done();
    };
    let start = false;
    for (const k of missing) {
      const q = this.loading.get(k);
      if (q) {
        q.push(one);
        continue;
      }
      this.loading.set(k, [one]);
      s.load.atlas(k, `assets/skins/${k}.png`, `assets/skins/${k}.json`);
      s.load.once(`filecomplete-atlasjson-${k}`, () => {
        const cbs = this.loading.get(k) ?? [];
        this.loading.delete(k);
        cbs.forEach((f) => f());
      });
      start = true;
    }
    if (start && !s.load.isLoading()) s.load.start();
  }

  /** Pele (chave da textura) de um soldado: aliados pela linha do clã; inimigos pelo povo do bioma. */
  skinKey(team: 0 | 1, type: SoldierType, tier: number, faction = 0): string {
    const t = Math.max(0, Math.min(3, tier));
    const list = team === 0 ? SKINS.ally[t][type] : (SKINS.factions[String(Math.max(0, Math.min(5, faction))) as keyof typeof SKINS.factions] ?? SKINS.factions['0']).tiers[t][type];
    return `sk-${pickOf(list as readonly string[])}`;
  }

  /** Veste o soldado (troca a textura quando a pele chega). */
  dress(s: Soldier, tier: number) {
    const key = this.skinKey(s.team, s.type, tier, s.faction);
    s.skin = key;
    const apply = () => {
      if (s.dead || s.skin !== key) return;
      s.sprite.setTexture(key, s.sprite.frame?.name ?? 0);
    };
    if (this.scene.textures.exists(key)) apply();
    else this.need([key], apply);
  }

  private gcAt = 0;
  /**
   * Libera da memória de vídeo as peles que ninguém está usando (povos de
   * biomas que ficaram para trás). Se voltarem, carregam de novo do cache.
   */
  gcSkins(now: number) {
    if (now < this.gcAt) return;
    this.gcAt = now + 20000;
    const tm = this.scene.textures;
    const busy = new Set<string>([FALLBACK, ...this.loading.keys()]);
    for (const o of this.scene.children.list) {
      const k = (o as Phaser.GameObjects.Sprite).texture?.key;
      if (k && (k.startsWith('sk-') || k.startsWith('mount-'))) busy.add(k);
    }
    for (const t of ['sword', 'greatsword', 'bow', 'staff'] as SoldierType[]) for (const k of SKINS.ally[this.upTier][t]) busy.add(`sk-${k}`);
    const near = SKINS.factions[String(this.scene.biome) as keyof typeof SKINS.factions];
    if (near) for (const tier of near.tiers) for (const list of Object.values(tier)) for (const k of list as readonly string[]) busy.add(`sk-${k}`);
    for (const k of tm.getTextureKeys()) if (k.startsWith('sk-') && !busy.has(k)) tm.remove(k);
    // atlas de montarias que ninguém (herói ou cavaleiro inimigo) está usando
    const ridden = this.scene.player.mount ? `mount-${this.scene.player.mount.id}` : '';
    for (const k of tm.getTextureKeys()) if (k.startsWith('mount-') && k !== 'mount-icons' && k !== ridden && !busy.has(k)) tm.remove(k);
  }

  /** Adianta as peles de um povo (ao entrar no bioma ou quando um bando se aproxima). */
  preloadFaction(f: number) {
    const F = SKINS.factions[String(Math.max(0, Math.min(5, f))) as keyof typeof SKINS.factions];
    if (!F) return;
    const keys: string[] = [];
    for (const tier of F.tiers) for (const list of Object.values(tier)) for (const k of list as readonly string[]) keys.push(`sk-${k}`);
    this.need(keys, () => {});
  }

  /** Carrega as peles dos aliados (o treino atual) e solta os recrutas pendentes. */
  prepare(done: () => void) {
    if (this.ready) return done();
    const keys = [FALLBACK];
    for (const t of ['sword', 'greatsword', 'bow', 'staff'] as SoldierType[]) for (const k of SKINS.ally[this.upTier][t]) keys.push(`sk-${k}`);
    this.need(keys, () => {
      if (this.ready) return done();
      this.ready = true;
      const p = this.scene.player;
      for (const r of this.pending.splice(0)) {
        const s = this.addAlly(r.t, p.x, p.y + 30, r.k, false, !!r.st, r.m, r.kn);
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
    });
  }

  // ------------------------------------------------------------------ elenco
  private addAlly(type: SoldierType, x: number, y: number, kills = 0, save = true, station = false, mount?: string, kn?: Knight) {
    const s = new Soldier(this, 0, type, x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-6, 6), kills);
    s.station = station;
    this.soldiers.push(s);
    if (mount && MOUNTS[mount]) this.rideAlly(s, mount, kn);
    if (save) this.save();
    return s;
  }

  /**
   * Quartel onde o herói está: o de qualquer cidade (com folga de 2 tiles nos
   * muros) ou, na sede com Alojamento, o da cidade vizinha à sede.
   */
  get barracksCity(): City | undefined {
    const p = this.scene.player;
    const tx = p.x / TILE;
    const ty = p.y / TILE;
    const here = this.scene.map.cities.find((c) => tx >= c.x0 - 2 && tx <= c.x1 + 2 && ty >= c.y0 - 2 && ty <= c.y1 + 2);
    if (here) return here;
    const hq = this.scene.hq;
    if (hq.founded && hq.heroInside && hq.level('barracks') > 0) return hq.city;
    return undefined;
  }

  /** Teto de recrutas de um quartel: a capital forma mais gente. */
  poolMaxOf(c: City) {
    return c.capital ? 60 : 35;
  }

  poolOf(c: City) {
    return Math.floor(this.pools.get(c.name) ?? (c.capital ? 40 : 25));
  }

  /** Recrutas do quartel onde o herói está (ou da capital). */
  get pool(): number {
    const c = this.barracksCity ?? this.scene.map.cities.find((x) => x.capital);
    return c ? this.poolOf(c) : 0;
  }

  set pool(v: number) {
    const c = this.barracksCity ?? this.scene.map.cities.find((x) => x.capital);
    if (c) this.pools.set(c.name, Math.max(0, Math.min(this.poolMaxOf(c), v)));
  }

  get poolMax(): number {
    const c = this.barracksCity ?? this.scene.map.cities.find((x) => x.capital);
    return c ? this.poolMaxOf(c) : 60;
  }

  /** O herói está em Brumavale? */
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
    if (!this.barracksCity) return 'Recrute no quartel de qualquer cidade (ou no Alojamento da sede)';
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
  declareWar(n: number, house?: { name: string; color: number; clan?: string }, opts: { origin?: { x: number; y: number }; exact?: boolean; vet?: number; siege?: { x: number; y: number }; faction?: number } = {}) {
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
    const [name, raw] = house ? [house.name, house.color] : Phaser.Utils.Array.GetRandom(houses);
    // tom leve: a roupa de cada povo é que identifica; a cor só marca a casa
    const color = allyTint(raw, 0.72);
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
    // bando que já está no mapa: aparece onde está, de frente para o herói
    const hero = this.scene.player;
    if (opts.exact) ang = Math.atan2(p.y - hero.y, p.x - hero.x);
    const cx = opts.exact ? p.x : p.x + Math.cos(ang) * 300;
    const cy = opts.exact ? p.y : p.y + Math.sin(ang) * 300;
    const fx = -Math.cos(ang);
    const fy = -Math.sin(ang);
    // o povo do lugar de onde vêm (roupa, armas e raça do bioma)
    const faction = opts.faction ?? this.scene.biomeAt(cx, cy);
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
      const s = new Soldier(this, 1, type, x, y, kills, faction);
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

  /**
   * O herói fugiu: os inimigos que sobraram voltam a ser um bando no mapa.
   * Devolve quantos estavam de pé.
   */
  dismissFoes(): number {
    const w = this.war;
    if (!w) return 0;
    let left = 0;
    for (const s of this.soldiers) {
      if (s.team !== 1 || s.dead || s.champion) continue;
      left++;
      s.dead = true;
      this.scene.tweens.add({ targets: [s.sprite, s.ring, s.icon], alpha: 0, duration: 500, onComplete: () => s.destroy() });
    }
    this.war = null;
    this.emit('war-end', { ...w, won: false, fled: true, left, glory: 0 });
    return left;
  }

  /** Inimigos ainda de pé na guerra (sem os personagens nomeados). */
  get foesLeft(): number {
    let n = 0;
    for (const s of this.soldiers) if (s.team === 1 && !s.dead && !s.champion) n++;
    return n;
  }

  /** Centro dos inimigos de pé. */
  get foeCenter(): { x: number; y: number } | null {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const s of this.soldiers)
      if (s.team === 1 && !s.dead) {
        x += s.x;
        y += s.y;
        n++;
      }
    return n ? { x: x / n, y: y / n } : null;
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
    s.onDeath?.();
    const sc = this.scene;
    if (s.team === 0 && s.mount) sc.events.emit('toast', `${s.knight?.name ?? 'Um cavaleiro'} caiu · ${s.mount.name} voltou ferida ao estábulo`);
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
    sc.tweens.add({ targets: [s.sprite, s.ring, s.icon, ...(s.mountSpr ? [s.mountSpr] : [])], alpha: 0, duration: 500, onComplete: () => s.destroy() });
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
      this.garrison.push({ t: s.type, k: s.kills, m: s.mount?.id, kn: s.knight ?? undefined });
      s.dead = true;
      sc.fx.burst(s.x, s.y - 10, 0xbfe0ff, 3);
      sc.tweens.add({ targets: [s.sprite, s.ring, s.icon, ...(s.mountSpr ? [s.mountSpr] : []), ...(s.nameTag ? [s.nameTag] : [])], alpha: 0, duration: 400, onComplete: () => s.destroy() });
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
      const s = this.addAlly(g.t, bx + Phaser.Math.Between(-30, 30), by + Phaser.Math.Between(-20, 20), g.k, false, false, g.m, g.kn ?? undefined);
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
    const tn = { sword: 0, greatsword: 0, bow: 0, staff: 0 };
    for (const s of this.field) tn[s.type]++;
    this.typeN = tn;
    const k = { sword: 0, greatsword: 0, bow: 0, staff: 0 };
    this.field.forEach((s) => {
      s.slot = k[s.type]++;
      if (!all) return;
      const [x, y] = this.slotPos(s, p.x, p.y);
      s.x = x;
      s.y = y;
      s.vx = s.vy = 0;
    });
  }

  formation: Formation = 'line';
  /** Quantos de cada tipo há na formação (contados a cada quadro). */
  private typeN: Record<SoldierType, number> = { sword: 0, greatsword: 0, bow: 0, staff: 0 };

  setFormation(f: Formation) {
    this.formation = f;
    for (const s of this.soldiers) if (s.team === 0) s.thinkAt = 0;
    this.save();
    this.emit('formation', f);
  }

  /**
   * Lugar do soldado na formação: (frente, lado) no referencial do herói,
   * convertido para o mapa. `i` é a ordem dele entre os do mesmo tipo.
   */
  private slotPos(s: Soldier | number, ox: number, oy: number): [number, number] {
    const type: SoldierType = typeof s === 'number' ? 'sword' : s.type;
    const i = typeof s === 'number' ? s : s.slot;
    const n = Math.max(1, typeof s === 'number' ? 10 : this.typeN[type]);
    const G = 13;
    const fx = this.faceX;
    const fy = this.faceY;
    // fileiras centradas: `per` por fileira, a partir de `f0` (frente) indo para `dir`
    const rows = (per: number, f0: number, dir: number, side = 0): [number, number] => {
      const row = Math.floor(i / per);
      const inRow = Math.min(per, n - row * per);
      const col = (i % per) - (inRow - 1) / 2;
      return [f0 + dir * row * G, side + col * G];
    };
    let f = 0;
    let r = 0;
    const F = this.formation;
    const melee = type === 'sword' || type === 'greatsword';
    if (F === 'line') {
      if (type === 'greatsword') [f, r] = rows(10, 40, 1);
      else if (type === 'sword') [f, r] = rows(10, 26, -1);
      else if (type === 'bow') [f, r] = rows(10, -26, -1);
      else {
        // arcanos divididos nos dois flancos
        const half = i % 2 ? 1 : -1;
        const k = Math.floor(i / 2);
        f = 12 - Math.floor(k / 2) * G;
        r = half * (78 + (k % 2) * G);
      }
    } else if (F === 'wedge') {
      if (melee) {
        // V aberto para trás; quebra-escudos na ponta
        const k = type === 'greatsword' ? i : i + this.typeN.greatsword;
        const arm = k % 2 ? 1 : -1;
        const d = Math.ceil(k / 2);
        f = 46 - d * 9;
        r = arm * d * 10;
      } else if (type === 'bow') [f, r] = rows(5, -10, -1);
      else [f, r] = rows(4, -34, -1);
    } else if (F === 'flank') {
      if (melee) {
        const k = type === 'greatsword' ? i : i + this.typeN.greatsword;
        const sideK = k % 2 ? 1 : -1;
        const j = Math.floor(k / 2);
        f = 18 - Math.floor(j / 3) * G;
        r = sideK * (34 + (j % 3) * G);
      } else if (type === 'bow') [f, r] = rows(6, -26, -1);
      else [f, r] = rows(4, -14, -1);
    } else {
      // anel: corpo a corpo por fora, atiradores por dentro
      const total = melee ? this.typeN.sword + this.typeN.greatsword : this.typeN.bow + this.typeN.staff;
      const k = type === 'greatsword' ? i : type === 'sword' ? i + this.typeN.greatsword : type === 'bow' ? i : i + this.typeN.bow;
      const R = melee ? Math.max(34, (total * G) / (Math.PI * 2)) : Math.max(18, (total * G * 0.8) / (Math.PI * 2));
      const a = (k / Math.max(1, total)) * Math.PI * 2;
      f = Math.cos(a) * R;
      r = Math.sin(a) * R;
    }
    // frente = (fx, fy); direita = (-fy, fx)
    return [ox + fx * f - fy * r, oy + fy * f + fx * r];
  }

  /**
   * Personagem nomeado (líder de clã, procurado): um soldado inimigo com
   * armadura e arma próprias, maior, mais forte e tingido. Sem guerra, fica
   * perto de casa até o herói chegar. Precisa de `prepare` antes.
   */
  spawnChampion(spec: { x: number; y: number; type: SoldierType; faction?: number; tier?: number; hp: number; damage: number; tint: number; scale: number; rank: number; onDeath?: () => void }): Soldier {
    const faction = spec.faction ?? this.scene.biomeAt(spec.x, spec.y);
    const s = new Soldier(this, 1, spec.type, spec.x, spec.y, SOLDIER_RANKS[Math.min(3, spec.rank)].kills, faction);
    // personagens: o escalão de cima do povo (ou o pedido)
    this.dress(s, spec.tier ?? Math.min(3, spec.rank + 1));
    s.maxHp = s.hp = spec.hp;
    s.dmgK = spec.damage / SOLDIERS[spec.type].damage;
    s.sizeK = spec.scale;
    s.sprite.setScale(this.scale * spec.scale);
    s.ring.setScale(this.scale * 2 * spec.scale);
    s.baseTint = spec.tint;
    s.sprite.setTint(spec.tint);
    s.home = { x: spec.x, y: spec.y };
    s.onDeath = spec.onDeath;
    s.champion = true;
    s.thinkAt = this.scene.time.now + 300;
    this.soldiers.push(s);
    return s;
  }

  /**
   * Põe um personagem numa montaria: carrega o atlas dela (se preciso) e ergue
   * o cavaleiro até a sela; a montaria fica na frente das pernas dele.
   */
  mountChampion(s: Soldier, id: string) {
    const def = MOUNTS[id];
    if (!def) return;
    const key = `mount-${id}`;
    const sc = this.scene;
    s.mount = def;
    const ride = () => {
      if (s.dead || !s.sprite.active || !sc.textures.exists(key) || s.mount !== def || s.mountSpr) return;
      const k = this.scale * s.sizeK;
      s.mountSpr = sc.add.sprite(s.x, s.y, key, 0).setOrigin(0.5, 76 / 80).setScale(0.5 * s.sizeK).setDepth(DEPTH.entities + s.y + 0.4);
      // as folhas de soldado são recortadas por quadro (setCrop não serve): em vez de
      // cortar as pernas, a montaria é desenhada na frente delas
      s.sprite.setOrigin(0.5, (FOOT + (def.seat * s.sizeK) / k - 4) / CELL);
      s.ring.setScale(this.scale * 2.6 * s.sizeK);
    };
    if (sc.textures.exists(key)) return ride();
    sc.load.atlas(key, `assets/sprites/mounts/${key}.png`, `assets/sprites/mounts/${key}.json`);
    sc.load.once(`filecomplete-atlasjson-${key}`, ride);
    sc.load.start();
  }

  // ------------------------------------------------------------------ cavalaria
  /** Soldado do herói monta: mais vida e dano (cavaleiro), mais rápido. */
  private rideAlly(s: Soldier, id: string, kn?: Knight) {
    const m = MOUNTS[id];
    s.knight = kn ?? null;
    const wt = kn?.wt ?? 0;
    const at = kn?.at ?? 0;
    // a qualidade da arma e da armadura que ele recebeu pesa muito
    // cavaleiro nomeado: bem mais forte que um soldado montado comum
    s.cavK = (1.4 + m.power) * (1 + 0.22 * wt) * (kn ? 1.5 : 1);
    s.maxHp = s.hp = Math.round(s.maxHp * 1.6 * (1 + 0.3 * at) * (kn ? 2.2 : 1));
    this.mountChampion(s, id);
    if (kn) {
      // pele de elite e o nome sobre a cabeça
      this.dress(s, 3);
      s.nameTag = this.scene.add
        .text(s.x, s.y - 50, kn.name, { fontFamily: 'Tiny5, monospace', fontSize: '7px', color: '#ffe9a8', stroke: '#1e1a24', strokeThickness: 2 })
        .setOrigin(0.5)
        .setResolution(4)
        .setDepth(4245);
    }
  }

  private unrideAlly(s: Soldier) {
    s.mountSpr?.destroy();
    s.mountSpr = undefined;
    s.mount = null;
    s.cavK = 1;
    // o cavaleiro devolve a arma e a armadura
    if (s.knight) {
      const inv = this.scene.inventory;
      for (const id of [s.knight.w, s.knight.a]) if (id) inv.add(id, 1);
      s.knight = null;
      s.nameTag?.destroy();
      s.nameTag = undefined;
      this.dress(s, this.upTier);
    }
    s.maxHp = Math.round(SOLDIERS[s.type].hp * s.hpMul);
    s.hp = Math.min(s.hp, s.maxHp);
    s.sprite.setOrigin(0.5, FOOT / CELL);
    s.ring.setScale(this.scale * 2 * s.sizeK);
  }

  /** Quantas cópias da montaria `id` estão com cavaleiros (no campo, de guarda ou aquartelados). */
  ridersOf(id: string): number {
    let n = 0;
    for (const s of this.soldiers) if (s.team === 0 && !s.dead && s.mount?.id === id) n++;
    for (const g of this.garrison) if (g.m === id) n++;
    for (const r of this.pending) if (r.m === id) n++;
    return n;
  }

  get cavalry(): number {
    return this.soldiers.filter((s) => s.team === 0 && !s.dead && s.mount).length + this.garrison.filter((g) => g.m).length;
  }

  /** Melhor arma e armadura sobrando na mochila (para nomear um cavaleiro). */
  knightGear(): { w: string; a: string } | null {
    const inv = this.scene.inventory;
    let w = '';
    let a = '';
    for (const sl of inv.slots) {
      const d = sl && ITEMS[sl.id];
      if (!d?.equip) continue;
      if (d.equip.kind === 'weapon' && (!w || (d.tier ?? 0) > (ITEMS[w].tier ?? 0))) w = d.id;
      if (d.equip.kind === 'armor' && (!a || (d.tier ?? 0) > (ITEMS[a].tier ?? 0))) a = d.id;
    }
    return w && a ? { w, a } : null;
  }

  /**
   * Nomeia um cavaleiro: um soldado recebe a montaria `id` e a melhor arma e
   * armadura sobrando na mochila (a arma define o tipo: arco vira arqueiro
   * montado). Ganha um nome com o da casa do herói.
   */
  promote(id: string): string {
    const st = this.scene.stable;
    if (!MOUNTS[id] || st.free(id) <= 0) return st.count(id) > 1 ? 'Todas as cópias estão em uso (procrie mais)' : 'Sem montaria livre desta espécie (procrie para ter outra)';
    const gear = this.knightGear();
    if (!gear) return 'Faltam uma arma e uma armadura sobrando na mochila para o cavaleiro';
    const wd = ITEMS[gear.w];
    const wantType = (wd.equip as { id: SoldierType }).id;
    const order: SoldierType[] = [wantType, 'greatsword', 'sword', 'bow', 'staff'];
    const pick = this.soldiers
      .filter((s) => s.team === 0 && !s.dead && !s.mount && !s.station)
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || b.kills - a.kills)[0];
    if (!pick) return 'Nenhum soldado com você para nomear (convoque o exército)';
    const inv = this.scene.inventory;
    inv.remove(gear.w, 1);
    inv.remove(gear.a, 1);
    const female = Math.random() < 0.35;
    const first = female ? KNIGHT_F[Math.floor(Math.random() * KNIGHT_F.length)] : KNIGHT_M[Math.floor(Math.random() * KNIGHT_M.length)];
    const name = `${female ? 'Dama' : 'Sir'} ${first} ${this.scene.clans.player.name}`;
    this.rideAlly(pick, id, { name, w: gear.w, a: gear.a, wt: wd.tier ?? 0, at: ITEMS[gear.a].tier ?? 0 });
    this.scene.fx.burst(pick.x, pick.y - 14, 0xffd77a, 18);
    this.scene.events.emit('area', 'CAVALEIRO NOMEADO!', `${name} · ${MOUNTS[id].name} · ${wd.name} · ${ITEMS[gear.a].name}`);
    this.save();
    this.emit('change');
    return `${name} jurou lealdade à casa`;
  }

  /** Cavaleiros nomeados (no campo, de guarda e aquartelados). */
  get knights(): Knight[] {
    return [...this.soldiers.filter((s) => s.team === 0 && !s.dead && s.knight).map((s) => s.knight!), ...this.garrison.filter((g) => g.kn).map((g) => g.kn!)];
  }

  /** Tira a montaria `id` de um cavaleiro (volta para o estábulo). */
  recall(id: string): boolean {
    const s = this.soldiers.find((x) => x.team === 0 && !x.dead && x.mount?.id === id);
    if (s) {
      this.unrideAlly(s);
    } else {
      const g = this.garrison.find((x) => x.m === id) ?? this.pending.find((x) => x.m === id);
      if (!g) return false;
      g.m = undefined;
    }
    this.save();
    this.emit('change');
    return true;
  }

  /** Tira um soldado do campo sem contar como abate (despawn). */
  remove(s: Soldier) {
    s.dead = true;
    s.destroy();
    const i = this.soldiers.indexOf(s);
    if (i >= 0) this.soldiers.splice(i, 1);
  }

  setScale(k: number) {
    this.scale = k;
    for (const s of this.soldiers) {
      s.sprite.setScale(k * s.sizeK);
      s.ring.setScale(k * 2 * s.sizeK);
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
      const d = t.size ? reachDist(s.x, s.y, t) ** 2 : (t.fx - s.x) ** 2 + (t.fy - s.y) ** 2;
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
    else if (!this.war) {
      for (const e of this.scene.enemies) consider(e);
      // o gigante acordado é o alvo de todos que estiverem por perto
      for (const g of this.scene.giants?.targets ?? []) consider(g);
    }
    else {
      // cerco: portão, torres e Salão do forte rival também são alvos
      for (const t of this.siegeTargets()) consider(t);
      if (!best) {
        bd = 30 * 30;
        for (const e of this.scene.enemies) consider(e);
      }
    }
    return best;
  }

  update(time: number, delta: number) {
    this.gcSkins(time);
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
    // quantos de cada tipo na formação (e a ordem de cada um entre os seus)
    const cnt = { sword: 0, greatsword: 0, bow: 0, staff: 0 };
    for (const s of this.soldiers) if (!s.dead && s.team === 0 && !s.station) cnt[s.type]++;
    this.typeN = cnt;
    const tn = { sword: 0, greatsword: 0, bow: 0, staff: 0 };
    for (const s of this.soldiers) {
      if (s.dead) continue;
      const D = SOLDIERS[s.type];
      if (s.team === 0 && !s.station) s.slot = tn[s.type]++;
      // fora da tela: anda em quadros alternados, com passo dobrado (metade do custo)
      const off = !s.sprite.visible;
      if (off && ((this.frameN + s.parity) & 1)) continue;
      const dt = off ? Math.min(0.1, dt0 * 2) : dt0;
      // decide o alvo de vez em quando (turnos alternados)
      if (time >= s.thinkAt) {
        s.thinkAt = time + 140 + Math.random() * 120;
        if (this.duel) s.target = s === this.duel.champ ? this.heroT : null;
        else if (s.fleeing) s.target = null;
        else if (s.station) {
          // guarda: só sai do posto atrás de quem chega perto da sede
          const t = this.nearest(s, 170);
          s.target = t && Math.hypot(t.fx - s.postX, t.fy - s.postY) < 230 ? t : null;
        } else if (s.champion && s.home && !this.war) {
          // sem guerra: só sai de casa atrás de quem chega perto, e não vai longe
          const t = this.nearest(s, 150);
          s.target = t && Math.hypot(t.fx - s.home.x, t.fy - s.home.y) < 320 ? t : null;
        } else if (s.team === 1) s.target = this.nearest(s, this.war?.siege ? 160 : 520);
        else if (this.mode === 'attack') s.target = this.nearest(s, 260);
        else s.target = this.nearest(s, this.mode === 'hold' ? 90 : 70);
        // caminho reto até o herói bloqueado? então contorna pelo campo de fluxo
        s.useFlow = !s.target && !s.station && !s.champion && !(s.team === 1 && this.war?.siege) && Math.hypot(s.x - p.x, s.y - p.y) > 30 && !this.los(s.x, s.y, p.x, p.y);
        s.healRate = s.team === 0 ? this.healAt(s.x, s.y) : 0;
        // longe demais do herói: alcança a formação
        if (s.team === 0 && !s.station && Math.hypot(s.x - p.x, s.y - p.y) > 520) {
          const [x, y] = this.slotPos(s, p.x, p.y);
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
      const du = this.duel;
      if (du && s !== du.champ) {
        // duelo: todo mundo assiste de fora da roda
        const ax = s.x - du.x;
        const ay = s.y - du.y;
        const d = Math.hypot(ax, ay) || 1;
        const R = du.r + 16 + (s.team === 1 ? 12 : 0);
        if (d < R) {
          gx = du.x + (ax / d) * R;
          gy = du.y + (ay / d) * R;
        }
        s.dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 1 : 2) : ay > 0 ? 3 : 0;
      } else if (s.fleeing) {
        gx = s.x + (s.x - p.x);
        gy = s.y + (s.y - p.y);
      } else if (s.target) {
        const dx = s.target.fx - s.x;
        const dy = s.target.fy - s.y;
        const d = Math.hypot(dx, dy) - (s.target.size ?? 0);
        if (d > D.range * 0.85) {
          gx = s.target.fx;
          gy = s.target.fy;
        } else wantAttack = true;
        s.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
      } else if (s.station) {
        gx = s.postX;
        gy = s.postY;
      } else if (s.team === 0) {
        const [x, y] = this.mode === 'hold' ? this.slotPos(s, this.holdX, this.holdY) : this.slotPos(s, p.x, p.y);
        gx = x;
        gy = y;
      } else if (s.champion && s.home && !this.war) {
        gx = s.home.x;
        gy = s.home.y;
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
      // com o herói montado, o exército acompanha em marcha forçada
      const ride = s.team === 0 && !s.target && !s.station && p.mount ? Math.min(2, p.mount.speed * 0.9) : 1;
      const speed = D.speed * (time < s.slowUntil ? 0.45 : 1) * (s.fleeing ? 1.3 : 1) * ride * (s.mount ? 1.35 : 1);
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
      s.mountSpr?.setVisible(vis);
      s.nameTag?.setVisible(vis);
      if (!vis) continue;
      s.icon.setPosition(Math.round(s.x), Math.round(s.y - 25 - (s.mount ? s.mount.seat * s.sizeK : 0)));
      // montaria na frente das pernas do cavaleiro (sentado na sela)
      if (s.nameTag) s.nameTag.setPosition(Math.round(s.x), Math.round(s.y - 34 - (s.mount ? s.mount.seat * s.sizeK : 0))).setVisible(vis);
      if (s.mountSpr) s.mountSpr.setFrame(s.dir * 6 + (moving ? Math.floor(s.animT * 0.75) % 6 : 0)).setPosition(Math.round(s.x), Math.round(s.y)).setDepth(DEPTH.entities + s.y + 0.4);
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

  /** Cada quartel forma 1 recruta a cada 3 s, até o teto dele. */
  private regenPool(delta: number) {
    this.poolTimer += delta;
    if (this.poolTimer < 3000) return;
    this.poolTimer = 0;
    let any = false;
    for (const c of this.scene.map.cities) {
      const n = this.poolOf(c);
      if (n >= this.poolMaxOf(c)) continue;
      this.pools.set(c.name, n + 1);
      any = true;
    }
    if (any) this.emit('change');
  }

  /** Golpe ou disparo no passo de impacto. */
  private strike(s: Soldier, time: number) {
    const t = s.target;
    if (!t || !t.targetable) return;
    const D = SOLDIERS[s.type];
    const dmg = D.damage * s.mul;
    if (!D.ranged) {
      if (reachDist(s.x, s.y, t) <= D.range + 8) this.hit(t, dmg, s);
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
      } else if (sh.target.targetable && reachDist(sh.tx, sh.ty + 6, sh.target) < 16) this.damageFrom(sh.target, sh.damage, sh);
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

  /** Tira a montaria de um personagem (duelo a pé). */
  dismount(s: Soldier) {
    if (!s.mount) return;
    s.mountSpr?.destroy();
    s.mountSpr = undefined;
    s.mount = null;
    s.sprite.setOrigin(0.5, FOOT / CELL);
    s.ring.setScale(this.scale * 2 * s.sizeK);
  }

  /** Vitória forçada (o Salão do forte inimigo caiu): os que sobraram fogem. */
  winWar() {
    const w = this.war;
    if (!w) return;
    const p = this.scene.player;
    this.rout();
    this.war = null;
    const glory = w.start * 2;
    this.scene.gainGlory(glory, p.x, p.y - 40);
    this.emit('war-end', { ...w, won: true, glory });
    this.save();
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
      const roster = this.soldiers.filter((s) => s.team === 0 && !s.dead).map((s) => ({ t: s.type, k: s.kills, st: s.station || undefined, m: s.mount?.id, kn: s.knight ?? undefined }));
      localStorage.setItem(SAVE_KEY, JSON.stringify({ roster: [...roster, ...this.pending], garrison: this.garrison, pools: Object.fromEntries(this.pools), formation: this.formation }));
    } catch {
      /* sem armazenamento */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.pools && typeof d.pools === 'object') for (const [k, v] of Object.entries(d.pools)) if (typeof v === 'number') this.pools.set(k, v);
      // save antigo: um só quartel (o de Brumavale)
      else if (typeof d.pool === 'number') {
        const cap = this.scene.map.cities.find((c) => c.capital);
        if (cap) this.pools.set(cap.name, d.pool);
      }
      if (d.formation in FORMATIONS) this.formation = d.formation;
      const m = (v: unknown) => (typeof v === 'string' && MOUNTS[v] ? v : undefined);
      const kn = (v: unknown): Knight | undefined => (v && typeof v === 'object' && typeof (v as Knight).name === 'string' ? (v as Knight) : undefined);
      if (Array.isArray(d.roster)) for (const r of d.roster) if (SOLDIER_TYPES.includes(r.t)) this.pending.push({ t: r.t, k: Number(r.k) || 0, st: !!r.st, m: m(r.m), kn: kn(r.kn) });
      if (Array.isArray(d.garrison)) for (const r of d.garrison) if (SOLDIER_TYPES.includes(r.t)) this.garrison.push({ t: r.t, k: Number(r.k) || 0, m: m(r.m), kn: kn(r.kn) });
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
