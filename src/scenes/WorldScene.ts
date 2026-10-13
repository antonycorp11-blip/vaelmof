import Phaser from 'phaser';
import { ACTIVE_RADIUS, DEBUG, TILE, VIEW_TILES_H, VIEW_TILES_W, WORLD_SEED } from '../config';
import { Animal } from '../entities/Animal';
import { Bandit } from '../entities/Bandit';
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
import { DayNightSystem, mulColor } from '../systems/DayNightSystem';
import { BiomeFx } from '../systems/BiomeFx';
import { Biome, BIOMES, generateWorld, type WorldData } from '../systems/WorldGenerator';
import { ANIM_FRAMES, T } from '../systems/Tiles';
import { WeatherSystem } from '../systems/WeatherSystem';

interface Light {
  img: Phaser.GameObjects.Image;
  base: number;
  scale: number;
  flicker: number;
}

interface AnimTile {
  tile: Phaser.Tilemaps.Tile;
  base: number;
}

const BIRD_COUNT = 14;
/** Tom de cada variante de criatura por bioma. */
const VARIANT_TINT: Record<string, number> = { snow: 0xe6eeff, stone: 0xa09c94, void: 0x9a70d8, sand: 0xe8c47a };
/** Rótulo do clima próprio de cada bioma (substitui o clima geral). */
const BIOME_WEATHER: Partial<Record<Biome, string>> = { [Biome.SNOW]: 'Neve', [Biome.BLACK]: 'Cinzas', [Biome.DUST]: 'Seco' };

/** Mundo: mapa, entidades, ciclo de dia/noite, clima e câmera. */
export class WorldScene extends Phaser.Scene {
  map!: WorldData;
  /** Bioma predominante em volta do jogador. */
  biome: Biome = Biome.VALE;
  player!: Player;
  enemies: Enemy[] = [];
  animals: Animal[] = [];
  flames: Flame[] = [];
  dayNight!: DayNightSystem;
  weather!: WeatherSystem;
  fx!: {
    burst: (x: number, y: number, tint: number, count: number) => void;
    ember: (x: number, y: number) => void;
    damageText: (x: number, y: number, amount: number, color?: string) => void;
  };

  private ambient!: Phaser.GameObjects.Rectangle;
  private glowLights: Light[] = [];
  private houseSprites: Phaser.GameObjects.Sprite[] = [];
  private torches: Phaser.GameObjects.Sprite[] = [];
  private waterTiles: AnimTile[] = [];
  private fallTiles: AnimTile[] = [];
  private waterFrame = 0;
  private fallFrame = 0;
  private waterTimer = 0;
  private fallTimer = 0;
  private bars!: Phaser.GameObjects.Graphics;
  private biomeFx!: BiomeFx;
  /** Peso (0..1) de cada bioma em volta do jogador, suavizado no tempo. */
  private biomeW: number[] = BIOMES.map((_, i) => (i === 0 ? 1 : 0));
  private biomeTint = 0xffffff;
  private biomeDark = 0;
  private playerCollider!: Phaser.Physics.Arcade.Collider;
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
    this.buildTilemap(map);
    this.physics.world.setBounds(0, 0, W, H);

    // vilas: casas, poços, tochas
    for (const h of map.houses) {
      const s = this.add.sprite(h.tx * TILE, h.ty * TILE, h.texture, 0).setOrigin(0);
      s.setDepth(DEPTH.entities + (h.ty + 3) * TILE - 4);
      this.houseSprites.push(s);
      for (const wx of [12, 36]) this.addLight(h.tx * TILE + wx, h.ty * TILE + 34, 0xffc060, 0.75, 0.75, 0.06);
    }
    for (const w of map.wells) this.add.image(w.tx * TILE, w.ty * TILE, 'well').setOrigin(0).setDepth(DEPTH.entities + (w.ty + 2) * TILE - 4);
    for (const t of map.torches) {
      const s = this.add.sprite(t.x, t.y, 'torch', 0).setOrigin(0.5, 1).setDepth(DEPTH.entities + t.y);
      this.torches.push(s);
      this.addLight(t.x, t.y - 11, 0xff9a40, 0.9, 1.4, 0.18);
    }
    // cristais do Blackland brilham sempre que estiver escuro (lá, quase sempre)
    for (const g of map.glows) this.addLight(g.x, g.y, g.color, 0.8, 0.75, 0.1);

    // jogador
    this.player = new Player(this, map.start.x, map.start.y);

