import Phaser from 'phaser';
import { RARITY } from '../data/gear';
import { ITEMS, type ItemDef } from '../data/items';
import { Inventory } from '../systems/Inventory';
import type { Market } from '../systems/Market';
import { Button, COLOR, fit, frame, label, sizeFrame, Window } from './kit';

type Icon = Phaser.GameObjects.Image;
type Slot = Phaser.GameObjects.NineSlice;

/**
 * Mochila (estilo Albion): à esquerda o equipamento — uma arma (que define a
 * classe) e uma armadura completa (corpo inteiro) —, à direita a grade de 8×6
 * com ícone e quantidade de cada pilha e o peso total. Tocar num item mostra
 * nome e atributos; armas e armaduras ganham o botão EQUIPAR.
 */
export class InventoryPanel {
  private win: Window;
  private weight: Phaser.GameObjects.Text;
  private detail: Phaser.GameObjects.Text;
  private equipBtn: Button;
  private sellBtn: Button;
  /** Mercado (para vender direto da mochila quando há mercador por perto). */
  market?: Market;
  private eqLabel: Phaser.GameObjects.Text;
  private eq: { box: Slot; icon: Icon; label: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text }[] = [];
  private cells: { box: Slot; sel: Slot; icon: Icon; qty: Phaser.GameObjects.Text }[] = [];
  private selected = -1;
  private u = 1;
  private cell = 20;

  constructor(
    private scene: Phaser.Scene,
    private inv: Inventory,
  ) {
    this.win = new Window(scene, 'MOCHILA', 0, () => this.setOpen(false));
    this.weight = label(scene, '', 11, COLOR.text).setOrigin(1, 0.5);
    this.detail = label(scene, '', 9, COLOR.dim, 1, false);
    this.equipBtn = new Button(scene, { label: 'EQUIPAR', color: 'green', size: 11, onTap: () => this.equip() });
    this.eqLabel = label(scene, 'EQUIPADO', 10, COLOR.gold);
    this.win.add(this.weight, this.detail, this.eqLabel);
    this.equipBtn.addTo(this.win.root);
    this.sellBtn = new Button(scene, { label: 'VENDER', color: 'gold', size: 10, onTap: () => this.sell() });
    this.sellBtn.addTo(this.win.root);
    for (const name of ['ARMA', 'ARMADURA']) {
      const box = frame(scene, 'frame-hl');
      const icon = scene.add.image(0, 0, 'items', 0);
      const l = label(scene, name, 9, COLOR.dim);
      const n = label(scene, '', 9, COLOR.text, 1, false);
      this.win.add(box, icon, l, n);
      this.eq.push({ box, icon, label: l, name: n });
    }
    for (let i = 0; i < Inventory.SLOTS; i++) {
      const box = frame(scene, 'frame-inner').setInteractive();
      const sel = frame(scene, 'frame-hl').setVisible(false);
      const icon = scene.add.image(0, 0, 'items', 0).setVisible(false);
      const qty = label(scene, '', 9, COLOR.text).setOrigin(1, 1);
      box.on('pointerdown', () => this.select(i));
      this.win.add(box, sel, icon, qty);
      this.cells.push({ box, sel, icon, qty });
    }
    inv.on('change', () => this.refresh());
    inv.on('denied', () => this.refresh());
    this.refresh();
  }

  get open() {
    return this.win.open;
  }

  contains(x: number, y: number): boolean {
    return this.win.contains(x, y);
  }

  setOpen(on: boolean) {
    this.win.setOpen(on);
    this.selected = -1;
    if (on) this.layout(this.u);
  }

  toggle() {
    this.setOpen(!this.open);
  }

  private select(i: number) {
    this.selected = i;
    this.refresh();
  }

  private sell() {
    if (!this.market || this.selected < 0) return;
    const msg = this.market.sell(this.selected, 999);
    this.selected = -1;
    this.refresh();
    this.detail.setText(msg).setColor(msg.startsWith('Vendeu') ? COLOR.green : COLOR.red);
  }

  private equip() {
    if (this.selected >= 0 && this.inv.equipAt(this.selected)) this.refresh();
  }

  /** Ícone do item na folha certa e no tamanho da célula. */
  private setIcon(icon: Icon, def: ItemDef, size: number) {
    const sheet = def.sheet ?? 'items';
    icon.setTexture(sheet, def.icon).setVisible(true);
    const h = sheet === 'armor-icons' ? 54 : 16;
    icon.setScale((size * (sheet === 'armor-icons' ? 0.8 : 0.56)) / h);
    if (def.tint) icon.setTint(def.tint);
    else icon.clearTint();
  }

