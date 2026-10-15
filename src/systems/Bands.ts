import Phaser from 'phaser';
import { TILE } from '../config';
import type { WorldScene } from '../scenes/WorldScene';
import { allyTint, type Soldier } from './Army';
import type { Clan } from './Clans';

export type BandGoal = 'patrol' | 'hunt' | 'raid' | 'home';

/** Bando de um clã rival andando pelo mapa (abstrato até chegar perto do herói). */
export interface Band {
  clan: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  goal: BandGoal;
  n: number;
  /** Já avisou o jogador de que se aproxima. */
  warned?: boolean;
  /** Sem bando até este momento (refazendo-se depois de uma derrota). */
  restUntil?: number;
}

const SAVE_KEY = 'vaelmor.bands.v1';
/** Velocidades (px/s): marcha e caçada. O herói anda a 58. */
const SPEED = 20;
const HUNT_SPEED = 32;
/** Distâncias (tiles): vira batalha, aviso de aproximação, caça e fuga. */
const ENGAGE = 26;
const WARN = 55;
const HUNT = 70;
const FLEE = 50;

/**
 * Os clãs rivais estão no mapa de verdade: cada um tem um bando em campo
 * (com o líder) que patrulha entre cidades, caça o herói quando se acha mais
 * forte, ataca a sede do jogador e briga com bandos rivais quando se cruzam.
 * Longe do herói é só um ponto andando (barato); perto, vira um exército de
 * soldados de verdade. Dá para vê-los chegando no minimapa — e fugir.
 */
export class Bands extends Phaser.Events.EventEmitter {
  list: Band[] = [];
  /** Bando que está lutando agora (materializado). */
  engaged: Band | null = null;
  private leader?: Soldier;
  private tickAt = 0;
  private saveAt = 0;

  constructor(private scene: WorldScene) {
    super();
    this.load();
    scene.army.on('war-end', (w: { clan?: string; won: boolean; fled?: boolean; left?: number; start: number; killed: number; glory: number }) => this.onWarEnd(w));
  }

  byClan(id: string) {
    return this.list.find((b) => b.clan === id);
  }

  /** Bandos com soldados e o clã de cada um. */
  get active(): { band: Band; clan: Clan }[] {
    const out: { band: Band; clan: Clan }[] = [];
    for (const b of this.list) {
      const c = this.scene.clans.byId(b.clan);
      if (c && b.n > 0 && !(b.restUntil && b.restUntil > this.scene.clans.now)) out.push({ band: b, clan: c });
    }
    return out;
  }

  /** Mantém um bando por rival (os novos clãs ganham o seu; os desfeitos perdem). */
  private sync() {
    const C = this.scene.clans;
    for (const c of C.rivals) if (!this.byClan(c.id)) this.list.push(this.makeBand(c));
    this.list = this.list.filter((b) => C.byId(b.clan));
  }

  private makeBand(c: Clan): Band {
    const city = this.scene.map.cities.find((x) => x.name === c.city) ?? this.scene.map.cities[0];
    const x = (city.cx + (Math.random() - 0.5) * 40) * TILE;
    const y = (city.y1 + 12 + Math.random() * 20) * TILE;
    return { clan: c.id, x, y, tx: x, ty: y, goal: 'patrol', n: this.sizeOf(c) };
  }

  /** Quantos soldados o clã põe em campo (o resto fica na sede dele). */
  private sizeOf(c: Clan) {
    return Math.max(6, Math.min(260, Math.round(c.soldiers * 0.6)));
  }

  /** Força comparável (soldados × experiência). */
  private power(n: number, tier: number) {
    return n * (1 + tier * 0.2);
  }

  /** Para onde patrulhar: outra cidade perto da sede do clã. */
  private patrolTarget(b: Band, c: Clan) {
    const cities = this.scene.map.cities;
    const home = cities.find((x) => x.name === c.city) ?? cities[0];
    const near = [...cities].sort((p, q) => Math.hypot(p.cx - home.cx, p.cy - home.cy) - Math.hypot(q.cx - home.cx, q.cy - home.cy)).slice(0, 4);
    const t = near[Math.floor(Math.random() * near.length)];
    // fora dos muros, ao lado da estrada
    const side = Math.random() < 0.5 ? -1 : 1;
    b.tx = (t.cx + side * ((t.x1 - t.x0) / 2 + 10 + Math.random() * 12)) * TILE;
    b.ty = (t.cy + (Math.random() - 0.5) * 30) * TILE;
  }

