import Phaser from 'phaser';
import { TILE } from '../config';
import type { WorldScene } from '../scenes/WorldScene';
import { BIOMES } from '../systems/WorldGenerator';
import { Button, COLOR, fit, frame, label, sizeFrame, type BtnColor } from './kit';

/**
 * Painel de debug para conferir o mundo pelo celular: teleporte para cada
 * bioma, cidade, spot e campeão, voo, invencível, dia/noite, mapa com
 * teleporte, progressão e testes de exército.
 */
export class DebugPanel {
  open = false;
  /** Abre o mapa completo em modo teleporte (definido pela UIScene). */
  onMap?: () => void;
  private root: Phaser.GameObjects.Container;
  private box: Phaser.GameObjects.NineSlice;
  private title: Phaser.GameObjects.Text;
  private info: Phaser.GameObjects.Text;
  private buttons: Button[] = [];
  private u = 1;
  private flyBtn!: Button;
  private godBtn!: Button;
  private spotBtn!: Button;
  private cityBtn!: Button;
  private champBtn!: Button;
  private spotIdx = -1;
  private cityIdx = -1;
  private champIdx = -1;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.root = scene.add.container(0, 0).setDepth(2300).setVisible(false);
    this.box = frame(scene, 'frame').setInteractive();
    this.title = label(scene, 'DEBUG', 14, COLOR.red);
    this.info = label(scene, '', 10, COLOR.dim, 1, false);
    this.root.add([this.box, this.title, this.info]);
    const add = (text: string, fn: () => void, color: BtnColor = 'dark') => {
      const b = new Button(scene, { label: text, color, size: 10, onTap: fn });
      b.addTo(this.root);
      this.buttons.push(b);
      return b;
    };
    BIOMES.forEach((b, i) =>
      add(b.name, () => {
        const p = world.map.poi[i];
        world.teleport(p.x, p.y);
      }),
    );
    add('Mapa (teleporte)', () => {
      this.setOpen(false);
      this.onMap?.();
    }, 'blue');
    this.cityBtn = add('Cidade: próxima', () => {
      const list = world.map.cities;
      this.cityIdx = (this.cityIdx + 1) % list.length;
      const c = list[this.cityIdx];
      world.teleport(c.cx * TILE + 8, (c.cy + 3) * TILE + 8);
      this.refresh();
    }, 'blue');
    this.spotBtn = add('Spot: próximo', () => {
      const list = world.spots.spots;
      if (!list.length) return;
      this.spotIdx = (this.spotIdx + 1) % list.length;
      const sp = list[this.spotIdx];
      world.teleport(sp.x, sp.y + sp.r + 24);
      this.refresh();
    }, 'blue');
    this.champBtn = add('Campeão: próximo', () => {
      const list = world.champions.list;
      this.champIdx = (this.champIdx + 1) % list.length;
      const c = list[this.champIdx];
      world.teleport(c.x, c.y + 120);
      this.refresh();
    }, 'blue');
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
    add('+50 pontos', () => world.progress.grant(50), 'gold');
    add('+500 glória', () => world.progress.addGlory(500), 'gold');
    add('Zerar progresso', () => world.progress.reset(), 'red');
    add('Recrutas cheios', () => {
      world.army.pool = world.army.poolMax;
      world.army.emit('change');
    }, 'green');
    add('Aliados +50', () => {
      const a = world.army;
      a.prepare(() => {
        for (let i = 0; i < 50; i++) a.recruit((['sword', 'sword', 'greatsword', 'bow', 'staff'] as const)[i % 5], 1, true);
      });
    }, 'green');
    for (const n of [50, 100, 300])
      add(`Inimigos ${n}`, () => {
        const a = world.army;
        a.prepare(() => {
          if (a.war) a.clearFoes();
          a.declareWar(n);
        });
        this.setOpen(false);
      }, 'red');
    add('Limpar exércitos', () => world.army.disband(), 'red');
    this.refresh();
  }

  contains(x: number, y: number): boolean {
    return this.open && this.box.getBounds().contains(x, y);
  }

  setOpen(on: boolean) {
    this.open = on;
    this.root.setVisible(on);
    if (on) {
      this.refresh();
      this.layout(this.u);
    }
  }

  toggle() {
    this.setOpen(!this.open);
  }

  private refresh() {
    const w = this.world;
    this.flyBtn?.setLabel(`Voo: ${w.flying ? 'SIM' : 'não'}`).setColor(w.flying ? 'green' : 'dark');
    this.godBtn?.setLabel(`Invencível: ${w.player?.god ? 'SIM' : 'não'}`).setColor(w.player?.god ? 'green' : 'dark');
    const sp = w.spots?.spots[this.spotIdx];
    this.spotBtn?.setLabel(sp ? `Spot: ${sp.name}` : 'Spot: próximo');
    const city = w.map?.cities[this.cityIdx];
    this.cityBtn?.setLabel(city ? `Cidade: ${city.name}` : 'Cidade: próxima');
    const ch = w.champions?.list[this.champIdx];
    this.champBtn?.setLabel(ch ? `Campeão: ${ch.id}` : 'Campeão: próximo');
    if (this.open) this.layout(this.u);
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const pad = 12 * u;
    const nc = 3;
    const colW = Math.min(180 * u, (width * 0.9 - pad * 2) / nc);
    const bh = 26 * u;
    fit(this.title, 14, u).setPosition(pad, pad);
    fit(this.info, 10, u).setPosition(pad + this.title.width + 10 * u, pad + 4 * u);
    let y = pad + 26 * u;
    this.buttons.forEach((b, i) => {
      b.place(pad + (i % nc) * colW, y, u, colW - 6 * u, bh);
      if (i % nc === nc - 1) y += bh + 4 * u;
    });
    if (this.buttons.length % nc) y += bh + 4 * u;
    const W = pad * 2 + colW * nc - 6 * u;
    const H = y + pad - 4 * u;
    sizeFrame(this.box, 0, 0, W, H, u);
    this.root.setPosition(Math.round((width - this.box.displayWidth) / 2), Math.round(Math.max(4 * u, (height - this.box.displayHeight) / 2)));
  }

  update() {
    if (!this.open) return;
    const w = this.world;
    const p = w.player;
    if (!p) return;
    this.info.setText(`${BIOMES[w.biome].name} · tile ${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)} · ${Math.round(this.scene.game.loop.actualFps)} fps`);
  }
}