  refresh() {
    const inv = this.inv;
    this.cells.forEach((c, i) => {
      const s = inv.slots[i];
      c.sel.setVisible(i === this.selected);
      if (!s) {
        c.icon.setVisible(false);
        c.qty.setText('');
        c.box.clearTint();
        return;
      }
      this.setIcon(c.icon, ITEMS[s.id], this.cell);
      c.qty.setText(s.qty > 1 ? String(s.qty) : '');
      // itens que o herói ainda não pode usar ficam apagados, com borda vermelha
      const locked = !!ITEMS[s.id].equip && !!inv.missing(s.id);
      c.icon.setAlpha(locked ? 0.4 : 1);
      // moldura na cor da raridade; vermelha se ainda não dá para usar
      const tier = ITEMS[s.id].tier ?? 0;
      if (locked) c.box.setTint(0xff8080);
      else if (tier) c.box.setTint(RARITY[tier].frame);
      else c.box.clearTint();
    });
    const eqIds = [inv.gear.weapon, inv.gear.armor];
    this.eq.forEach((e, i) => {
      const def = ITEMS[eqIds[i]];
      this.setIcon(e.icon, def, this.cell * 1.6);
      e.name.setText(def.name).setColor(RARITY[def.tier ?? 0].color);
      if (def.tier) e.box.setTint(RARITY[def.tier].frame);
      else e.box.clearTint();
    });
    const w = inv.weight;
    const over = w > inv.maxWeight;
    this.weight.setText(`${w.toFixed(1)} / ${Math.round(inv.maxWeight)} kg`).setColor(over ? COLOR.red : COLOR.text);
    const s = this.selected >= 0 ? inv.slots[this.selected] : null;
    const d = s ? ITEMS[s.id] : null;
    const need = d?.equip ? inv.missing(d.id) : '';
    if (s && d) {
      const extra = d.info ? ` · ${d.info}` : '';
      const req = need ? ` · ${need}` : '';
      this.detail.setText(`${d.name}${s.qty > 1 ? ` · ${s.qty} un` : ''}${extra} · ${(d.weight * s.qty).toFixed(1)} kg${req}`).setColor(need ? COLOR.red : RARITY[d.tier ?? 0].color);
    } else
      this.detail
        .setText(over ? 'Carga acima do máximo: Teren fica mais lento.' : 'Toque num item para ver; armas e armaduras podem ser equipadas.')
        .setColor(over ? COLOR.red : COLOR.dim);
    const city = this.market?.cityHere();
    const price = s && city ? this.market!.price(s.id, city) * s.qty : 0;
    this.sellBtn.setVisible(!!s && !!city && this.open).setLabel(`VENDER ${price}`);
    this.equipBtn.setVisible(!!d?.equip && this.open).setLabel(need ? 'BLOQUEADO' : 'EQUIPAR').setColor(need ? 'dark' : 'green').setEnabled(!need);
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const cols = 8;
    const rows = Inventory.SLOTS / cols;
    const pad = 14 * u;
    const head = 38 * u;
    const foot = 34 * u;
    const side = 110 * u; // coluna do equipamento
    const cell = Math.floor(Math.min((width * 0.9 - side - pad * 3) / cols, (height * 0.92 - head - foot - pad * 2) / rows));
    this.cell = cell;
    const win = this.win;
    win.place(u, side + cell * cols + pad * 3, cell * rows + head + foot + pad * 1.5);
    const top = win.head + pad / 2;
    fit(this.weight, 11, u).setPosition(win.close.x - 10 * u, win.head / 2 + 2 * u);
    fit(this.eqLabel, 10, u).setPosition(pad, top);
    const big = cell * 1.6;
    this.eq.forEach((e, i) => {
      const y = top + 18 * u + i * (big + 36 * u);
      sizeFrame(e.box, pad, y, big, big, u);
      e.icon.setPosition(pad + big / 2, y + big / 2);
      fit(e.label, 9, u).setPosition(pad, y + big + 3 * u);
      fit(e.name, 9, u).setWordWrapWidth(side).setPosition(pad, y + big + 15 * u);
    });
    const gx = pad * 2 + side;
    this.cells.forEach((c, i) => {
      const x = gx + (i % cols) * cell;
      const y = top + Math.floor(i / cols) * cell;
      sizeFrame(c.box, x + 1, y + 1, cell - 2, cell - 2, u);
      sizeFrame(c.sel, x + 1, y + 1, cell - 2, cell - 2, u);
      c.icon.setPosition(x + cell / 2, y + cell / 2);
      fit(c.qty, 9, u).setPosition(x + cell - 4 * u, y + cell - 3 * u);
    });
    const fy = win.H - pad - foot + 6 * u;
    fit(this.detail, 9, u).setWordWrapWidth(win.W - pad * 3 - 230 * u).setPosition(pad, fy);
    this.equipBtn.place(win.W - pad - 110 * u, fy - 2 * u, u, 110 * u, 28 * u);
    this.sellBtn.place(win.W - pad - 226 * u, fy - 2 * u, u, 110 * u, 28 * u);
    this.refresh();
  }
}
