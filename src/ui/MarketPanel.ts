import Phaser from 'phaser';
import { RARITY } from '../data/gear';
import { ITEMS } from '../data/items';
import type { WorldScene } from '../scenes/WorldScene';
import { Inventory } from '../systems/Inventory';
import { OFFERS } from '../systems/Market';
import { Button, COLOR, fit, frame, label, sizeFrame, Window } from './kit';

type Txt = Phaser.GameObjects.Text;

interface Cell {
  box: Phaser.GameObjects.NineSlice;
  sel: Phaser.GameObjects.NineSlice;
  icon: Phaser.GameObjects.Image;
  qty: Txt;
}

/**
 * Mercado da cidade: à esquerda a mochila (toque num item para ver o preço e
 * vender), à direita o que o mercador vende (recrutas e mercenários).
 */
export class MarketPanel {
  private win: Window;
  private cells: Cell[] = [];
  private detail: Txt;
  private sell1: Button;
  private sellAll: Button;
  private shopTitle: Txt;
  private offers: { box: Phaser.GameObjects.NineSlice; name: Txt; desc: Txt; btn: Button }[] = [];
  private status: Txt;
  private away: Txt;
  private selected = -1;
  private u = 1;
  private cs = 20;
  private lastTick = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    const w = (this.win = new Window(scene, 'MERCADO', 22, () => this.setOpen(false)));
    for (let i = 0; i < Inventory.SLOTS; i++) {
      const box = frame(scene, 'frame-inner').setInteractive({ useHandCursor: true });
      const sel = frame(scene, 'frame-hl').setVisible(false);
      const icon = scene.add.image(0, 0, 'items', 0).setVisible(false);
      const qty = label(scene, '', 8, COLOR.text).setOrigin(1, 1);
      box.on('pointerdown', () => {
        this.selected = i;
        this.status.setText('');
        this.refresh();
      });
      w.add(box, sel, icon, qty);
      this.cells.push({ box, sel, icon, qty });
    }
    this.detail = label(scene, '', 9, COLOR.text, 1, false);
    this.sell1 = new Button(scene, { label: 'VENDER 1', color: 'gold', size: 9, onTap: () => this.sell(1) }).addTo(w.root);
    this.sellAll = new Button(scene, { label: 'VENDER TUDO', color: 'gold', size: 9, onTap: () => this.sell(999) }).addTo(w.root);
    this.shopTitle = label(scene, 'O MERCADOR VENDE', 10, COLOR.blue);
    this.status = label(scene, '', 9, COLOR.green, 1, false);
    this.away = label(scene, 'Os mercadores ficam nas praças das cidades.\nEntre numa cidade para vender e comprar.', 11, COLOR.dim, 1, false).setOrigin(0.5).setAlign('center');
    w.add(this.detail, this.shopTitle, this.status, this.away);
    for (const o of OFFERS) {
      const r = {
        box: frame(scene, 'frame-inner'),
        name: label(scene, o.name, 9.5, COLOR.gold),
        desc: label(scene, `${o.price} ouro · ${o.desc}`, 8, COLOR.dim, 1, false),
        btn: new Button(scene, { label: 'COMPRAR', color: 'green', size: 9, onTap: () => this.say(world.market.buy(o)) }),
      };
      w.add(r.box, r.name, r.desc);
      r.btn.addTo(w.root);
      this.offers.push(r);
    }
    world.inventory.on('change', () => this.refresh());
    world.market.on('change', () => this.refresh());
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
      this.selected = -1;
      this.status.setText('');
      this.layout(this.u);
    }
  }

  toggle() {
    this.setOpen(!this.open);
  }

  update(time: number) {
    if (!this.open || time - this.lastTick < 1000) return;
    this.lastTick = time;
    this.refresh();
  }

  private say(msg: string) {
    const bad = /^(Falt|Sua|A reserva|Compre|Venda|O mercador|Tire)/.test(msg);
    this.status.setText(msg).setColor(bad ? COLOR.red : COLOR.green);
    this.refresh();
  }

  private sell(n: number) {
    if (this.selected < 0) return;
    this.say(this.world.market.sell(this.selected, n));
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const w = this.world;
    const c = w.market.cityHere();
    const inv = w.inventory;
    this.win.sub.setText(c ? `${c.name} (${w.market.regionName(c)}) · você tem ${w.hq.gold} ouro · o mercador tem ${w.market.purseOf(c)} para pagar` : `você tem ${w.hq.gold} ouro`);
    const on = !!c;
    this.away.setVisible(!on);
    for (const o of [this.detail, this.shopTitle, this.status]) o.setVisible(on);
    this.sell1.setVisible(on);
    this.sellAll.setVisible(on);
    for (const r of this.offers) {
      for (const o of [r.box, r.name, r.desc]) o.setVisible(on);
      r.btn.setVisible(on);
    }
    this.cells.forEach((cell, i) => {
      const s = inv.slots[i];
      for (const o of [cell.box, cell.icon, cell.qty]) o.setVisible(on);
      cell.sel.setVisible(on && i === this.selected);
      if (!on) return;
      if (!s) {
        cell.icon.setVisible(false);
        cell.qty.setText('');
        cell.box.clearTint();
        return;
      }
      const d = ITEMS[s.id];
      const sheet = d.sheet ?? 'items';
      cell.icon.setTexture(sheet, d.icon).setVisible(true);
      cell.icon.setScale((this.cs * (sheet === 'armor-icons' ? 0.8 : 0.56)) / (sheet === 'armor-icons' ? 54 : 16));
      if (d.tint) cell.icon.setTint(d.tint);
      else cell.icon.clearTint();
      if (d.tier) cell.box.setTint(RARITY[d.tier].frame);
      else cell.box.clearTint();
      cell.qty.setText(s.qty > 1 ? String(s.qty) : '');
    });
    if (!on) return;
    const s = this.selected >= 0 ? inv.slots[this.selected] : null;
    if (s) {
      const d = ITEMS[s.id];
      const each = w.market.price(s.id, c!);
      this.detail.setText(`${d.name}${s.qty > 1 ? ` (${s.qty})` : ''} · ${each} ouro cada${s.qty > 1 ? ` · tudo: ${each * s.qty}` : ''}`).setColor(RARITY[d.tier ?? 0].color);
    } else this.detail.setText('Toque num item para ver quanto vale. Material de outra região vale o dobro.').setColor(COLOR.dim);
    this.sell1.setEnabled(!!s);
    this.sellAll.setEnabled(!!s && s.qty > 1);
    OFFERS.forEach((o, i) => this.offers[i].btn.setEnabled(w.hq.gold >= o.price));
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const win = this.win;
    win.place(u, Math.min(width * 0.97, 820 * u), Math.min(height * 0.95, 384 * u));
    const pad = win.pad;
    const top = win.head + pad / 2;
    const L = (win.W - pad * 3) * 0.5;
    const cs = Math.floor(Math.min(L / 8, (win.H - top - pad - 56 * u) / 6));
    this.cs = cs;
    this.cells.forEach((c, i) => {
      const x = pad + (i % 8) * cs;
      const y = top + Math.floor(i / 8) * cs;
      sizeFrame(c.box, x + 1, y + 1, cs - 2, cs - 2, u);
      sizeFrame(c.sel, x + 1, y + 1, cs - 2, cs - 2, u);
      c.icon.setPosition(x + cs / 2, y + cs / 2);
      fit(c.qty, 8, u).setPosition(x + cs - 3 * u, y + cs - 2 * u);
    });
    const fy = top + cs * 6 + 6 * u;
    fit(this.detail, 9, u).setPosition(pad, fy).setWordWrapWidth(L);
    this.sell1.place(pad, fy + 18 * u, u, L / 2 - 3 * u, 24 * u);
    this.sellAll.place(pad + L / 2 + 3 * u, fy + 18 * u, u, L / 2 - 3 * u, 24 * u);
    const rx = pad * 2 + L;
    const rw = win.W - rx - pad;
    fit(this.shopTitle, 10, u).setPosition(rx, top);
    const oh = 52 * u;
    this.offers.forEach((r, i) => {
      const y = top + 18 * u + i * (oh + 4 * u);
      sizeFrame(r.box, rx, y, rw, oh, u);
      fit(r.name, 9.5, u).setPosition(rx + 10 * u, y + 7 * u);
      fit(r.desc, 8, u).setPosition(rx + 10 * u, y + 22 * u).setWordWrapWidth(rw - 112 * u);
      r.btn.place(rx + rw - 96 * u, y + oh / 2 - 12 * u, u, 86 * u, 24 * u);
    });
    fit(this.status, 9, u).setPosition(rx, win.H - pad - 14 * u).setWordWrapWidth(rw);
    fit(this.away, 11, u).setPosition(win.W / 2, win.H / 2);
    this.refresh(true);
  }
}
