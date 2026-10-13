import Phaser from 'phaser';
import { TILE } from '../config';
import { BUILDINGS } from '../data/buildings';
import { DEPTH } from '../entities/Creature';
import type { Animal } from '../entities/Animal';
import type { Enemy } from '../entities/Enemy';
import type { Light, WorldScene } from '../scenes/WorldScene';
import { BIOME_TIER } from './SpawnSpots';
import type { Building, Prop, WorldData } from './WorldGenerator';

/** Lado de uma célula de streaming (tiles). */
const CELL = 32;
/** Células carregadas em volta da câmera (Chebyshev) e a partir de quando descarregam. */
const LOAD_R = 2;
const UNLOAD_R = 3;

type Item =
  | { t: 'spawn'; s: WorldData['spawns'][number] }
  | { t: 'building'; b: Building }
  | { t: 'prop'; p: Prop }
  | { t: 'glow'; g: WorldData['glows'][number] };

interface Loaded {
  objs: Phaser.GameObjects.GameObject[];
  lights: Light[];
  enemies: Enemy[];
  animals: Animal[];
}

const ANIMALS = new Set(['sheep', 'deer', 'fox', 'hare', 'goat', 'lizard']);

/**
 * O mundo é grande demais para ter tudo vivo ao mesmo tempo (milhares de
 * criaturas, centenas de casas e milhares de luzes). O mundo é dividido em
 * células de 32×32 tiles; só as células perto da câmera têm objetos criados.
 * Ao se afastar, a célula é descarregada (as criaturas voltam inteiras quando
 * o herói retornar). A colisão das casas e muralhas fica no mapa, sempre.
 */
export class Streamer {
  private cells = new Map<number, Item[]>();
  private loaded = new Map<number, Loaded>();
  private cols: number;
  private lastCell = -1;
  private lastCheck = 0;

  constructor(
    private scene: WorldScene,
    map: WorldData,
  ) {
    this.cols = Math.ceil(map.width / CELL);
    const add = (px: number, py: number, item: Item) => {
      const key = this.key(Math.floor(px / TILE / CELL), Math.floor(py / TILE / CELL));
      let list = this.cells.get(key);
      if (!list) this.cells.set(key, (list = []));
      list.push(item);
    };
    for (const s of map.spawns) add(s.x, s.y, { t: 'spawn', s });
    for (const b of map.buildings) {
      const B = BUILDINGS[b.key];
      add(b.tx * TILE + B.w / 2, b.ty * TILE + B.h / 2, { t: 'building', b });
    }
    for (const p of map.props) add(p.x, p.y, { t: 'prop', p });
    for (const g of map.glows) add(g.x, g.y, { t: 'glow', g });
  }

  private key(cx: number, cy: number) {
    return cy * this.cols + cx;
  }

  /** Carrega/descarrega em volta de (x, y) px; `force` ignora o intervalo. */
  update(x: number, y: number, time: number, force = false) {
    const cx = Math.floor(x / TILE / CELL);
    const cy = Math.floor(y / TILE / CELL);
    const here = this.key(cx, cy);
    if (!force && here === this.lastCell && time - this.lastCheck < 1000) return;
    this.lastCell = here;
    this.lastCheck = time;
    for (const [k, l] of this.loaded) {
      const kx = k % this.cols;
      const ky = Math.floor(k / this.cols);
      if (Math.max(Math.abs(kx - cx), Math.abs(ky - cy)) > UNLOAD_R) {
        this.unload(l);
        this.loaded.delete(k);
      }
    }
    for (let dy = -LOAD_R; dy <= LOAD_R; dy++)
      for (let dx = -LOAD_R; dx <= LOAD_R; dx++) {
        const kx = cx + dx;
        const ky = cy + dy;
        if (kx < 0 || ky < 0 || kx >= this.cols) continue;
        const k = this.key(kx, ky);
        if (this.loaded.has(k)) continue;
        this.loaded.set(k, this.load(this.cells.get(k) ?? []));
      }
  }

  /** Quantos objetos estão vivos (debug). */
  get stats() {
    let objs = 0;
    let lights = 0;
    for (const l of this.loaded.values()) {
      objs += l.objs.length + l.enemies.length + l.animals.length;
      lights += l.lights.length;
    }
    return { cells: this.loaded.size, objs, lights };
  }

  private load(items: Item[]): Loaded {
    const s = this.scene;
    const out: Loaded = { objs: [], lights: [], enemies: [], animals: [] };
    for (const it of items) {
      switch (it.t) {
        case 'spawn': {
          const sp = it.s;
          if (ANIMALS.has(sp.kind)) out.animals.push(s.spawnAnimal(sp.kind, sp.x, sp.y, sp.variant));
          else out.enemies.push(s.spawnEnemy(sp.kind, sp.x, sp.y, sp.variant, BIOME_TIER[s.biomeAt(sp.x, sp.y)]));
          break;
        }
        case 'building': {
          const b = it.b;
          const B = BUILDINGS[b.key];
          const img = s.add.sprite(b.tx * TILE, b.ty * TILE, `bld-${b.key}`, b.variant * 2).setOrigin(0);
          img.setDepth(DEPTH.entities + b.ty * TILE + B.h - 4).setData('v', b.variant);
          s.addHouse(img);
          out.objs.push(img);
          const color = b.key.startsWith('black') ? 0xc890ff : 0xffc060;
          for (const [wx, wy] of B.windows) out.lights.push(s.addLight(b.tx * TILE + wx, b.ty * TILE + wy, color, 0.75, 0.75, 0.06));
          break;
        }
        case 'prop': {
          const p = it.p;
          if (p.kind === 'torch') {
            const t = s.add.sprite(p.x, p.y, 'torch', 0).setOrigin(0.5, 1).setDepth(DEPTH.entities + p.y);
            s.addTorch(t);
            out.objs.push(t);
            out.lights.push(s.addLight(p.x, p.y - 11, 0xff9a40, 0.9, 1.4, 0.18));
          } else {
            const frame = p.kind === 'tower' || p.kind === 'stall' ? p.frame : undefined;
            const img = s.add.image(p.x, p.y, p.kind, frame).setOrigin(0.5, 1).setDepth(DEPTH.entities + p.y - 2);
            out.objs.push(img);
          }
          break;
        }
        case 'glow':
          out.lights.push(s.addLight(it.g.x, it.g.y, it.g.color, 0.8, 0.75, 0.1));
          break;
      }
    }
    return out;
  }

  private unload(l: Loaded) {
    const s = this.scene;
    for (const o of l.objs) {
      s.forgetObject(o);
      o.destroy();
    }
    for (const L of l.lights) s.removeLight(L);
    for (const e of l.enemies) if (e.active) s.removeEnemy(e);
    for (const a of l.animals) s.removeAnimal(a);
  }
}
