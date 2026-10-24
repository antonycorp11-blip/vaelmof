import Phaser from 'phaser';
import { TILE } from '../config';
import { ITEMS, REGION_NAME, type Region } from '../data/items';
import { SKIN_CELL, SKIN_FOOT, SKINS } from '../data/skins';
import type { WorldScene } from '../scenes/WorldScene';
import type { SoldierType } from './Army';
import type { City } from './Cities';

/** Preço base por unidade de material. */
const BASE: Record<string, number> = { wood: 1, stone: 1, fiber: 1, fruit: 1, ice: 2, ore: 4, crystal: 8, egg: 400 };
/** Peças: base (comum) e por raridade. */
const GEAR_PRICE = [15, 80, 250, 700, 2000];
/** Caixa de cada mercador (ouro que ele pode pagar) e quanto renova por minuto. */
const PURSE = 2500;
const PURSE_REFILL = 80;
const SAVE_KEY = 'vaelmor.market.v1';

/** Região de cada bioma (a de Vale e Greenland é green). */
const BIOME_REGION: Region[] = ['green', 'green', 'snow', 'block', 'black', 'dust'];

export interface Offer {
  id: string;
  name: string;
  desc: string;
  price: number;
  buy: (w: WorldScene) => string;
}

const merc = (type: SoldierType, n: number, price: number, name: string): Offer => ({
  id: `merc-${type}`,
  name: `${n} mercenários: ${name}`,
  desc: 'Entram no exército na hora (dentro do limite da patente).',
  price,
  buy: (w) => {
    const a = w.army;
    const room = w.progress.armyCap - a.size;
    if (room <= 0) return `Sua patente comanda até ${w.progress.armyCap} soldados`;
    a.prepare(() => a.recruit(type, Math.min(n, room), true));
    return '';
  },
});

export const OFFERS: Offer[] = [
  {
    id: 'recruits',
    name: '15 recrutas para o quartel',
    desc: 'Enchem a reserva de recrutas (para recrutar no quartel ou na sede).',
    price: 120,
    buy: (w) => {
      if (w.army.pool >= w.army.poolMax) return 'A reserva de recrutas já está cheia';
      w.army.pool = Math.min(w.army.poolMax, w.army.pool + 15);
      w.army.emit('change');
      return '';
    },
  },
  merc('sword', 5, 220, 'Lâminas do Vale'),
  merc('bow', 5, 240, 'Flechas Cinzentas'),
  merc('greatsword', 3, 300, 'Quebra-Escudos'),
];

/**
 * Mercadores das cidades: compram material da coleta (mais caro quando vem de
 * outra região — vale levar madeira de Snowland para vender em Dustland),
 * peças de equipamento e saque, e vendem recrutas e mercenários. Cada um tem
 * um caixa que renova devagar: dá para ganhar ouro, mas não à vontade.
 */
export class Market extends Phaser.Events.EventEmitter {
  private purse = new Map<string, number>();
  private sprites: Phaser.GameObjects.GameObject[] = [];
  /** Onde fica cada mercador (para o botão de ação). */
  private spots: { x: number; y: number }[] = [];

  /** Há um mercador a até `r` px? */
  merchantNear(x: number, y: number, r = 30): boolean {
    return this.spots.some((p) => Math.abs(p.x - x) < r && Math.abs(p.y - y) < r);
  }

  constructor(private scene: WorldScene) {
    super();
    this.load();
  }

  /** Cidade onde o herói está (onde há mercador). */
  cityHere(): City | undefined {
    const p = this.scene.player;
    const tx = p.x / TILE;
    const ty = p.y / TILE;
    return this.scene.map.cities.find((c) => tx >= c.x0 && tx <= c.x1 && ty >= c.y0 && ty <= c.y1);
  }

  purseOf(c: City) {
    return Math.floor(this.purse.get(c.name) ?? PURSE);
  }

