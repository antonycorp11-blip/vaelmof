import Phaser from 'phaser';
import { rollGear } from '../data/gear';
import type { WorldScene } from '../scenes/WorldScene';
import { RANKS } from './Ranks';

/** Escada de um clã até virar Casa (pela Glória; a do jogador também pede a última patente). */
export const CLAN_TIERS = [
  { name: 'Bando', glory: 0 },
  { name: 'Clã', glory: 600 },
  { name: 'Clã Juramentado', glory: 3000 },
  { name: 'Clã de Renome', glory: 8000 },
  { name: 'Clã Lendário', glory: 20000 },
  { name: 'Casa', glory: 30000 },
];

/** Cores que o jogador pode escolher para o clã (e que os rivais usam). */
export const CLAN_COLORS = [0x3d7be0, 0xc83a3a, 0x3e9a4a, 0xd8a030, 0x8a4ac8, 0x2aa8a8, 0xe07a2a, 0xd0d0d0, 0x5a3a2a, 0xe05aa0, 0x2a2a3a, 0x9ac83a];
export const CREST_COUNT = 12;
export const CREST_NAMES = ['Lobo', 'Corvo', 'Torre', 'Espadas', 'Lua', 'Chama', 'Árvore', 'Coroa', 'Caveira', 'Estrela', 'Machado', 'Serpente'];

export interface Clan {
  id: string;
  name: string;
  crest: number;
  color: number;
  /** Cidade onde fica a sede. */
  city: string;
  leader: string;
  glory: number;
  soldiers: number;
  /** Peça rara que o líder carrega (cai quando ele é derrotado). */
  gear: string;
  player?: boolean;
  /** Pode ser desafiado de novo a partir deste momento (ms desde o início da sessão salva). */
  restUntil?: number;
  /** Vezes que o jogador venceu este clã. */
  beaten?: number;
}

export interface Chronicle {
  t: number;
  text: string;
}

/** Desafio de um rival ao jogador, com prazo para responder. */
export interface Challenge {
  clan: string;
  until: number;
}

const SAVE_KEY = 'vaelmor.clans.v1';
const TICK = 22000;

const FIRST = ['Corvos', 'Lobos', 'Lâminas', 'Escudos', 'Filhos', 'Juramentados', 'Andarilhos', 'Guardiões', 'Serpentes', 'Martelos', 'Chamas', 'Sombras', 'Falcões', 'Ursos', 'Presas', 'Estandartes'];
const SECOND = ['de Cinza', 'do Norte', 'da Aurora', 'de Ferro', 'do Vale', 'da Bruma', 'Rubros', 'de Pedra', 'do Ocaso', 'da Geada', 'do Deserto', 'Negros', 'de Prata', 'da Tormenta', 'do Juramento', 'Errantes'];
const LEADERS = ['Aldren', 'Kaela', 'Thorvik', 'Mirena', 'Godran', 'Selvia', 'Brann', 'Ilsa', 'Varek', 'Oriane', 'Dunmor', 'Tessaly', 'Hrolf', 'Ysolde', 'Corvin', 'Maela', 'Garrick', 'Elowen', 'Rurik', 'Sabine', 'Torvald', 'Lyra'];
const EPITHETS = ['o Implacável', 'a Rubra', 'Mão-de-Ferro', 'a Sombria', 'o Velho', 'Olho-de-Falcão', 'o Juramentado', 'a Fria', 'Quebra-Escudos', 'o Errante', 'a Lâmina', 'o Lobo'];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const tierOfGlory = (g: number) => CLAN_TIERS.reduce((t, T, i) => (g >= T.glory ? i : t), 0);

/**
 * Clãs de Vaelmor: o do jogador e os rivais, cada um com sede numa cidade,
 * líder, brasão, cor, Glória e soldados. Um motor simples faz o mundo andar
 * sozinho: os clãs recrutam, guerreiam entre si, desafiam o jogador, surgem
 * e se desfazem — e tudo vira crônica. Todo clã quer virar Casa.
 */
export class Clans extends Phaser.Events.EventEmitter {
  list: Clan[] = [];
  chronicle: Chronicle[] = [];
  challenge: Challenge | null = null;
  /** O jogador já fundou o clã (senão a tela de criação abre). */
  founded = false;
  private clock = 0;
  private tickAt = TICK;

