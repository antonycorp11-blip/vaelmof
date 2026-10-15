import Phaser from 'phaser';
import { DEPTH } from '../entities/Creature';
import type { WorldScene } from '../scenes/WorldScene';
import type { DialogOption, DialogSpec } from '../ui/Dialog';
import type { Soldier } from './Army';
import type { Clan } from './Clans';

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Falas dos líderes ({L} líder, {C} clã dele, {H} o clã do herói). */
const TAUNT = [
  'Então é você o tal do {H}? Meus homens vão adorar contar essa história.',
  'O {C} não recua. Nunca recuou. Vire as costas enquanto ainda tem pernas.',
  'Já enterrei clãs maiores que o seu, forasteiro.',
  'Você veio até aqui só para morrer longe de casa?',
  'Que os deuses decidam. Ou melhor: que as nossas lâminas decidam.',
];
const FORT = [
  'Você ousa bater no portão do {C}? Estas muralhas viram mais cercos que você viu invernos.',
  'Meu forte, minhas regras. Dê meia-volta, {H}, ou fique para sempre embaixo das torres.',
  'Os arqueiros já estão nas ameias. Fale rápido.',
];
const HONOR = ['Recebi seu desafio. Vim sozinho para a roda — como manda a honra.', 'Um duelo, então. Sem cavalos, sem soldados. Só nós dois.'];
const ACCEPT = ['Que seja! Ninguém interfere — quem cair, perde a guerra.', 'Gosto de você. Vai ser uma pena.'];
const REFUSE = ['Rendição? Ha! Volte quando tiver um exército de verdade.', 'Você conta mal os seus soldados, forasteiro.'];
const YIELD = ['...Está bem. Leve o ouro e suma da minha frente.', 'Hoje não é dia de morrer por orgulho. Tome o tributo.'];

/**
 * Diplomacia com os líderes dos clãs: ao começar uma batalha (no campo ou no
 * cerco de um forte) o líder fala e o herói escolhe — lutar, desafiar para um
 * duelo 1x1 a pé que decide a guerra, comprar uma trégua ou exigir rendição.
 * Pela tela de Clãs dá para conversar a qualquer hora: provocar, pedir trégua
 * ou lançar um desafio de honra (o líder vem para o duelo).
 */
export class Diplomacy {
  private arena: Phaser.GameObjects.Graphics;
  private duelClan: Clan | null = null;
  private duelStart = 0;
  private sparkAt = 0;

  constructor(private scene: WorldScene) {
    this.arena = scene.add.graphics().setDepth(DEPTH.decor + 2);
    scene.army.on('war-end', () => this.endDuel());
  }

  private say(c: Clan, text: string, options: DialogOption[], title?: string) {
    const fill = (t: string) => t.replace('{L}', c.leader).replace('{C}', c.name).replace('{H}', this.scene.clans.player.name);
    const spec: DialogSpec = { name: c.leader, title: title ?? `líder do ${c.name}`, color: c.color, crest: c.crest, text: fill(text), options };
    this.scene.events.emit('dialog', spec);
  }

  /** Preço da trégua e se o herói é forte o bastante para exigir rendição. */
  truceCost(c: Clan) {
    return 150 + this.scene.clans.tier(c) * 250;
  }

  private strength(c: Clan) {
    const a = this.scene.army;
    const ours = (a.size - a.garrison.length) * (1 + 0.15 * a.upTier) + 6;
    const theirs = a.foes.length * (1 + 0.2 * Math.min(3, this.scene.clans.tier(c)));
    return { ours, theirs };
  }

  // ------------------------------------------------------------ começo da batalha
  /** Batalha no campo com o bando de um clã: o líder fala. */
  atBattle(c: Clan, leader?: Soldier) {
    const s = this.scene;
    s.time.delayedCall(700, () => {
      if (!s.army.war || s.army.war.clan !== c.id) return;
      const honor = !!c.duelPending;
      c.duelPending = false;
      this.say(c, honor ? pick(HONOR) : pick(TAUNT), this.warOptions(c, leader, honor));
    });
  }

  /** Cerco de um forte: o líder grita das ameias. */
  atSiege(c: Clan) {
    const s = this.scene;
    s.time.delayedCall(700, () => {
      if (!s.army.war || s.army.war.clan !== c.id) return;
      this.say(c, pick(FORT), this.warOptions(c, undefined, false), `líder do ${c.name}, das ameias`);
    });
  }

