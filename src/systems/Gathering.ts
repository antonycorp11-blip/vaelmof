import Phaser from 'phaser';
import { TILE } from '../config';
import { ITEMS, itemId, type Family, type Region } from '../data/items';
import { inputState } from '../input/InputState';
import type { WorldScene } from '../scenes/WorldScene';
import { T } from './Tiles';
import { Biome } from './WorldGenerator';

interface NodeType {
  family: Exclude<Family, 'weapon' | 'armor'>;
  /** Golpes até esgotar. */
  charges: number;
  /** Quantidade por golpe [mín, máx]. */
  yield: [number, number];
  /** Árvore: base e altura da copa (para tirar ao cortar). */
  canopy?: [number, number];
  /** Tile que fica no lugar ao esgotar (-1 = some). */
  leaves?: number;
  /** Cor das lascas ao golpear. */
  chips: number;
}

const tree = (canopy: number, h = 2): NodeType => ({ family: 'wood', charges: 3, yield: [2, 3], canopy: [canopy, h], leaves: T.STUMP, chips: 0xa8743f });
const rock = (chips = 0xb9bbbe): NodeType => ({ family: 'stone', charges: 3, yield: [1, 2], chips });

/** O que cada tile de decoração vira quando coletado. */
const NODES: Record<number, NodeType> = {
  [T.TRUNK_OAK]: tree(T.CANOPY_OAK),
  [T.TRUNK_PINE]: tree(T.CANOPY_PINE),
  [T.TRUNK_WILLOW]: tree(T.CANOPY_WILLOW),
  [T.TRUNK_BIGOAK]: tree(T.CANOPY_BIGOAK),
  [T.TRUNK_SNOWPINE]: { ...tree(T.CANOPY_SNOWPINE, 3), leaves: T.SNOW_STUMP },
  [T.TRUNK_DEAD]: { ...tree(T.CANOPY_DEAD), chips: 0x4a4054 },
  [T.TRUNK_PALM]: { ...tree(T.CANOPY_PALM), chips: 0xc8a86a },
  [T.TRUNK_CRYSTAL]: { family: 'crystal', charges: 3, yield: [2, 3], canopy: [T.CANOPY_CRYSTAL, 2], leaves: -1, chips: 0xb46cec },
  [T.ROCK]: rock(),
  [T.SNOW_ROCK]: rock(0xe6edf5),
  [T.BLOCK]: rock(0xa3a099),
  [T.BLOCK_MOSS]: rock(0xa3a099),
  [T.BLOCK_SMALL]: { ...rock(0xa3a099), charges: 1 },
  [T.DESERT_ROCK]: rock(0xdea26c),
  [T.ORE]: { family: 'ore', charges: 2, yield: [1, 2], chips: 0xe0b84a },
  [T.CRYSTAL_P]: { family: 'crystal', charges: 2, yield: [1, 2], chips: 0xb46cec },
  [T.CRYSTAL_C]: { family: 'crystal', charges: 2, yield: [1, 2], chips: 0x5ee0ea },
  [T.CRYSTAL_BIG]: { family: 'crystal', charges: 3, yield: [2, 3], chips: 0xb46cec },
  [T.ICE_SHARDS]: { family: 'ice', charges: 2, yield: [1, 2], chips: 0xcde9f8 },
  [T.CACTUS]: { family: 'fiber', charges: 2, yield: [2, 3], chips: 0x78ba60 },
  [T.CACTUS_SMALL]: { family: 'fiber', charges: 1, yield: [1, 2], chips: 0x78ba60 },
  [T.BUSH]: { family: 'fiber', charges: 1, yield: [1, 2], chips: 0x58a548 },
  [T.BUSH_BERRY]: { family: 'fruit', charges: 1, yield: [2, 3], leaves: T.BUSH, chips: 0xc0392b },
  [T.FROZEN_BUSH]: { family: 'fiber', charges: 1, yield: [1, 2], chips: 0xd3ddea },
  [T.THORNS]: { family: 'fiber', charges: 1, yield: [1, 2], chips: 0x3a2a40 },
};

const REGION: Record<Biome, Region> = {
  [Biome.VALE]: 'green',
  [Biome.GREEN]: 'green',
  [Biome.SNOW]: 'snow',
  [Biome.BLOCK]: 'block',
  [Biome.BLACK]: 'black',
  [Biome.DUST]: 'dust',
};

interface NodeState {
  charges: number;
  /** Quando volta (0 = ativo). */
  respawnAt: number;
  saved?: { decor: number; collision: number; canopy: [number, number, number][] };
}

const RESPAWN_MS = 150_000;

/**
 * Coleta: toda árvore, pedra, cristal, cacto, gelo e arbusto do mapa é um
 * recurso. O item depende do tipo e da **região** onde está (ex.: madeira de
 * Snowland). Cada golpe rende um pouco; ao esgotar, a árvore vira toco e a
 * pedra some, voltando depois de um tempo quando o herói estiver longe.
 */
export class Gathering {
  private state = new Map<number, NodeState>();
  private target: { tx: number; ty: number; type: NodeType } | null = null;
  private marker: Phaser.GameObjects.Graphics;
  private lastRespawnCheck = 0;

  constructor(private scene: WorldScene) {
    this.marker = scene.add.graphics().setDepth(4300);
  }

