import Phaser from 'phaser';
import { TILE } from '../config';
import { MOUNTS } from '../data/mounts';
import { DEPTH } from '../entities/Creature';
import type { Hittable } from '../entities/Hittable';
import type { WorldScene } from '../scenes/WorldScene';
import type { SoldierType } from './Army';
import type { City } from './Cities';
import type { Clan } from './Clans';
import { HQ_H, HQ_W, type Material } from './HQ';
import { T } from './Tiles';

/** Forte: largura e altura em tiles (muralha incluída) e vão do portão (ao sul). */
export const FORT_W = 16;
export const FORT_H = 12;
const GATE = 4;

type Part = 'gate' | 'hall' | 'tower0' | 'tower1';
const PARTS: Part[] = ['gate', 'hall', 'tower0', 'tower1'];

export interface Fort {
  /** Clã que ergueu o forte (o dono original). */
  clan: string;
  /** Quem manda nele agora: o id de um clã rival ou 'player'. */
  owner: string;
  city: string;
  ox: number;
  oy: number;
  tier: number;
  hp: Record<Part, number>;
  /** Do herói: soldados deixados de guarda. */
  guards?: SoldierType[];
  /** Clã que perdeu o forte para o herói (é quem tenta retomar). */
  lostBy?: string;
}

interface Live {
  fort: Fort;
  parts: Phaser.GameObjects.GameObject[];
  hall: Phaser.GameObjects.Image;
  gate: Phaser.GameObjects.Image;
  towers: Phaser.GameObjects.Image[];
  label: Phaser.GameObjects.Text;
  bars: Phaser.GameObjects.Graphics;
}

const SAVE_KEY = 'vaelmor.forts.v1';
const maxHp = (p: Part, tier: number) => (p === 'hall' ? 500 + tier * 450 : p === 'gate' ? 300 + tier * 220 : 200 + tier * 140);
/** Material que cada povo (bioma da cidade) rende por minuto ao dono do território. */
const REGION_MAT: Material[] = ['wood', 'wood', 'crystal', 'stone', 'ore', 'fiber'];

/** Uma peça do forte que se pode atacar (portão, torres, Salão). */
class FortTarget implements Hittable {
  constructor(
    private forts: Forts,
    readonly fort: Fort,
    readonly part: Part,
  ) {}
  get fx() {
    return this.forts.partPos(this.fort, this.part).x;
  }
  get fy() {
    return this.forts.partPos(this.fort, this.part).y + 4;
  }
  get dead() {
    return this.fort.hp[this.part] <= 0;
  }
  get targetable() {
    return !this.dead;
  }
  takeDamage(amount: number) {
    this.forts.damage(this.fort, this.part, amount);
  }
  stun() {}
  slow() {}
}

/**
 * Fortes dos clãs e territórios. Cada clã rival tem um forte de verdade perto
 * da cidade-sede (muralha, portão, duas torres e o Salão), visível no mapa.
 * O herói cerca o forte com o exército: derruba o portão, enfrenta as torres e
 * a guarnição e, com o Salão no chão (ou a guarnição em fuga), o forte e o
 * território da cidade passam a ser dele — rendendo ouro e material. Os clãs
 * tentam retomar (com aviso e hora marcada); dá para deixar guarda no forte.
 */
export class Forts extends Phaser.Events.EventEmitter {
  forts: Fort[] = [];
  /** Clãs sem forte esperando para erguer outro (relógio dos clãs). */
  private rebuild: { clan: string; at: number }[] = [];
  /** Forte sendo cercado pelo herói, e o forte do herói sendo atacado. */
  siege: Fort | null = null;
  defense: Fort | null = null;
  /** Retomada marcada: um clã marcha contra um forte do herói. */
  retake: { fort: string; clan: string; at: number } | null = null;
  private nextRetake = 0;
  private live = new Map<Fort, Live>();
  private targets = new Map<Fort, FortTarget[]>();
  private towerCd = new Map<string, number>();
  private incomeAt = 0;
  private checkAt = 0;