  /** Quanto este mercador paga por uma unidade do item. */
  price(itemId: string, c: City, level = 0): number {
    const d = ITEMS[itemId];
    if (!d) return 0;
    if (d.equip) return GEAR_PRICE[d.tier ?? 0] + Math.max(0, level) * (20 + (d.tier ?? 0) * 35);
    const base = BASE[d.family] ?? 1;
    // material de outra região vale o dobro aqui
    const here = BIOME_REGION[c.biome];
    return !d.region || d.region === here ? base : base * 2;
  }

  /** Vende `qty` do espaço `i` da mochila. Devolve o motivo se não der. */
  sell(i: number, qty: number): string {
    const c = this.cityHere();
    if (!c) return 'Venda numa cidade, com o mercador';
    const inv = this.scene.inventory;
    const st = inv.slots[i];
    if (!st) return '';
    const d = ITEMS[st.id];
    if (d.equip && (inv.gear.weapon === st.id || inv.gear.armor === st.id)) return 'Tire o item antes de vender';
    const each = this.price(st.id, c, inv.levelOf(st));
    const purse = this.purseOf(c);
    const k = Math.min(qty, st.qty, each > 0 ? Math.floor(purse / each) : 0);
    if (k <= 0) return `O mercador de ${c.name} está sem ouro (volta aos poucos)`;
    inv.removeAt(i, k);
    const gold = k * each;
    this.purse.set(c.name, purse - gold);
    this.scene.hq.addGold(gold);
    this.save();
    this.emit('change');
    return `Vendeu ${k} × ${d.name} por ${gold} ouro`;
  }

  buy(o: Offer): string {
    const c = this.cityHere();
    if (!c) return 'Compre numa cidade';
    const hq = this.scene.hq;
    if (hq.gold < o.price) return `Faltam ${o.price - hq.gold} de ouro`;
    const why = o.buy(this.scene);
    if (why) return why;
    hq.addGold(-o.price);
    this.purse.set(c.name, this.purseOf(c) + Math.round(o.price * 0.5));
    this.save();
    this.emit('change');
    return `Comprou: ${o.name}`;
  }

  /** Nomes das regiões, para a tela. */
  regionName(c: City) {
    return REGION_NAME[BIOME_REGION[c.biome]];
  }

  // ------------------------------------------------------------ mundo
  /** Um mercador na praça de cada cidade, com o nome em cima. */
  placeMerchants() {
    const s = this.scene;
    for (const o of this.sprites) o.destroy();
    this.sprites = [];
    this.spots = this.scene.map.cities.map((c) => ({ x: (c.cx + 3) * TILE + 8, y: (c.cy + 3) * TILE + 8 }));
    // cada cidade com o seu mercador (roupa, rosto e chapéu próprios)
    const keys = SKINS.merchants.map((k) => `sk-${k}`);
    s.army.need(keys, () => {
      s.map.cities.forEach((c, i) => {
        const key = keys[i % keys.length];
        const x = (c.cx + 3) * TILE + 8;
        const y = (c.cy + 3) * TILE + 8;
        const spr = s.add.sprite(x, y, key, 0).setOrigin(0.5, SKIN_FOOT / SKIN_CELL).setScale(s.army.scale).setDepth(10 + y);
        const lab = s.add.text(x, y - 32, 'Mercador', { fontFamily: 'Tiny5, monospace', fontSize: '7px', color: '#ffd77a', stroke: '#1e1a24', strokeThickness: 2 }).setOrigin(0.5).setResolution(4).setDepth(4240);
        this.sprites.push(spr, lab);
      });
    });
  }

  update(delta: number) {
    for (const c of this.scene.map.cities) {
      const v = this.purse.get(c.name);
      if (v !== undefined && v < PURSE) this.purse.set(c.name, Math.min(PURSE, v + (PURSE_REFILL * delta) / 60000));
    }
  }

  // ------------------------------------------------------------ salvar
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify([...this.purse.entries()]));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) this.purse = new Map(JSON.parse(raw));
    } catch {
      /* começa com o caixa cheio */
    }
  }
}

