import Phaser from 'phaser';
import { ITEMS } from '../data/items';

export interface ItemStack {
  id: string;
  qty: number;
}

/**
 * Mochila no estilo Albion (sem slots de equipamento por enquanto): 48 espaços,
 * pilhas de até 999, peso total. Acima da carga máxima o herói fica mais lento.
 * Emite 'change' a cada alteração (a UI escuta).
 */
export class Inventory extends Phaser.Events.EventEmitter {
  static readonly SLOTS = 48;
  static readonly STACK = 999;
  static readonly MAX_WEIGHT = 300;
  readonly slots: (ItemStack | null)[] = Array(Inventory.SLOTS).fill(null);

  /** Adiciona; devolve quanto coube. */
  add(id: string, qty: number): number {
    let left = qty;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.qty < Inventory.STACK) {
        const k = Math.min(left, Inventory.STACK - s.qty);
        s.qty += k;
        left -= k;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const k = Math.min(left, Inventory.STACK);
      this.slots[i] = { id, qty: k };
      left -= k;
    }
    if (left !== qty) this.emit('change');
    return qty - left;
  }

  count(id: string): number {
    return this.slots.reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);
  }

  get weight(): number {
    return this.slots.reduce((w, s) => w + (s ? ITEMS[s.id].weight * s.qty : 0), 0);
  }

  /** Multiplicador de velocidade pela carga: 100% até a carga máxima, cai até 40% em 150%. */
  get speedFactor(): number {
    const k = this.weight / Inventory.MAX_WEIGHT;
    if (k <= 1) return 1;
    return Math.max(0.4, 1 - (k - 1) * 1.2);
  }
}