  constructor(private scene: WorldScene) {
    super();
    this.load();
    if (!this.list.length) this.generate();
  }

  get player(): Clan {
    return this.list.find((c) => c.player)!;
  }

  get rivals(): Clan[] {
    return this.list.filter((c) => !c.player);
  }

  byId(id: string) {
    return this.list.find((c) => c.id === id);
  }

  /** Glória do clã: a do jogador é a do herói. */
  glory(c: Clan): number {
    return c.player ? this.scene.progress.glory : c.glory;
  }

  soldiersOf(c: Clan): number {
    return c.player ? this.scene.army.size : c.soldiers;
  }

  /** Degrau do clã. O do jogador só vira Casa com a última patente. */
  tier(c: Clan): number {
    const t = tierOfGlory(this.glory(c));
    if (c.player && t >= CLAN_TIERS.length - 1 && this.scene.progress.rankIdx < RANKS.length - 1) return CLAN_TIERS.length - 2;
    return t;
  }

  ranking(): Clan[] {
    return [...this.list].sort((a, b) => this.glory(b) - this.glory(a));
  }

  position(c: Clan): number {
    return this.ranking().indexOf(c) + 1;
  }

  /** Tempo de jogo (ms) que segue entre sessões. */
  get now() {
    return this.clock;
  }

  // ------------------------------------------------------------ fundação
  found(name: string, crest: number, color: number) {
    const p = this.player;
    p.name = name.trim().slice(0, 24) || 'Clã sem Nome';
    p.crest = crest;
    p.color = color;
    this.founded = true;
    this.log(`Nasce o ${p.name}, em ${p.city}. Todo clã sonha em virar Casa.`);
    this.save();
    this.emit('change');
    this.emit('founded', p);
  }

  private generate() {
    const cities = this.scene.map.cities;
    const capital = cities.find((c) => c.capital) ?? cities[0];
    this.list = [
      { id: 'player', name: 'Meu Clã', crest: 0, color: CLAN_COLORS[0], city: capital.name, leader: 'Teren', glory: 0, soldiers: 0, gear: '', player: true },
    ];
    const used = new Set<string>();
    // um rival por cidade, mais dois nas maiores
    const homes = [...cities.map((c) => c.name), capital.name, cities[1]?.name ?? capital.name];
    homes.forEach((city, i) => this.list.push(this.makeRival(city, used, i)));
  }

  private makeRival(city: string, used: Set<string>, i = 0): Clan {
    let name = '';
    for (let k = 0; k < 30 && (!name || used.has(name)); k++) name = `${pick(FIRST)} ${pick(SECOND)}`;
    used.add(name);
    // Glória espalhada: poucos clãs fortes, muitos pequenos
    const g = Math.round(40 + Math.pow(Math.random(), 2.2) * 14000 + (i % 5 === 0 ? 1500 : 0));
    return {
      id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      name,
      crest: Math.floor(Math.random() * CREST_COUNT),
      color: pick(CLAN_COLORS.slice(1)),
      city,
      leader: `${pick(LEADERS)} ${pick(EPITHETS)}`,
      glory: g,
      soldiers: Math.round(Math.min(300, 6 + g / 90 + Math.random() * 10)),
      gear: rollGear(1 + Math.min(3, tierOfGlory(g) * 0.8)),
    };
  }

  // ------------------------------------------------------------ motor do mundo
  update(delta: number) {
    if (!this.founded) return;
    this.clock += delta;
    if (this.challenge && this.clock > this.challenge.until) {
      // desafio ignorado: o clã perde Glória por fugir
      const c = this.byId(this.challenge.clan);
      this.challenge = null;
      if (c) {
        const loss = Math.min(300, Math.round(this.scene.progress.glory * 0.04) + 10);
        this.scene.gainGlory(-loss, this.scene.player.x, this.scene.player.y - 40);
        c.glory += loss;
        this.log(`O ${this.player.name} fugiu do desafio do ${c.name} e perdeu ${loss} de Glória.`);
      }
      this.emit('change');
    }
    if (this.clock < this.tickAt) return;
    this.tickAt = this.clock + TICK * (0.7 + Math.random() * 0.6);
    this.tick();
    this.save();
    this.emit('change');
  }