    // criaturas (variantes de bioma ganham um tom próprio)
    for (const sp of map.spawns) {
      let c: Enemy | Animal;
      switch (sp.kind) {
        case 'sheep':
          this.animals.push((c = new Sheep(this, sp.x, sp.y)));
          break;
        case 'deer':
          this.animals.push((c = new Deer(this, sp.x, sp.y)));
          break;
        case 'slime':
          this.enemies.push((c = new Slime(this, sp.x, sp.y)));
          break;
        case 'wolf':
          this.enemies.push((c = new Wolf(this, sp.x, sp.y)));
          break;
        case 'bandit':
          this.enemies.push((c = new Bandit(this, sp.x, sp.y)));
          break;
        case 'wraith':
          this.enemies.push((c = new Wraith(this, sp.x, sp.y)));
          break;
      }
      const tint = sp.variant ? VARIANT_TINT[sp.variant] : undefined;
      if (tint !== undefined) {
        c.baseTint = tint;
        c.setTint(tint);
      }
    }
    for (let i = 0; i < BIRD_COUNT; i++) new Bird(this, W, H);

    const collisionLayer = this.collisionLayer;
    this.playerCollider = this.physics.add.collider(this.player, collisionLayer);
    this.physics.add.collider([...this.enemies, ...this.animals], collisionLayer);