  // ------------------------------------------------------------ tempo
  update(time: number, delta: number) {
    const s = this.scene;
    if (!s.clans.founded) return;
    const dt = delta / 1000;
    const p = s.player;
    const war = s.army.war;
    // fuga: o herói se afastou da batalha com um bando
    if (this.engaged && war?.clan === this.engaged.clan && !war.siege) {
      const c = s.army.foeCenter;
      if (c && Math.hypot(c.x - p.x, c.y - p.y) > FLEE * TILE) {
        const b = this.engaged;
        b.x = c.x;
        b.y = c.y;
        s.army.dismissFoes();
      }
    }
    // andar (o bando materializado não anda como ponto)
    for (const { band: b, clan: c } of this.active) {
      if (b === this.engaged) continue;
      if (b.goal === 'hunt') {
        b.tx = p.x;
        b.ty = p.y;
      }
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      const d = Math.hypot(dx, dy);
      const v = (b.goal === 'hunt' ? HUNT_SPEED : SPEED) * dt;
      if (d > v) {
        b.x += (dx / d) * v;
        b.y += (dy / d) * v;
      } else this.arrive(b, c);
    }
    if (time < this.tickAt) return;
    this.tickAt = time + 1000;
    this.sync();
    const me = s.clans.tier(s.clans.player);
    const myPower = this.power(s.army.field.length + 2, s.army.upTier);
    for (const { band: b, clan: c } of this.active) {
      if (b === this.engaged) continue;
      const dh = Math.hypot(b.x - p.x, b.y - p.y) / TILE;
      // perto o bastante: vira batalha de verdade
      // (um ataque à sede com o herói em casa vira cerco quando o bando chega aos muros)
      const defending = b.goal === 'raid' && s.hq.inside(p.x, p.y, 30);
      if (dh < ENGAGE && !s.army.war && !p.dead && !defending) {
        this.engage(b, c);
        continue;
      }
      // caçar o herói quando se acha mais forte (e o herói está por perto)
      const theirs = this.power(b.n, s.clans.tier(c));
      // (rivais de força parecida: um Bando iniciante não é caçado por um exército dez vezes maior)
      const fair = theirs < myPower * 3 + 12 && Math.abs(s.clans.tier(c) - me) <= 1;
      const truce = (c.truceUntil ?? 0) > s.clans.now;
      // desafio de honra: o bando vem ao herói de qualquer jeito
      if (c.duelPending && b.goal !== 'raid') b.goal = 'hunt';
      else if (!truce && b.goal !== 'raid' && dh < HUNT && theirs > myPower * 0.9 && fair) {
        if (b.goal !== 'hunt') b.goal = 'hunt';
      } else if (b.goal === 'hunt' && dh > HUNT * 1.4) {
        b.goal = 'patrol';
        b.warned = false;
        this.patrolTarget(b, c);
      }
      // aviso: um bando vem na sua direção
      if (b.goal === 'hunt' && dh < WARN && !b.warned) {
        b.warned = true;
        s.army.preloadFaction(s.biomeAt(b.x, b.y));
        s.events.emit('area', `${c.name} SE APROXIMA`, `${b.n} soldados vêm atrás de você · lute ou fuja`);
        this.emit('warn', b, c);
      }
    }
    // bandos que se cruzam brigam entre si
    const act = this.active;
    for (let i = 0; i < act.length; i++)
      for (let j = i + 1; j < act.length; j++) {
        const a = act[i];
        const bb = act[j];
        if (a.band === this.engaged || bb.band === this.engaged) continue;
        if (Math.hypot(a.band.x - bb.band.x, a.band.y - bb.band.y) < 6 * TILE) this.clash(a, bb);
      }
    // de vez em quando um rival parte para atacar a sede do jogador
    if (s.hq.founded && !s.hq.st.raid && Math.random() < 0.004) {
      const cands = act.filter(({ band, clan }) => band.goal === 'patrol' && Math.abs(s.clans.tier(clan) - me) <= 1 && band.n >= 10 && (clan.truceUntil ?? 0) <= s.clans.now);
      if (cands.length) {
        const { band, clan } = cands[Math.floor(Math.random() * cands.length)];
        const g = s.hq.gate;
        band.goal = 'raid';
        band.tx = g.x;
        band.ty = g.y + 6 * TILE;
        s.hq.scheduleRaid(clan, Math.hypot(band.tx - band.x, band.ty - band.y) / SPEED);
      }
    }
    // atualiza a chegada estimada do ataque
    const raid = s.hq.st.raid;
    if (raid) {
      const b = this.byClan(raid.clan);
      if (b && b.goal === 'raid') raid.at = s.clans.now + (Math.hypot(b.tx - b.x, b.ty - b.y) / SPEED) * 1000;
    }
    if (time - this.saveAt > 10000) {
      this.saveAt = time;
      this.save();
    }
  }

  private arrive(b: Band, c: Clan) {
    if (b.goal === 'raid') {
      // chegou à sede: o ataque acontece (de verdade se o herói está perto)
      this.scene.hq.raidArrived(c, b);
      return;
    }
    if (b.goal === 'hunt') return;
    b.goal = 'patrol';
    this.patrolTarget(b, c);
  }

