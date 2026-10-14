import Phaser from 'phaser';
import { TILE } from '../config';
import { rollGear } from '../data/gear';
import type { Enemy } from '../entities/Enemy';
import type { Soldier } from './Army';
import type { WorldScene } from '../scenes/WorldScene';
import type { City } from './Cities';
import { CHAMPIONS, RANKS, type ChampionId } from './Ranks';
import { BIOMES } from './WorldGenerator';

export type MissionKind = 'hunt' | 'bounty' | 'clan' | 'duel';

export interface Mission {
  id: string;
  kind: MissionKind;
  city: string;
  title: string;
  desc: string;
  need: number;
  have: number;
  /** Glória da recompensa. */
  reward: number;
  /** Recrutas extras para o quartel. */
  recruits: number;
  biome?: number;
  /** Procurado: onde ronda, nome e força (1–4). */
  target?: { x: number; y: number; name: string; tier: number };
  clan?: string;
  champ?: ChampionId;
}

const SAVE_KEY = 'vaelmor.missions.v1';
const MAX_ACTIVE = 3;
const LORDS = ['Aldric', 'Berenice', 'Cassius', 'Doranna', 'Edmar', 'Fiora', 'Gaspar', 'Helena', 'Iwen', 'Jorund', 'Leandra', 'Marek', 'Nadia', 'Osric', 'Petra', 'Quintus'];
const OUTLAWS = ['Gorm Dente-Podre', 'Vesna das Facas', 'Ulrik Sem-Orelha', 'Mara Corta-Bolsas', 'Brenn o Saqueador', 'Sylas Mão-Leve', 'Hilda Machado-Rubro', 'Doran Olho-Morto', 'Kessa a Serpente', 'Torg Rompe-Portas'];
const PREY = ['criaturas', 'feras', 'monstros'];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Lorde de cada cidade (fixo pelo nome da cidade). */
export function lordOf(city: string): string {
  let h = 0;
  for (const ch of city) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `Lorde ${LORDS[h % LORDS.length]}`;
}

/**
 * Missões dadas pelo Lorde de cada cidade: caçadas, procurados (personagens
 * nomeados que deixam cair peças raras), guerras contra clãs rivais e duelos
 * de campeão. Rendem Glória — o que faz o clã subir até virar Casa — e
 * recrutas para o quartel. Até 3 ativas; cumpridas, pagam na hora.
 */
export class Missions extends Phaser.Events.EventEmitter {
  active: Mission[] = [];
  offers = new Map<string, Mission[]>();
  done = 0;
  /** Procurados no mapa (e o bando de capangas de cada um); null = nascendo. */
  private bounty = new Map<string, Soldier[] | null>();
  private lastCheck = 0;

  constructor(private scene: WorldScene) {
    super();
    this.load();
    scene.events.on('enemy-killed', (e: Enemy) => {
      const b = scene.map.biome[Math.floor(e.y / TILE) * scene.map.width + Math.floor(e.x / TILE)];
      for (const m of this.active) if (m.kind === 'hunt' && (m.biome === undefined || m.biome === b)) this.progress(m, 1);
    });
    scene.events.on('clan-beaten', (id: string) => {
      for (const m of this.active) if (m.kind === 'clan' && m.clan === id) this.progress(m, 1);
    });
    scene.events.on('champion-defeated', (id: ChampionId) => {
      for (const m of this.active) if (m.kind === 'duel' && m.champ === id) this.progress(m, 1);
    });
  }

  /**
   * De quem vêm os chamados agora: com sede, só dentro dela (do Lorde da
   * cidade mais próxima); antes da sede, no salão de Brumavale.
   */
  cityHere(): City | undefined {
    const hq = this.scene.hq;
    if (hq.founded) return hq.heroInside ? hq.city : undefined;
    const p = this.scene.player;
    const tx = p.x / TILE;
    const ty = p.y / TILE;
    return this.scene.map.cities.find((c) => c.capital && tx >= c.x0 - 2 && tx <= c.x1 + 2 && ty >= c.y0 - 2 && ty <= c.y1 + 2);
  }

  /** Ofertas do Lorde da cidade (geradas na primeira visita e repostas ao aceitar). */
  offersOf(city: City): Mission[] {
    let list = this.offers.get(city.name);
    if (!list) {
      list = [];
      this.offers.set(city.name, list);
    }
    while (list.length < 3) list.push(this.make(city, list));
    return list;
  }

