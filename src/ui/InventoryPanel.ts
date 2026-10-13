import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import { Inventory } from '../systems/Inventory';

/**
 * Mochila (estilo Albion, sem slots de equipamento): grade de 8×6, ícone e
 * quantidade de cada pilha, peso total com a carga máxima. Tocar num espaço
 * mostra o nome do item.
 */
export class InventoryPanel {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private title: Phaser.GameObjects.Text;
  private weight: Phaser.GameObjects.Text;
  private detail: Phaser.GameObjects.Text;
  private close: Phaser.GameObjects.Text;
  private cells: { box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; qty: Phaser.GameObjects.Text }[] = [];
  private selected = -1;
  open = false;
  private u = 1;

  constructor(
    private scene: Phaser.Scene,
    private inv: Inventory,
  ) {
    const style = { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', fontStyle: 'bold' };
    this.root = scene.add.container(0, 0).setDepth(2200).setVisible(false);
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x0b0a12, 0.9).setOrigin(0).setStrokeStyle(1, 0xffe9a8, 0.5).setInteractive();
    this.title = scene.add.text(0, 0, 'MOCHILA', { ...style, color: '#ffe9a8' });
    this.weight = scene.add.text(0, 0, '', style).setOrigin(1, 0);
    this.detail = scene.add.text(0, 0, 'toque num item para ver o nome', { ...style, fontSize: '10px', color: '#c8c0d8' });
    this.close = scene.add.text(0, 0, ' X ', { ...style, backgroundColor: '#7a1f2a', padding: { x: 4, y: 2 } }).setInteractive({ useHandCursor: true });
    this.close.on('pointerdown', () => this.setOpen(false));
    this.root.add([this.bg, this.title, this.weight, this.detail, this.close]);
    for (let i = 0; i < Inventory.SLOTS; i++) {
      const box = scene.add.rectangle(0, 0, 10, 10, 0x2a2234, 0.95).setOrigin(0).setStrokeStyle(1, 0x5a4c6a, 1).setInteractive();
      const icon = scene.add.image(0, 0, 'items', 0).setVisible(false);
      const qty = scene.add.text(0, 0, '', { ...style, fontSize: '9px', stroke: '#0b0a12', strokeThickness: 3 }).setOrigin(1, 1);
      box.on('pointerdown', () => this.select(i));
      this.root.add([box, icon, qty]);
      this.cells.push({ box, icon, qty });
    }
    inv.on('change', () => this.refresh());
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

  private refresh() {
    const inv = this.inv;
    this.cells.forEach((c, i) => {
      const s = inv.slots[i];
      c.box.setStrokeStyle(Math.max(1, this.u), i === this.selected ? 0xffe9a8 : 0x5a4c6a, 1);
      if (!s) {
        c.icon.setVisible(false);
        c.qty.setText('');
        return;
      }
      c.icon.setVisible(true).setFrame(ITEMS[s.id].icon);
      c.qty.setText(String(s.qty));
    });
    const w = inv.weight;
    const over = w > Inventory.MAX_WEIGHT;
    this.weight.setText(`${w.toFixed(1)} / ${Inventory.MAX_WEIGHT} kg`).setColor(over ? '#ff8080' : '#ffffff');
    const s = this.selected >= 0 ? inv.slots[this.selected] : null;
    if (s) {
      const d = ITEMS[s.id];
      this.detail.setText(`${d.name} · ${s.qty} un · ${(d.weight * s.qty).toFixed(1)} kg`).setColor('#ffffff');
    } else this.detail.setText(over ? 'carga acima do máximo: Teren fica mais lento' : 'toque num item para ver o nome').setColor(over ? '#ff8080' : '#c8c0d8');
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const cols = 8;
    const rows = Inventory.SLOTS / cols;
    const pad = 10 * u;
    const head = 26 * u;
    const foot = 22 * u;
    const cell = Math.floor(Math.min((width * 0.62 - pad * 2) / cols, (height * 0.8 - head - foot - pad * 2) / rows));
    const W = cell * cols + pad * 2;
    const H = cell * rows + head + foot + pad * 2;
    this.root.setPosition(Math.round((width - W) / 2), Math.round((height - H) / 2));
    this.bg.setSize(W, H);
    this.title.setFontSize(Math.round(12 * u)).setPosition(pad, pad);
    this.close.setFontSize(Math.round(11 * u)).setPosition(W - pad - this.close.width, pad - 2 * u);
    this.weight.setFontSize(Math.round(11 * u)).setPosition(W - pad - this.close.width - 8 * u, pad);
    this.detail.setFontSize(Math.round(10 * u)).setPosition(pad, H - pad - foot + 6 * u);
    this.cells.forEach((c, i) => {
      const x = pad + (i % cols) * cell;
      const y = pad + head + Math.floor(i / cols) * cell;
      c.box.setPosition(x + 1, y + 1).setSize(cell - 2, cell - 2);
      c.icon.setPosition(x + cell / 2, y + cell / 2).setScale((cell * 0.62) / 16);
      c.qty.setFontSize(Math.round(9 * u)).setStroke('#0b0a12', 3 * u).setPosition(x + cell - 3 * u, y + cell - 2 * u);
    });
    this.refresh();
  }
}
