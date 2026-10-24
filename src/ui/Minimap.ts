import Phaser from 'phaser';
import { TILE } from '../config';
import type { WorldScene } from '../scenes/WorldScene';
import { TYRANTS } from '../systems/Tyrants';
import { BIOMES } from '../systems/WorldGenerator';
import { Button, COLOR, fit, frame, label, pxOf, sizeFrame } from './kit';

/** Tiles do mundo por pixel da textura 'worldmap'. */
const MAP_TILES_PER_PX = 2;
/** Zoom: quantos tiles o minimapa mostra de largura (toque em + / −). */
const ZOOMS = [50, 110, 220, 440];

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
  private zoom = 1;
  private zin: Button;
  private zout: Button;
  private bx = 0;
  private by = 0;
  private bw = 10;
  private bh = 10;

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
    this.zin = new Button(scene, { label: '+', color: 'dark', size: 12, onTap: () => this.setZoom(this.zoom - 1) }).setDepth(1404);
    this.zout = new Button(scene, { label: '-', color: 'dark', size: 12, onTap: () => this.setZoom(this.zoom + 1) }).setDepth(1404);
  }

  private setZoom(z: number) {
    this.zoom = Math.max(0, Math.min(ZOOMS.length - 1, z));
    this.layout(this.u, this.bx, this.by, this.bw, this.bh);
  }

  contains(x: number, y: number) {
    if (this.zin.contains(x, y) || this.zout.contains(x, y)) return true;
    return x >= this.box.x && y >= this.box.y && x <= this.box.x + this.box.displayWidth && y <= this.box.y + this.box.displayHeight;
  }

  /** Caixa do minimapa em (x, y), w × h px de tela. */
  layout(u: number, x: number, y: number, w: number, h: number) {
    this.u = u;
    this.bx = x;
    this.by = y;
    this.bw = w;
    this.bh = h;
    sizeFrame(this.box, x, y, w, h, u);
    const b = pxOf(u) * 4;
    this.ix = x + b;
    this.iy = y + b;
    this.iw = this.box.displayWidth - b * 2;
    this.ih = this.box.displayHeight - b * 2;
    this.s = this.iw / (ZOOMS[this.zoom] / MAP_TILES_PER_PX);
    this.img.setScale(this.s);
    this.maskG.clear().fillStyle(0xffffff).fillRect(this.ix, this.iy, this.iw, this.ih);
    fit(this.area, 10, u).setPosition(x + this.box.displayWidth / 2, y + this.box.displayHeight + 2 * u);
    // zoom: dois botões no canto de baixo à esquerda, por fora da caixa
    const zs = 22 * u;
    this.zin.place(x - zs - 3 * u, y + this.box.displayHeight - zs * 2 - 3 * u, u, zs, zs);
    this.zout.place(x - zs - 3 * u, y + this.box.displayHeight - zs, u, zs, zs);
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

  /** Ponto fora da caixa: preso na borda, na direção dele (o jogador sabe para onde ir). */
  private edge(wx: number, wy: number): [number, number] {
    const p = this.world.player;
    const cx = this.ix + this.iw / 2;
    const cy = this.iy + this.ih / 2;
    const dx = wx - p.x;
    const dy = wy - p.y;
    const k = Math.min((this.iw / 2 - 5 * this.u) / Math.max(1e-6, Math.abs(dx)), (this.ih / 2 - 5 * this.u) / Math.max(1e-6, Math.abs(dy)));
    return [cx + dx * k, cy + dy * k];
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
      const owner = w.forts.ownerOf(c);
      const col = owner === 'player' ? w.clans.player.color : owner ? (w.clans.byId(owner)?.color ?? 0xf3ead2) : (c.capital ? 0xffd77a : 0xf3ead2);
      if (owner) {
        g.fillStyle(col, owner === 'player' ? 0.34 : 0.2).fillCircle(pt[0], pt[1], r + 5 * u);
        g.lineStyle(Math.max(1, u), col, 0.8).strokeCircle(pt[0], pt[1], r + 4 * u);
      }
      g.fillStyle(0x0b0d14, 1).fillRect(pt[0] - r - u, pt[1] - r - u, r * 2 + 2 * u, r * 2 + 2 * u);
      g.fillStyle(col, 1).fillRect(pt[0] - r, pt[1] - r, r * 2, r * 2);
      if (owner === 'player') g.fillStyle(0xffd77a, 1).fillRect(pt[0] - u, pt[1] - u, 2 * u, 2 * u);
    }
    // fortes: torre com a cor do dono (o seu com miolo dourado)
    for (const f of w.forts.forts) {
      const c = w.forts.center(f);
      const pt = this.toScreen(c.x, c.y);
      if (!pt) continue;
      const mine = f.owner === 'player';
      const col = mine ? w.clans.player.color : (w.clans.byId(f.owner)?.color ?? 0x888888);
      const r = 3 * u;
      g.fillStyle(0x0b0d14, 1).fillRect(pt[0] - r - u, pt[1] - r - 2 * u, r * 2 + 2 * u, r * 2 + 3 * u);
      g.fillStyle(col, 1).fillRect(pt[0] - r, pt[1] - r, r * 2, r * 2);
      g.fillStyle(col, 1).fillRect(pt[0] - r, pt[1] - r - u, u, u).fillRect(pt[0] + r - u, pt[1] - r - u, u, u);
      if (mine) g.fillStyle(0xffd77a, 1).fillRect(pt[0] - u, pt[1] - u, 2 * u, 2 * u);
    }
    // baús rúnicos ainda fechados
    for (const c of w.chests.available) {
      const pt = this.toScreen(c.x, c.y);
      if (!pt) continue;
      const r = 2.7 * u;
      g.fillStyle(0x0b0d14, 1).fillRect(pt[0] - r - u, pt[1] - r - u, r * 2 + 2 * u, r * 2 + 2 * u);
      g.fillStyle(0xffd34a, 1).fillRect(pt[0] - r, pt[1] - r, r * 2, r * 2);
      g.fillStyle(0x7a4a16, 1).fillRect(pt[0] - r, pt[1] - u * 0.5, r * 2, u);
    }
    // Masmorras dos Tiranos: caveira com coroa roxa
    TYRANTS.forEach((_, i) => {
      if (!w.tyrants.alive(i)) return;
      const at = w.tyrants.lair(i);
      const pt = this.toScreen(at.x, at.y);
      if (!pt) return;
      const r = 3.5 * u;
      g.fillStyle(0x0b0d14, 1).fillCircle(pt[0], pt[1], r + u);
      g.fillStyle(0xb070ff, 1).fillCircle(pt[0], pt[1], r);
      g.fillStyle(0xffd77a, 1).fillRect(pt[0] - r, pt[1] - r - 1.5 * u, 2 * r, 1.5 * u);
    });
    // gigante acordado: marca laranja com chifres (pisca)
    const gs = w.giants?.st;
    if (gs) {
      const pt = this.toScreen(gs.x, gs.y);
      if (pt) {
        const r = 4.5 * u;
        const on = Math.floor(w.time.now / 400) % 2 === 0;
        g.fillStyle(0x0b0d14, 1).fillCircle(pt[0], pt[1], r + u);
        g.fillStyle(on ? 0xff7a2a : 0xd04a1a, 1).fillCircle(pt[0], pt[1], r);
        g.fillStyle(0xfff0c0, 1).fillTriangle(pt[0] - r, pt[1] - r * 0.4, pt[0] - r * 0.4, pt[1] - r * 0.7, pt[0] - r * 1.1, pt[1] - r * 1.5);
        g.fillStyle(0xfff0c0, 1).fillTriangle(pt[0] + r, pt[1] - r * 0.4, pt[0] + r * 0.4, pt[1] - r * 0.7, pt[0] + r * 1.1, pt[1] - r * 1.5);
        g.fillStyle(0x1a0a0a, 1).fillRect(pt[0] - r * 0.5, pt[1] - u * 0.5, u * 1.5, u * 1.5).fillRect(pt[0] + r * 0.5 - u * 1.5, pt[1] - u * 0.5, u * 1.5, u * 1.5);
      }
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
    // sede do clã: brasão
    if (w.hq.founded) {
      const c = w.hq.center;
      const pt = this.toScreen(c.x, c.y) ?? this.edge(c.x, c.y);
      const r = 4 * u;
      g.fillStyle(0x0b0d14, 1).fillRect(pt[0] - r - u, pt[1] - r - u, r * 2 + 2 * u, r * 2 + 2 * u);
      g.fillStyle(w.clans.player.color, 1).fillRect(pt[0] - r, pt[1] - r, r * 2, r * 2);
      g.fillStyle(0xffd77a, 1).fillRect(pt[0] - u, pt[1] - u, 2 * u, 2 * u);
    }
    // bandos dos clãs rivais: quadrado na cor do clã; vermelho piscando se vêm atrás de você
    const blink = Math.floor(time / 300) % 2 === 0;
    for (const { band: b, clan: c } of w.bands.active) {
      if (b === w.bands.engaged) continue;
      const danger = b.goal === 'hunt' || b.goal === 'raid';
      const pt = this.toScreen(b.x, b.y) ?? (danger ? this.edge(b.x, b.y) : null);
      if (!pt) continue;
      const r = (b.n > 60 ? 4 : 3) * u;
      g.fillStyle(danger && blink ? 0xff3a3a : 0x0b0d14, 1).fillRect(pt[0] - r - u, pt[1] - r - u, r * 2 + 2 * u, r * 2 + 2 * u);
      g.fillStyle(c.color, 1).fillRect(pt[0] - r, pt[1] - r, r * 2, r * 2);
    }
    // alvos (missão, duelo da próxima patente): estrela pulsando, presa na borda se longe
    const pulse = 1 + 0.25 * Math.sin(time / 160);
    for (const o of w.objectives()) {
      const pt = this.toScreen(o.x, o.y) ?? this.edge(o.x, o.y);
      const r = 4.5 * u * pulse;
      const star = (rr: number) => {
        const pts = [];
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const q = k % 2 ? rr * 0.45 : rr;
          pts.push({ x: pt[0] + Math.cos(a) * q, y: pt[1] + Math.sin(a) * q });
        }
        return pts;
      };
      g.fillStyle(0x0b0d14, 1).fillPoints(star(r + 1.5 * u), true);
      g.fillStyle(0xffd34a, 1).fillPoints(star(r), true);
      g.fillStyle(o.color, 1).fillCircle(pt[0], pt[1], 1.3 * u);
    }
    // procurados das missões: alvo vermelho
    for (const m of w.missions.active) {
      if (!m.target) continue;
      const pt = this.toScreen(m.target.x, m.target.y) ?? this.edge(m.target.x, m.target.y);
      g.fillStyle(0x0b0d14, 1).fillCircle(pt[0], pt[1], 4.5 * u);
      g.fillStyle(0xff3a3a, 1).fillCircle(pt[0], pt[1], 3.5 * u);
      g.fillStyle(0xffffff, 1).fillRect(pt[0] - 0.5 * u, pt[1] - 2.2 * u, u, 2.6 * u).fillRect(pt[0] - 0.5 * u, pt[1] + 1 * u, u, u);
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