  accept(city: City, m: Mission): string {
    if (this.active.length >= MAX_ACTIVE) return `Você já tem ${MAX_ACTIVE} missões; cumpra ou abandone uma`;
    const list = this.offersOf(city);
    list.splice(list.indexOf(m), 1);
    this.active.push(m);
    this.save();
    this.emit('change');
    return '';
  }

  abandon(m: Mission) {
    const i = this.active.indexOf(m);
    if (i < 0) return;
    this.active.splice(i, 1);
    this.despawn(m.id);
    this.bounty.delete(m.id);
    this.save();
    this.emit('change');
  }

  private progress(m: Mission, n: number) {
    m.have = Math.min(m.need, m.have + n);
    if (m.have >= m.need) this.complete(m);
    else {
      this.save();
      this.emit('change');
    }
  }

  private complete(m: Mission) {
    const i = this.active.indexOf(m);
    if (i < 0) return;
    this.active.splice(i, 1);
    // os capangas que sobraram somem depois de um tempo
    this.scene.time.delayedCall(60000, () => this.despawn(m.id));
    this.done++;
    const s = this.scene;
    s.gainGlory(m.reward, s.player.x, s.player.y - 50);
    s.army.pool = Math.min(s.army.poolMax, s.army.pool + m.recruits);
    s.hq.addGold(this.gold(m));
    s.army.emit('change');
    s.clans.log(`${s.clans.player.name} cumpriu a missão de ${lordOf(m.city)}: ${m.title}.`);
    this.emit('complete', m);
    this.save();
    this.emit('change');
  }

