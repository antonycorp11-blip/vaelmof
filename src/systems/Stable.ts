import Phaser from 'phaser';
import { MOUNTS, type MountDef } from '../data/mounts';
import type { WorldScene } from '../scenes/WorldScene';

const SAVE_KEY = 'vaelmor.stable.v1';

/**
 * Estábulo do herói: as montarias que ele tem, a escolhida e se está montado.
 * Os estábulos das cidades vendem as da região; as raras e lendárias só caem
 * de personagens (campeões, líderes de clã, procurados fortes).
 */
export class Stable extends Phaser.Events.EventEmitter {
  owned = new Set<string>();
  active: string | null = null;
  riding = false;
  /** Montarias ganhas e ainda não vistas no estábulo (selo NOVA no menu). */
  unseen = new Set<string>();

  constructor(private scene: WorldScene) {
    super();
    this.load();
  }

  get mount(): MountDef | null {
    return this.active ? MOUNTS[this.active] : null;
  }

  /** Montarias à venda na cidade em que o herói está. */
  forSale(): MountDef[] {
    const c = this.scene.market.cityHere();
    if (!c) return [];
    return Object.values(MOUNTS).filter((m) => m.price > 0 && (!m.biomes.length || m.biomes.includes(c.biome)));
  }

  buy(id: string): string {
    const m = MOUNTS[id];
    if (!m || !m.price) return '';
    if (!this.forSale().includes(m)) return 'Este estábulo não vende esta montaria';
    if (this.owned.has(id)) return 'Você já tem esta montaria';
    const hq = this.scene.hq;
    if (hq.gold < m.price) return `Faltam ${m.price - hq.gold} de ouro`;
    hq.addGold(-m.price);
    this.give(id, false);
    return `Comprou: ${m.name}`;
  }

  /** Ganha uma montaria (compra ou saque). */
  give(id: string, loot = true) {
    const m = MOUNTS[id];
    if (!m) return;
    const isNew = !this.owned.has(id);
    this.owned.add(id);
    if (!this.active) this.active = id;
    if (isNew) this.unseen.add(id);
    this.save();
    this.emit('change');
    // ganhar uma montaria é um momento: cartão com o retrato e MONTAR AGORA (UIScene)
    if (loot && isNew) this.emit('new-mount', id);
  }

  choose(id: string) {
    if (!this.owned.has(id)) return;
    this.active = id;
    if (this.riding) this.scene.player.setMount(MOUNTS[id]);
    this.save();
    this.emit('change');
  }

  /** O estábulo foi aberto: as novas já foram vistas. */
  markSeen() {
    if (!this.unseen.size) return;
    this.unseen.clear();
    this.save();
    this.emit('change');
  }

  /** Monta ou desmonta. Devolve o motivo se não der. */
  toggle(): string {
    const p = this.scene.player;
    if (!this.active) return 'Você ainda não tem montaria: compre num estábulo (mercado das cidades)';
    if (p.dead) return '';
    this.riding = !this.riding;
    p.setMount(this.riding ? MOUNTS[this.active] : null);
    this.save();
    this.emit('change');
    return '';
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ owned: [...this.owned], active: this.active, riding: this.riding, unseen: [...this.unseen] }));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.owned = new Set((d.owned ?? []).filter((id: string) => MOUNTS[id]));
      this.active = d.active && MOUNTS[d.active] ? d.active : null;
      this.riding = !!d.riding && !!this.active;
      this.unseen = new Set((d.unseen ?? []).filter((id: string) => this.owned.has(id)));
    } catch {
      /* sem save */
    }
  }
}
