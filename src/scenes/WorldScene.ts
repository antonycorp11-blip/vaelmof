import Phaser from 'phaser';
import { FloatTexts } from '../systems/FloatTexts';
import { ACTIVE_RADIUS, DEBUG, TILE, VIEW_TILES_H, VIEW_TILES_W, WORLD_SEED } from '../config';
import { Animal } from '../entities/Animal';
import { Bandit } from '../entities/Bandit';
import { BEASTS, Beast } from '../entities/Beast';
import { makeCritter } from '../entities/Critters';
import { Bird } from '../entities/Bird';
import { DEPTH } from '../entities/Creature';
import { Deer } from '../entities/Deer';
import type { Enemy } from '../entities/Enemy';
import type { Flame } from '../entities/Flame';
import { Player } from '../entities/Player';
import { Sheep } from '../entities/Sheep';
import { Slime } from '../entities/Slime';
import { Wolf } from '../entities/Wolf';
import { Wraith } from '../entities/Wraith';
import { inputState } from '../input/InputState';
import type { OutfitId, WeaponId } from '../entities/heroSheets';
import { DayNightSystem, mulColor } from '../systems/DayNightSystem';
import { BiomeFx } from '../systems/BiomeFx';
import { Gathering } from '../systems/Gathering';
import { Inventory } from '../systems/Inventory';
import type { SpawnKind } from '../systems/WorldGenerator';
import { fmtPts, Progress } from '../systems/Progress';
import { SpawnSpots, type Spot } from '../systems/SpawnSpots';
import { Biome, BIOMES, generateWorld, type WorldData } from '../systems/WorldGenerator';
import { TileCollision } from '../systems/TileCollision';
import { Army } from '../systems/Army';
import { Bands } from '../systems/Bands';
import { Bosses } from '../systems/Bosses';
import { Clans, type Clan } from '../systems/Clans';
import { Loot } from '../systems/Loot';
import { Missions } from '../systems/Missions';
import { HQ } from '../systems/HQ';
import { Market } from '../systems/Market';
import { Stable } from '../systems/Stable';
import { CHAMPION_MOUNT, RARE_MOUNTS } from '../data/mounts';
import { rollGear } from '../data/gear';
import { Champions } from '../systems/Champions';
import { CHAMPIONS, RANKS, type ChampionId } from '../systems/Ranks';
import type { Hittable } from '../entities/Hittable';
import { Diplomacy } from '../systems/Diplomacy';
import { Forts } from '../systems/Forts';
import { MountFx } from '../systems/MountFx';
import { Races } from '../systems/Races';
import { Streamer } from '../systems/Streamer';
import { TileWindow } from '../systems/TileWindow';
import { Tyrants } from '../systems/Tyrants';
import { WorldBosses } from '../systems/WorldBosses';
import { WeatherSystem } from '../systems/WeatherSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { Territories } from '../systems/Territories';
import { Prologue } from '../systems/Prologue';
import { identityOf } from '../systems/Cities';
import { saves } from '../systems/SaveManager';

export interface Light {
  img: Phaser.GameObjects.Image;
  base: number;
  scale: number;
  flicker: number;
}

const BIRD_COUNT = 14;
/** Tom de cada variante de criatura por bioma. */
const VARIANT_TINT: Record<string, number> = { snow: 0xe6eeff, stone: 0xa09c94, void: 0x9a70d8, sand: 0xe8c47a };
/** Rótulo do clima próprio de cada bioma (substitui o clima geral). */
/** Pontos por abate de cada criatura (antes do nível da região): 0,5 nas básicas. */
const KILL_POINTS: Partial<Record<SpawnKind, number>> = { slime: 0.5, wolf: 0.5, boar: 0.5, bandit: 0.75, spider: 0.75, scorpion: 0.75, wraith: 1, bear: 1, golem: 1.25 };
const BIOME_WEATHER: Partial<Record<Biome, string>> = { [Biome.SNOW]: 'Neve', [Biome.BLACK]: 'Cinzas', [Biome.DUST]: 'Seco' };

/** Mundo: mapa, entidades, ciclo de dia/noite, clima e câmera. */
const POS_KEY = 'vaelmor.pos.v1';
const MERCHANT_ACTION = { id: 'market', label: 'COMPRAR', icon: 11 };

export class WorldScene extends Phaser.Scene {
  map!: WorldData;
  /** Bioma predominante em volta do jogador. */
  biome: Biome = Biome.VALE;
  player!: Player;
  enemies: Enemy[] = [];
  /** Tudo que o herói pode atingir neste quadro: criaturas e soldados inimigos. */
  hostiles: Hittable[] = [];
  army!: Army;
  /** Insígnia da patente sobre a cabeça do herói. */
  private rankIcon!: Phaser.GameObjects.Image;
  champions!: Champions;
  /** Clãs (o do jogador e os rivais), missões dos Lordes, personagens nomeados e saque. */
  clans!: Clans;
  missions!: Missions;
  bosses!: Bosses;
  loot!: Loot;
  /** Sede do clã. */
  hq!: HQ;
  /** Fortes dos clãs e territórios. */
  forts!: Forts;
  /** Conversas com líderes, tréguas e duelos. */
  diplomacy!: Diplomacy;
  /** Um chefe único por bioma. */
  tyrants!: Tyrants;
  giants!: WorldBosses;
  territories!: Territories;
  prologue!: Prologue;
  /** Áudio e preferências carregados antes dos sistemas visuais. */
  audio = new AudioSystem();
  /** Corridas de montaria em volta das cidades. */
  races!: Races;
  /** Bandos dos clãs rivais andando pelo mapa. */
  bands!: Bands;
  /** Mercadores das cidades. */
  market!: Market;
  /** Montarias do herói. */
  stable!: Stable;
  animals: Animal[] = [];
  flames: Flame[] = [];
  dayNight!: DayNightSystem;
  weather!: WeatherSystem;
  fx!: {
    burst: (x: number, y: number, tint: number, count: number) => void;
    /** Faísca de acerto no alvo (estrela branca + clarão), no lugar de tremer a câmera. */
    impact: (x: number, y: number) => void;
    ember: (x: number, y: number) => void;
    damageText: (x: number, y: number, amount: number, color?: string) => void;
    floatText: (x: number, y: number, text: string, color?: string) => void;
  };
  /** Efeitos das habilidades das montarias. */
  mountFx!: MountFx;
  inventory = new Inventory();
  /** Atributos e pontos (estilo MU), salvos no aparelho. */
  progress = new Progress();
  spots!: SpawnSpots;
  private gathering!: Gathering;