  // ------------------------------------------------------------ geração
  private make(city: City, taken: Mission[]): Mission {
    const s = this.scene;
    const rank = s.progress.rankIdx;
    const id = `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const kinds: MissionKind[] = ['hunt', 'bounty', 'bounty', 'clan'];
    const next = RANKS[rank + 1];
    if (next?.duel && !s.progress.duels.has(next.duel)) kinds.push('duel', 'duel');
    const has = (k: MissionKind) => taken.some((t) => t.kind === k);
    let kind = pick(kinds);
    for (let k = 0; k < 6 && has(kind) && kind !== 'bounty'; k++) kind = pick(kinds);
    const base = { id, city: city.name, have: 0, need: 1 };
    if (kind === 'duel' && next?.duel) {
      const C = CHAMPIONS[next.duel];
      return { ...base, kind, champ: next.duel, title: `Duelo: ${C.name}`, desc: `Vença ${C.name}, que espera ao sul de ${C.city}. Abre a patente ${next.name}.`, reward: C.points * 10, recruits: 15 };
    }
    if (kind === 'clan') {
      const me = s.clans.tier(s.clans.player);
      const rivals = s.clans.rivals.filter((c) => c.soldiers > 0);
      const near = rivals.sort((a, b) => Math.abs(s.clans.tier(a) - me) - Math.abs(s.clans.tier(b) - me) || a.soldiers - b.soldiers).slice(0, 5);
      const c = near.length ? pick(near) : undefined;
      if (c)
        return { ...base, kind, clan: c.id, title: `Guerra: ${c.name}`, desc: `${lordOf(city.name)} quer ${c.name} humilhado. O bando dele anda pelo mapa (quadrado da cor do clã no minimapa): encontre-o e vença.`, reward: Math.round(120 + c.soldiers * 4 + c.glory * 0.05), recruits: 20 };
      kind = 'hunt';
    }
    if (kind === 'bounty') {
      const tier = Math.max(1, Math.min(4, 1 + Math.floor(rank / 3) + (Math.random() < 0.3 ? 1 : 0)));
      const at = this.findSpot(city);
      const usedNames = new Set([...taken, ...this.active].map((t) => t.target?.name));
      let name = pick(OUTLAWS);
      for (let k = 0; k < 10 && usedNames.has(name); k++) name = pick(OUTLAWS);
      return { ...base, kind, target: { ...at, name, tier }, title: `Procurado: ${name}`, desc: `Ronda os arredores de ${city.name} (marcado no mapa). Deixa cair uma peça ${['', 'Temperada', 'Rúnica', 'Ancestral', 'Lendária'][tier]}.`, reward: 60 + tier * tier * 60, recruits: 10 };
    }
    const n = 8 + Math.floor(Math.random() * 3) * 4 + rank * 2;
    return { ...base, kind: 'hunt', biome: city.biome, need: n, title: `Caçada em ${BIOMES[city.biome].name}`, desc: `Abata ${n} ${pick(PREY)} em ${BIOMES[city.biome].name} para proteger as estradas de ${city.name}.`, reward: 30 + n * 5, recruits: 8 };
  }

  /** Chão livre a 30–60 tiles da cidade, fora dos muros. */
  private findSpot(c: City): { x: number; y: number } {
    const m = this.scene.map;
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 30;
      const tx = Math.round(c.cx + Math.cos(a) * (r + (c.x1 - c.x0) / 2));
      const ty = Math.round(c.cy + Math.sin(a) * (r + (c.y1 - c.y0) / 2));
      if (tx < 4 || ty < 4 || tx >= m.width - 4 || ty >= m.height - 4) continue;
      const i = ty * m.width + tx;
      if (!m.collision[i] && m.water[i] < 0) return { x: tx * TILE + 8, y: ty * TILE + 8 };
    }
    return { x: c.cx * TILE + 8, y: (c.y1 + 20) * TILE + 8 };
  }

  // ------------------------------------------------------------ procurados no mapa
  update(time: number) {
    if (time - this.lastCheck < 500) return;
    this.lastCheck = time;
    const s = this.scene;
    const p = s.player;
    for (const m of this.active) {
      if (m.kind !== 'bounty' || !m.target) continue;
      const t = m.target;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      const live = this.bounty.get(m.id);
      if (!live && d < 40 * TILE) {
        const k = t.tier;
        this.bounty.set(m.id, null);
        const group: Soldier[] = [];
        s.bosses.spawn({
          name: t.name,
          x: t.x,
          y: t.y,
          hp: Math.round(50 * Math.pow(k, 1.9)),
          damage: 2 + k * 1.6,
          tint: [0xffffff, 0xd8ffd0, 0xc8dcff, 0xffe0a0, 0xf0c0ff][k],
          scale: 1.08 + k * 0.05,
          points: 6 + k * 6,
          rank: k * 2,
          loot: rollGear(k),
          onKill: () => {
            if (k >= 3) s.events.emit('rare-mount-roll', 0.15);
            this.progress(m, 1);
          },
        }, (u) => {
          group.push(u);
          // capangas: alguns bandidos com armas e trajes variados, perto do chefe
          const n = 2 + k + Math.floor(Math.random() * 3);
          const types = ['sword', 'sword', 'bow', 'greatsword', 'staff'] as const;
          const outfits = ['leather', 'hunter', 'plate', 'legion', 'arcane'];
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const type = types[Math.floor(Math.random() * types.length)];
            group.push(
              s.army.spawnChampion({
                x: t.x + Math.cos(a) * 26,
                y: t.y + Math.sin(a) * 18,
                type,
                outfit: outfits[Math.floor(Math.random() * outfits.length)],
                hp: Math.round(12 + k * 10),
                damage: 1.5 + k * 0.8,
                tint: 0xd8c8b0,
                scale: 1,
                rank: Math.max(0, k - 1),
              }),
            );
          }
          this.bounty.set(m.id, group);
        });
      } else if (live && d > 80 * TILE) this.despawn(m.id);
    }
  }

  /** Ouro da recompensa. */
  gold(m: Mission) {
    return Math.round(m.reward * 0.6);
  }

  /** Texto curto da missão para o HUD. */
  summary(m: Mission): string {
    if (m.kind === 'hunt') return `${m.title}: ${m.have}/${m.need}`;
    return m.title;
  }

  // ------------------------------------------------------------ salvar
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ active: this.active, offers: [...this.offers.entries()], done: this.done }));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.active = Array.isArray(d.active) ? d.active : [];
      this.offers = new Map(Array.isArray(d.offers) ? d.offers : []);
      this.done = Number(d.done) || 0;
    } catch {
      /* começa sem missões */
    }
  }

  private despawn(id: string) {
    const g = this.bounty.get(id);
    this.bounty.delete(id);
    if (!g) return;
    for (const u of g) {
      if (u.dead) continue;
      if (this.scene.bosses.list.some((b) => b.unit === u)) this.scene.bosses.remove(u);
      else this.scene.army.remove(u);
    }
  }

  reset() {
    for (const id of [...this.bounty.keys()]) this.despawn(id);
    this.active = [];
    this.offers.clear();
    this.done = 0;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignora */
    }
    this.emit('change');
  }
}
