import Phaser from 'phaser';
import { ITEMS, type ItemDef } from '../data/items';
import { Inventory } from '../systems/Inventory';

type Icon = Phaser.GameObjects.Image;

/**
 * Mochila (estilo Albion): à esquerda o equipamento — uma arma (que define a
 * classe) e uma armadura completa (corpo inteiro) —, à direita a grade de 8×6
 * com ícone e quantidade de cada pilha e o peso total. Tocar num item mostra
 * nome e atributos; armas e armaduras ganham o botão EQUIPAR.
 */
export class InventoryPanel {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private title: Phaser.GameObjects.Text;
  private weight: Phaser.GameObjects.Text;
  private detail: Phaser.GameObjects.Text;
  private close: Phaser.GameObjects.Text;
  private equipBtn: Phaser.GameObjects.Text;
  private eqLabel: Phaser.GameObjects.Text;
  private eq: { box: Phaser.GameObjects.Rectangle; icon: Icon; label: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text }[] = [];
  private cells: { box: Phaser.GameObjects.Rectangle; icon: Icon; qty: Phaser.GameObjects.Text }[] = [];
  private selected = -1;
  open = false;
  private u = 1;
  private cell = 20;

  constructor(
    private scene: Phaser.Scene,
    private inv: Inventory,
  ) {
    const style = { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', fontStyle: 'bold' };
    this.root = scene.add.container(0, 0).setDepth(2200).setVisible(false);
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x0b0a12, 0.92).setOrigin(0).setStrokeStyle(1, 0xffe9a8, 0.5).setInteractive();
    this.title = scene.add.text(0, 0, 'MOCHILA', { ...style, color: '#ffe9a8' });
    this.weight = scene.add.text(0, 0, '', style).setOrigin(1, 0);
    this.detail = scene.add.text(0, 0, '', { ...style, fontSize: '10px', color: '#c8c0d8' });
    this.close = scene.add.text(0, 0, ' X ', { ...style, backgroundColor: '#7a1f2a', padding: { x: 6, y: 4 } }).setInteractive({ useHandCursor: true });
    this.close.on('pointerdown', () => this.setOpen(false));
    this.equipBtn = scene.add.text(0, 0, 'EQUIPAR', { ...style, backgroundColor: '#2e7a3a', padding: { x: 8, y: 5 } }).setInteractive({ useHandCursor: true }).setVisible(false);
    this.equipBtn.on('pointerdown', () => {
      if (this.selected >= 0 && this.inv.equipAt(this.selected)) this.refresh();
    });
    this.eqLabel = scene.add.text(0, 0, 'EQUIPADO', { ...style, fontSize: '10px', color: '#ffe9a8' });
    this.root.add([this.bg, this.title, this.weight, this.detail, this.close, this.equipBtn, this.eqLabel]);
    for (const label of ['ARMA', 'ARMADURA']) {
      const box = scene.add.rectangle(0, 0, 10, 10, 0x2a2234, 0.95).setOrigin(0).setStrokeStyle(1, 0xffe9a8, 0.7);
      const icon = scene.add.image(0, 0, 'items', 0);
      const l = scene.add.text(0, 0, label, { ...style, fontSize: '9px', color: '#c8c0d8' });
      const name = scene.add.text(0, 0, '', { ...style, fontSize: '9px', wordWrap: { width: 80 } });
      this.root.add([box, icon, l, name]);
      this.eq.push({ box, icon, label: l, name });
    }
    for (let i = 0; i < Inventory.SLOTS; i++) {
      const box = scene.add.rectangle(0, 0, 10, 10, 0x2a2234, 0.95).setOrigin(0).setStrokeStyle(1, 0x5a4c6a, 1).setInteractive();
      const icon = scene.add.image(0, 0, 'items', 0).setVisible(false);
      const qty = scene.add.text(0, 0, '', { ...style, fontSize: '9px', stroke: '#0b0a12', strokeThickness: 3 }).setOrigin(1, 1);
      box.on('pointerdown', () => this.select(i));
      this.root.add([box, icon, qty]);
      this.cells.push({ box, icon, qty });
    }
    inv.on('change', () => this.refresh());
    inv.on('denied', () => this.refresh());
    this.refresh();
  }

  contains(x: number, y: number): boolean {
    return this.open && this.bg.getBounds().contains(x, y);
  }

  setOpen(on: boolean) {
    this.open = on;
    this.root.setVisible(on);
    this.selected = -1;
    this.refresh();
  }

  toggle() {
    this.setOpen(!this.open);
  }

  private select(i: number) {
    this.selected = i;
    this.refresh();
  }

  /** Ícone do item na folha certa e no tamanho da célula. */
  private setIcon(icon: Icon, def: ItemDef, size: number) {
    const sheet = def.sheet ?? 'items';
    icon.setTexture(sheet, def.icon).setVisible(true);
    const h = sheet === 'armor-icons' ? 54 : 16;
    icon.setScale((size * (sheet === 'armor-icons' ? 0.86 : 0.62)) / h);
  }