  /** Dois bandos rivais se cruzaram. */
  private clash(a: { band: Band; clan: Clan }, b: { band: Band; clan: Clan }) {
    const C = this.scene.clans;
    const pa = this.power(a.band.n, C.tier(a.clan));
    const pb = this.power(b.band.n, C.tier(b.clan));
    const [win, lose] = Math.random() < pa / (pa + pb) ? [a, b] : [b, a];
    const prize = Math.round(lose.clan.glory * 0.08 + 20);
    win.clan.glory += prize;
    lose.clan.glory = Math.max(0, lose.clan.glory - prize);
    win.band.n = Math.max(1, Math.round(win.band.n * 0.8));
    lose.clan.soldiers = Math.max(0, lose.clan.soldiers - lose.band.n);
    win.clan.soldiers = Math.max(0, win.clan.soldiers - Math.round(win.band.n * 0.2));
    lose.band.n = 0;
    lose.band.restUntil = C.now + 180000;
    C.log(`${win.clan.name} venceu ${lose.clan.name} em batalha no campo (+${prize} Glória).`);
    this.patrolTarget(win.band, win.clan);
  }

  /** O bando vira um exército de verdade, com o líder à frente. */
  private engage(b: Band, c: Clan) {
    const s = this.scene;
    this.engaged = b;
    const t = s.clans.tier(c);
    const leaderMount = s.clans.mountOf(c);
    s.army.prepare(() => {
      s.army.declareWar(b.n, { name: c.name, color: c.color, clan: c.id }, { origin: { x: b.x, y: b.y }, exact: true, vet: Math.min(3, t) });
      s.bosses.spawn(
        {
          name: c.leader,
          x: b.x,
          y: b.y,
          hp: Math.round(60 + s.clans.glory(c) / 18),
          damage: 2.5 + t * 1.4,
          tint: allyTint(c.color),
          scale: 1.25,
          points: 10 + t * 8,
          rank: Math.min(9, t * 2 + 1),
          loot: c.gear,
          // o líder vem montado: cavalo nos clãs pequenos, a fera da região nos médios, uma rara nos grandes
          mount: leaderMount,
          onKill: () => {
            this.leader = undefined;
            // 35% de deixar a própria montaria (se ainda não for sua); senão, a chance de uma rara
            if (!s.stable.owned.has(leaderMount) && Math.random() < 0.35) s.stable.give(leaderMount);
            else s.events.emit('rare-mount-roll', 0.1);
            s.events.emit('toast', `${c.leader}, líder do ${c.name}, caiu!`);
          },
        },
        (u) => {
          this.leader = u;
          // o líder fala antes da batalha: lutar, duelo, trégua ou rendição
          s.diplomacy.atBattle(c, u);
        },
      );
      s.events.emit('area', 'BATALHA!', `${c.name} · ${b.n} soldados · líder ${c.leader}`);
    });
  }

  private onWarEnd(w: { clan?: string; won: boolean; fled?: boolean; left?: number; start: number; killed: number; glory: number }) {
    const s = this.scene;
    if (this.leader) {
      // o líder que sobrou volta com o bando
      s.bosses.remove(this.leader);
      this.leader = undefined;
    }
    const b = this.engaged;
    this.engaged = null;
    if (!b || b.clan !== w.clan) return;
    const c = s.clans.byId(b.clan);
    if (!c) return;
    if (w.fled) {
      b.n = Math.max(1, w.left ?? b.n);
      b.goal = 'patrol';
      b.warned = false;
      this.patrolTarget(b, c);
      return;
    }
    s.clans.settle(c, w.won, w.killed, Math.abs(w.glory));
    if (w.won) {
      // bando destruído: o clã leva um tempo para pôr outro em campo
      b.n = 0;
      b.restUntil = s.clans.now + 240000;
      s.events.emit('clan-beaten', c.id);
    } else {
      b.n = Math.max(1, w.start - w.killed);
      b.goal = 'patrol';
      this.patrolTarget(b, c);
    }
    this.save();
  }

  /** Bando volta a campo depois de descansar. */
  respawn(b: Band) {
    const c = this.scene.clans.byId(b.clan);
    if (!c) return;
    const nb = this.makeBand(c);
    Object.assign(b, nb, { restUntil: undefined });
  }

  /** Chamado a cada tick do motor dos clãs: bandos refeitos voltam a campo. */
  refresh() {
    const now = this.scene.clans.now;
    for (const b of this.list) if (b.restUntil && b.restUntil <= now && b.n <= 0) this.respawn(b);
  }

  // ------------------------------------------------------------ salvar
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.list.map((b) => ({ ...b, goal: b.goal === 'hunt' ? 'patrol' : b.goal, warned: false }))));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d)) this.list = d;
    } catch {
      /* começa sem bandos salvos */
    }
  }

  reset() {
    this.list = [];
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignora */
    }
  }
}
