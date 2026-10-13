import Phaser from 'phaser';
import { TILE } from '../config';
import { ANIM_FRAMES, T } from './Tiles';
import type { WorldData } from './WorldGenerator';

type LayerName = 'ground' | 'water' | 'cliffs' | 'decor' | 'canopy';

/** Camadas desenhadas e a profundidade de cada uma. */
const LAYERS: [LayerName, number][] = [
  ['ground', 0],
  ['water', 1],
  ['cliffs', 2],
  ['decor', 3],
  ['canopy', 3000],
];

interface AnimTile {
  tile: Phaser.Tilemaps.Tile;
  base: number;
}

/**
 * Desenha só uma "janela" do mundo em volta da câmera. O mundo inteiro fica
 * em arrays compactos (WorldData); a janela é um tilemap pequeno que é
 * reposicionado e reescrito quando a câmera se aproxima da borda. Assim um
 * mundo de centenas de tiles de lado não cria milhões de objetos Tile (o que
 * pesa na memória e causa travadinhas do coletor de lixo no celular).
 */
export class TileWindow {
  readonly cols = 72;
  readonly rows = 48;
  /** Margem (tiles) da câmera até a borda da janela antes de reposicionar. */
  private readonly margin = 8;
  private ox = -9999;
  private oy = -9999;
  private layers = new Map<LayerName, Phaser.Tilemaps.TilemapLayer>();
  private water: AnimTile[] = [];
  private falls: AnimTile[] = [];
  private waterFrame = 0;
  private fallFrame = 0;
  private waterTimer = 0;
  private fallTimer = 0;

  constructor(
    scene: Phaser.Scene,
    private map: WorldData,
  ) {
    const tm = scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: this.cols, height: this.rows });
    const ts = tm.addTilesetImage('tiles', 'tiles', TILE, TILE, 1, 2)!;
    for (const [name, depth] of LAYERS) {
      const l = tm.createBlankLayer(name, ts, 0, 0, this.cols, this.rows)!;
      l.setDepth(depth);
      this.layers.set(name, l);
    }
  }

  /** Reposiciona a janela se a câmera chegou perto da borda. */
  update(view: Phaser.Geom.Rectangle, delta: number) {
    const x0 = Math.floor(view.x / TILE);
    const y0 = Math.floor(view.y / TILE);
    const x1 = Math.ceil(view.right / TILE);
    const y1 = Math.ceil(view.bottom / TILE);
    const m = this.margin;
    if (x0 < this.ox + m || y0 < this.oy + m || x1 > this.ox + this.cols - m || y1 > this.oy + this.rows - m) {
      const cx = Math.floor((x0 + x1) / 2);
      const cy = Math.floor((y0 + y1) / 2);
      this.moveTo(cx - (this.cols >> 1), cy - (this.rows >> 1));
    }
    this.animate(delta);
  }

  private moveTo(ox: number, oy: number) {
    const m = this.map;
    this.ox = Phaser.Math.Clamp(ox, 0, Math.max(0, m.width - this.cols));
    this.oy = Phaser.Math.Clamp(oy, 0, Math.max(0, m.height - this.rows));
    this.water = [];
    this.falls = [];
    for (const [name] of LAYERS) {
      const layer = this.layers.get(name)!;
      layer.setPosition(this.ox * TILE, this.oy * TILE);
      const src = m[name];
      const rows = layer.layer.data;
      for (let y = 0; y < this.rows; y++) {
        const row = rows[y];
        const base = (this.oy + y) * m.width + this.ox;
        for (let x = 0; x < this.cols; x++) {
          const v = src[base + x];
          const tile = row[x];
          tile.index = v;
          if (name === 'water' && v >= 0) this.track(tile, v);
        }
      }
    }
  }

  private track(tile: Phaser.Tilemaps.Tile, v: number) {
    const anim = (base: number) => v >= base && v < base + ANIM_FRAMES;
    if (anim(T.WATER)) this.water.push({ tile, base: T.WATER });
    else if (anim(T.WATER_LIP)) this.water.push({ tile, base: T.WATER_LIP });
    else if (anim(T.WATERFALL)) this.falls.push({ tile, base: T.WATERFALL });
    else if (anim(T.FOAM)) this.falls.push({ tile, base: T.FOAM });
    // a janela nova continua no mesmo quadro de animação
    for (const a of [this.water, this.falls]) {
      const last = a[a.length - 1];
      if (last?.tile === tile) last.tile.index = last.base + (a === this.water ? this.waterFrame : this.fallFrame);
    }
  }

  private animate(delta: number) {
    this.waterTimer += delta;
    this.fallTimer += delta;
    if (this.waterTimer >= 190) {
      this.waterTimer = 0;
      this.waterFrame = (this.waterFrame + 1) % ANIM_FRAMES;
      for (const a of this.water) a.tile.index = a.base + this.waterFrame;
    }
    if (this.fallTimer >= 85) {
      this.fallTimer = 0;
      this.fallFrame = (this.fallFrame + 1) % ANIM_FRAMES;
      for (const a of this.falls) a.tile.index = a.base + this.fallFrame;
    }
  }

  /** Muda um tile do mundo (ex.: árvore cortada) e, se visível, na janela. */
  set(name: LayerName, tx: number, ty: number, v: number) {
    const m = this.map;
    m[name][ty * m.width + tx] = v;
    const x = tx - this.ox;
    const y = ty - this.oy;
    if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) this.layers.get(name)!.layer.data[y][x].index = v;
  }

  /** Força a janela a se redesenhar em volta do ponto (teleporte). */
  recenter(px: number, py: number) {
    this.moveTo(Math.floor(px / TILE) - (this.cols >> 1), Math.floor(py / TILE) - (this.rows >> 1));
  }
}
