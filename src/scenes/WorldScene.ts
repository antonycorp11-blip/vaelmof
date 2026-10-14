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
import { allyTint, Army } from '../systems/Army';
import { Bosses } from '../systems/Bosses';
import { Clans, type Clan } from '../systems/Clans';
import { Loot } from '../systems/Loot';
import { Missions } from '../systems/Missions';
import { rollGear } from '../data/gear';
import { Champions } from '../systems/Champions';
import type { Hittable } from '../entities/Hittable';
import { Streamer } from '../systems/Streamer';
import { TileWindow } from '../systems/TileWindow';
import { WeatherSystem } from '../systems/WeatherSystem';

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

    // jogador
    this.player = new Player(this, map.start.x, map.start.y);

    for (let i = 0; i < BIRD_COUNT; i++) new Bird(this, W, H);

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
    this.setupClans();
    this.rankIcon = this.add.image(0, 0, 'rank-icons', this.progress.rankIdx).setDepth(DEPTH.fx - 50);
    this.progress.on('change', () => this.rankIcon.setFrame(this.progress.rankIdx));
    this.events.on('player-died', () => this.time.delayedCall(2400, () => this.army.regroup()));
    this.spots = new SpawnSpots(this, map);
    this.setupProgress();

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
      if (kind === 'weapon') this.player.setWeapon(id as WeaponId);
      else this.player.setOutfit(id as OutfitId);
      this.player.applyLook();
    });
    // mochila salva; na primeira vez, a espada e o traje de couro equipados e o resto das bases na mochila
    if (this.inventory.load()) {
      const eq = this.inventory.equipped;
      if (eq.weapon !== 'sword') this.player.setWeapon(eq.weapon);
      if (eq.armor !== 'leather') this.player.setOutfit(eq.armor);
      this.player.applyLook();
      this.inventory.emit('change');
    } else {
      for (const w of ['greatsword', 'staff', 'bow']) this.inventory.add(`weapon_${w}`, 1);
      for (const a of ['plate', 'legion', 'arcane', 'hunter']) this.inventory.add(`armor_${a}`, 1);
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
    this.createFx();
    this.bars = this.add.graphics().setDepth(DEPTH.fx + 1);

    if (DEBUG) {
      (window as unknown as { vaelmor: unknown }).vaelmor = { scene: this, input: inputState };
    }
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
    C.on('founded', (c: Clan) => this.army.setClanColor(c.color));
    this.army.on('war-end', (w: { clan?: string; won: boolean; killed: number; glory: number }) => {
      if (this.clanLeader) {
        // o líder que sobrou foge com o exército
        this.bosses.remove(this.clanLeader);
        this.clanLeader = undefined;
      }
      const c = w.clan ? C.byId(w.clan) : undefined;
      if (!c) return;
      C.settle(c, w.won, w.killed, Math.abs(w.glory));
      if (w.won) this.events.emit('clan-beaten', c.id);
    });
    // bandidos comuns: raramente uma peça Temperada
    this.events.on('enemy-killed', (e: Enemy) => {
      if (!e.transient && e instanceof Bandit && Math.random() < 0.05) this.loot.drop(rollGear(1), e.x, e.y);
    });
  }

  private clanLeader?: Enemy;

  /** Desafia um clã rival: o exército dele vem com o líder à frente. Devolve o motivo se não der. */
  startClanWar(c: Clan): string {
    const why = this.clans.challengeBlock(c);
    if (why) return why;
    const n = this.clans.armyOf(c);
    this.army.prepare(() => {
      this.army.declareWar(n, { name: c.name, color: c.color, clan: c.id });
      const w = this.army.war;
      if (!w) return;
      const t = this.clans.tier(c);
      this.clanLeader = this.bosses.spawn({
        name: `${c.leader}`,
        x: w.x,
        y: w.y,
        hp: Math.round(60 + this.clans.glory(c) / 18),
        damage: 2.5 + t * 1.4,
        tint: allyTint(c.color),
        scale: 1.2,
        points: 10 + t * 8,
        rank: Math.min(9, t * 2 + 1),
        loot: c.gear,
        onKill: () => {
          this.clanLeader = undefined;
          this.events.emit('toast', `${c.leader}, líder do ${c.name}, caiu!`);
        },
      });
      if (this.clans.challenge?.clan === c.id) this.clans.challenge = null;
      this.clans.emit('change');
    });
    return '';
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

  private drawAim(time: number) {
    const g = this.aimGfx;
    g.clear();
    const p = this.player;
    if (p.dead) return;
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
    this.player.update(time);
    this.army.update(time, dt);
    this.champions.update(time);
    this.bosses.update();
    this.loot.update(time);
    this.clans.update(dt);
    this.missions.update(time);
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
    this.biome = this.biomeAt(p.x, p.y);
    const W = this.biomeW;
    this.weather.rainMask = W[Biome.VALE] + W[Biome.GREEN] + W[Biome.BLOCK] * 0.6;
  }

  // ------------------------------------------------------------------ debug
  /** Leva o jogador para (x, y) — ou para o chão livre mais próximo. */
  teleport(x: number, y: number) {
    const m = this.map;
    let tx = Phaser.Math.Clamp(Math.floor(x / TILE), 1, m.width - 2);
    let ty = Phaser.Math.Clamp(Math.floor(y / TILE), 1, m.height - 2);
    const freeAt = (cx: number, cy: number) => cx > 0 && cy > 0 && cx < m.width - 1 && cy < m.height - 1 && !m.collision[cy * m.width + cx];
    if (!this.flying && !freeAt(tx, ty)) {
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
        sub = `${c.capital ? 'Capital' : 'Cidade'} de ${BIOMES[c.biome].name}`;
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