  refresh() {
    const inv = this.inv;
    this.cells.forEach((c, i) => {
      const s = inv.slots[i];
      c.box.setStrokeStyle(Math.max(1, this.u), i === this.selected ? 0xffe9a8 : 0x5a4c6a, 1);
      if (!s) {
        c.icon.setVisible(false);
        c.qty.setText('');
        return;
      }
      this.setIcon(c.icon, ITEMS[s.id], this.cell);
      c.qty.setText(s.qty > 1 ? String(s.qty) : '');
    });
    const eqIds = [`weapon_${inv.equipped.weapon}`, `armor_${inv.equipped.armor}`];
    this.eq.forEach((e, i) => {
      const def = ITEMS[eqIds[i]];
      this.setIcon(e.icon, def, this.cell * 1.6);
      e.name.setText(def.name);
    });
    const w = inv.weight;
    const over = w > inv.maxWeight;
    this.weight.setText(`${w.toFixed(1)} / ${Math.round(inv.maxWeight)} kg`).setColor(over ? '#ff8080' : '#ffffff');
    const s = this.selected >= 0 ? inv.slots[this.selected] : null;
    const d = s ? ITEMS[s.id] : null;
    const need = d?.equip ? inv.missing(d.id) : '';
    if (s && d) {
      const extra = d.info ? ` · ${d.info}` : '';
      const req = need ? ` · ${need}` : '';
      this.detail.setText(`${d.name}${s.qty > 1 ? ` · ${s.qty} un` : ''}${extra} · ${(d.weight * s.qty).toFixed(1)} kg${req}`).setColor(need ? '#ff9a80' : '#ffffff');
    } else
      this.detail
        .setText(over ? 'carga acima do máximo: Teren fica mais lento' : 'toque num item para ver; armas e armaduras podem ser equipadas')
        .setColor(over ? '#ff8080' : '#c8c0d8');
    this.equipBtn.setVisible(!!d?.equip).setText(need ? 'BLOQUEADO' : 'EQUIPAR').setBackgroundColor(need ? '#5a4c6a' : '#2e7a3a');
    // itens que o herói ainda não pode usar ficam apagados
    this.cells.forEach((c, i) => {
      const id = inv.slots[i]?.id;
      const locked = !!id && !!ITEMS[id].equip && !!inv.missing(id);
      c.icon.setAlpha(locked ? 0.4 : 1);
      if (locked && i !== this.selected) c.box.setStrokeStyle(Math.max(1, this.u), 0x8a3a3a, 1);
    });
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const cols = 8;
    const rows = Inventory.SLOTS / cols;
    const pad = 10 * u;
    const head = 28 * u;
    const foot = 30 * u;
    const side = 96 * u; // coluna do equipamento
    const cell = Math.floor(Math.min((width * 0.8 - side - pad * 3) / cols, (height * 0.84 - head - foot - pad * 2) / rows));
    this.cell = cell;
    const W = side + cell * cols + pad * 3;
    const H = cell * rows + head + foot + pad * 2;
    this.root.setPosition(Math.round((width - W) / 2), Math.round((height - H) / 2));
    this.bg.setSize(W, H);
    this.title.setFontSize(Math.round(12 * u)).setPosition(pad, pad);
    this.close.setFontSize(Math.round(12 * u)).setPadding(Math.round(7 * u), Math.round(4 * u)).setPosition(W - pad - this.close.width, pad - 4 * u);
    this.weight.setFontSize(Math.round(11 * u)).setPosition(W - pad - this.close.width - 8 * u, pad);
    this.detail.setFontSize(Math.round(10 * u)).setWordWrapWidth(W - pad * 3 - 90 * u).setPosition(pad, H - pad - foot + 6 * u);
    this.equipBtn.setFontSize(Math.round(11 * u)).setPadding(Math.round(9 * u), Math.round(6 * u)).setPosition(W - pad - this.equipBtn.width, H - pad - foot + 2 * u);
    this.eqLabel.setFontSize(Math.round(10 * u)).setPosition(pad, pad + head - 4 * u);
    const big = cell * 1.6;
    this.eq.forEach((e, i) => {
      const y = pad + head + 12 * u + i * (big + 34 * u);
      e.box.setPosition(pad, y).setSize(big, big);
      e.icon.setPosition(pad + big / 2, y + big / 2);
      e.label.setFontSize(Math.round(9 * u)).setPosition(pad + big + 6 * u, y);
      e.name.setFontSize(Math.round(9 * u)).setWordWrapWidth(side - big - 8 * u).setPosition(pad + big + 6 * u, y + 13 * u);
    });
    const gx = pad * 2 + side;
    this.cells.forEach((c, i) => {
      const x = gx + (i % cols) * cell;
      const y = pad + head + Math.floor(i / cols) * cell;
      c.box.setPosition(x + 1, y + 1).setSize(cell - 2, cell - 2);
      c.icon.setPosition(x + cell / 2, y + cell / 2);
      c.qty.setFontSize(Math.round(9 * u)).setStroke('#0b0a12', 3 * u).setPosition(x + cell - 3 * u, y + cell - 2 * u);
    });
    this.refresh();
  }
}
