import Phaser from 'phaser';
import { TILE } from '../config';
import type { WorldScene } from '../scenes/WorldScene';
import { BIOMES } from '../systems/WorldGenerator';
import { COLOR, fit, frame, label, pxOf, sizeFrame } from './kit';

/** Tiles do mundo por pixel da textura 'worldmap'. */
const MAP_TILES_PER_PX = 2;
/** Quantos tiles o minimapa mostra de largura. */
const VIEW_TILES = 110;

/**
 * Minimapa no canto: o mapa do mundo recortado em volta do herói, com as
 * cidades (quadrados), os spots de up (anéis dourados), os campeões (losangos
 * vermelhos), o exército (pontos azuis), inimigos em guerra (pontos vermelhos)
 * e o herói (seta amarela). Tocar abre o mapa completo.
 */
export class Minimap {
  private box: Phaser.GameObjects.NineSlice;
  private img: Phaser.GameObjects.Image;
  private maskG: Phaser.GameObjects.Graphics;
  private marks: Phaser.GameObjects.Graphics;
  private area: Phaser.GameObjects.Text;
  private ix = 0;
  private iy = 0;
  private iw = 10;
  private ih = 10;
  private s = 1;
  private u = 1;
  private lastDraw = 0;
  onTap?: () => void;

  constructor(
    scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.box = frame(scene, 'frame').setDepth(1400).setInteractive({ useHandCursor: true });
    this.box.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e?.stopPropagation?.();
      this.onTap?.();
    });
    this.img = scene.add.image(0, 0, 'worldmap').setOrigin(0).setDepth(1401);
    this.maskG = scene.make.graphics({}, false);
    this.img.setMask(this.maskG.createGeometryMask());
    this.marks = scene.add.graphics().setDepth(1402);
    this.area = label(scene, '', 10, COLOR.gold).setOrigin(0.5, 0).setDepth(1403);
  }

  contains(x: number, y: number) {
    return x >= this.box.x && y >= this.box.y && x <= this.box.x + this.box.displayWidth && y <= this.box.y + this.box.displayHeight;
  }

  /** Caixa do minimapa em (x, y), w × h px de tela. */
  layout(u: number, x: number, y: number, w: number, h: number) {
    this.u = u;
    sizeFrame(this.box, x, y, w, h, u);
    const b = pxOf(u) * 4;
    this.ix = x + b;
    this.iy = y + b;
    this.iw = this.box.displayWidth - b * 2;
    this.ih = this.box.displayHeight - b * 2;
    this.s = this.iw / (VIEW_TILES / MAP_TILES_PER_PX);
    this.img.setScale(this.s);
    this.maskG.clear().fillStyle(0xffffff).fillRect(this.ix, this.iy, this.iw, this.ih);
    fit(this.area, 10, u).setPosition(x + this.box.displayWidth / 2, y + this.box.displayHeight + 2 * u);
    this.lastDraw = 0;
  }

  get bottom() {
    return this.area.y + this.area.height;
  }

  /** px do mundo → px da tela no minimapa (null fora da caixa). */
  private toScreen(wx: number, wy: number): [number, number] | null {
    const p = this.world.player;
    const k = this.s / (TILE * MAP_TILES_PER_PX);
    const x = this.ix + this.iw / 2 + (wx - p.x) * k;
    const y = this.iy + this.ih / 2 + (wy - p.y) * k;
    if (x < this.ix + 1 || y < this.iy + 1 || x > this.ix + this.iw - 1 || y > this.iy + this.ih - 1) return null;
    return [x, y];
  }

  update(time: number) {
    const w = this.world;
    const p = w.player;
    if (!p) return;
    const k = this.s / MAP_TILES_PER_PX;
    this.img.setPosition(Math.round(this.ix + this.iw / 2 - (p.x / TILE) * k), Math.round(this.iy + this.ih / 2 - (p.y / TILE) * k));
    if (time - this.lastDraw < 150) return;
    this.lastDraw = time;
    const u = this.u;
    const g = this.marks;
    g.clear();
    // cidades
    for (const c of w.map.cities) {
      const pt = this.toScreen(c.cx * TILE, c.cy * TILE);
      if (!pt) continue;
      const r = (c.capital ? 4 : 3) * u;
      g.fillStyle(0x0b0d14, 1).fillRect(pt[0] - r - u, pt[1] - r - u, r * 2 + 2 * u, r * 2 + 2 * u);
      g.fillStyle(c.capital ? 0xffd77a : 0xf3ead2, 1).fillRect(pt[0] - r, pt[1] - r, r * 2, r * 2);
    }
    // spots de up
    for (const sp of w.spots.spots) {
      const pt = this.toScreen(sp.x, sp.y);
      if (!pt) continue;
      g.lineStyle(Math.max(1, 1.5 * u), 0x0b0d14, 1).strokeCircle(pt[0], pt[1], 4 * u);
      g.lineStyle(Math.max(1, u), 0xffb030, 1).strokeCircle(pt[0], pt[1], 3.5 * u);
    }
    // campeões ainda de pé
    for (const c of w.champions.list) {
      if (w.progress.duels.has(c.id)) continue;
      const pt = this.toScreen(c.x, c.y);
      if (!pt) continue;
      const r = 3.5 * u;
      g.fillStyle(0x0b0d14, 1).fillPoints([{ x: pt[0], y: pt[1] - r - u }, { x: pt[0] + r + u, y: pt[1] }, { x: pt[0], y: pt[1] + r + u }, { x: pt[0] - r - u, y: pt[1] }], true);
      g.fillStyle(0xff5a5a, 1).fillPoints([{ x: pt[0], y: pt[1] - r }, { x: pt[0] + r, y: pt[1] }, { x: pt[0], y: pt[1] + r }, { x: pt[0] - r, y: pt[1] }], true);
    }
    // soldados
    for (const s of w.army.soldiers) {
      if (s.dead) continue;
      const pt = this.toScreen(s.x, s.y);
      if (!pt) continue;
      g.fillStyle(s.team === 0 ? 0x5aa0ff : 0xff5a5a, 1).fillRect(pt[0] - u, pt[1] - u, 2 * u, 2 * u);
    }
    // herói: seta na direção em que olha
    const a = Math.atan2(p.facing.y, p.facing.x);
    const cx = this.ix + this.iw / 2;
    const cy = this.iy + this.ih / 2;
    const tri = (r: number) => [
      { x: cx + Math.cos(a) * r * 1.4, y: cy + Math.sin(a) * r * 1.4 },
      { x: cx + Math.cos(a + 2.4) * r, y: cy + Math.sin(a + 2.4) * r },
      { x: cx + Math.cos(a - 2.4) * r, y: cy + Math.sin(a - 2.4) * r },
    ];
    g.fillStyle(0x0b0d14, 1).fillPoints(tri(5.5 * u), true);
    g.fillStyle(0xffe14a, 1).fillPoints(tri(4 * u), true);
    // nome do lugar sob o mapa
    const city = w.map.cities.find((c) => p.x / TILE >= c.x0 - 2 && p.x / TILE <= c.x1 + 2 && p.y / TILE >= c.y0 - 2 && p.y / TILE <= c.y1 + 2);
    this.area.setText(city ? city.name : BIOMES[w.biome].name);
  }
}
