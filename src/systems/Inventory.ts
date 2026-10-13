import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import type { OutfitId, WeaponId } from '../entities/heroSheets';

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
  /** Equipado (fora da mochila): uma arma e uma armadura completa. */
  equipped: { weapon: WeaponId; armor: OutfitId } = { weapon: 'sword', armor: 'leather' };

  /**
   * Equipa o item do espaço `i`: ele sai da mochila e o que estava equipado
   * entra no lugar. Emite 'equip' (tipo, id).
   */
  equipAt(i: number): boolean {
    const s = this.slots[i];
    const def = s && ITEMS[s.id];
    if (!def?.equip) return false;
    const e = def.equip;
    const old = e.kind === 'weapon' ? `weapon_${this.equipped.weapon}` : `armor_${this.equipped.armor}`;
    if (e.kind === 'weapon') this.equipped.weapon = e.id;
    else this.equipped.armor = e.id;
    this.slots[i] = { id: old, qty: 1 };
    this.emit('change');
    this.emit('equip', e.kind, e.id);
    return true;
  }

  /** Próxima arma da mochila (atalho Q / botão de classe). */
  nextWeaponSlot(): number {
    return this.slots.findIndex((s) => !!s && ITEMS[s.id].equip?.kind === 'weapon');
  }

  /** Adiciona; devolve quanto coube. Equipamentos não empilham. */
  add(id: string, qty: number): number {
    let left = qty;
    const stack = ITEMS[id].equip ? 1 : Inventory.STACK;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.qty < stack) {
        const k = Math.min(left, stack - s.qty);
        s.qty += k;
        left -= k;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const k = Math.min(left, stack);
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
    const eq = ITEMS[`weapon_${this.equipped.weapon}`].weight + ITEMS[`armor_${this.equipped.armor}`].weight;
    return eq + this.slots.reduce((w, s) => w + (s ? ITEMS[s.id].weight * s.qty : 0), 0);
  }

  /** Multiplicador de velocidade pela carga: 100% até a carga máxima, cai até 40% em 150%. */
  get speedFactor(): number {
    const k = this.weight / Inventory.MAX_WEIGHT;
    if (k <= 1) return 1;
    return Math.max(0.4, 1 - (k - 1) * 1.2);
  }
}
