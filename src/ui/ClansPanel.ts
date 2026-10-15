import Phaser from 'phaser';
import { RARITY } from '../data/gear';
import { ITEMS } from '../data/items';
import { MOUNTS } from '../data/mounts';
import type { WorldScene } from '../scenes/WorldScene';
import { CLAN_TIERS, type Clan } from '../systems/Clans';
import { RANKS } from '../systems/Ranks';
import { Button, COLOR, Crest, fit, frame, label, sizeFrame, Window } from './kit';

type Txt = Phaser.GameObjects.Text;

interface Row {
  bg: Phaser.GameObjects.NineSlice;
  pos: Txt;
  crest: Crest;
  name: Txt;
  info: Txt;
  glory: Txt;
  clan?: Clan;
}

const PER_PAGE = 7;
const gl = (n: number) => Math.round(n).toLocaleString('pt-BR');

/**
 * Ranking dos clãs de Vaelmor (por Glória), com a ficha do clã escolhido,
 * o botão de desafiar, o desafio que um rival fez ao jogador e a crônica do
 * mundo (guerras entre clãs, clãs que surgem e somem).
 */
export class ClansPanel {
  private win: Window;
  private rows: Row[] = [];
  private prev: Button;
  private next: Button;
  private page = 0;
  private sel?: Clan;
  private detailBox: Phaser.GameObjects.NineSlice;
  private bigCrest: Crest;
  private dName: Txt;
  private dInfo: Txt;
  private dGear: Txt;
  private action: Button;
  private status: Txt;
  private banner: Phaser.GameObjects.NineSlice;
  private bannerText: Txt;
  private accept: Button;
  private chron: Txt;
  private u = 1;
  private lastTick = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.win = new Window(scene, 'CLÃS DE VAELMOR', 19, () => this.setOpen(false));
    for (let i = 0; i < PER_PAGE; i++) {
      const r: Row = {
        bg: frame(scene, 'frame-inner').setInteractive({ useHandCursor: true }),
        pos: label(scene, '', 11, COLOR.dim).setOrigin(0.5),
        crest: new Crest(scene),
        name: label(scene, '', 10, COLOR.text),
        info: label(scene, '', 8, COLOR.dim, 1, false),
        glory: label(scene, '', 10, COLOR.gold).setOrigin(1, 0.5),
      };
      r.bg.on('pointerdown', () => {
        if (!r.clan) return;
        this.sel = r.clan;
        this.status.setText('');
        this.refresh();
      });
      this.win.add(r.bg, r.pos, ...r.crest.parts, r.name, r.info, r.glory);
      this.rows.push(r);
    }
    this.prev = new Button(scene, { label: '< ANTERIOR', color: 'dark', size: 9, onTap: () => this.turn(-1) });
    this.next = new Button(scene, { label: 'PRÓXIMA >', color: 'dark', size: 9, onTap: () => this.turn(1) });
    this.prev.addTo(this.win.root);
    this.next.addTo(this.win.root);
    this.detailBox = frame(scene, 'frame-inner');
    this.bigCrest = new Crest(scene);
    this.dName = label(scene, '', 12, COLOR.gold);
    this.dInfo = label(scene, '', 9, COLOR.text, 1, false).setLineSpacing(3);
    this.dGear = label(scene, '', 9, COLOR.text, 1, false);
    this.action = new Button(scene, { label: 'VER NO MAPA', icon: 3, color: 'blue', size: 11, onTap: () => this.challenge() });
    this.status = label(scene, '', 9, COLOR.red, 1, false);
    this.banner = frame(scene, 'frame-hl');
    this.bannerText = label(scene, '', 9, COLOR.gold);
    this.accept = new Button(scene, { label: 'ACEITAR', color: 'gold', size: 10, onTap: () => this.challenge() });
    this.chron = label(scene, '', 8, COLOR.dim, 1, false).setLineSpacing(3);
    this.win.add(this.detailBox, ...this.bigCrest.parts, this.dName, this.dInfo, this.dGear, this.status, this.banner, this.bannerText, this.chron);
    this.action.addTo(this.win.root);
    this.accept.addTo(this.win.root);
    world.clans.on('change', () => this.refresh());
    world.progress.on('change', () => this.refresh());
  }

  get open() {
    return this.win.open;
  }

  contains(x: number, y: number) {
    return this.win.contains(x, y);
  }

  setOpen(on: boolean) {
    this.win.setOpen(on);
    if (!on) return;
    this.status.setText('');
    // abre na página do jogador
    const pos = this.world.clans.position(this.world.clans.player) - 1;
    this.page = Math.floor(pos / PER_PAGE);
    this.sel ??= this.world.clans.player;
    this.layout(this.u);
  }

  toggle() {
    this.setOpen(!this.open);
  }

  update(time: number) {
    if (!this.open || time - this.lastTick < 1000) return;
    this.lastTick = time;
    this.refresh();
  }

  private turn(d: number) {
    const pages = Math.ceil(this.world.clans.list.length / PER_PAGE);
    this.page = (this.page + d + pages) % pages;
    this.refresh();
  }

  /** Abre o mapa (definido pela UIScene). */
  onMap?: () => void;

  private challenge() {
    this.onMap?.();
  }

  /** Onde anda o bando do clã. */
  private bandText(c: Clan): string {
    const w = this.world;
    const b = w.bands.byClan(c.id);
    if (!b) return '';
    if (b.n <= 0) return 'Bando derrotado: refazendo-se na sede do clã';
    const p = w.player;
    const d = Math.round(Math.hypot(b.x - p.x, b.y - p.y) / 16);
    const city = [...w.map.cities].sort((a, q) => Math.hypot(a.cx * 16 - b.x, a.cy * 16 - b.y) - Math.hypot(q.cx * 16 - b.x, q.cy * 16 - b.y))[0];
    const what = b.goal === 'hunt' ? 'CAÇANDO VOCÊ' : b.goal === 'raid' ? 'MARCHANDO CONTRA SUA SEDE' : 'em patrulha';
    return `Bando em campo: ${b.n} soldados perto de ${city.name}, a ${d} tiles de você · ${what}`;
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const C = this.world.clans;
    const list = C.ranking();
    const me = C.player;
    if (this.sel && !list.includes(this.sel)) this.sel = me;
    this.win.sub.setText(`${list.length} clãs · o seu está em #${C.position(me)}`);
    this.rows.forEach((r, i) => {
      const k = this.page * PER_PAGE + i;
      const c = list[k];
      r.clan = c;
      const vis = !!c;
      for (const o of [r.bg, r.pos, r.name, r.info, r.glory]) o.setVisible(vis);
      r.crest.setVisible(vis);
      if (!c) return;
      r.bg.setTexture(c === this.sel ? 'ui-frame-hl' : 'ui-frame-inner');
      r.pos.setText(`${k + 1}`).setColor(k < 3 ? COLOR.gold : COLOR.dim);
      r.crest.set(c.crest, c.color);
      r.name.setText(c.name).setColor(c.player ? COLOR.green : COLOR.text);
      r.info.setText(`${CLAN_TIERS[C.tier(c)].name} · ${c.city} · ${C.soldiersOf(c)} soldados`);
      r.glory.setText(gl(C.glory(c)));
    });
    // ficha do clã escolhido
    const c = this.sel ?? me;
    const t = C.tier(c);
    this.bigCrest.set(c.crest, c.color);
    this.dName.setText(c.name).setColor(c.player ? COLOR.green : COLOR.gold);
    const lines = [`${CLAN_TIERS[t].name} · #${C.position(c)} no ranking · sede em ${c.city}`, `Líder: ${c.leader}${c.player ? '' : ` (montaria: ${MOUNTS[C.mountOf(c)]?.name ?? 'cavalo'})`} · ${C.soldiersOf(c)} soldados · ${gl(C.glory(c))} Glória`];
    // fortes e territórios
    const F = this.world.forts;
    if (c.player) {
      const terr = F.territories.map((t) => t.name);
      lines.push(terr.length ? `Territórios: ${terr.join(', ')} · fortes: ${F.mine.length} (+${15 * F.mine.length} ouro/min e material)` : 'Sem territórios: tome o forte de um clã rival para ganhar o da cidade');
    } else {
      const f = F.byClan(c.id);
      lines.push(f ? `Forte perto de ${f.city} (vá até o portão com o exército para atacar)` : 'Sem forte (reconstruindo)');
    }
    if (c.player) {
      const nx = CLAN_TIERS[t + 1];
      if (nx) lines.push(nx.name === 'Casa' ? `Para virar Casa: ${gl(nx.glory)} Glória e a patente ${RANKS[RANKS.length - 1].name}` : `Próximo degrau: ${nx.name} com ${gl(nx.glory)} Glória`);
      else lines.push('Seu clã é uma Casa de Vaelmor!');
    } else if (c.beaten) lines.push(`Você já venceu este clã ${c.beaten}×`);
    this.dInfo.setText(lines.join('\n'));
    const g = c.gear && ITEMS[c.gear];
    if (g && !c.player) this.dGear.setText(`O líder carrega: ${g.name} (${RARITY[g.tier ?? 0].name})`).setColor(RARITY[g.tier ?? 0].color);
    else this.dGear.setText(c.player ? 'Vença rivais, cumpra missões e derrote personagens para subir.' : '').setColor(COLOR.dim);
    this.action.setVisible(!c.player).setLabel('VER NO MAPA');
    this.status.setText(c.player ? '' : this.bandText(c)).setColor(this.world.bands.byClan(c.id)?.goal === 'hunt' ? COLOR.red : COLOR.text);
    // aviso: alguém vem atrás de você
    const hunter = this.world.bands.active.find((a) => a.band.goal === 'hunt' || a.band.goal === 'raid');
    this.banner.setVisible(!!hunter);
    this.bannerText.setVisible(!!hunter);
    this.accept.setVisible(false);
    if (hunter) this.bannerText.setText(`${hunter.clan.name} ${hunter.band.goal === 'hunt' ? 'está atrás de você!' : 'marcha contra sua sede!'}`);
    this.chron.setText(C.chronicle.slice(0, 4).map((e) => `· ${e.text}`).join('\n'));
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const win = this.win;
    win.place(u, Math.min(width * 0.96, 800 * u), Math.min(height * 0.94, 380 * u));
    const pad = win.pad;
    const top = win.head + pad / 2;
    const L = (win.W - pad * 3) * 0.5;
    const rh = (win.H - top - pad - 30 * u) / PER_PAGE;
    this.rows.forEach((r, i) => {
      const y = top + i * rh;
      sizeFrame(r.bg, pad, y, L, rh - 3 * u, u);
      const cy = y + (rh - 3 * u) / 2;
      fit(r.pos, 11, u).setPosition(pad + 14 * u, cy);
      r.crest.place(pad + 38 * u, cy, Math.max(1, Math.floor((rh - 10 * u) / 18)));
      fit(r.name, 10, u).setPosition(pad + 56 * u, cy - 1 * u).setOrigin(0, 1);
      fit(r.info, 8, u).setPosition(pad + 56 * u, cy + 1 * u).setOrigin(0, 0);
      fit(r.glory, 10, u).setPosition(pad + L - 10 * u, cy);
    });
    const by = win.H - pad - 24 * u;
    this.prev.place(pad, by, u, L / 2 - 3 * u, 24 * u);
    this.next.place(pad + L / 2 + 3 * u, by, u, L / 2 - 3 * u, 24 * u);
    // direita
    const rx = pad * 2 + L;
    const rw = win.W - rx - pad;
    let y = top;
    const bh = 30 * u;
    // o aviso de desafio fica no pé da coluna
    const fy = win.H - pad - bh;
    sizeFrame(this.banner, rx, fy, rw, bh, u);
    fit(this.bannerText, 9, u).setPosition(rx + 10 * u, fy + bh / 2).setOrigin(0, 0.5).setWordWrapWidth(rw - 100 * u);
    this.accept.place(rx + rw - 84 * u, fy + 4 * u, u, 78 * u, bh - 8 * u);
    const dh = 128 * u;
    sizeFrame(this.detailBox, rx, y, rw, dh, u);
    this.bigCrest.place(rx + 30 * u, y + 34 * u, Math.max(2, Math.round(2.4 * u)));
    fit(this.dName, 12, u).setPosition(rx + 58 * u, y + 12 * u).setWordWrapWidth(rw - 66 * u);
    fit(this.dInfo, 9, u).setPosition(rx + 58 * u, y + 30 * u).setWordWrapWidth(rw - 66 * u);
    fit(this.dGear, 9, u).setPosition(rx + 12 * u, y + dh - 46 * u).setWordWrapWidth(rw - 24 * u);
    this.action.place(rx + 10 * u, y + dh - 32 * u, u, rw - 20 * u, 24 * u);
    y += dh + 4 * u;
    fit(this.status, 9, u).setPosition(rx, y).setWordWrapWidth(rw);
    fit(this.chron, 8, u).setPosition(rx, y + 16 * u).setWordWrapWidth(rw);
    this.refresh(true);
  }
}