  private warOptions(c: Clan, leader: Soldier | undefined, honor: boolean): DialogOption[] {
    const s = this.scene;
    const cost = this.truceCost(c);
    const { ours, theirs } = this.strength(c);
    const duel: DialogOption = { label: 'DUELO 1x1', color: 'gold', onPick: () => this.startDuel(c, leader) };
    const fight: DialogOption = { label: 'LUTAR!', color: 'red', onPick: () => s.events.emit('toast', `${c.leader}: "Então venha!"`) };
    if (honor) return [duel, fight];
    return [
      fight,
      duel,
      { label: `TRÉGUA (${cost} ouro)`, color: 'blue', why: s.hq.gold < cost ? `Faltam ${cost - s.hq.gold} de ouro` : undefined, onPick: () => this.truce(c, cost) },
      {
        label: 'EXIGIR RENDIÇÃO',
        color: 'green',
        onPick: () => {
          if (ours >= theirs * 1.8) this.surrender(c);
          else this.say(c, pick(REFUSE), [{ label: 'ENTÃO LUTE!', color: 'red', onPick: () => {} }]);
        },
      },
    ];
  }

  /** Trégua comprada: a guerra acaba e o clã deixa o herói em paz por 20 min. */
  private truce(c: Clan, cost: number) {
    const s = this.scene;
    s.hq.addGold(-cost);
    c.truceUntil = s.clans.now + 20 * 60000;
    s.army.war && s.army.dismissFoes();
    s.clans.log(`O ${s.clans.player.name} comprou uma trégua do ${c.name} (${cost} ouro).`);
    s.events.emit('area', 'TRÉGUA', `${c.name} não ataca você nem a sua sede por 20 min`);
    s.clans.save();
  }

  /** O clã cede: paga tributo e vai embora. */
  private surrender(c: Clan) {
    const s = this.scene;
    const gold = 100 + s.clans.tier(c) * 220;
    this.say(c, pick(YIELD), [
      {
        label: `ACEITAR ${gold} OURO`,
        color: 'gold',
        onPick: () => {
          s.hq.addGold(gold);
          c.glory = Math.max(0, Math.round(c.glory * 0.9));
          c.truceUntil = s.clans.now + 10 * 60000;
          s.army.war && s.army.dismissFoes();
          s.gainGlory(40 + s.clans.tier(c) * 30, s.player.x, s.player.y - 40);
          s.clans.log(`${c.name} se rendeu ao ${s.clans.player.name} e pagou ${gold} de ouro.`, true);
          s.clans.save();
        },
      },
    ]);
  }

  // ------------------------------------------------------------ conversa a qualquer hora (tela de Clãs)
  talk(c: Clan) {
    const s = this.scene;
    const cost = this.truceCost(c);
    const b = s.bands.byClan(c.id);
    const busy = s.army.war ? 'Não durante uma guerra' : undefined;
    this.say(c, `${pick(['Fale, forasteiro.', 'O que o {H} quer com o {C}?', 'Seja breve. Tenho uma guerra para ganhar.'])}`, [
      {
        label: 'PROVOCAR',
        color: 'red',
        why: busy ?? (!b || b.n <= 0 ? 'O bando deles está se refazendo' : undefined),
        onPick: () => {
          b!.goal = 'hunt';
          b!.warned = false;
          c.truceUntil = 0;
          s.events.emit('toast', `${c.leader} jurou vingança: o bando do ${c.name} vem atrás de você`);
        },
      },
      {
        label: 'DESAFIO DE HONRA',
        color: 'gold',
        why: busy ?? (!b || b.n <= 0 ? 'O bando deles está se refazendo' : undefined),
        onPick: () => {
          c.duelPending = true;
          c.truceUntil = 0;
          b!.goal = 'hunt';
          b!.warned = false;
          s.events.emit('toast', `${c.leader} aceitou: vem ao seu encontro para um duelo 1x1`);
        },
      },
      { label: `TRÉGUA (${cost})`, color: 'blue', why: busy ?? (s.hq.gold < cost ? `Faltam ${cost - s.hq.gold} de ouro` : undefined), onPick: () => this.truce(c, cost) },
      { label: 'ATÉ MAIS', color: 'dark', onPick: () => {} },
    ]);
  }