  constructor(private scene: WorldScene) {
    super();
    this.load();
    this.sync();
    for (const f of this.forts) this.stamp(f);
    // o exército inimigo também ataca os fortes do herói; o do herói, os do inimigo sob cerco
    const army = scene.army;
    const prev = army.structures;
    army.structures = () => [...prev(), ...(this.defense ? this.targetsOf(this.defense) : [])];
    army.siegeTargets = () => (this.siege ? this.targetsOf(this.siege).filter((t) => t.targetable) : []);
    army.on('war-end', (w: { clan?: string; won: boolean; fled?: boolean; killed: number }) => this.onWarEnd(w));
  }

  // ------------------------------------------------------------ consultas
  byClan(id: string) {
    return this.forts.find((f) => f.clan === id && f.owner === id);
  }

  get mine(): Fort[] {
    return this.forts.filter((f) => f.owner === 'player');
  }

  key(f: Fort) {
    return `${f.ox},${f.oy}`;
  }

  center(f: Fort) {
    return { x: (f.ox + FORT_W / 2) * TILE, y: (f.oy + FORT_H / 2) * TILE };
  }

  /** Lado de fora do portão (px). */
  gateOut(f: Fort) {
    return { x: (f.ox + FORT_W / 2) * TILE, y: (f.oy + FORT_H + 1) * TILE };
  }

  partPos(f: Fort, p: Part): { x: number; y: number } {
    const cx = (f.ox + FORT_W / 2) * TILE;
    if (p === 'gate') return { x: cx, y: (f.oy + FORT_H) * TILE };
    if (p === 'hall') return { x: cx, y: (f.oy + 7) * TILE };
    return { x: (f.ox + (p === 'tower0' ? 2.5 : FORT_W - 2.5)) * TILE, y: (f.oy + 4) * TILE };
  }

