import Phaser from 'phaser';
import { Button, Window } from './kit';

export type MoreDestination = 'hq' | 'market' | 'forge' | 'stable' | 'clans' | 'settings' | 'debug';

const ITEMS: { id: MoreDestination; label: string; icon: number; color: 'dark' | 'red' }[] = [
  { id: 'hq', label: 'SEDE DO CLÃ', icon: 23, color: 'dark' },
  { id: 'market', label: 'MERCADO', icon: 22, color: 'dark' },
  { id: 'forge', label: 'FORJA RÚNICA', icon: 25, color: 'dark' },
  { id: 'stable', label: 'ESTÁBULO', icon: 26, color: 'dark' },
  { id: 'clans', label: 'CLÃS', icon: 19, color: 'dark' },
  { id: 'settings', label: 'CONFIGURAÇÕES', icon: 13, color: 'dark' },
  { id: 'debug', label: 'DEBUG', icon: 4, color: 'red' },
];

/** Atalhos menos usados, agrupados para a barra superior não ocupar a tela. */
export class MorePanel {
  private win: Window;
  private buttons: Button[];
  private u = 1;
  onOpen?: (id: MoreDestination) => void;

  constructor(scene: Phaser.Scene) {
    this.win = new Window(scene, 'OUTROS MENUS', 13, () => this.setOpen(false));
    this.win.sub.setText('Sede, comércio, forja, montarias, clãs e opções');
    this.buttons = ITEMS.map((item) =>
      new Button(scene, {
        label: item.label,
        icon: item.icon,
        color: item.color,
        size: 11,
        onTap: () => {
          this.setOpen(false);
          this.onOpen?.(item.id);
        },
      }).addTo(this.win.root),
    );
  }

  get open() {
    return this.win.open;
  }

  contains(x: number, y: number) {
    return this.win.contains(x, y);
  }

  setOpen(on: boolean) {
    this.win.setOpen(on);
    if (on) this.layout(this.u);
  }

  toggle() {
    this.setOpen(!this.open);
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.win.root.scene.scale;
    this.win.place(u, Math.min(width * 0.9, 460 * u), Math.min(height * 0.88, 260 * u));
    const pad = this.win.pad;
    const top = this.win.head + pad / 2;
    const gap = 8 * u;
    const bw = (this.win.W - pad * 2 - gap) / 2;
    const bh = 42 * u;
    this.buttons.forEach((button, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      button.place(pad + col * (bw + gap), top + row * (bh + gap), u, bw, bh);
    });
  }
}