  private ambient!: Phaser.GameObjects.Rectangle;
  private glowLights: Light[] = [];
  private houseSprites = new Set<Phaser.GameObjects.Sprite>();
  private torches = new Set<Phaser.GameObjects.Sprite>();
  private streamer!: Streamer;
  private bars!: Phaser.GameObjects.Graphics;
  private biomeFx!: BiomeFx;
  /** Mira: linha ao arrastar o botão e marcador no alvo automático. */
  private aimGfx!: Phaser.GameObjects.Graphics;
  /** Peso (0..1) de cada bioma em volta do jogador, suavizado no tempo. */
  private biomeW: number[] = BIOMES.map((_, i) => (i === 0 ? 1 : 0));
  private biomeTint = 0xffffff;
  private biomeDark = 0;

  private projBlock!: Uint8Array;
  private area = '';
  private areaTimer = 0;
  private lightsOn = false;

  constructor() {
    super('World');
  }

  create() {
    this.enemies = [];
    this.animals = [];
    this.flames = [];
    this.glowLights = [];
    const map = (this.map = generateWorld(WORLD_SEED));
    const W = map.width * TILE;
    const H = map.height * TILE;
    this.buildWorld(map);
    this.physics.world.setBounds(0, 0, W, H);

    // efeitos antes de tudo: sistemas que restauram o save (montaria, sede…) já os usam
    this.createFx();

    // jogador
    this.player = new Player(this, map.start.x, map.start.y);

    for (let i = 0; i < (this.audio.settings.quality === 'high' ? BIRD_COUNT : 6); i++) new Bird(this, W, H);

    this.collision.add(this.player.body);
    // criaturas, casas, tochas e luzes nascem por região, perto da câmera
    this.streamer = new Streamer(this, map);
    this.army = new Army(this);
    this.army.setScale(this.player.scaleX);
    this.champions = new Champions(this);
    this.loot = new Loot(this);
    this.bosses = new Bosses(this);
    this.clans = new Clans(this);
    this.missions = new Missions(this);
    this.hq = new HQ(this);
    this.bands = new Bands(this);
    this.market = new Market(this);
    this.market.placeMerchants();
    this.stable = new Stable(this);
    this.forts = new Forts(this);
    this.territories = new Territories(this);
    this.diplomacy = new Diplomacy(this);
    this.tyrants = new Tyrants(this);
    this.giants = new WorldBosses(this);
    this.races = new Races(this);
    this.prologue = new Prologue(this);
    this.input.once('pointerdown', () => this.audio.unlock());
    this.input.keyboard?.once('keydown', () => this.audio.unlock());
    this.events.on('fort-captured', () => saves.achievement('first-territory'));
    this.events.on('giant-killed', () => saves.achievement('giant-slayer'));
    // um save estranho nunca pode impedir o jogo de abrir: na dúvida, desmonta
    try {
      if (this.stable.riding && this.stable.mount) this.player.setMount(this.stable.mount);
    } catch (e) {
      console.warn('montaria não restaurada', e);
      this.stable.riding = false;
    }
    // campeões de duelo deixam montaria; líderes e procurados fortes, às vezes uma rara
    this.events.on('champion-defeated', (id: string) => CHAMPION_MOUNT[id] && this.stable.give(CHAMPION_MOUNT[id]));
    this.events.on('rare-mount-roll', (chance: number) => {
      if (Math.random() < chance) this.stable.give(RARE_MOUNTS[Math.floor(Math.random() * RARE_MOUNTS.length)]);
    });
    this.setupClans();
    this.rankIcon = this.add.image(0, 0, 'rank-icons', this.progress.rankIdx).setDepth(DEPTH.fx - 50);
    this.progress.on('change', () => this.rankIcon.setFrame(this.progress.rankIdx));
    this.events.on('player-died', () => this.time.delayedCall(2400, () => this.army.regroup()));
    this.spots = new SpawnSpots(this, map);
    this.setupProgress();
    this.restorePosition();

    // câmera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    // sem arredondar a câmera em px do mundo (com zoom ~4,6× isso fazia o cenário
    // pular 4–5 px de tela enquanto o herói andava de 1 em 1: o "tremor")
    cam.startFollow(this.player, false, 0.12, 0.12);
    cam.setBackgroundColor('#1e1a24');
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyZoom, this));

    // efeitos ambientes
    this.dayNight = new DayNightSystem();
    this.weather = new WeatherSystem(this, DEPTH.weather);
    this.biomeFx = new BiomeFx(this, DEPTH.weather);
    this.gathering = new Gathering(this);
    this.aimGfx = this.add.graphics().setDepth(DEPTH.fx + 3);
    this.inventory.on('change', () => (this.player.weightMul = this.inventory.speedFactor));
    this.inventory.missing = (id) => this.progress.missing(id);
    this.inventory.extraWeight = this.progress.extraWeight;
    // equipar: arma (define a classe) e armadura (corpo inteiro)
    this.inventory.on('equip', (kind: 'weapon' | 'armor', id: string) => {
      if (kind === 'weapon') this.player.setWeapon(id as WeaponId, this.inventory.equipped.look);
      else this.player.setOutfit(id as OutfitId);
      this.player.applyLook();
    });
    // mochila salva; na primeira vez, a espada e o traje de couro equipados e o resto das bases na mochila
    if (this.inventory.load()) {
      const eq = this.inventory.equipped;
      if (eq.look !== 'sword') this.player.setWeapon(eq.weapon, eq.look);
      if (eq.armor !== this.player.outfit) this.player.setOutfit(eq.armor);
      this.player.applyLook();
      this.inventory.emit('change');
    } else {
      for (const w of ['greatsword', 'staff', 'bow']) this.inventory.add(`weapon_${w}`, 1);
      for (const a of ['leather', 'plate', 'legion', 'arcane', 'hunter']) this.inventory.add(`armor_${a}`, 1);
    }
    this.inventory.on('denied', (msg: string) => this.events.emit('toast', msg));
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.Q).on('down', () => {
      const i = this.inventory.nextWeaponSlot();
      if (i >= 0) this.inventory.equipAt(i);
    });
    // desktop: mira com o mouse (some depois de 3 s parado)
    let mouseAt = 0;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      mouseAt = this.time.now;
      inputState.mouseAim = { x: p.worldX, y: p.worldY };
    });
    this.events.on('update', () => {
      if (inputState.mouseAim && this.time.now - mouseAt > 3000) inputState.mouseAim = null;
    });
    this.createWorldMap(map);
    this.ambient = this.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0).setDepth(DEPTH.ambient);
    this.ambient.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.bars = this.add.graphics().setDepth(DEPTH.fx + 1);

    if (DEBUG) {
      (window as unknown as { vaelmor: unknown }).vaelmor = { scene: this, input: inputState };
    }
    this.game.events.emit('vaelmor-ready');
  }

  // ------------------------------------------------------------------ criaturas
  tinted<T extends Enemy | Animal>(c: T, variant?: string): T {
    const tint = variant ? VARIANT_TINT[variant] : undefined;
    if (tint !== undefined) {
      c.baseTint = tint;
      c.setTint(tint);
    }
    return c;
  }

  /** Cria um inimigo (do mapa ou de um spot) já no nível da região. */
  spawnEnemy(kind: SpawnKind, x: number, y: number, variant?: string, tier = 1, collide = true): Enemy {
    let e: Enemy;
    switch (kind) {
      case 'slime':
        e = new Slime(this, x, y);
        break;
      case 'wolf':
        e = new Wolf(this, x, y);
        break;
      case 'bandit':
        e = new Bandit(this, x, y);
        break;
      case 'wraith':
        e = new Wraith(this, x, y);
        break;
      default:
        e = new Beast(this, x, y, BEASTS[kind as keyof typeof BEASTS]);
    }
    // só criaturas que têm variante naquele bioma mudam de tom
    if (variant && (kind === 'wolf' || kind === 'slime' || kind === 'deer')) this.tinted(e, variant);
    e.applyTier(tier, KILL_POINTS[kind] ?? 0.5);
    this.enemies.push(e);
    if (collide) this.collision.add(e.body);
    return e;
  }

  /** Cria um animal (fauna pacífica). */
  spawnAnimal(kind: SpawnKind, x: number, y: number, variant?: string): Animal {
    const a =
      kind === 'sheep' ? new Sheep(this, x, y) : kind === 'deer' ? new Deer(this, x, y) : makeCritter(this, kind as 'fox' | 'hare' | 'goat' | 'lizard', x, y);
    this.tinted(a, variant);
    this.animals.push(a);
    this.collision.add(a.body);
    return a;
  }

  removeAnimal(a: Animal) {
    Phaser.Utils.Array.Remove(this.animals, a);
    this.collision.remove(a.body);
    this.tweens.killTweensOf(a);
    if (a.active) a.destroy();
  }

  /** Tira um inimigo do mundo (spot esvaziado ou criatura de spot morta). */
  removeEnemy(e: Enemy) {
    Phaser.Utils.Array.Remove(this.enemies, e);
    // também sai da lista de alvos deste quadro (senão a mira ainda a consulta)
    Phaser.Utils.Array.Remove(this.hostiles, e);
    this.collision.remove(e.body);
    this.tweens.killTweensOf(e);
    if (e.active) e.destroy();
  }

  /**
   * Glória ganha ou perdida, com o número flutuando no ponto (x, y). Ganhos
   * acima do recorde viram pontos de atributo (ver Ranks.ts).
   */
  gainGlory(n: number, x: number, y: number, kill = false) {
    const v = Math.round(n * 10) / 10;
    if (!v) return;
    if (kill) this.progress.addKill(v);
    else this.progress.addGlory(v);
    // o número só aparece perto do herói (numa guerra grande seriam centenas)
    const p = this.player;
    if (Math.abs(x - p.x) < 170 && Math.abs(y - p.y) < 110) this.fx.floatText(x, y, `${v > 0 ? '+' : ''}${fmtPts(v)} glória`, v > 0 ? '#ffd34a' : '#ff7070');
  }

  /** Cor do clã nos soldados, guerras de clã e saque dos bandidos. */
  private setupClans() {
    const C = this.clans;
    if (C.founded) this.army.setClanColor(C.player.color);
    C.on('founded', (c: Clan) => {
      this.army.setClanColor(c.color);
      this.hq.refreshBanners();
    });
    // bandidos comuns: raramente uma peça Temperada
    this.events.on('enemy-killed', (e: Enemy) => {
      if (!e.transient && e instanceof Bandit && Math.random() < 0.05) this.loot.drop(rollGear(1), e.x, e.y);
      // bandidos levam umas moedas no bolso
      if (e instanceof Bandit && !e.transient) {
        const g = 1 + Math.floor(Math.random() * 4);
        this.hq.addGold(g);
        this.fx.floatText(e.x, e.y - 20, `+${g} ouro`, '#ffd77a');
      }
    });
  }

  /** Apaga todo o progresso salvo e recomeça (debug). */
  resetAll() {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('vaelmor.')) localStorage.removeItem(k);
    } catch {
      /* ignora */
    }
    location.reload();
  }

  /** Abates rendem Glória; atributos mudam vida, carga e requisitos. */
  private setupProgress() {
    const P = this.progress;
    // criaturas: 2 de Glória na básica × nível da região
    this.events.on('enemy-killed', (e: Enemy) => this.gainGlory(e.points * 4, e.x, e.y - e.barOffset - 4, true));
    // o herói caiu: perde Glória
    this.events.on('player-died', () => this.gainGlory(-Math.max(10, Math.round(P.glory * 0.05)), this.player.x, this.player.y - 30));
    this.events.on('enemy-gone', (e: Enemy) => {
      this.spots.release(e);
      Phaser.Utils.Array.Remove(this.enemies, e);
      this.collision.remove(e.body);
    });
    let lastMax = P.maxHp;
    P.on('change', () => {
      const p = this.player;
      // vida máxima subiu: ganha a diferença na hora
      if (P.maxHp !== lastMax) {
        p.hp = Phaser.Math.Clamp(p.hp + P.maxHp - lastMax, 1, P.maxHp);
        lastMax = P.maxHp;
      }
      this.inventory.extraWeight = P.extraWeight;
      this.inventory.enforce();
      this.player.weightMul = this.inventory.speedFactor;
      this.inventory.emit('change');
    });
  }

  // ------------------------------------------------------------------ mapa
  /** Janela de tiles desenhada em volta da câmera (o mundo fica em arrays). */
  tiles!: TileWindow;
  collision!: TileCollision;

  private buildWorld(m: WorldData) {
    this.tiles = new TileWindow(this, m);
    this.collision = new TileCollision(this.physics.world, m.collision, m.width, m.height);
    // projéteis atravessam água, mas não paredes/árvores/casas
    this.projBlock = new Uint8Array(m.collision.length);
    for (let i = 0; i < m.collision.length; i++) this.projBlock[i] = m.collision[i] && m.water[i] < 0 ? 1 : 0;
  }

  /**
   * Alvos para o jogador ir direto: procurados e duelos das missões, o
   * campeão do duelo da próxima patente e os bandos das missões de guerra.
   */
  objectives(): { x: number; y: number; name: string; color: number }[] {
    const out: { x: number; y: number; name: string; color: number }[] = [];
    const champ = (id: ChampionId) => {
      const c = this.champions.list.find((l) => l.id === id);
      if (c && !this.progress.duels.has(id) && !out.some((o) => o.name === CHAMPIONS[id].name)) out.push({ x: c.x, y: c.y, name: CHAMPIONS[id].name, color: 0xff5a5a });
    };
    for (const m of this.missions.active) {
      if (m.target) out.push({ x: m.target.x, y: m.target.y, name: m.target.name, color: 0xff3a3a });
      if (m.champ) champ(m.champ);
      if (m.kind === 'siege' && m.clan) {
        const f = this.forts.byClan(m.clan);
        const c = this.clans.byId(m.clan);
        if (f && c) out.push({ ...this.forts.center(f), name: `Forte do ${c.name}`, color: c.color });
      } else if (m.raid) out.push({ x: m.raid.x, y: m.raid.y, name: `Defesa de ${m.city}`, color: 0xb08060 });
      else if (m.clan) {
        const b = this.bands.byClan(m.clan);
        const c = this.clans.byId(m.clan);
        if (b && c && b.n > 0) out.push({ x: b.x, y: b.y, name: c.name, color: c.color });
      }
    }
    const next = RANKS[this.progress.rankIdx + 1];
    if (next?.duel) champ(next.duel);
    // corrida: a próxima bandeira
    const rt = this.races?.target;
    if (rt) out.unshift({ x: rt.x, y: rt.y, name: rt.name, color: 0xffd34a });
    // forte do herói com ataque marcado
    // gigante acordado
    const gs = this.giants?.st;
    if (gs) out.push({ x: gs.x, y: gs.y, name: this.giants.label, color: 0xff7a2a });
    const prologue = this.prologue?.objective;
    if (prologue) out.unshift(prologue);
    const r = this.forts?.retake;
    if (r) {
      const f = this.forts.forts.find((x) => this.forts.key(x) === r.fort);
      if (f) out.push({ ...this.forts.center(f), name: `Defenda ${f.city}`, color: 0x5aa0ff });
    }
    return out;
  }

  private drawAim(time: number) {
    const g = this.aimGfx;
    g.clear();
    const p = this.player;
    if (p.dead) return;
    // seta em volta do herói apontando o alvo mais perto (missão, duelo)
    {
      let best: { x: number; y: number; color: number } | null = null;
      let bd = Infinity;
      for (const o of this.objectives()) {
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best && bd > 90) {
        const a = Math.atan2(best.y - p.y, best.x - p.x);
        const cx = p.x + Math.cos(a) * 26;
        const cy = p.y - 8 + Math.sin(a) * 18;
        const pulse = 0.65 + 0.35 * Math.sin(time / 180);
        const tri = (r: number) => [
          { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r },
          { x: cx + Math.cos(a + 2.5) * r * 0.7, y: cy + Math.sin(a + 2.5) * r * 0.7 },
          { x: cx + Math.cos(a - 2.5) * r * 0.7, y: cy + Math.sin(a - 2.5) * r * 0.7 },
        ];
        g.fillStyle(0x0b0d14, 0.8 * pulse).fillPoints(tri(7), true);
        g.fillStyle(best.color, pulse).fillPoints(tri(5), true);
      }
    }
    const ox = p.fx;
    const oy = p.fy - 8;
    if (inputState.aim.active) {
      // linha pontilhada na direção arrastada
      const len = p.ranged ? p.aimRange : 34;
      const { x, y } = inputState.aim;
      for (let d = 8; d < len; d += 7) g.fillStyle(0xffffff, 0.75 - (d / len) * 0.5).fillRect(ox + x * d - 1, oy + y * d - 1, 2, 2);
      const tx = ox + x * len;
      const ty = oy + y * len;
      const a = Math.atan2(y, x);
      g.lineStyle(1.5, 0xffffff, 0.8);
      g.lineBetween(tx, ty, tx - Math.cos(a - 0.5) * 5, ty - Math.sin(a - 0.5) * 5);
      g.lineBetween(tx, ty, tx - Math.cos(a + 0.5) * 5, ty - Math.sin(a + 0.5) * 5);
      return;
    }
    if (!p.ranged || inputState.mouseAim) return;
    // mira automática: marca o alvo que será atingido
    const t = p.nearestTarget(p.aimRange);
    if (!t) return;
    const r = 7 + Math.sin(time / 130);
    g.lineStyle(1, 0xff6060, 0.85);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const cx = t.x + Math.cos(a) * r;
      const cy = t.y - 4 + Math.sin(a) * r;
      g.lineBetween(cx, cy, cx - Math.cos(a) * 3, cy - Math.sin(a) * 3);
    }
  }

  /** Liga/desliga a colisão de um tile (recurso coletado, recurso que voltou). */
  setSolid(tx: number, ty: number, on: boolean) {
    const i = ty * this.map.width + tx;
    this.map.collision[i] = on ? 1 : 0;
    this.projBlock[i] = on && this.map.water[i] < 0 ? 1 : 0;
  }

  blocksProjectile(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return true;
    return this.projBlock[ty * this.map.width + tx] === 1;
  }

  // ------------------------------------------------------------------ luzes
  addLight(x: number, y: number, color: number, base: number, scale: number, flicker: number): Light {
    const img = this.add
      .image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(scale)
      .setDepth(DEPTH.lights)
      .setAlpha(0)
      .setVisible(false);
    const L = { img, base, scale, flicker };
    this.glowLights.push(L);
    return L;
  }

  removeLight(L: Light) {
    Phaser.Utils.Array.Remove(this.glowLights, L);
    L.img.destroy();
  }

  /** Casa carregada: janelas acesas à noite (quadro = variante × 2 + acesa). */
  addHouse(h: Phaser.GameObjects.Sprite) {
    this.houseSprites.add(h);
    h.setFrame((h.getData('v') as number) * 2 + (this.lightsOn ? 1 : 0));
  }

  addTorch(t: Phaser.GameObjects.Sprite) {
    this.torches.add(t);
    if (this.lightsOn) t.play({ key: 'torch-burn', startFrame: Phaser.Math.Between(0, 2) });
  }

  /** Objeto descarregado pelo streaming. */
  forgetObject(o: Phaser.GameObjects.GameObject) {
    this.houseSprites.delete(o as Phaser.GameObjects.Sprite);
    this.torches.delete(o as Phaser.GameObjects.Sprite);
  }

  private updateLights(time: number) {
    const level = Math.max(this.dayNight.lightLevel, this.biomeDark);
    const visible = level > 0.01;
    const view = this.cameras.main.worldView;
    for (let i = 0; i < this.glowLights.length; i++) {
      const L = this.glowLights[i];
      const r = 32 * L.scale;
      const { x, y } = L.img;
      const onScreen = visible && x + r > view.x && x - r < view.right && y + r > view.y && y - r < view.bottom;
      L.img.setVisible(onScreen);
      if (!onScreen) continue;
      const f = 1 - L.flicker * (0.5 + 0.5 * Math.sin(time * 0.013 + i * 1.7)) * (0.6 + 0.4 * Math.sin(time * 0.031 + i));
      L.img.setAlpha(level * L.base * f);
      L.img.setScale(L.scale * (0.96 + 0.04 * f));
    }
    const on = level > 0.4;
    if (on !== this.lightsOn) {
      this.lightsOn = on;
      for (const h of this.houseSprites) h.setFrame((h.getData('v') as number) * 2 + (on ? 1 : 0));
      for (const t of this.torches) {
        if (on) t.play({ key: 'torch-burn', startFrame: Phaser.Math.Between(0, 2) });
        else t.stop().setFrame(0);
      }
    }
  }

  // ------------------------------------------------------------------ efeitos
  private createFx() {
    this.mountFx = new MountFx(this);
    const burst = this.add.particles(0, 0, 'pixel', {
      speed: { min: 30, max: 110 },
      lifespan: { min: 250, max: 520 },
      scale: { start: 0.7, end: 0 },
      gravityY: 140,
      emitting: false,
    });
    burst.setDepth(DEPTH.fx);
    const embers = this.add.particles(0, 0, 'pixel', {
      speed: { min: 5, max: 25 },
      lifespan: { min: 180, max: 340 },
      scale: { start: 0.55, end: 0 },
      tint: [0xffd34a, 0xff9a2a, 0xe8512a],
      emitting: false,
      maxAliveParticles: 40,
    });
    embers.setDepth(DEPTH.fx - 1);
    // estrela de impacto 11×11 em pixel art (contorno escuro para ler em qualquer chão)
    if (!this.textures.exists('impact-star')) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0x0b0d14, 1).fillRect(4, 0, 3, 11).fillRect(0, 4, 11, 3);
      g.fillStyle(0xffffff, 1).fillRect(5, 1, 1, 9).fillRect(1, 5, 9, 1).fillRect(4, 4, 3, 3);
      g.fillStyle(0xfff1a8, 1).fillRect(5, 5, 1, 1);
      g.generateTexture('impact-star', 11, 11);
      g.destroy();
    }
    const texts = new FloatTexts(this, DEPTH.fx + 2);
    const stars: Phaser.GameObjects.Image[] = [];
    const flashes: Phaser.GameObjects.Image[] = [];
    const take = (pool: Phaser.GameObjects.Image[], make: () => Phaser.GameObjects.Image) => pool.find((i) => !i.visible) ?? (pool.length < 24 ? (pool.push(make()), pool[pool.length - 1]) : pool[0]);
    this.fx = {
      burst: (x, y, tint, count) => {
        burst.setParticleTint(tint);
        burst.explode(count, x, y);
      },
      impact: (x, y) => {
        this.audio.sfx('hit');
        const st = take(stars, () => this.add.image(0, 0, 'impact-star').setDepth(DEPTH.fx + 1).setVisible(false));
        const fl = take(flashes, () => this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx).setVisible(false));
        this.tweens.killTweensOf([st, fl]);
        st.setPosition(x, y).setVisible(true).setAlpha(1).setScale(0.6).setAngle(Math.random() < 0.5 ? 0 : 45);
        fl.setPosition(x, y).setVisible(true).setAlpha(0.9).setScale(0.18);
        this.tweens.add({ targets: st, scale: 1.3, alpha: 0, duration: 170, ease: 'Quad.easeOut', onComplete: () => st.setVisible(false) });
        this.tweens.add({ targets: fl, scale: 0.45, alpha: 0, duration: 200, ease: 'Quad.easeOut', onComplete: () => fl.setVisible(false) });
      },
      ember: (x, y) => embers.emitParticleAt(x, y, 1),
      damageText: (x, y, amount, color = '#ffffff') => texts.show(x, y, String(amount), color, 8, 12, 0, 600),
      floatText: (x, y, text, color = '#ffffff') => texts.show(x, y, text, color, 7, 14, 350, 900),
    };
  }

  /** Congela a física por alguns ms para dar peso ao impacto. */
  hitStop(ms: number) {
    const w = this.physics.world;
    if (w.isPaused) return;
    w.pause();
    this.time.delayedCall(ms, () => w.resume());
  }

  /** Tremor centralizado para respeitar a opção de movimento reduzido. */
  shake(duration: number, intensity: number) {
    if (!this.audio.settings.reducedMotion) this.cameras.main.shake(duration, intensity);
  }

  // ------------------------------------------------------------------ câmera
  /**
   * Zoom inteiro mais próximo do que mostraria ~20×12 tiles. Inteiro para cada
   * pixel da arte virar exatamente N pixels da tela: com zoom fracionado os
   * pixels alternam de largura e "rastejam" quando a câmera anda.
   */
  private applyZoom() {
    const { width, height } = this.scale;
    const target = VIEW_TILES_W * TILE * VIEW_TILES_H * TILE;
    const zoom = Math.max(1, Math.round(Math.sqrt((width * height) / target)));
    const cam = this.cameras.main;
    cam.setSize(width, height);
    cam.setZoom(zoom);
    cam.setRoundPixels(false);
    this.player?.fitPixels(zoom);
    if (this.player) this.army?.setScale(this.player.scaleX);
    if (this.player) cam.centerOn(this.player.x, this.player.y);
  }

  // ------------------------------------------------------------------ loop
  update(_time: number, delta: number) {
    // tudo usa o relógio da cena (o mesmo de delayedCall/tweens); o tempo do
    // loop do jogo diverge dele quando há quedas de FPS
    const time = this.time.now;
    const dt = Math.min(delta, 50);
    this.dayNight.update(dt);
    this.streamer.update(this.cameras.main.midPoint.x, this.cameras.main.midPoint.y, time);
    const H = this.hostiles;
    H.length = 0;
    for (const e of this.enemies) H.push(e);
    for (const s of this.army.soldiers) if (s.team === 1 && !s.dead) H.push(s);
    // cerco: portão, torres e Salão do forte rival também são alvos do herói
    for (const t of this.forts.hostileStructures()) H.push(t);
    // gigante acordado por perto
    for (const g of this.giants.targets) H.push(g);
    // duelo: só o duelista é alvo
    if (this.army.duel) {
      H.length = 0;
      H.push(this.army.duel.champ);
    }
    // ação de contexto: perto do mercador o golpe vira COMPRAR
    inputState.action = !this.army.war && this.market.merchantNear(this.player.x, this.player.y) ? MERCHANT_ACTION : null;
    // diante do portão de um forte: atacar (rival) ou deixar/chamar a guarda (seu)
    if (!inputState.action && !this.army.war) {
      const f = this.forts.fortAtGate();
      if (f) inputState.action = f.owner === 'player' ? { id: 'fort-guard', label: f.guards?.length ? 'CHAMAR GUARDA' : 'DEIXAR GUARDA', icon: 10 } : { id: 'fort-siege', label: 'ATACAR FORTE', icon: 5 };
    }
    this.player.update(time);
    this.stable.update(time);
    this.army.update(time, dt);
    this.champions.update(time);
    this.bosses.update();
    this.loot.update(time);
    this.clans.update(dt);
    this.missions.update(time);
    this.hq.update(time, dt);
    this.bands.update(time, dt);
    this.forts.update(time, dt);
    this.diplomacy.update(time);
    this.tyrants.update(time);
    this.giants.update(time, dt);
    this.prologue.update();
    this.territories.update(time);
    this.races.update(time);
    this.market.update(dt);
    const pl = this.player;
    this.rankIcon
      .setPosition(Math.round(pl.x), Math.round(pl.y - 25))
      .setScale(this.army.iconScale)
      .setVisible(pl.visible && !pl.dead);
    this.gathering.update(time);
    this.spots.update(time);
    this.drawAim(time);

    const cam = this.cameras.main;
    const cx = cam.midPoint.x;
    const cy = cam.midPoint.y;
    const r2 = ACTIVE_RADIUS * ACTIVE_RADIUS;
    const p = this.player;
    for (const e of this.enemies) {
      const dx = e.x - cx;
      const dy = e.y - cy;
      e.tick(time, dt, dx * dx + dy * dy < r2);
      if (!e.dead && e.contactDamage > 0 && !p.invulnerable) {
        if (Phaser.Math.Distance.Between(e.fx, e.fy, p.fx, p.fy) < 10) p.hurt(e.contactDamage * e.dmgMul, e.fx, e.fy);
      }
    }
    for (const a of this.animals) {
      const dx = a.x - cx;
      const dy = a.y - cy;
      a.tick(time, dx * dx + dy * dy < r2);
    }

    const view = cam.worldView;
    this.tiles.update(view, dt);
    this.updateBiome(dt);
    this.weather.update(time, dt, view);
    this.biomeFx.update(view, this.biomeW);
    this.audio.update(time, this.biome);
    // luz ambiente = dia/noite × clima, aplicada com MULTIPLY. A margem cobre o
    // movimento da câmera, que só atualiza worldView depois deste update.
    const M = 64;
    this.ambient.setPosition(view.x - M, view.y - M).setSize(view.width + M * 2, view.height + M * 2);
    this.ambient.setFillStyle(mulColor(mulColor(this.dayNight.ambient, this.weather.tint), this.biomeTint));
    this.updateLights(time);
    this.drawBars(view);

    this.areaTimer -= dt;
    if (this.areaTimer <= 0) {
      this.areaTimer = 400;
      this.updateArea();
    }
    this.registry.set('clock', `Dia ${this.dayNight.day} · ${this.dayNight.clock}`);
    this.registry.set('weather', BIOME_WEATHER[this.biome] ?? this.weather.label);
    this.registry.set('biome', BIOMES[this.biome].name);
    this.registry.set('night', this.dayNight.isNight);
  }

  private drawBars(view: Phaser.Geom.Rectangle) {
    const g = this.bars;
    g.clear();
    this.army.drawBars(g, view);
    for (const e of this.enemies) {
      if (e.dead || e.hp >= e.maxHp || !view.contains(e.x, e.y)) continue;
      const w = 12;
      const x = Math.round(e.x - w / 2);
      const y = Math.round(e.y - e.barOffset);
      g.fillStyle(0x1e1a24, 0.85).fillRect(x - 1, y - 1, w + 2, 4);
      g.fillStyle(0xe04848, 1).fillRect(x, y, Math.max(1, (w * e.hp) / e.maxHp), 2);
    }
  }

  /** Bioma no ponto (px do mundo). */
  biomeAt(x: number, y: number): Biome {
    const tx = Phaser.Math.Clamp(Math.floor(x / TILE), 0, this.map.width - 1);
    const ty = Phaser.Math.Clamp(Math.floor(y / TILE), 0, this.map.height - 1);
    return this.map.biome[ty * this.map.width + tx] as Biome;
  }

  /** Mistura luz, escuridão e chuva dos biomas em volta do jogador (transição suave). */
  private updateBiome(dt: number) {
    const p = this.player;
    const target = BIOMES.map(() => 0);
    const R = 7 * TILE;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        target[this.biomeAt(p.x + dx * R, p.y + dy * R)] += 1;
        n++;
      }
    const k = Math.min(1, dt / 900);
    let r = 0;
    let g = 0;
    let b = 0;
    let dark = 0;
    let best = 0;
    for (let i = 0; i < BIOMES.length; i++) {
      this.biomeW[i] += (target[i] / n - this.biomeW[i]) * k;
      const w = this.biomeW[i];
      const t = BIOMES[i].tint;
      r += ((t >> 16) & 255) * w;
      g += ((t >> 8) & 255) * w;
      b += (t & 255) * w;
      dark += BIOMES[i].dark * w;
      if (w > this.biomeW[best]) best = i;
    }
    this.biomeTint = (Math.min(255, Math.round(r)) << 16) | (Math.min(255, Math.round(g)) << 8) | Math.min(255, Math.round(b));
    this.biomeDark = dark;
    const was = this.biome;
    this.biome = this.biomeAt(p.x, p.y);
    // o povo deste bioma: adianta as peles dos soldados dele
    if (this.biome !== was && this.army) this.army.preloadFaction(this.biome);
    const W = this.biomeW;
    this.weather.rainMask = W[Biome.VALE] + W[Biome.GREEN] + W[Biome.BLOCK] * 0.6;
  }

  // ------------------------------------------------------------------ debug
  /** Leva o jogador para (x, y) — ou para o chão livre mais próximo. */
  // ------------------------------------------------------------------ onde parou
  /** Volta para onde estava ao fechar o jogo (sem save: para a sede, se houver). */
  private restorePosition() {
    let at: { x: number; y: number } | null = null;
    try {
      const d = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
      if (d && Number.isFinite(d.x) && Number.isFinite(d.y)) at = d;
    } catch {
      /* sem save */
    }
    if (!at && this.hq.founded) at = { x: this.player.spawnX, y: this.player.spawnY };
    if (at) this.teleport(at.x, at.y);
    const save = () => {
      if (this.player.state2 === 'dead') return;
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(this.player.x), y: Math.round(this.player.y) }));
      } catch {
        /* sem espaço */
      }
    };
    this.time.addEvent({ delay: 4000, loop: true, callback: save });
    const onHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
    });
  }

  teleport(x: number, y: number) {
    const m = this.map;
    let tx = Phaser.Math.Clamp(Math.floor(x / TILE), 1, m.width - 2);
    let ty = Phaser.Math.Clamp(Math.floor(y / TILE), 1, m.height - 2);
    const freeAt = (cx: number, cy: number) => cx > 0 && cy > 0 && cx < m.width - 1 && cy < m.height - 1 && !m.collision[cy * m.width + cx];
    if (!this.flying && !this.player.mount?.flies && !freeAt(tx, ty)) {
      search: for (let r = 1; r < 40; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !freeAt(tx + dx, ty + dy)) continue;
            tx += dx;
            ty += dy;
            break search;
          }
    }
    const px = tx * TILE + 8;
    const py = ty * TILE + 8;
    this.player.body.reset(px, py);
    this.player.setPosition(px, py);
    this.cameras.main.centerOn(px, py);
    this.tiles.recenter(px, py);
    this.streamer.update(px, py, this.time.now, true);
    this.army.regroup();
    // chega com o clima do destino já aplicado
    const b = this.biomeAt(px, py);
    this.biomeW = BIOMES.map((_, i) => (i === b ? 1 : 0));
  }

  // ------------------------------------------------------------------ viagem rápida
  private travelAt = -1e9;
  /** Para onde dá para viajar: a sede, os fortes e as cidades dos seus territórios. */
  travelPoints(): { x: number; y: number; name: string }[] {
    const out: { x: number; y: number; name: string }[] = [];
    if (this.hq.founded) out.push({ x: this.hq.gate.x, y: this.hq.gate.y - 5 * TILE, name: 'sede' });
    for (const f of this.forts.mine) out.push({ ...this.forts.gateOut(f), name: `forte de ${f.city}` });
    for (const c of this.forts.territories) out.push({ x: c.cx * TILE + 8, y: (c.cy + 3) * TILE + 8, name: c.name });
    return out;
  }

  /** Viagem rápida (30 de ouro, 60 s de espera, fora de guerra). */
  fastTravel(to: { x: number; y: number; name: string }): string {
    if (this.army.war) return 'Não dá para viajar durante uma guerra';
    const left = this.travelAt + 60000 - this.time.now;
    if (left > 0) return `Os cavalos de posta descansam: ${Math.ceil(left / 1000)} s`;
    if (this.hq.gold < 30) return 'A viagem custa 30 de ouro';
    this.hq.addGold(-30);
    this.travelAt = this.time.now;
    this.teleport(to.x, to.y);
    this.events.emit('toast', `Viagem para ${to.name} (−30 ouro)`);
    return '';
  }

  /** Tile sólido sob o ponto (px)? */
  isSolidAt(x: number, y: number) {
    return this.collision.solid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  flying = false;
  /** Modo voo: atravessa tudo e anda 3× mais rápido. */
  setFlying(on: boolean) {
    this.flying = on;
    if (on) this.collision.ghosts.add(this.player.body);
    else this.collision.ghosts.delete(this.player.body);
    this.player.speedMul = on ? 3 : 1;
  }

  /** Mapa do mundo (1 px a cada 2×2 tiles) com a cor média do que se vê de cima. */
  private createWorldMap(m: WorldData) {
    const src = this.textures.get('tiles').getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const cx = c.getContext('2d')!;
    cx.drawImage(src, 0, 0);
    const px = cx.getImageData(0, 0, c.width, c.height).data;
    const cols = Math.floor((src.width - 2) / (TILE + 2)) + 1;
    const avg = new Int32Array(512).fill(-1);
    for (let id = 0; id < 512; id++) {
      const ox = (id % cols) * (TILE + 2) + 1;
      const oy = Math.floor(id / cols) * (TILE + 2) + 1;
      if (oy + TILE > c.height) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const i = ((oy + y) * c.width + ox + x) * 4;
          if (px[i + 3] < 128) continue;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
          n++;
        }
      if (n) avg[id] = ((r / n) << 16) | ((g / n) << 8) | (b / n);
    }
    const S = 2;
    const MW = Math.ceil(m.width / S);
    const MH = Math.ceil(m.height / S);
    const tex = this.textures.createCanvas('worldmap', MW, MH)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(MW, MH);
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const i = y * S * m.width + x * S;
        const o = y * MW + x;
        let col = 0x1e1a24;
        for (const layer of [m.ground, m.water, m.cliffs, m.decor, m.canopy]) {
          const v = layer[i];
          if (v >= 0 && avg[v] >= 0) col = avg[v];
        }
        img.data[o * 4] = col >> 16;
        img.data[o * 4 + 1] = (col >> 8) & 255;
        img.data[o * 4 + 2] = col & 255;
        img.data[o * 4 + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    // telhados das casas (no mapa, as cidades aparecem cheias)
    ctx.fillStyle = '#a8483a';
    for (const b of m.buildings) ctx.fillRect(b.tx / S, b.ty / S + 0.5, 1.5, 1.5);
    tex.refresh();
  }

  private lastBiome = -1;
  private spot?: Spot;

  private updateArea() {
    const p = this.player;
    // spots de up têm nome próprio
    const spot = this.spots.at(p.x, p.y);
    if (spot !== this.spot) {
      this.spot = spot;
      if (spot) {
        this.area = spot.name;
        this.events.emit('area', spot.name, `Spot de up · nível ${spot.tier} · ${spot.max} criaturas`);
        return;
      }
    }
    if (spot) return;
    let name = '';
    let sub = '';
    for (const c of this.map.cities) {
      const tx = p.x / TILE;
      const ty = p.y / TILE;
      if (tx >= c.x0 - 2 && tx <= c.x1 + 2 && ty >= c.y0 - 2 && ty <= c.y1 + 2) {
        name = c.name;
        const id = c.identity ?? identityOf(c);
        const mine = this.forts.ownerOf(c) === 'player';
        sub = `${id.epithet} · ${id.specialty} · ${mine ? 'SEU TERRITÓRIO' : `domínio de ${this.territories.ownerName(c)}`}`;
      }
    }
    if (name !== this.area) {
      this.area = name;
      if (name) this.events.emit('area', name, sub);
    }
    // entrou num bioma novo: mostra o nome (depois de 1,2 s lá dentro)
    if (this.biome !== this.lastBiome && this.biomeW[this.biome] > 0.6) {
      this.lastBiome = this.biome;
      if (!name) this.events.emit('area', BIOMES[this.biome].name);
    }
  }
}