  private nodeAt(tx: number, ty: number): NodeType | undefined {
    const m = this.scene.map;
    if (tx < 0 || ty < 0 || tx >= m.width || ty >= m.height) return undefined;
    const i = ty * m.width + tx;
    const st = this.state.get(i);
    if (st && st.respawnAt) return undefined;
    return NODES[m.decor[i]];
  }

  update(time: number) {
    const p = this.scene.player;
    this.findTarget();
    inputState.canGather = !!this.target && !p.dead;
    this.drawMarker(time);
    if (this.target && p.wantsGather(time) && !p.busy) {
      const { tx, ty } = this.target;
      const cx = tx * TILE + 8;
      const cy = ty * TILE + 8;
      p.startGather(cx, cy, () => this.hit(tx, ty));
    }
    if (time - this.lastRespawnCheck > 2000) {
      this.lastRespawnCheck = time;
      this.respawn(time);
    }
  }

  /** Recurso mais próximo dos pés do herói (até ~1,3 tile), preferindo o da frente. */
  private findTarget() {
    const p = this.scene.player;
    const fx = p.x + p.facing.x * 6;
    const fy = p.y - 2 + p.facing.y * 6;
    const ptx = Math.floor(p.x / TILE);
    const pty = Math.floor((p.y - 2) / TILE);
    let best: typeof this.target = null;
    let bestD = 22;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const tx = ptx + dx;
        const ty = pty + dy;
        const type = this.nodeAt(tx, ty);
        if (!type) continue;
        const d = Math.hypot(tx * TILE + 8 - fx, ty * TILE + 10 - fy);
        if (d < bestD) {
          bestD = d;
          best = { tx, ty, type };
        }
      }
    this.target = best;
  }

  private drawMarker(time: number) {
    const g = this.marker;
    g.clear();
    if (!this.target) return;
    const x = this.target.tx * TILE;
    const y = this.target.ty * TILE;
    const a = 0.55 + 0.35 * Math.sin(time / 160);
    const L = 4;
    g.lineStyle(1, 0xffffff, a);
    for (const [cx, cy, sx, sy] of [
      [x, y, 1, 1],
      [x + TILE, y, -1, 1],
      [x, y + TILE, 1, -1],
      [x + TILE, y + TILE, -1, -1],
    ]) {
      g.lineBetween(cx, cy, cx + L * sx, cy);
      g.lineBetween(cx, cy, cx, cy + L * sy);
    }
  }

  private hit(tx: number, ty: number) {
    const s = this.scene;
    const m = s.map;
    const i = ty * m.width + tx;
    const type = NODES[m.decor[i]];
    if (!type) return;
    let st = this.state.get(i);
    if (!st) this.state.set(i, (st = { charges: type.charges, respawnAt: 0 }));
    const region = REGION[m.biome[i] as Biome];
    const id = itemId(type.family, region);
    const n = Phaser.Math.Between(type.yield[0], type.yield[1]);
    const got = s.inventory.add(id, n);
    const cx = tx * TILE + 8;
    const cy = ty * TILE + 8;
    s.fx.burst(cx, cy, type.chips, 7);
    s.cameras.main.shake(50, 0.0015);
    if (got > 0) s.fx.floatText(cx, cy - 10, `+${got} ${ITEMS[id].name}`, '#ffe9a8');
    else s.fx.floatText(cx, cy - 10, 'Mochila cheia', '#ff8080');
    st.charges--;
    if (st.charges <= 0) this.deplete(tx, ty, type, st);
  }

  private deplete(tx: number, ty: number, type: NodeType, st: NodeState) {
    const s = this.scene;
    const m = s.map;
    const i = ty * m.width + tx;
    const saved: NodeState['saved'] = { decor: m.decor[i], collision: m.collision[i], canopy: [] };
    if (type.canopy) {
      const [base, h] = type.canopy;
      for (let dy = -h; dy <= -1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0) continue;
          const v = m.canopy[y * m.width + x];
          const row = Math.floor((v - base) / 16);
          const col = (v - base) % 16;
          if (v >= 0 && row >= 0 && row < h && col >= 0 && col < 3) {
            saved.canopy.push([x, y, v]);
            s.tiles.set('canopy', x, y, -1);
          }
        }
      // a copa cai: folhas voando
      s.fx.burst(tx * TILE + 8, (ty - h / 2) * TILE, type.chips, 14);
    }
    s.tiles.set('decor', tx, ty, type.leaves ?? -1);
    s.setSolid(tx, ty, false);
    st.saved = saved;
    st.respawnAt = s.time.now + RESPAWN_MS;
  }

  private respawn(time: number) {
    const s = this.scene;
    const m = s.map;
    const p = s.player;
    for (const [i, st] of this.state) {
      if (!st.respawnAt || time < st.respawnAt || !st.saved) continue;
      const tx = i % m.width;
      const ty = Math.floor(i / m.width);
      if (Math.hypot(tx * TILE - p.x, ty * TILE - p.y) < 18 * TILE) continue;
      s.tiles.set('decor', tx, ty, st.saved.decor);
      if (st.saved.collision) s.setSolid(tx, ty, true);
      for (const [x, y, v] of st.saved.canopy) s.tiles.set('canopy', x, y, v);
      this.state.delete(i);
    }
  }
}