  private tick() {
    const rivals = this.rivals;
    // todos recrutam um pouco e ganham Glória em missões próprias
    for (const c of rivals) {
      const cap = Math.min(320, 10 + c.glory / 40);
      if (c.soldiers < cap) c.soldiers = Math.min(Math.round(cap), c.soldiers + 1 + Math.floor(Math.random() * 4));
      c.glory += Math.round(Math.random() * 12 + c.glory * 0.002);
    }
    // as guerras entre rivais e contra o jogador agora acontecem no mapa (systems/Bands)
    this.scene.bands?.refresh();
    // clãs nascem e morrem
    if (rivals.length < 24 && Math.random() < 0.05) {
      const city = pick(this.scene.map.cities).name;
      const c = this.makeRival(city, new Set(this.list.map((l) => l.name)));
      c.glory = Math.round(30 + Math.random() * 200);
      c.soldiers = 5 + Math.floor(Math.random() * 8);
      this.list.push(c);
      this.log(`Um novo clã surgiu em ${city}: ${c.name}, liderado por ${c.leader}.`);
    }
    for (const c of rivals)
      if (c.soldiers <= 0 && c.glory < 60) {
        this.list.splice(this.list.indexOf(c), 1);
        this.log(`${c.name} se desfez.`);
        break;
      }
  }

  /** Registra na crônica e avisa a interface. `loud` = aviso em destaque. */
  log(text: string, loud = false) {
    this.chronicle.unshift({ t: this.clock, text });
    this.chronicle.length = Math.min(this.chronicle.length, 40);
    this.emit('chronicle', text, loud);
  }

  /** Por que não dá para desafiar agora ('' = dá). */
  challengeBlock(c: Clan): string {
    if (c.player) return 'Este é o seu clã';
    if (this.scene.army.war) return 'Já há uma guerra em curso';
    if ((c.restUntil ?? 0) > this.clock) return `${c.name} se recupera da última batalha (${Math.ceil(((c.restUntil ?? 0) - this.clock) / 1000)} s)`;
    if (c.soldiers <= 0) return 'Este clã não tem soldados';
    return '';
  }

  /** Tamanho do exército que o rival manda (todos, até 300). */
  armyOf(c: Clan) {
    return Math.max(5, Math.min(300, c.soldiers));
  }

  /** Guerra contra o rival terminou. */
  settle(c: Clan, won: boolean, killed: number, gain: number) {
    c.restUntil = this.clock + 120000;
    c.soldiers = Math.max(0, c.soldiers - killed);
    if (this.challenge?.clan === c.id) this.challenge = null;
    if (won) {
      c.glory = Math.max(0, c.glory - Math.round(gain * 0.6));
      c.beaten = (c.beaten ?? 0) + 1;
      this.log(`O ${this.player.name} venceu ${c.name}!`, true);
      // o líder vencido troca a peça que carregava
      c.gear = rollGear(1 + Math.min(3, tierOfGlory(c.glory) * 0.8));
    } else {
      c.glory += Math.round(gain);
      this.log(`${c.name} derrotou o ${this.player.name}.`, true);
    }
    this.save();
    this.emit('change');
  }

  /** A sede caiu: o clã do jogador acaba (é preciso fundar outro). */
  disband() {
    const p = this.player;
    p.name = 'Meu Clã';
    this.founded = false;
    this.challenge = null;
    this.save();
    this.emit('change');
    this.emit('fallen');
  }

  // ------------------------------------------------------------ salvar
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ list: this.list, chronicle: this.chronicle.slice(0, 40), founded: this.founded, clock: this.clock, challenge: this.challenge }));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!Array.isArray(d.list) || !d.list.some((c: Clan) => c.player)) return;
      this.list = d.list;
      this.chronicle = d.chronicle ?? [];
      this.founded = !!d.founded;
      this.clock = Number(d.clock) || 0;
      this.tickAt = this.clock + TICK;
      this.challenge = d.challenge ?? null;
    } catch {
      /* save inválido: começa de novo */
    }
  }

  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignora */
    }
    this.list = [];
    this.chronicle = [];
    this.founded = false;
    this.challenge = null;
    this.generate();
    this.emit('change');
  }
}
