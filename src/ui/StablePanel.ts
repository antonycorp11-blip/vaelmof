import Phaser from 'phaser';
import { MOUNTS, type MountDef } from '../data/mounts';
import type { WorldScene } from '../scenes/WorldScene';
import { BIOMES } from '../systems/WorldGenerator';
import { Button, COLOR, fit, frame, label, sizeFrame, Window } from './kit';

type Txt = Phaser.GameObjects.Text;

interface Card {
  m: MountDef;
  box: Phaser.GameObjects.NineSlice;
  img: Phaser.GameObjects.Image;
  name: Txt;
}

const pct = (k: number) => `+${Math.round(k * 100)}%`;

/**
 * Estábulo: as 21 montarias (as que você tem coloridas, as outras em sombra),
 * a ficha da escolhida — velocidade, bônus e como conseguir — e os botões de
 * usar, comprar (no estábulo da cidade) e montar/desmontar.
 */
export class StablePanel {
  private win: Window;
  private cards: Card[] = [];
  private sel: MountDef = MOUNTS.bay;
  private info: Txt;
  private use: Button;
  private buy: Button;
  private ride: Button;
  private status: Txt;
  private u = 1;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    const w = (this.win = new Window(scene, 'ESTÁBULO', 26, () => this.setOpen(false)));
    for (const m of Object.values(MOUNTS)) {
      const c: Card = {
        m,
        box: frame(scene, 'frame-inner').setInteractive({ useHandCursor: true }),
        img: scene.add.image(0, 0, 'mounts', m.row * 16 + 8),
        name: label(scene, m.name, 7, COLOR.text, 1, false).setOrigin(0.5, 0).setAlign('center'),
      };
      c.box.on('pointerdown', () => {
        this.sel = m;
        this.status.setText('');
        this.refresh();
      });
      w.add(c.box, c.img, c.name);
      this.cards.push(c);
    }
    this.info = label(scene, '', 9, COLOR.text, 1, false).setLineSpacing(3);
    this.status = label(scene, '', 9, COLOR.green, 1, false);
    this.use = new Button(scene, { label: 'USAR ESTA', color: 'blue', size: 10, onTap: () => this.say(this.choose()) }).addTo(w.root);
    this.buy = new Button(scene, { label: 'COMPRAR', color: 'gold', size: 10, onTap: () => this.say(world.stable.buy(this.sel.id)) }).addTo(w.root);
    this.ride = new Button(scene, { label: 'MONTAR', icon: 26, color: 'green', size: 10, onTap: () => this.say(world.stable.toggle()) }).addTo(w.root);
    w.add(this.info, this.status);
    world.stable.on('change', () => this.refresh());
  }

  get open() {
    return this.win.open;
  }

  contains(x: number, y: number) {
    return this.win.contains(x, y);
  }

  setOpen(on: boolean) {
    this.win.setOpen(on);
    if (on) {
      const st = this.world.stable;
      if (st.active) this.sel = MOUNTS[st.active];
      this.status.setText('');
      this.layout(this.u);
    }
  }

  toggle() {
    this.setOpen(!this.open);
  }

  update() {}

  private choose(): string {
    if (!this.world.stable.owned.has(this.sel.id)) return 'Você ainda não tem esta montaria';
    this.world.stable.choose(this.sel.id);
    return `${this.sel.name} selada`;
  }

  private say(msg: string) {
    this.status.setText(msg).setColor(/^(Falt|Você ainda|Este|Você já)/.test(msg) ? COLOR.red : COLOR.green);
    this.refresh();
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const st = this.world.stable;
    const sale = st.forSale();
    this.win.sub.setText(`${st.owned.size}/${Object.keys(MOUNTS).length} montarias · ${this.world.hq.gold} ouro${this.world.market.cityHere() ? ` · estábulo de ${this.world.market.cityHere()!.name}` : ''}`);
    for (const c of this.cards) {
      const has = st.owned.has(c.m.id);
      c.img.setTint(has ? 0xffffff : 0x202028).setAlpha(has ? 1 : 0.85);
      c.box.setTexture(c.m === this.sel ? 'ui-frame-hl' : 'ui-frame-inner');
      c.name.setColor(st.active === c.m.id ? COLOR.green : has ? COLOR.text : COLOR.dim);
    }
    const m = this.sel;
    const has = st.owned.has(m.id);
    const bonus = [m.guard ? `defesa ${pct(m.guard)}` : '', m.power ? `dano ${pct(m.power)}` : ''].filter(Boolean).join(' · ');
    const how = m.price
      ? `Vende por ${m.price} ouro em ${m.biomes.length ? m.biomes.map((b) => BIOMES[b].name).join(', ') : 'qualquer cidade'}`
      : 'Não se compra: cai de campeões, líderes de clã e procurados fortes';
    this.info.setText([`${m.name}${has ? '  (sua)' : ''}`, `velocidade ×${m.speed.toFixed(2).replace('.', ',')}${bonus ? ` · ${bonus}` : ''}`, m.desc, how].join('\n'));
    this.use.setEnabled(has && st.active !== m.id);
    this.buy.setVisible(!has && sale.includes(m)).setLabel(`COMPRAR ${m.price}`);
    this.ride.setLabel(st.riding ? 'DESMONTAR' : 'MONTAR').setEnabled(!!st.active);
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const win = this.win;
    win.place(u, Math.min(width * 0.97, 820 * u), Math.min(height * 0.95, 384 * u));
    const pad = win.pad;
    const top = win.head + pad / 2;
    const cols = 7;
    const cw = (win.W - pad * 2) / cols;
    const ch = Math.min(64 * u, (win.H - top - pad - 70 * u) / 3);
    this.cards.forEach((c, i) => {
      const x = pad + (i % cols) * cw;
      const y = top + Math.floor(i / cols) * ch;
      sizeFrame(c.box, x + 1, y + 1, cw - 3 * u, ch - 3 * u, u);
      const k = Math.max(1, Math.floor((ch - 18 * u) / 40));
      c.img.setScale(k).setPosition(Math.round(x + cw / 2), Math.round(y + (ch - 14 * u) / 2 + 2 * u));
      fit(c.name, 7, u).setPosition(x + cw / 2, y + ch - 14 * u).setWordWrapWidth(cw - 6 * u);
    });
    const by = top + ch * 3 + 6 * u;
    fit(this.info, 9, u).setPosition(pad, by).setWordWrapWidth(win.W - pad * 2 - 300 * u);
    this.use.place(win.W - pad - 296 * u, by, u, 94 * u, 26 * u);
    this.buy.place(win.W - pad - 198 * u, by, u, 100 * u, 26 * u);
    this.ride.place(win.W - pad - 94 * u, by, u, 94 * u, 26 * u);
    fit(this.status, 9, u).setPosition(win.W - pad - 296 * u, by + 32 * u).setWordWrapWidth(296 * u);
    this.refresh(true);
  }
}
