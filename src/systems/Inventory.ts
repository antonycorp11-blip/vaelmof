import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import type { OutfitId, WeaponId } from '../entities/heroSheets';

const SAVE_KEY = 'vaelmor.inv.v1';

export interface ItemStack {
  id: string;
  qty: number;
}

/**
 * Mochila no estilo Albion: 48 espaços,
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
  /** Item exato equipado (a peça rara, com raridade, tom e brilho). */
  gear = { weapon: 'weapon_sword', armor: 'armor_leather' };
  /** Requisitos de atributo: devolve o que falta para usar o item ('' = pode). */
  missing: (id: string) => string = () => '';
  /** Carga extra (kg) dada pela Força. */
  extraWeight = 0;

  get maxWeight(): number {
    return Inventory.MAX_WEIGHT + this.extraWeight;
  }

  /**
   * Equipa o item do espaço `i`: ele sai da mochila e o que estava equipado
   * entra no lugar. Emite 'equip' (tipo, id).
   */
  equipAt(i: number): boolean {
    const s = this.slots[i];
    const def = s && ITEMS[s.id];
    if (!def?.equip) return false;
    const need = this.missing(def.id);
    if (need) {
      this.emit('denied', need);
      return false;
    }
    const e = def.equip;
    const old = this.gear[e.kind];
    if (e.kind === 'weapon') this.equipped.weapon = e.id;
    else this.equipped.armor = e.id;
    this.gear[e.kind] = def.id;
    this.slots[i] = { id: old, qty: 1 };
    this.emit('change');
    this.emit('equip', e.kind, e.id, def.id);
    this.save();
    return true;
  }

  /** Próxima arma da mochila que dá para usar (atalho Q). */
  nextWeaponSlot(): number {
    return this.slots.findIndex((s) => !!s && ITEMS[s.id].equip?.kind === 'weapon' && !this.missing(s.id));
  }

  /**
   * Tira o que não cumpre mais os requisitos (ex.: atributos zerados) e volta
   * para a espada / o traje de couro, que não exigem nada.
   */
  enforce() {
    const fix = (kind: 'weapon' | 'armor', base: string) => {
      const cur = this.gear[kind];
      if (!this.missing(cur)) return;
      const i = this.slots.findIndex((s) => s?.id === `${kind}_${base}`);
      if (i >= 0) this.equipAt(i);
    };
    fix('weapon', 'sword');
    fix('armor', 'leather');
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
    if (left !== qty) {
      this.emit('change');
      this.save();
    }
    return qty - left;
  }

  /** Quanto há de uma família de material, de qualquer região (madeira, pedra…). */
  countFamily(f: string): number {
    return this.slots.reduce((n, s) => n + (s && ITEMS[s.id].family === f ? s.qty : 0), 0);
  }

  /** Gasta `n` de uma família (de qualquer região). Devolve false se faltar. */
  removeFamily(f: string, n: number): boolean {
    if (this.countFamily(f) < n) return false;
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || ITEMS[s.id].family !== f) continue;
      const k = Math.min(left, s.qty);
      s.qty -= k;
      left -= k;
      if (!s.qty) this.slots[i] = null;
    }
    this.emit('change');
    this.save();
    return true;
  }

  count(id: string): number {
    return this.slots.reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);
  }

  get weight(): number {
    const eq = ITEMS[this.gear.weapon].weight + ITEMS[this.gear.armor].weight;
    return eq + this.slots.reduce((w, s) => w + (s ? ITEMS[s.id].weight * s.qty : 0), 0);
  }

  /** Multiplicador de velocidade pela carga: 100% até a carga máxima, cai até 40% em 150%. */
  get speedFactor(): number {
    const k = this.weight / this.maxWeight;
    if (k <= 1) return 1;
    return Math.max(0.4, 1 - (k - 1) * 1.2);
  }

  /** Tira `qty` do item (coleta gasta na sede, etc.). */
  remove(id: string, qty: number): number {
    let left = qty;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(left, s.qty);
      s.qty -= k;
      left -= k;
      if (!s.qty) this.slots[i] = null;
    }
    if (left !== qty) {
      this.emit('change');
      this.save();
    }
    return qty - left;
  }

  // ---------------------------------------------------------------- salvar
  private saveAt = 0;
  save() {
    // a coleta chama muito: grava no máximo a cada 1,5 s
    const now = performance.now();
    if (now - this.saveAt < 1500) {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.save(), 1600);
      return;
    }
    this.saveAt = now;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ slots: this.slots, gear: this.gear }));
    } catch {
      /* sem espaço */
    }
  }
  private saveTimer?: ReturnType<typeof setTimeout>;

  /** Carrega a mochila salva; devolve false se não havia save. */
  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      (d.slots as (ItemStack | null)[]).forEach((st, i) => {
        if (i < Inventory.SLOTS) this.slots[i] = st && ITEMS[st.id] ? { id: st.id, qty: st.qty } : null;
      });
      for (const kind of ['weapon', 'armor'] as const) {
        const id = d.gear?.[kind];
        const def = id && ITEMS[id];
        if (def?.equip?.kind !== kind) continue;
        this.gear[kind] = id;
        if (def.equip.kind === 'weapon') this.equipped.weapon = def.equip.id;
        else this.equipped.armor = def.equip.id;
      }
      return true;
    } catch {
      return false;
    }
  }

  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignora */
    }
  }
}
