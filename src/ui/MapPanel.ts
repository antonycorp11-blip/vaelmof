import Phaser from 'phaser';
import { TILE } from '../config';
import type { WorldScene } from '../scenes/WorldScene';
import { Button, COLOR, fit, frame, label, sizeFrame } from './kit';

/**
 * Mapa completo do mundo: cidades com nome, spots de up, campeões e o herói.
 * No debug, tocar no mapa teleporta para o ponto.
 */
export class MapPanel {
  open = false;
  /** Debug: tocar no mapa leva o herói até lá. */
  teleport = false;
  private root: Phaser.GameObjects.Container;
  private shade: Phaser.GameObjects.Rectangle;
  private box: Phaser.GameObjects.NineSlice;
  private img: Phaser.GameObjects.Image;
  private marks: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private legend: Phaser.GameObjects.Text;
  private close: Button;
  private names: Phaser.GameObjects.Text[] = [];
  private u = 1;
  private blink = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.root = scene.add.container(0, 0).setDepth(2400).setVisible(false);
    this.shade = scene.add.rectangle(0, 0, 10, 10, 0x05060a, 0.78).setOrigin(0).setInteractive();
    this.shade.on('pointerdown', () => this.setOpen(false));
    this.box = frame(scene, 'frame');
    this.img = scene.add.image(0, 0, 'worldmap').setOrigin(0).setInteractive();
    this.img.on('pointerdown', (_p: Phaser.Input.Pointer, lx: number, ly: number, e: Phaser.Types.Input.EventData) => {
      e?.stopPropagation?.();
      if (!this.teleport) return;
      const m = world.map;
      world.teleport((lx / this.img.width) * m.width * TILE, (ly / this.img.height) * m.height * TILE);
      this.setOpen(false);
    });
    this.marks = scene.add.graphics();
    this.title = label(scene, 'MAPA DE VAELMOR', 15, COLOR.gold);
    this.legend = label(scene, '', 10, COLOR.dim, 1, false);
    this.close = new Button(scene, { icon: 12, color: 'red', onTap: () => this.setOpen(false) });
    this.root.add([this.shade, this.box, this.img, this.marks, this.title, this.legend, ...this.close.parts]);
    for (const c of world.map.cities) {
      const t = label(scene, c.name, 9, c.capital ? COLOR.gold : COLOR.text).setOrigin(0.5, 1);
      this.names.push(t);
      this.root.add(t);
    }
  }

  contains() {
    return this.open;
  }

  setOpen(on: boolean, teleport = this.teleport) {
    this.open = on;
    this.teleport = teleport;
    this.root.setVisible(on);
    if (on) this.layout(this.u);
  }

  toggle() {
    this.setOpen(!this.open, false);
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    this.shade.setSize(width, height);
    const pad = 14 * u;
    const head = 30 * u;
    const foot = 22 * u;
    const side = Math.min(width * 0.8, height - pad * 2 - head - foot);
    const W = side + pad * 2;
    const H = side + head + foot + pad;
    const x0 = Math.round((width - W) / 2);
    const y0 = Math.round((height - H) / 2);
    sizeFrame(this.box, x0, y0, W, H, u);
    const s = side / this.img.width;
    this.img.setScale(s).setPosition(Math.round(x0 + pad), Math.round(y0 + head));
    fit(this.title, 15, u).setPosition(x0 + pad, y0 + 9 * u);
    this.close.place(x0 + W - pad - 30 * u, y0 + 6 * u, u, 30 * u, 24 * u);
    fit(this.legend, 10, u)
      .setText(`■ cidade   ◯ spot de up   ◆ campeão   ● procurado   ▲ você${this.teleport ? '   · toque para ir até lá' : ''}`)
      .setPosition(x0 + pad, y0 + head + side + 6 * u);
    const k = s / (TILE * 2);
    this.world.map.cities.forEach((c, i) => {
      fit(this.names[i], 9, u).setPosition(Math.round(this.img.x + c.cx * TILE * k), Math.round(this.img.y + (c.y0 - 6) * TILE * k));
    });
    this.draw();
  }

  private draw() {
    const g = this.marks;
    const w = this.world;
    const u = this.u;
    const k = this.img.scaleX / (TILE * 2);
    const at = (x: number, y: number): [number, number] => [this.img.x + x * k, this.img.y + y * k];
    g.clear();
    for (const c of w.map.cities) {
      const [x, y] = at(c.x0 * TILE, c.y0 * TILE);
      const ww = (c.x1 - c.x0) * TILE * k;
      const hh = (c.y1 - c.y0) * TILE * k;
      g.lineStyle(Math.max(1, 1.5 * u), 0x0b0d14, 1).strokeRect(x - u, y - u, ww + 2 * u, hh + 2 * u);
      g.lineStyle(Math.max(1, u), c.capital ? 0xffd77a : 0xf3ead2, 1).strokeRect(x, y, ww, hh);
    }
    for (const sp of w.spots.spots) {
      const [x, y] = at(sp.x, sp.y);
      g.lineStyle(Math.max(1, 1.5 * u), 0xffb030, 1).strokeCircle(x, y, Math.max(3 * u, sp.r * k));
    }
    for (const c of w.champions.list) {
      if (w.progress.duels.has(c.id)) continue;
      const [x, y] = at(c.x, c.y);
      const r = 4 * u;
      g.fillStyle(0xff5a5a, 1).fillPoints([{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }], true);
    }
    for (const m of w.missions.active) {
      if (!m.target) continue;
      const [x, y] = at(m.target.x, m.target.y);
      g.fillStyle(0x0b0d14, 1).fillCircle(x, y, 5 * u);
      g.fillStyle(0xff3a3a, 1).fillCircle(x, y, 4 * u);
      g.fillStyle(0xffffff, 1).fillRect(x - 0.5 * u, y - 2.5 * u, u, 3 * u).fillRect(x - 0.5 * u, y + 1.2 * u, u, u);
    }
    const p = w.player;
    const [px, py] = at(p.x, p.y);
    g.fillStyle(0x0b0d14, 1).fillCircle(px, py, 5 * u);
    g.fillStyle(0xffe14a, 1).fillCircle(px, py, 3.5 * u);
  }

  update(time: number) {
    if (!this.open || time - this.blink < 300) return;
    this.blink = time;
    this.draw();
  }
}
