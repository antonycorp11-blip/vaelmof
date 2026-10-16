import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import { MOUNTS, type MountDef } from '../data/mounts';
import type { WorldScene } from '../scenes/WorldScene';
import type { Cost } from './HQ';

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
  /** Rebanho: cópias além da primeira de cada espécie (nascidas da procriação). */
  extra: Record<string, number> = {};
  /** Filhotes a caminho (hora real em que nascem: continua com o jogo fechado). */
  breeding: { id: string; readyAt: number; egg?: boolean }[] = [];

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
    // a única livre está com um cavaleiro: ela volta para você
    if (this.active !== id && this.free(id) <= 0) this.scene.army.recall(id);
    this.active = id;
    if (this.riding) this.scene.player.setMount(MOUNTS[id]);
    this.save();
    this.emit('change');
  }

  // ------------------------------------------------------------ rebanho e procriação
  /** Quantas desta espécie você tem. */
  count(id: string): number {
    return this.owned.has(id) ? 1 + (this.extra[id] ?? 0) : 0;
  }

  /** Livres para um cavaleiro (fora a sua e as que já têm cavaleiro). */
  free(id: string): number {
    return this.count(id) - (this.active === id ? 1 : 0) - this.scene.army.ridersOf(id);
  }

  /** Raridade para a procriação: 0 comum, 1 de guerra/região, 2 rara, 3 lendária. */
  static tier(m: MountDef): number {
    if (!m.price) return m.desc.startsWith('Lendária') ? 3 : 2;
    return m.price >= 1000 ? 1 : 0;
  }

  static breedCost(m: MountDef): Cost {
    return [
      { gold: 150, fiber: 20 },
      { gold: 400, fiber: 40, ore: 10 },
      { gold: 900, fiber: 60, crystal: 20 },
      { gold: 2200, fiber: 80, crystal: 60 },
    ][Stable.tier(m)];
  }

  /** Minutos até o filhote estar pronto para montar. */
  static breedMinutes(m: MountDef): number {
    return [4, 8, 15, 25][Stable.tier(m)];
  }

  /** Baias de procriação: 1, +1 com sede, +1 com o Salão nível 3. */
  get breedSlots(): number {
    const hq = this.scene.hq;
    return 1 + (hq.founded ? 1 : 0) + (hq.founded && hq.level('hall') >= 3 ? 1 : 0);
  }

  breedBlock(id: string): string {
    const m = MOUNTS[id];
    if (!m || !this.owned.has(id)) return 'Você precisa ter esta montaria';
    if (this.breeding.length >= this.breedSlots) return `Baias cheias (${this.breedSlots}); a sede e o Salão nível 3 dão mais`;
    const miss = this.scene.hq.missing(Stable.breedCost(m));
    return miss ? `Faltam ${miss}` : '';
  }

  breed(id: string): string {
    const why = this.breedBlock(id);
    if (why) return why;
    const m = MOUNTS[id];
    const paid = this.scene.hq.spend(Stable.breedCost(m));
    if (paid) return paid;
    this.breeding.push({ id, readyAt: Date.now() + Stable.breedMinutes(m) * 60000 });
    this.save();
    this.emit('change');
    return `Cruzamento começou: um filhote de ${m.name} em ${Stable.breedMinutes(m)} min`;
  }

  /** Ovos de montaria na mochila (id do item). */
  eggs(): string[] {
    const out: string[] = [];
    for (const sl of this.scene.inventory.slots) if (sl && ITEMS[sl.id]?.family === 'egg') for (let i = 0; i < sl.qty; i++) out.push(sl.id);
    return out;
  }

  /**
   * Choca um ovo dos gigantes numa baia (metade do tempo de procriar, sem
   * custo): nasce uma montaria — nova espécie para você, ou mais uma cópia
   * para a cavalaria.
   */
  hatch(): string {
    const egg = this.eggs()[0];
    if (!egg) return 'Nenhum ovo na mochila (os gigantes deixam cair)';
    if (this.breeding.length >= this.breedSlots) return `Baias cheias (${this.breedSlots}); espere um filhote nascer`;
    const id = egg.slice(4);
    const m = MOUNTS[id];
    if (!m) return 'Ovo estranho';
    this.scene.inventory.remove(egg, 1);
    const min = Math.max(2, Math.round(Stable.breedMinutes(m) / 2));
    this.breeding.push({ id, readyAt: Date.now() + min * 60000, egg: true });
    this.save();
    this.emit('change');
    return `O ovo de ${m.name} está chocando: nasce em ${min} min`;
  }

  private checkAt = 0;
  /** Filhotes prontos viram montarias do rebanho. */
  update(time: number) {
    if (time < this.checkAt || !this.breeding.length) return;
    this.checkAt = time + 1000;
    const now = Date.now();
    const born = this.breeding.filter((b) => b.readyAt <= now);
    if (!born.length) return;
    this.breeding = this.breeding.filter((b) => b.readyAt > now);
    for (const b of born) {
      // ovo de uma espécie que você não tinha: ganha a espécie (com o cartão)
      if (!this.owned.has(b.id)) {
        this.give(b.id);
        continue;
      }
      this.extra[b.id] = (this.extra[b.id] ?? 0) + 1;
      this.unseen.add(b.id);
      this.emit('born', b.id);
    }
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
      localStorage.setItem(SAVE_KEY, JSON.stringify({ owned: [...this.owned], active: this.active, riding: this.riding, unseen: [...this.unseen], extra: this.extra, breeding: this.breeding }));
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
      if (d.extra && typeof d.extra === 'object') for (const [k, v] of Object.entries(d.extra)) if (MOUNTS[k] && typeof v === 'number' && v > 0) this.extra[k] = Math.floor(v);
      if (Array.isArray(d.breeding)) this.breeding = d.breeding.filter((b: { id: string; readyAt: number; egg?: boolean }) => MOUNTS[b?.id] && Number.isFinite(b.readyAt));
    } catch {
      /* sem save */
    }
  }
}
