import Phaser from 'phaser';
import { TILE } from '../config';
import type { WorldScene } from '../scenes/WorldScene';
import { BIOMES } from '../systems/WorldGenerator';

type Btn = Phaser.GameObjects.Text;

/**
 * Painel de debug para conferir o mundo pelo celular: teleporte para cada
 * bioma, modo voo (atravessa tudo, 3× mais rápido), invencível, dia/noite e um
 * mapa do mundo inteiro — tocar no mapa leva o herói para aquele ponto.
 */
export class DebugPanel {
  private toggle: Btn;
  private panel: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private info: Phaser.GameObjects.Text;
  private buttons: Btn[] = [];
  private mapLayer: Phaser.GameObjects.Container;
  private mapImg: Phaser.GameObjects.Image;
  private mapDot: Phaser.GameObjects.Arc;
  private mapBg: Phaser.GameObjects.Rectangle;
  private mapHint: Phaser.GameObjects.Text;
  private open = false;
  private showingMap = false;
  private u = 1;
  private flyBtn!: Btn;
  private spotBtn!: Btn;
  private spotIdx = -1;
  private cityBtn!: Btn;
  private cityIdx = -1;
  private champBtn!: Btn;
  private champIdx = -1;
  private spotMarks: Phaser.GameObjects.GameObject[] = [];
  private godBtn!: Btn;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    const style = { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', fontStyle: 'bold', backgroundColor: '#2a2234', padding: { x: 6, y: 4 } };
    this.toggle = scene.add.text(0, 0, 'DEBUG', { ...style, backgroundColor: '#7a1f2a' }).setDepth(2000).setInteractive({ useHandCursor: true });
    this.toggle.on('pointerdown', () => this.setOpen(!this.open));

    this.panel = scene.add.container(0, 0).setDepth(2000).setVisible(false);
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x0b0a12, 0.82).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.3);
    this.info = scene.add.text(0, 0, '', { ...style, backgroundColor: undefined, fontSize: '10px' });
    this.panel.add([this.bg, this.info]);
    const add = (label: string, fn: () => void, color = '#2a2234') => {
      const b = scene.add.text(0, 0, label, { ...style, backgroundColor: color }).setInteractive({ useHandCursor: true });
      b.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        fn();
      });
      this.panel.add(b);
      this.buttons.push(b);
      return b;
    };
    BIOMES.forEach((b, i) => {
      const hex = '#' + b.map.toString(16).padStart(6, '0');
      const btn = add(b.name, () => {
        const p = world.map.poi[i];
        world.teleport(p.x, p.y);
      });
      btn.setStyle({ backgroundColor: i === 4 ? '#3a3046' : '#2a2234', color: i === 2 ? '#e6edf5' : hex === '#2c2731' ? '#b46cec' : hex });
    });
    add('MAPA', () => this.setMap(true), '#22507a');
    this.flyBtn = add('Voo: não', () => {
      world.setFlying(!world.flying);
      this.refresh();
    });
    this.godBtn = add('Invencível: não', () => {
      world.player.god = !world.player.god;
      this.refresh();
    });
    add('Dia', () => (world.dayNight.time = 0.45));
    add('Noite', () => (world.dayNight.time = 0.92));
    // progressão (estilo MU)
    add('+50 pontos', () => {
      const P = world.progress;
      P.grant(50);
    }, '#6a4a10');
    add('+500 glória', () => world.progress.addGlory(500), '#6a4a10');
    add('Zerar atributos', () => world.progress.reset(), '#5a2a2a');
    this.spotBtn = add('Spot: próximo', () => {
      const list = world.spots.spots;
      if (!list.length) return;
      this.spotIdx = (this.spotIdx + 1) % list.length;
      const sp = list[this.spotIdx];
      world.teleport(sp.x, sp.y + sp.r + 24);
      this.refresh();
    }, '#3a2414');
    // exércitos (teste de recrutamento, guerra e desempenho)
    add('Recrutas cheios', () => {
      world.army.pool = world.army.poolMax;
      world.army.emit('change');
    }, '#1c2a44');
    add('Aliados +50 (teste)', () => {
      const a = world.army;
      a.prepare(() => {
        for (let i = 0; i < 50; i++) a.recruit((['sword', 'sword', 'greatsword', 'bow', 'staff'] as const)[i % 5], 1, true);
      });
    }, '#1c2a44');
    for (const n of [50, 100, 300]) add(`Inimigos ${n}`, () => {
      const a = world.army;
      a.prepare(() => {
        if (a.war) a.clearFoes();
        a.declareWar(n);
      });
      this.setOpen(false);
    }, '#5a2a2a');
    add('Limpar exércitos', () => world.army.disband(), '#2a2234');
    this.champBtn = add('Campeão: próximo', () => {
      const list = world.champions.list;
      this.champIdx = (this.champIdx + 1) % list.length;
      const c = list[this.champIdx];
      world.teleport(c.x, c.y + 120);
      this.refresh();
    }, '#6a4a10');
    this.cityBtn = add('Cidade: próxima', () => {
      const list = world.map.cities;
      this.cityIdx = (this.cityIdx + 1) % list.length;
      const c = list[this.cityIdx];
      world.teleport(c.cx * TILE + 8, (c.cy + 3) * TILE + 8);
      this.refresh();
    }, '#22507a');

    // mapa do mundo
    this.mapLayer = scene.add.container(0, 0).setDepth(2100).setVisible(false);
    this.mapBg = scene.add.rectangle(0, 0, 10, 10, 0x0b0a12, 0.9).setOrigin(0).setInteractive();
    this.mapImg = scene.add.image(0, 0, 'worldmap').setOrigin(0).setInteractive();
    this.mapDot = scene.add.circle(0, 0, 4, 0xff3b3b).setStrokeStyle(2, 0xffffff);
    this.mapHint = scene.add.text(0, 0, 'toque no mapa para ir até lá · branco = cidade, dourado = spot · toque fora fecha', { ...style, backgroundColor: undefined, fontSize: '10px' }).setOrigin(0.5, 0);
    this.mapLayer.add([this.mapBg, this.mapImg, this.mapDot, this.mapHint]);
    this.mapImg.on('pointerdown', (p: Phaser.Input.Pointer, lx: number, ly: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      void p;
      const m = world.map;
      world.teleport((lx / this.mapImg.width) * m.width * TILE, (ly / this.mapImg.height) * m.height * TILE);
      this.setMap(false);
    });
    this.mapBg.on('pointerdown', () => this.setMap(false));
    this.refresh();
  }

  /** Toques nestas áreas não acionam o joystick. */
  contains(x: number, y: number): boolean {
    if (this.showingMap) return true;
    if (this.toggle.getBounds().contains(x, y)) return true;
    return this.open && this.bg.getBounds().contains(x, y);
  }

  private setOpen(on: boolean) {
    this.open = on;
    this.panel.setVisible(on);
    this.refresh();
  }

  private setMap(on: boolean) {
    // o mapa é gerado pela WorldScene; garante a textura já pronta
    if (on && this.mapImg.texture.key !== 'worldmap') this.mapImg.setTexture('worldmap');
    this.showingMap = on;
    this.mapLayer.setVisible(on);
    this.layoutMap();
  }

  private refresh() {
    const sp = this.world.spots?.spots[this.spotIdx];
    this.spotBtn?.setText(sp ? `Spot: ${sp.name}` : 'Spot: próximo');
    const city = this.world.map?.cities[this.cityIdx];
    this.cityBtn?.setText(city ? `Cidade: ${city.name}` : 'Cidade: próxima');
    const ch = this.world.champions?.list[this.champIdx];
    this.champBtn?.setText(ch ? `Campeão: ${ch.id}` : 'Campeão: próximo');
    this.flyBtn.setText(`Voo: ${this.world.flying ? 'SIM' : 'não'}`).setStyle({ backgroundColor: this.world.flying ? '#2e7a3a' : '#2a2234' });
    this.godBtn.setText(`Invencível: ${this.world.player?.god ? 'SIM' : 'não'}`).setStyle({ backgroundColor: this.world.player?.god ? '#2e7a3a' : '#2a2234' });
  }

  /** Largura do botão DEBUG (para a barra do topo distribuir os botões). */
  get toggleWidth(): number {
    return this.toggle.width;
  }

  /** Botão DEBUG em (x, y); o painel abre logo abaixo, centralizado na tela. */
  layout(u: number, x: number, y: number) {
    this.u = u;
    const fs = Math.round(12 * u);
    const pad = { x: Math.round(10 * u), y: Math.round(9 * u) };
    this.toggle.setFontSize(fs).setPadding(pad.x, pad.y, pad.x, pad.y).setPosition(x, y);
    this.info.setFontSize(Math.round(10 * u)).setPosition(8 * u, 6 * u);
    // botões em 3 colunas, grandes o bastante para o dedo
    const colW = 168 * u;
    const nc = 3;
    let by = 8 * u + this.info.height + 4 * u;
    this.buttons.forEach((b, i) => {
      b.setFontSize(Math.round(11 * u)).setPadding(Math.round(8 * u), Math.round(6 * u), Math.round(8 * u), Math.round(6 * u));
      b.setPosition(8 * u + (i % nc) * colW, by);
      if (i % nc === nc - 1) by += b.height + 4 * u;
    });
    if (this.buttons.length % nc) by += this.buttons[0].height + 4 * u;
    const W = colW * nc + 8 * u;
    this.bg.setSize(W, by + 4 * u);
    const { width } = this.scene.scale;
    this.panel.setPosition(Math.round((width - W) / 2), y + this.toggle.height + 6 * u);
    this.layoutMap();
  }

  private layoutMap() {
    if (!this.showingMap) return;
    const { width, height } = this.scene.scale;
    const u = this.u;
    this.mapBg.setSize(width, height);
    const s = Math.min((width * 0.9) / this.mapImg.width, (height * 0.82) / this.mapImg.height);
    this.mapImg.setScale(s).setPosition((width - this.mapImg.width * s) / 2, (height - this.mapImg.height * s) / 2 + 10 * u);
    this.mapHint.setFontSize(Math.round(10 * u)).setPosition(width / 2, this.mapImg.y - 18 * u);
    this.mapDot.setRadius(4 * u);
    // spots de up no mapa: círculo dourado com o nome
    for (const o of this.spotMarks) o.destroy();
    this.spotMarks = [];
    // px do mundo → px do mapa na tela
    const k = this.mapImg.displayWidth / (this.world.map.width * TILE);
    const mark = (wx: number, wy: number) => [this.mapImg.x + wx * k, this.mapImg.y + wy * k] as const;
    for (const c of this.world.map.cities) {
      const [x, y] = mark(c.x0 * TILE, c.y0 * TILE);
      const r = this.scene.add.rectangle(x, y, (c.x1 - c.x0) * TILE * k, (c.y1 - c.y0) * TILE * k).setOrigin(0).setStrokeStyle(Math.max(1, 1.5 * u), 0xffffff, 0.9);
      const t = this.scene.add
        .text(x + ((c.x1 - c.x0) * TILE * k) / 2, y - 2 * u, c.name, { fontFamily: 'monospace', fontSize: `${Math.round(9 * u)}px`, color: '#ffffff', fontStyle: 'bold', stroke: '#0b0a12', strokeThickness: 3 * u })
        .setOrigin(0.5, 1);
      this.mapLayer.add([r, t]);
      this.spotMarks.push(r, t);
    }
    for (const sp of this.world.spots.spots) {
      const [x, y] = mark(sp.x, sp.y);
      // spots: só o círculo dourado (com 36 spots, os nomes poluiriam o mapa)
      const c = this.scene.add.circle(x, y, Math.max(2.5 * u, sp.r * k)).setStrokeStyle(Math.max(1, 1.5 * u), 0xffd34a, 1);
      this.mapLayer.add(c);
      this.spotMarks.push(c);
    }
    this.mapLayer.bringToTop(this.mapDot);
  }

  update() {
    const w = this.world;
    const p = w.player;
    if (!p) return;
    if (this.open) {
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      this.info.setText(`${BIOMES[w.biome].name} · tile ${tx},${ty} · ${Math.round(this.scene.game.loop.actualFps)} fps`);
    }
    if (this.showingMap) {
      const k = this.mapImg.displayWidth / (w.map.width * TILE);
      this.mapDot.setPosition(this.mapImg.x + p.x * k, this.mapImg.y + p.y * k);
    }
  }
}