  // ------------------------------------------------------------ duelo
  /** Duelo a pé: os exércitos param em roda, só o líder e o herói lutam; quem cair perde a guerra. */
  startDuel(c: Clan, leader?: Soldier) {
    const s = this.scene;
    const p = s.player;
    if (!s.army.war) return;
    if (s.stable.riding) s.stable.toggle();
    const go = (u: Soldier) => {
      s.army.dismount(u);
      const cx = (p.x + u.x) / 2;
      const cy = (p.y + u.y) / 2;
      const r = 70;
      u.x = cx + 40;
      u.y = cy;
      p.body.reset(cx - 40, cy);
      p.setPosition(cx - 40, cy);
      s.army.duel = { x: cx, y: cy, r, champ: u };
      this.duelClan = c;
      this.duelStart = s.time.now;
      s.events.emit('area', 'DUELO!', `${c.leader} contra você · quem cair perde a guerra`);
      s.events.emit('toast', `${c.leader}: "${pick(ACCEPT)}"`);
      s.cameras.main.flash(200, 255, 230, 180);
    };
    if (leader && !leader.dead) return go(leader);
    // sem o líder em campo (cerco): ele desce para a roda
    const t = s.clans.tier(c);
    s.bosses.spawn(
      {
        name: c.leader,
        x: p.x + 70,
        y: p.y,
        hp: Math.round(60 + s.clans.glory(c) / 18),
        damage: 2.5 + t * 1.4,
        tint: 0xffe0d0,
        scale: 1.3,
        points: 10 + t * 8,
        rank: Math.min(9, t * 2 + 1),
        loot: c.gear,
      },
      go,
    );
  }

  private endDuel() {
    if (!this.scene.army.duel) return;
    this.scene.army.duel = null;
    this.duelClan = null;
    this.arena.clear();
  }

  update(time: number) {
    const s = this.scene;
    const d = s.army.duel;
    if (!d) return;
    const c = this.duelClan;
    const p = s.player;
    // roda do duelo: anel dourado tremulando, faíscas
    const g = this.arena.clear();
    const k = 0.85 + 0.15 * Math.sin(time / 120);
    g.lineStyle(5, 0x1a1028, 0.5).strokeEllipse(d.x, d.y, d.r * 2, d.r * 1.3);
    g.lineStyle(3, 0xffc850, 0.9 * k).strokeEllipse(d.x, d.y, d.r * 2, d.r * 1.3);
    g.lineStyle(1, 0xffffff, 0.8 * k).strokeEllipse(d.x, d.y - 0.5, d.r * 2 - 2, d.r * 1.3 - 2);
    if (time > this.sparkAt) {
      this.sparkAt = time + 90;
      const a = Math.random() * Math.PI * 2;
      s.fx.ember(d.x + Math.cos(a) * d.r, d.y + Math.sin(a) * d.r * 0.65);
    }
    if (!c) return;
    // o líder caiu: a guerra é do herói
    if (d.champ.dead) {
      this.endDuel();
      const t = s.clans.tier(c);
      s.gainGlory(200 + t * 150, p.x, p.y - 50);
      c.glory = Math.max(0, Math.round(c.glory * 0.85));
      s.clans.log(`O ${s.clans.player.name} venceu ${c.leader} em duelo! A guerra contra o ${c.name} acabou.`, true);
      s.events.emit('area', 'DUELO VENCIDO!', `${c.leader} caiu · a guerra é sua`);
      s.army.winWar();
      return;
    }
    // herói de joelhos (10% da vida): perdeu o duelo, a guerra acaba sem mais mortes
    if (p.hp <= p.maxHp * 0.1 || p.dead) {
      this.endDuel();
      if (!p.dead) p.hp = Math.max(1, p.hp);
      s.bosses.remove(d.champ);
      const loss = Math.min(400, Math.round(s.progress.glory * 0.05) + 30);
      s.gainGlory(-loss, p.x, p.y - 50);
      c.glory += loss;
      s.clans.log(`${c.leader} venceu o ${s.clans.player.name} em duelo.`, true);
      s.events.emit('area', 'DUELO PERDIDO', `${c.leader} leva a guerra · seu exército recua`);
      s.army.war && s.army.dismissFoes();
      return;
    }
    // ninguém sai da roda
    const dx = p.x - d.x;
    const dy = (p.y - d.y) / 0.65;
    const dist = Math.hypot(dx, dy);
    if (dist > d.r - 6 && time - this.duelStart > 300) {
      const f = (d.r - 6) / dist;
      p.body.reset(d.x + dx * f, d.y + dy * f * 0.65);
    }
  }
}
