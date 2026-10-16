import Phaser from 'phaser';
import { TILE } from '../config';
import type { WorldScene } from '../scenes/WorldScene';
import { TYRANTS } from '../systems/Tyrants';
import { Button, COLOR, fit, label } from './kit';

const ZOOMS = [1, 1.6, 2.5, 4, 6, 9];

/**
 * Mapa do mundo em tela cheia: arrastar para andar, + / − (ou a roda do mouse)
 * para o zoom. Mostra cidades com nome, sua sede, bandos rivais, spots de up,
 * campeões, procurados, os alvos das missões (estrelas) e o herói. Abre
 * centrado no herói. No debug, tocar (sem arrastar) teleporta.
 */
export class MapPanel {
  open = false;
  /** Debug: tocar no mapa leva o herói até lá. */
  teleport = false;
  private root: Phaser.GameObjects.Container;
  private shade: Phaser.GameObjects.Rectangle;
  private img: Phaser.GameObjects.Image;
  private marks: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private legend: Phaser.GameObjects.Text;
  private close: Button;
  private zin: Button;
  private zout: Button;
  private me: Button;
  private names: Phaser.GameObjects.Text[] = [];
  private objNames: Phaser.GameObjects.Text[] = [];
  private u = 1;
  private blink = 0;
  private zoom = 2;
  /** Centro da vista em px do mundo. */
  private cx = 0;
  private cy = 0;
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.root = scene.add.container(0, 0).setDepth(2400).setVisible(false);
    this.shade = scene.add.rectangle(0, 0, 10, 10, 0x05060a, 1).setOrigin(0).setInteractive();
    this.img = scene.add.image(0, 0, 'worldmap').setOrigin(0);
    this.marks = scene.add.graphics();
    this.title = label(scene, 'MAPA DE VAELMOR', 15, COLOR.gold);
    this.legend = label(scene, '', 9, COLOR.dim, 1, false);
    this.close = new Button(scene, { icon: 12, color: 'red', onTap: () => this.setOpen(false) });
    this.zin = new Button(scene, { label: '+', color: 'dark', size: 16, onTap: () => this.setZoom(this.zoom + 1) });
    this.zout = new Button(scene, { label: '-', color: 'dark', size: 16, onTap: () => this.setZoom(this.zoom - 1) });
    this.me = new Button(scene, { label: 'VOCÊ', color: 'blue', size: 10, onTap: () => this.center() });
    this.root.add([this.shade, this.img, this.marks]);
    for (const c of world.map.cities) {
      const t = label(scene, c.name, 9, c.capital ? COLOR.gold : COLOR.text).setOrigin(0.5, 1);
      this.names.push(t);
      this.root.add(t);
    }
    for (let i = 0; i < 6; i++) {
      const t = label(scene, '', 9, COLOR.gold).setOrigin(0.5, 1);
      this.objNames.push(t);
      this.root.add(t);
    }
    this.root.add([this.title, this.legend, ...this.close.parts, ...this.zin.parts, ...this.zout.parts, ...this.me.parts]);
    // arrastar / tocar
    this.shade.on('pointerdown', (p: Phaser.Input.Pointer) => (this.drag = { x: p.x, y: p.y, cx: this.cx, cy: this.cy, moved: false }));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.open || !this.drag || !p.isDown) return;
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (Math.hypot(dx, dy) > 6 * this.u) this.drag.moved = true;
      const k = this.k;
      this.cx = this.drag.cx - dx / k;
      this.cy = this.drag.cy - dy / k;
      this.place();
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.open || !this.drag) return;
      const d = this.drag;
      this.drag = null;
      if (d.moved) return;
      const { x, y } = this.toWorld(p.x, p.y);
      if (this.teleport) {
        world.teleport(x, y);
        this.setOpen(false);
        return;
      }
      // viagem rápida: toque na sua sede, num forte seu ou numa cidade do seu território
      const k = this.k;
      const hit = world.travelPoints().find((t) => Math.hypot((t.x - x) * k, (t.y - y) * k) < 14 * this.u);
      if (!hit) return;
      const why = world.fastTravel(hit);
      if (why) world.events.emit('toast', why);
      else this.setOpen(false);
    });
    scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.open) this.setZoom(this.zoom + (dy > 0 ? -1 : 1));
    });
  }

  contains() {
    return this.open;
  }

  /** px de tela por px do mundo. */
  private get k() {
    const { width, height } = this.scene.scale;
    const m = this.world.map;
    const fitK = Math.min(width / (m.width * TILE), height / (m.height * TILE));
    return fitK * ZOOMS[this.zoom];
  }

  private toWorld(sx: number, sy: number) {
    const { width, height } = this.scene.scale;
    return { x: this.cx + (sx - width / 2) / this.k, y: this.cy + (sy - height / 2) / this.k };
  }

  private toScreen(wx: number, wy: number): [number, number] {
    const { width, height } = this.scene.scale;
    return [width / 2 + (wx - this.cx) * this.k, height / 2 + (wy - this.cy) * this.k];
  }

  private setZoom(z: number) {
    this.zoom = Math.max(0, Math.min(ZOOMS.length - 1, z));
    this.place();
  }

  private center() {
    const p = this.world.player;
    this.cx = p.x;
    this.cy = p.y;
    this.place();
  }

  setOpen(on: boolean, teleport = this.teleport) {
    this.open = on;
    this.teleport = teleport;
    this.root.setVisible(on);
    this.drag = null;
    if (on) {
      this.center();
      this.layout(this.u);
    }
  }

  toggle() {
    this.setOpen(!this.open, false);
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    this.shade.setSize(width, height);
    const pad = 12 * u;
    fit(this.title, 15, u).setPosition(pad, pad);
    this.close.place(width - pad - 34 * u, pad, u, 34 * u, 30 * u);
    this.zin.place(width - pad - 34 * u, height / 2 - 36 * u, u, 34 * u, 32 * u);
    this.zout.place(width - pad - 34 * u, height / 2 + 4 * u, u, 34 * u, 32 * u);
    this.me.place(width - pad - 70 * u, height / 2 + 44 * u, u, 70 * u, 26 * u);
    fit(this.legend, 9, u)
      .setText(`□ cidade   ▣ forte (cor do dono)   ◯ território   ■ sua sede   ■ bando rival (vermelho = vem atrás de você)   * alvo   ◯ spot   ◆ campeão   ● Tirano (coroa)   ▲ você${this.teleport ? '   · toque para ir' : '   · arraste para andar · toque na sua sede, forte ou território para viajar (30 ouro)'}`)
      .setPosition(pad, height - pad - 12 * u)
      .setWordWrapWidth(width - pad * 2);
    this.place();
  }

  /** Posiciona a imagem e redesenha as marcas. */
  private place() {
    const k = this.k;
    const m = this.world.map;
    const [x0, y0] = this.toScreen(0, 0);
    this.img.setScale((k * m.width * TILE) / this.img.width).setPosition(Math.round(x0), Math.round(y0));
    this.world.map.cities.forEach((c, i) => {
      const [x, y] = this.toScreen(c.cx * TILE, (c.y0 - 4) * TILE);
      fit(this.names[i], ZOOMS[this.zoom] >= 2.5 ? 10 : 8, this.u).setPosition(Math.round(x), Math.round(y)).setVisible(ZOOMS[this.zoom] >= 1.6);
    });
    this.draw();
  }

  private draw() {
    const g = this.marks;
    const w = this.world;
    const u = this.u;
    const k = this.k;
    const at = (x: number, y: number) => this.toScreen(x, y);
    g.clear();
    // territórios: mancha na cor do dono em volta de cada cidade
    for (const c of w.map.cities) {
      const owner = w.forts.ownerOf(c);
      if (!owner) continue;
      const col = owner === 'player' ? w.clans.player.color : (w.clans.byId(owner)?.color ?? 0x888888);
      let nd = Infinity;
      for (const o of w.map.cities) if (o !== c) nd = Math.min(nd, Math.hypot(o.cx - c.cx, o.cy - c.cy));
      const r = Math.min(70, nd / 2) * TILE * k;
      const [x, y] = at(c.cx * TILE, c.cy * TILE);
      g.fillStyle(col, owner === 'player' ? 0.28 : 0.16).fillCircle(x, y, r);
      g.lineStyle(Math.max(1, u), col, 0.6).strokeCircle(x, y, r);
    }
    // fortes
    for (const f of w.forts.forts) {
      const c = w.forts.center(f);
      const [x, y] = at(c.x, c.y);
      const mine = f.owner === 'player';
      const col = mine ? w.clans.player.color : (w.clans.byId(f.owner)?.color ?? 0x888888);
      const r = 4 * u;
      g.fillStyle(0x0b0d14, 1).fillRect(x - r - u, y - r - 2 * u, r * 2 + 2 * u, r * 2 + 3 * u);
      g.fillStyle(col, 1).fillRect(x - r, y - r, r * 2, r * 2).fillRect(x - r, y - r - u, 2 * u, u).fillRect(x + r - 2 * u, y - r - u, 2 * u, u);
      if (mine) g.fillStyle(0xffd77a, 1).fillRect(x - u, y - u, 2 * u, 2 * u);
    }
    for (const c of w.map.cities) {
      const [x, y] = at(c.x0 * TILE, c.y0 * TILE);
      const ww = Math.max(4 * u, (c.x1 - c.x0) * TILE * k);
      const hh = Math.max(4 * u, (c.y1 - c.y0) * TILE * k);
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
    // Tiranos: covil com coroa
    TYRANTS.forEach((_, i) => {
      if (!w.tyrants.alive(i)) return;
      const t = w.tyrants.lair(i);
      const [x, y] = at(t.x, t.y);
      const r = 5 * u;
      g.fillStyle(0x0b0d14, 1).fillCircle(x, y, r + u);
      g.fillStyle(0xb070ff, 1).fillCircle(x, y, r);
      g.fillStyle(0xffd77a, 1).fillRect(x - r, y - r - 2 * u, 2 * r, 2 * u);
    });
    // gigante acordado
    const gs = w.giants?.st;
    if (gs) {
      const [x, y] = at(gs.x, gs.y);
      const r = 7 * u;
      g.fillStyle(0x0b0d14, 1).fillCircle(x, y, r + u);
      g.fillStyle(0xff7a2a, 1).fillCircle(x, y, r);
      g.fillStyle(0xfff0c0, 1).fillTriangle(x - r, y - r * 0.4, x - r * 0.4, y - r * 0.7, x - r * 1.1, y - r * 1.6);
      g.fillStyle(0xfff0c0, 1).fillTriangle(x + r, y - r * 0.4, x + r * 0.4, y - r * 0.7, x + r * 1.1, y - r * 1.6);
      g.fillStyle(0x1a0a0a, 1).fillRect(x - r * 0.5, y - u, 2 * u, 2 * u).fillRect(x + r * 0.5 - 2 * u, y - u, 2 * u, 2 * u);
    }
    if (w.hq.founded) {
      const c = w.hq.center;
      const [x, y] = at(c.x, c.y);
      g.fillStyle(0x0b0d14, 1).fillRect(x - 6 * u, y - 6 * u, 12 * u, 12 * u);
      g.fillStyle(w.clans.player.color, 1).fillRect(x - 5 * u, y - 5 * u, 10 * u, 10 * u);
      g.fillStyle(0xffd77a, 1).fillRect(x - u, y - u, 2 * u, 2 * u);
    }
    for (const { band: b, clan: c } of w.bands.active) {
      const [x, y] = at(b.x, b.y);
      const danger = b.goal === 'hunt' || b.goal === 'raid';
      g.fillStyle(danger ? 0xff3a3a : 0x0b0d14, 1).fillRect(x - 4 * u, y - 4 * u, 8 * u, 8 * u);
      g.fillStyle(c.color, 1).fillRect(x - 3 * u, y - 3 * u, 6 * u, 6 * u);
    }
    // alvos: estrela grande com o nome
    const objs = w.objectives();
    this.objNames.forEach((t, i) => {
      const o = objs[i];
      t.setVisible(!!o);
      if (!o) return;
      const [x, y] = at(o.x, o.y);
      const r = 7 * u;
      const star = (rr: number) => {
        const pts = [];
        for (let q = 0; q < 10; q++) {
          const a = -Math.PI / 2 + (q * Math.PI) / 5;
          const d = q % 2 ? rr * 0.45 : rr;
          pts.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d });
        }
        return pts;
      };
      g.fillStyle(0x0b0d14, 1).fillPoints(star(r + 2 * u), true);
      g.fillStyle(0xffd34a, 1).fillPoints(star(r), true);
      fit(t, 9, u).setText(o.name).setPosition(Math.round(x), Math.round(y - r - 3 * u));
    });
    const p = w.player;
    const [px, py] = at(p.x, p.y);
    g.fillStyle(0x0b0d14, 1).fillCircle(px, py, 6 * u);
    g.fillStyle(0xffe14a, 1).fillCircle(px, py, 4.5 * u);
  }

  update(time: number) {
    if (!this.open || time - this.blink < 300) return;
    this.blink = time;
    this.draw();
  }
}