    // câmera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setBackgroundColor('#1e1a24');
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyZoom, this));

    // efeitos ambientes
    this.createWaterfallMist(map);
    this.dayNight = new DayNightSystem();
    this.weather = new WeatherSystem(this, DEPTH.weather);
    this.biomeFx = new BiomeFx(this, DEPTH.weather);
    this.createWorldMap(map);
    this.ambient = this.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0).setDepth(DEPTH.ambient);
    this.ambient.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.createFx();
    this.bars = this.add.graphics().setDepth(DEPTH.fx + 1);

    if (DEBUG) {
      (window as unknown as { vaelmor: unknown }).vaelmor = { scene: this, input: inputState };
    }
  }

  // ------------------------------------------------------------------ mapa
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer;

  private buildTilemap(m: WorldData) {
    const tm = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: m.width, height: m.height });
    const ts = tm.addTilesetImage('tiles', 'tiles', TILE, TILE, 1, 2)!;
    const layer = (name: string, data: Int16Array, depth: number) => {
      const l = tm.createBlankLayer(name, ts)!;
      for (let y = 0; y < m.height; y++)
        for (let x = 0; x < m.width; x++) {
          const v = data[y * m.width + x];
          if (v >= 0) l.putTileAt(v, x, y, false);
        }
      l.setDepth(depth);
      return l;
    };
    layer('ground', m.ground, DEPTH.ground);
    const water = layer('water', m.water, DEPTH.water);
    layer('cliffs', m.cliffs, DEPTH.cliffs);
    layer('decor', m.decor, DEPTH.decor);
    layer('canopy', m.canopy, DEPTH.canopy);
    const col = new Int16Array(m.collision.length);
    for (let i = 0; i < col.length; i++) col[i] = m.collision[i] ? T.COLLISION : -1;
    this.collisionLayer = layer('collision', col, 0).setVisible(false);
    this.collisionLayer.setCollision(T.COLLISION);

    water.forEachTile((t) => {
      if (t.index >= T.WATER && t.index < T.WATER + ANIM_FRAMES) this.waterTiles.push({ tile: t, base: T.WATER });
      else if (t.index >= T.WATER_LIP && t.index < T.WATER_LIP + ANIM_FRAMES) this.waterTiles.push({ tile: t, base: T.WATER_LIP });
      else if (t.index >= T.WATERFALL && t.index < T.WATERFALL + ANIM_FRAMES) this.fallTiles.push({ tile: t, base: T.WATERFALL });
      else if (t.index >= T.FOAM && t.index < T.FOAM + ANIM_FRAMES) this.fallTiles.push({ tile: t, base: T.FOAM });
    });

    // projéteis atravessam água, mas não paredes/árvores/casas
    this.projBlock = new Uint8Array(m.collision.length);
    for (let i = 0; i < m.collision.length; i++) this.projBlock[i] = m.collision[i] && m.water[i] < 0 ? 1 : 0;
  }

  blocksProjectile(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return true;
    return this.projBlock[ty * this.map.width + tx] === 1;
  }

  private animateTiles(delta: number) {
    this.waterTimer += delta;
    this.fallTimer += delta;
    if (this.waterTimer >= 190) {
      this.waterTimer = 0;
      this.waterFrame = (this.waterFrame + 1) % ANIM_FRAMES;
      for (const a of this.waterTiles) a.tile.index = a.base + this.waterFrame;
    }
    if (this.fallTimer >= 85) {
      this.fallTimer = 0;
      this.fallFrame = (this.fallFrame + 1) % ANIM_FRAMES;
      for (const a of this.fallTiles) a.tile.index = a.base + this.fallFrame;
    }
  }

  private createWaterfallMist(m: WorldData) {
    const wf = m.waterfall;
    const mist = this.add.particles(0, 0, 'pixel', {
      x: { min: wf.x0 - 8, max: wf.x1 + 8 },
      y: { min: wf.base, max: wf.base + 12 },
      speedY: { min: -22, max: -8 },
      speedX: { min: -8, max: 8 },
      lifespan: { min: 900, max: 1500 },
      scale: { start: 0.6, end: 1.6 },
      alpha: { start: 0.45, end: 0 },
      tint: 0xe8f6ff,
      frequency: 110,
      maxAliveParticles: 18,
    });
    mist.setDepth(DEPTH.entities + wf.base + 40);
  }

  // ------------------------------------------------------------------ luzes
  private addLight(x: number, y: number, color: number, base: number, scale: number, flicker: number) {
    const img = this.add
      .image(x, y, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(scale)
      .setDepth(DEPTH.lights)
      .setAlpha(0)
      .setVisible(false);
    this.glowLights.push({ img, base, scale, flicker });
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
      for (const h of this.houseSprites) h.setFrame(on ? 1 : 0);
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
    this.fx = {
      burst: (x, y, tint, count) => {
        burst.setParticleTint(tint);
        burst.explode(count, x, y);
      },
      ember: (x, y) => embers.emitParticleAt(x, y, 1),
      damageText: (x, y, amount, color = '#ffffff') => {
        const t = this.add
          .text(x, y, String(amount), {
            fontFamily: 'monospace',
            fontSize: '8px',
            fontStyle: 'bold',
            color,
            stroke: '#1e1a24',
            strokeThickness: 2,
          })
          .setOrigin(0.5)
          .setResolution(4)
          .setDepth(DEPTH.fx + 2);
        this.tweens.add({ targets: t, y: y - 12, alpha: 0, duration: 600, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
      },
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
  /** Zoom que preserva a área de ~20×12 tiles visíveis em qualquer proporção. */
  private applyZoom() {
    const { width, height } = this.scale;
    const target = VIEW_TILES_W * TILE * VIEW_TILES_H * TILE;
    const zoom = Math.sqrt((width * height) / target);
    const cam = this.cameras.main;
    cam.setSize(width, height);
    cam.setZoom(zoom);
    if (this.player) cam.centerOn(this.player.x, this.player.y);
  }

  // ------------------------------------------------------------------ loop
  update(_time: number, delta: number) {
    // tudo usa o relógio da cena (o mesmo de delayedCall/tweens); o tempo do
    // loop do jogo diverge dele quando há quedas de FPS
    const time = this.time.now;
    const dt = Math.min(delta, 50);
    this.dayNight.update(dt);
    this.animateTiles(dt);
    this.player.update(time);

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
        if (Phaser.Math.Distance.Between(e.fx, e.fy, p.fx, p.fy) < 10) p.hurt(e.contactDamage, e.fx, e.fy);
      }
    }
    for (const a of this.animals) {
      const dx = a.x - cx;
      const dy = a.y - cy;
      a.tick(time, dx * dx + dy * dy < r2);
    }

    const view = cam.worldView;
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
    // chega com o clima do destino já aplicado
    const b = this.biomeAt(px, py);
    this.biomeW = BIOMES.map((_, i) => (i === b ? 1 : 0));
  }

  flying = false;
  /** Modo voo: atravessa tudo e anda 3× mais rápido. */
  setFlying(on: boolean) {
    this.flying = on;
    this.playerCollider.active = !on;
    this.player.speedMul = on ? 3 : 1;
  }

  /** Mapa do mundo (1 px por tile) com a cor média do que se vê de cima. */
  private createWorldMap(m: WorldData) {
    const src = this.textures.get('tiles').getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const cx = c.getContext('2d')!;
    cx.drawImage(src, 0, 0);
    const px = cx.getImageData(0, 0, c.width, c.height).data;
    const cols = Math.floor((src.width - 2) / (TILE + 2)) + 1;
    const avg = new Int32Array(256).fill(-1);
    for (let id = 0; id < 256; id++) {
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
    const tex = this.textures.createCanvas('worldmap', m.width, m.height)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(m.width, m.height);
    for (let i = 0; i < m.width * m.height; i++) {
      let col = 0x1e1a24;
      for (const layer of [m.ground, m.water, m.cliffs, m.decor, m.canopy]) {
        const v = layer[i];
        if (v >= 0 && avg[v] >= 0) col = avg[v];
      }
      img.data[i * 4] = col >> 16;
      img.data[i * 4 + 1] = (col >> 8) & 255;
      img.data[i * 4 + 2] = col & 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  private lastBiome = -1;

  private updateArea() {
    const p = this.player;
    let name = '';
    for (const v of this.map.villages) if (Phaser.Math.Distance.Between(p.x, p.y, v.cx, v.cy) < 12 * TILE) name = v.name;
    const wf = this.map.waterfall;
    if (!name && Phaser.Math.Distance.Between(p.x, p.y, (wf.x0 + wf.x1) / 2, wf.base) < 7 * TILE) name = 'Queda do Serro';
    if (name !== this.area) {
      this.area = name;
      if (name) this.events.emit('area', name);
    }
    // entrou num bioma novo: mostra o nome (depois de 1,2 s lá dentro)
    if (this.biome !== this.lastBiome && this.biomeW[this.biome] > 0.6) {
      this.lastBiome = this.biome;
      if (!name) this.events.emit('area', BIOMES[this.biome].name);
    }
  }
}