  /** Cidade (território) de um ponto: a mais próxima. */
  regionOf(x: number, y: number): City {
    let best = this.scene.map.cities[0];
    let bd = Infinity;
    for (const c of this.scene.map.cities) {
      const d = (c.cx * TILE - x) ** 2 + (c.cy * TILE - y) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /** Dono do território de uma cidade: o herói (forte ou sede), o clã mais forte com forte lá, ou ninguém (o Lorde). */
  ownerOf(city: City): string | null {
    const here = this.forts.filter((f) => f.city === city.name);
    if (here.some((f) => f.owner === 'player')) return 'player';
    const hq = this.scene.hq;
    if (hq.founded && this.regionOf(hq.center.x, hq.center.y).name === city.name) return 'player';
    let best: Clan | null = null;
    for (const f of here) {
      const c = this.scene.clans.byId(f.owner);
      if (c && (!best || c.glory > best.glory)) best = c;
    }
    return best?.id ?? null;
  }

  /** Territórios do herói. */
  get territories(): City[] {
    return this.scene.map.cities.filter((c) => this.ownerOf(c) === 'player');
  }

  /** O retângulo (tiles) encosta em algum forte? */
  overlaps(x: number, y: number, w: number, h: number, pad = 4): boolean {
    return this.forts.some((f) => x < f.ox + FORT_W + pad && x + w > f.ox - pad && y < f.oy + FORT_H + pad && y + h > f.oy - pad);
  }

  // ------------------------------------------------------------ fortes dos clãs
  /** Um forte por clã rival (os novos ganham o seu; os desfeitos perdem o que não é do herói). */
  private sync() {
    const C = this.scene.clans;
    for (const f of [...this.forts]) {
      if (f.owner === 'player') continue;
      if (!C.byId(f.owner)) this.removeFort(f);
    }
    for (const c of C.rivals) {
      if (this.byClan(c.id) || this.rebuild.some((r) => r.clan === c.id)) continue;
      const f = this.place(c);
      if (f) {
        this.forts.push(f);
        this.stamp(f);
      }
    }
  }

  /** Acha um lugar plano e seco perto da cidade do clã, fora de estradas, muros e outros fortes. */
  private place(c: Clan): Fort | null {
    const m = this.scene.map;
    const city = m.cities.find((x) => x.name === c.city) ?? m.cities[0];
    let h = 0;
    for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) >>> 0;
    const hq = this.scene.hq;
    for (let k = 0; k < 160; k++) {
      const a = ((h % 360) / 360) * Math.PI * 2 + k * 0.7;
      const r = Math.max(city.x1 - city.x0, city.y1 - city.y0) / 2 + 14 + (k % 8) * 4;
      const ox = Math.round(city.cx + Math.cos(a) * r - FORT_W / 2);
      const oy = Math.round(city.cy + Math.sin(a) * r * 0.8 - FORT_H / 2);
      if (ox < 4 || oy < 4 || ox + FORT_W > m.width - 4 || oy + FORT_H > m.height - 4) continue;
      if (this.overlaps(ox, oy, FORT_W, FORT_H, 6)) continue;
      if (hq.founded && ox < hq.st.ox + HQ_W + 6 && ox + FORT_W > hq.st.ox - 6 && oy < hq.st.oy + HQ_H + 6 && oy + FORT_H > hq.st.oy - 6) continue;
      if (m.cities.some((q) => ox < q.x1 + 5 && ox + FORT_W > q.x0 - 5 && oy < q.y1 + 5 && oy + FORT_H > q.y0 - 5)) continue;
      let bad = false;
      for (let y = oy - 1; y <= oy + FORT_H + 2 && !bad; y++)
        for (let x = ox - 1; x <= ox + FORT_W && !bad; x++) {
          const i = y * m.width + x;
          if (m.water[i] >= 0 || m.cliffs[i] >= 0 || m.road[i]) bad = true;
        }
      if (bad) continue;
      const tier = this.scene.clans.tier(c);
      const hp = Object.fromEntries(PARTS.map((p) => [p, maxHp(p, tier)])) as Record<Part, number>;
      return { clan: c.id, owner: c.id, city: city.name, ox, oy, tier, hp };
    }
    return null;
  }

  private removeFort(f: Fort) {
    this.unrealize(f);
    this.unstamp(f);
    this.forts.splice(this.forts.indexOf(f), 1);
    this.targets.delete(f);
  }

  // ------------------------------------------------------------ chão e muralha
  private wallAt(x: number, y: number): boolean {
    if (y <= 1) return true;
    if (y >= FORT_H - 2) return Math.abs(x + 0.5 - FORT_W / 2) >= GATE / 2 + 0.5;
    return x === 0 || x === FORT_W - 1;
  }

  /** Grava a muralha nos tiles (colisão) e limpa árvores e pedras de dentro. */
  private stamp(f: Fort) {
    const s = this.scene;
    const m = s.map;
    const stone = f.tier >= 2;
    for (let y = -1; y <= FORT_H; y++)
      for (let x = -1; x <= FORT_W; x++) {
        const tx = f.ox + x;
        const ty = f.oy + y;
        const i = ty * m.width + tx;
        if (m.decor[i] >= 0) s.tiles.set('decor', tx, ty, -1);
        if (m.canopy[i] >= 0) s.tiles.set('canopy', tx, ty, -1);
        const inside = x >= 0 && y >= 0 && x < FORT_W && y < FORT_H;
        if (!inside) continue;
        if (y >= 2 && y < FORT_H - 2 && x > 0 && x < FORT_W - 1 && m.ground[i] !== T.DIRT) s.tiles.set('ground', tx, ty, T.DIRT);
        if (!this.wallAt(x, y)) {
          s.setSolid(tx, ty, false);
          continue;
        }
        const below = y + 1 < FORT_H && this.wallAt(x, y + 1);
        s.tiles.set('cliffs', tx, ty, stone ? (below ? T.WALL + 4 : T.WALL + 5) : below ? T.PALISADE : T.PALISADE_FACE);
        s.setSolid(tx, ty, true);
      }
    this.syncGate(f);
  }

  private unstamp(f: Fort) {
    const s = this.scene;
    for (let y = 0; y < FORT_H; y++)
      for (let x = 0; x < FORT_W; x++) {
        s.tiles.set('cliffs', f.ox + x, f.oy + y, -1);
        s.setSolid(f.ox + x, f.oy + y, false);
      }
  }

  /** Portão de pé fecha o vão (no forte do herói ele fica aberto). */
  private syncGate(f: Fort) {
    const shut = f.owner !== 'player' && f.hp.gate > 0;
    for (let y = FORT_H - 2; y < FORT_H; y++)
      for (let x = 0; x < FORT_W; x++) if (Math.abs(x + 0.5 - FORT_W / 2) < GATE / 2 + 0.5) this.scene.setSolid(f.ox + x, f.oy + y, shut);
  }

  // ------------------------------------------------------------ desenho (só perto do herói)
  private realize(f: Fort) {
    const s = this.scene;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const add = <O extends Phaser.GameObjects.GameObject>(o: O) => (parts.push(o), o);
    const hp = this.partPos(f, 'hall');
    const hall = add(s.add.image(hp.x, hp.y, 'hq-hall', Math.min(2, f.tier)).setOrigin(0.5, 1).setDepth(DEPTH.entities + hp.y));
    const towers = (['tower0', 'tower1'] as Part[]).map((p) => {
      const q = this.partPos(f, p);
      return add(s.add.image(q.x, q.y, 'hq-tower', f.tier >= 2 ? 1 : 0).setOrigin(0.5, 1).setDepth(DEPTH.entities + q.y));
    });
    const gp = this.partPos(f, 'gate');
    const gate = add(s.add.image(gp.x, gp.y, 'hq-gate', 0).setOrigin(0.5, 1).setDepth(DEPTH.entities + gp.y));
    // casernas e caixotes no pátio
    const bp = { x: (f.ox + 4) * TILE, y: (f.oy + 9) * TILE };
    add(s.add.image(bp.x, bp.y, 'hq-barracks', Math.min(2, f.tier)).setOrigin(0.5, 1).setScale(0.8).setDepth(DEPTH.entities + bp.y));
    // estandartes com o brasão do dono, dos dois lados do portão
    const owner = f.owner === 'player' ? s.clans.player : s.clans.byId(f.owner);
    for (const dx of [-GATE / 2 - 2, GATE / 2 + 2]) {
      const x = (f.ox + FORT_W / 2 + dx) * TILE;
      const y = (f.oy + FORT_H - 2) * TILE;
      add(s.add.rectangle(x, y, 2, 30, 0x6e4426).setOrigin(0.5, 1).setDepth(DEPTH.entities + y));
      add(s.add.image(x, y - 30, 'crest-shield').setTint(owner?.color ?? 0x888888).setDepth(DEPTH.entities + y + 1));
      add(s.add.image(x, y - 31, 'crests', owner?.crest ?? 0).setDepth(DEPTH.entities + y + 2));
    }
    const label = add(
      s.add
        .text(hp.x, hp.y - 120, '', { fontFamily: 'Tiny5, monospace', fontSize: '7px', color: '#ffe9a8', stroke: '#1e1a24', strokeThickness: 2 })
        .setOrigin(0.5)
        .setResolution(4)
        .setDepth(4240),
    );
    const bars = add(s.add.graphics().setDepth(4241));
    this.live.set(f, { fort: f, parts, hall, gate, towers, label, bars });
    this.redraw(f);
  }

  private unrealize(f: Fort) {
    const l = this.live.get(f);
    if (!l) return;
    for (const o of l.parts) o.destroy();
    this.live.delete(f);
  }

  /** Atualiza quadros, ruínas e o nome do forte. */
  private redraw(f: Fort) {
    const l = this.live.get(f);
    if (!l) return;
    const stone = f.tier >= 2;
    const mine = f.owner === 'player';
    const gateDown = f.hp.gate <= 0;
    l.gate.setFrame((stone ? 4 : 0) + (mine || gateDown ? 3 : 0)).setTint(gateDown && !mine ? 0x6a5a50 : 0xffffff);
    l.hall.setTint(f.hp.hall <= 0 ? 0x4a4040 : 0xffffff);
    l.towers.forEach((t, i) => t.setTint(f.hp[i ? 'tower1' : 'tower0'] <= 0 ? 0x4a4040 : 0xffffff));
    const owner = mine ? this.scene.clans.player : this.scene.clans.byId(f.owner);
    const guards = mine ? ` · guarda ${f.guards?.length ?? 0}` : '';
    l.label.setText(`${mine ? 'Seu forte' : `Forte do ${owner?.name ?? 'clã'}`} · ${f.city}${guards}`).setPosition(this.partPos(f, 'hall').x, this.partPos(f, 'hall').y - l.hall.displayHeight - 6);
  }

  private targetsOf(f: Fort): FortTarget[] {
    let t = this.targets.get(f);
    if (!t) {
      t = PARTS.map((p) => new FortTarget(this, f, p));
      this.targets.set(f, t);
    }
    return t;
  }

  /** Peças do forte cercado que o herói pode golpear. */
  hostileStructures(): Hittable[] {
    return this.siege ? this.targetsOf(this.siege).filter((t) => t.targetable) : [];
  }

  // ------------------------------------------------------------ dano
  damage(f: Fort, p: Part, amount: number) {
    if (f.hp[p] <= 0) return;
    f.hp[p] = Math.max(0, f.hp[p] - amount);
    const l = this.live.get(f);
    const img = p === 'hall' ? l?.hall : p === 'gate' ? l?.gate : l?.towers[p === 'tower0' ? 0 : 1];
    if (img) {
      img.setTintFill(0xffffff);
      this.scene.time.delayedCall(70, () => img.active && this.redraw(f));
    }
    if (f.hp[p] > 0) return;
    const pos = this.partPos(f, p);
    this.scene.fx.burst(pos.x, pos.y - 16, 0x8a6a4a, 26);
    this.scene.cameras.main.shake(160, 0.004);
    if (p === 'gate') {
      this.syncGate(f);
      this.scene.events.emit('toast', f.owner === 'player' ? 'O portão do seu forte caiu!' : 'O portão caiu! Para dentro!');
    }
    if (p === 'hall') {
      // Salão no chão: o forte cai
      if (f === this.siege) this.scene.army.winWar();
      else if (f === this.defense) this.lose(f, this.retakeClan());
    }
    this.redraw(f);
    this.save();
  }

  // ------------------------------------------------------------ cerco
  /** O herói está diante do portão de um forte rival? */
  fortAtGate(): Fort | null {
    const p = this.scene.player;
    for (const f of this.forts) {
      const g = this.gateOut(f);
      if (Math.abs(p.x - g.x) < 7 * TILE && Math.abs(p.y - g.y) < 6 * TILE) return f;
    }
    return null;
  }

  siegeBlock(f: Fort): string {
    const s = this.scene;
    if (!s.clans.founded) return 'Funde o clã antes de atacar fortes';
    if (s.army.war) return 'Já há uma guerra em curso';
    const c = s.clans.byId(f.owner);
    if (!c) return '';
    if (s.army.size - s.army.garrison.length < 3) return 'Leve o exército (convoque os aquartelados)';
    return '';
  }

  startSiege(f: Fort): string {
    const why = this.siegeBlock(f);
    if (why) return why;
    const s = this.scene;
    const c = s.clans.byId(f.owner)!;
    const n = Math.max(6, Math.min(140, Math.round(c.soldiers * 0.4)));
    const ctr = this.center(f);
    // as peças voltam inteiras para o cerco (o que caiu antes foi reparado)
    for (const p of PARTS) f.hp[p] = Math.max(f.hp[p], Math.round(maxHp(p, f.tier) * 0.6));
    this.syncGate(f);
    this.siege = f;
    s.army.prepare(() => {
      s.army.declareWar(n, { name: c.name, color: c.color, clan: c.id }, { origin: { x: ctr.x, y: ctr.y }, exact: true, vet: Math.min(3, f.tier), faction: this.regionOf(ctr.x, ctr.y).biome });
      s.events.emit('area', 'CERCO!', `Forte do ${c.name} · ${n} defensores · derrube o portão e o Salão`);
    });
    this.redraw(f);
    return '';
  }

  private onWarEnd(w: { clan?: string; won: boolean; fled?: boolean; killed: number }) {
    const s = this.scene;
    if (this.siege) {
      const f = this.siege;
      this.siege = null;
      const c = s.clans.byId(f.owner);
      if (w.won && c && w.clan === c.id) this.capture(f, c, w.killed);
      else {
        // cerco falhou: os defensores consertam o forte
        for (const p of PARTS) f.hp[p] = maxHp(p, f.tier);
        this.syncGate(f);
        this.redraw(f);
        s.events.emit('toast', 'O cerco falhou: o forte foi consertado');
      }
      this.save();
      return;
    }
    if (this.defense) {
      const f = this.defense;
      this.defense = null;
      const c = s.clans.byId(this.lastAttacker ?? '');
      if (f.owner !== 'player') return;
      if (w.won) {
        s.events.emit('area', 'FORTE DEFENDIDO!', `${f.city} continua seu`);
        if (c) c.soldiers = Math.max(0, c.soldiers - w.killed);
        for (const p of PARTS) f.hp[p] = Math.max(f.hp[p], Math.round(maxHp(p, f.tier) * 0.5));
      } else if (c) this.lose(f, c);
      this.redraw(f);
      this.save();
    }
  }

  /** O forte cai nas mãos do herói: saque, território e o clã se muda. */
  private capture(f: Fort, c: Clan, killed: number) {
    const s = this.scene;
    const ctr = this.partPos(f, 'hall');
    f.owner = 'player';
    f.lostBy = c.id;
    f.guards = [];
    for (const p of PARTS) f.hp[p] = Math.round(maxHp(p, f.tier) * 0.5);
    this.syncGate(f);
    c.soldiers = Math.max(0, c.soldiers - killed);
    const lost = Math.round(c.glory * 0.35);
    c.glory = Math.max(0, c.glory - lost);
    const gold = 300 + f.tier * 450;
    s.hq.addGold(gold);
    if (c.gear) s.loot.drop(c.gear, ctr.x, ctr.y + 10);
    // o clã vencido muda a sede para outra cidade e ergue outro forte com o tempo
    const free = s.map.cities.filter((x) => x.name !== f.city && this.ownerOf(x) !== 'player');
    if (free.length) c.city = free[Math.floor(Math.random() * free.length)].name;
    this.rebuild.push({ clan: c.id, at: s.clans.now + 10 * 60000 });
    s.clans.log(`O ${s.clans.player.name} tomou o forte do ${c.name} em ${f.city}! ${c.name} recua para ${c.city}.`, true);
    s.events.emit('area', 'FORTE CONQUISTADO!', `território de ${f.city} · +${gold} ouro · rende ouro e material por minuto`);
    // às vezes o líder foge e deixa a montaria
    const mount = s.clans.mountOf(c);
    if (MOUNTS[mount] && !s.stable.owned.has(mount) && Math.random() < 0.25) s.stable.give(mount);
    this.unrealize(f);
    this.realize(f);
    this.nextRetake = s.clans.now + (6 + Math.random() * 4) * 60000;
    this.emit('change');
    s.clans.emit('change');
  }

  /** O forte do herói caiu para o clã `c` (que volta a morar nele). */
  private lose(f: Fort, c: Clan | null) {
    const s = this.scene;
    if (!c) return;
    s.army.war && s.army.clearFoes();
    f.owner = c.id;
    f.guards = [];
    for (const p of PARTS) f.hp[p] = maxHp(p, f.tier);
    c.city = f.city;
    // o forte antigo do clã (se ainda existia) fica sem uso: some
    for (const o of [...this.forts]) if (o !== f && o.owner === c.id) this.removeFort(o);
    this.rebuild = this.rebuild.filter((r) => r.clan !== c.id);
    this.syncGate(f);
    s.clans.log(`${c.name} retomou o forte de ${f.city}.`, true);
    s.events.emit('area', 'FORTE PERDIDO', `${c.name} retomou ${f.city}`);
    this.unrealize(f);
    this.emit('change');
    s.clans.emit('change');
  }

  // ------------------------------------------------------------ guarda nos fortes do herói
  /** Deixa até 12 soldados de guarda no forte (ou traz todos de volta). */
  toggleGuards(f: Fort): string {
    const s = this.scene;
    const a = s.army;
    if (f.guards?.length) {
      const back = f.guards.splice(0);
      const by = new Map<SoldierType, number>();
      for (const t of back) by.set(t, (by.get(t) ?? 0) + 1);
      a.prepare(() => {
        for (const [t, n] of by) a.recruit(t, n, true);
      });
      this.redraw(f);
      this.save();
      return `${back.length} guardas voltam para você`;
    }
    const field = a.allies.filter((x) => !x.station && !x.mount).slice(0, 12);
    if (!field.length) return 'Nenhum soldado com você para deixar de guarda';
    f.guards = field.map((x) => x.type);
    for (const x of field) a.remove(x);
    a.save();
    a.emit('change');
    this.redraw(f);
    this.save();
    return `${field.length} soldados ficam de guarda em ${f.city}`;
  }

  // ------------------------------------------------------------ retomadas
  private lastAttacker: string | null = null;

  private retakeClan(): Clan | null {
    return this.scene.clans.byId(this.retake?.clan ?? this.lastAttacker ?? '') ?? null;
  }

  private scheduleRetake() {
    const s = this.scene;
    const mine = this.mine;
    if (!mine.length || this.retake) return;
    const f = mine[Math.floor(Math.random() * mine.length)];
    const c = s.clans.byId(f.lostBy ?? '') ?? [...s.clans.rivals].filter((x) => x.soldiers > 20).sort((a, b) => b.glory - a.glory)[0];
    if (!c) return;
    this.retake = { fort: this.key(f), clan: c.id, at: s.clans.now + 180000 };
    s.clans.log(`${c.name} marcha para retomar o forte de ${f.city}! Chega em 3 min (veja no mapa).`, true);
    s.events.emit('area', 'ATAQUE MARCADO', `${c.name} chega ao forte de ${f.city} em 3 min`);
    this.save();
  }

  private resolveRetake() {
    const s = this.scene;
    const r = this.retake!;
    this.retake = null;
    const f = this.forts.find((x) => this.key(x) === r.fort && x.owner === 'player');
    const c = s.clans.byId(r.clan);
    if (!f || !c) return;
    this.lastAttacker = c.id;
    const n = Math.max(8, Math.min(160, Math.round(c.soldiers * 0.5)));
    const ctr = this.center(f);
    const p = s.player;
    // herói perto: batalha de verdade nos muros do forte
    if (Math.hypot(p.x - ctr.x, p.y - ctr.y) < 70 * TILE && !s.army.war) {
      this.defense = f;
      const g = this.gateOut(f);
      s.army.prepare(() => {
        s.army.declareWar(n, { name: c.name, color: c.color, clan: c.id }, { origin: { x: g.x, y: g.y + 18 * TILE }, exact: true, vet: Math.min(3, s.clans.tier(c)), siege: { x: ctr.x, y: ctr.y } });
        s.events.emit('area', 'O FORTE ESTÁ SOB ATAQUE!', `${c.name} chega com ${n} soldados`);
      });
      return;
    }
    // longe: a guarda e as torres decidem
    const towers = (f.hp.tower0 > 0 ? 1 : 0) + (f.hp.tower1 > 0 ? 1 : 0);
    const def = (f.guards?.length ?? 0) * 1.4 + towers * 6 + f.tier * 4 + 4;
    const att = n * (1 + s.clans.tier(c) * 0.2) * (0.8 + Math.random() * 0.4);
    if (def >= att) {
      c.soldiers = Math.max(0, c.soldiers - Math.round(n * 0.5));
      s.clans.log(`O forte de ${f.city} resistiu ao ${c.name}.`, true);
    } else this.lose(f, c);
    this.save();
  }

  // ------------------------------------------------------------ tempo
  update(time: number, delta: number) {
    const s = this.scene;
    const p = s.player;
    if (time > this.checkAt) {
      this.checkAt = time + 1000;
      this.sync();
      // clãs que perderam o forte erguem outro
      const now = s.clans.now;
      for (const r of [...this.rebuild])
        if (r.at <= now) {
          this.rebuild.splice(this.rebuild.indexOf(r), 1);
          const c = s.clans.byId(r.clan);
          const f = c && !this.byClan(c.id) ? this.place(c) : null;
          if (f) {
            this.forts.push(f);
            this.stamp(f);
            s.clans.log(`${c!.name} ergueu um forte novo perto de ${f.city}.`);
          }
        }
      // só desenha os fortes perto do herói
      for (const f of this.forts) {
        const c = this.center(f);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < 70 * TILE && !this.live.has(f)) this.realize(f);
        else if (d > 90 * TILE && this.live.has(f) && f !== this.siege && f !== this.defense) this.unrealize(f);
      }
      // retomadas com hora marcada
      if (s.clans.founded) {
        if (!this.nextRetake) this.nextRetake = now + 8 * 60000;
        if (!this.retake && this.mine.length && now > this.nextRetake) {
          this.scheduleRetake();
          this.nextRetake = now + (8 + Math.random() * 6) * 60000;
        }
        if (this.retake && now >= this.retake.at) this.resolveRetake();
      }
    }
    // renda dos territórios: ouro e material da região por minuto
    this.incomeAt += delta;
    if (this.incomeAt >= 60000) {
      this.incomeAt = 0;
      const mine = this.mine;
      if (mine.length) {
        const hq = s.hq;
        hq.addGold(15 * mine.length);
        if (hq.founded) {
          const cap = hq.stockCap;
          for (const f of mine) {
            const c = s.map.cities.find((x) => x.name === f.city);
            const mat = REGION_MAT[c?.biome ?? 0];
            hq.st.stock[mat] = Math.min(cap, (hq.st.stock[mat] ?? 0) + 8);
          }
        }
      }
    }
    // torres atiram: as rivais no exército do herói durante o cerco; as do herói, em inimigos perto
    for (const [f, l] of this.live) {
      for (const [i, part] of (['tower0', 'tower1'] as Part[]).entries()) {
        if (f.hp[part] <= 0) continue;
        const k = `${this.key(f)}:${i}`;
        if (time < (this.towerCd.get(k) ?? 0)) continue;
        const pos = this.partPos(f, part);
        const sx = pos.x;
        const sy = pos.y - 50;
        let best: Hittable | null = null;
        let bd = 170 * 170;
        const consider = (t: Hittable) => {
          if (!t.targetable) return;
          const d = (t.fx - sx) ** 2 + (t.fy - pos.y) ** 2;
          if (d < bd) {
            bd = d;
            best = t;
          }
        };
        if (f.owner === 'player') {
          for (const e of s.army.soldiers) if (e.team === 1) consider(e);
          for (const e of s.enemies) consider(e);
        } else if (f === this.siege) {
          consider(s.army.heroT);
          for (const a of s.army.allies) consider(a);
        }
        if (!best) continue;
        this.towerCd.set(k, time + 1300);
        s.army.fire(sx, sy, best, 2 + f.tier * 1.5, f.owner === 'player' ? 0 : 1);
      }
      // barras de vida das peças danificadas
      const g = l.bars.clear();
      for (const part of PARTS) {
        const max = maxHp(part, f.tier);
        if (f.hp[part] >= max || f.hp[part] <= 0) continue;
        const pos = this.partPos(f, part);
        const w = 26;
        const y = pos.y - (part === 'hall' ? l.hall.displayHeight : part === 'gate' ? 76 : 70) - 4;
        g.fillStyle(0x0b0d14, 1).fillRect(pos.x - w / 2 - 1, y - 1, w + 2, 5);
        g.fillStyle(f.owner === 'player' ? 0x5fbf52 : 0xd83c3c, 1).fillRect(pos.x - w / 2, y, (w * f.hp[part]) / max, 3);
      }
      l.label.setVisible(Math.hypot(p.x - this.center(f).x, p.y - this.center(f).y) < 30 * TILE);
    }
  }

  // ------------------------------------------------------------ salvar
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ forts: this.forts, rebuild: this.rebuild, retake: this.retake, nextRetake: this.nextRetake }));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (!d) return;
      if (Array.isArray(d.forts)) this.forts = d.forts.filter((f: Fort) => f && Number.isFinite(f.ox) && Number.isFinite(f.oy) && f.hp);
      if (Array.isArray(d.rebuild)) this.rebuild = d.rebuild;
      this.retake = d.retake ?? null;
      this.nextRetake = Number(d.nextRetake) || 0;
    } catch {
      /* começa sem fortes salvos */
    }
  }
}
