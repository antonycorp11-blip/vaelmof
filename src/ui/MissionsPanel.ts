import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { lordOf, type Mission } from '../systems/Missions';
import { Button, COLOR, fit, frame, label, sizeFrame, Window } from './kit';

type Txt = Phaser.GameObjects.Text;

interface Card {
  box: Phaser.GameObjects.NineSlice;
  title: Txt;
  desc: Txt;
  reward: Txt;
  btn: Button;
  m?: Mission;
}

const KIND_COLOR: Record<string, string> = { hunt: COLOR.green, bounty: COLOR.red, clan: COLOR.blue, duel: COLOR.gold };

/**
 * Missões: à esquerda o que o Lorde da cidade onde o herói está oferece; à
 * direita as missões aceitas (até 3), com o progresso. Cumpridas, pagam na
 * hora em Glória e recrutas.
 */
export class MissionsPanel {
  private win: Window;
  private lordTitle: Txt;
  private none: Txt;
  private offers: Card[] = [];
  private activeTitle: Txt;
  private actives: Card[] = [];
  private status: Txt;
  private u = 1;
  private lastTick = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.win = new Window(scene, 'MISSÕES', 18, () => this.setOpen(false));
    this.lordTitle = label(scene, '', 11, COLOR.gold);
    this.none = label(scene, '', 10, COLOR.dim, 1, false).setAlign('center').setOrigin(0.5);
    this.activeTitle = label(scene, 'EM ANDAMENTO', 11, COLOR.blue);
    this.status = label(scene, '', 9, COLOR.red, 1, false);
    this.win.add(this.lordTitle, this.none, this.activeTitle, this.status);
    const card = (accept: boolean, i: number): Card => {
      const c: Card = {
        box: frame(scene, 'frame-inner'),
        title: label(scene, '', 10, COLOR.text),
        desc: label(scene, '', 8, COLOR.dim, 1, false).setLineSpacing(2),
        reward: label(scene, '', 8, COLOR.gold),
        btn: new Button(scene, { label: accept ? 'ACEITAR' : 'ABANDONAR', color: accept ? 'green' : 'dark', size: 9, onTap: () => (accept ? this.accept(i) : this.abandon(i)) }),
      };
      this.win.add(c.box, c.title, c.desc, c.reward);
      c.btn.addTo(this.win.root);
      return c;
    };
    for (let i = 0; i < 3; i++) this.offers.push(card(true, i));
    for (let i = 0; i < 3; i++) this.actives.push(card(false, i));
    world.missions.on('change', () => this.refresh());
  }

  get open() {
    return this.win.open;
  }

  contains(x: number, y: number) {
    return this.win.contains(x, y);
  }

  setOpen(on: boolean) {
    this.win.setOpen(on);
    if (on) {
      this.status.setText('');
      this.layout(this.u);
    }
  }

  toggle() {
    this.setOpen(!this.open);
  }

  update(time: number) {
    if (!this.open || time - this.lastTick < 800) return;
    this.lastTick = time;
    this.refresh();
  }

  private accept(i: number) {
    const city = this.world.missions.cityHere();
    const m = this.offers[i].m;
    if (!city || !m) return;
    const why = this.world.missions.accept(city, m);
    this.status.setText(why || `Missão aceita: ${m.title}`).setColor(why ? COLOR.red : COLOR.green);
    this.refresh();
  }

  private abandon(i: number) {
    const m = this.actives[i].m;
    if (m) this.world.missions.abandon(m);
  }

  private fill(c: Card, m: Mission | undefined, active: boolean) {
    c.m = m;
    for (const o of [c.box, c.title, c.desc, c.reward]) o.setVisible(!!m);
    c.btn.setVisible(!!m);
    if (!m) return;
    c.title.setText(active && m.kind === 'hunt' ? `${m.title} · ${m.have}/${m.need}` : m.title).setColor(KIND_COLOR[m.kind]);
    c.desc.setText(m.desc);
    c.reward.setText(`+${m.reward} Glória · +${this.world.missions.gold(m)} ouro · +${m.recruits} recrutas${active ? ` · ${lordOf(m.city)}` : ''}`);
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const M = this.world.missions;
    const city = M.cityHere();
    this.win.sub.setText(`${M.done} cumpridas · ${M.active.length}/3 em andamento`);
    const offers = city ? M.offersOf(city) : [];
    const hq = this.world.hq;
    this.lordTitle.setText(city ? `Chamados de ${lordOf(city.name)} de ${city.name}:` : hq.founded ? 'Longe da sede' : 'Longe de Brumavale');
    this.none
      .setVisible(!city)
      .setText(hq.founded ? 'Os chamados dos Lordes chegam ao Salão da sede.\nVolte à sede para aceitar missões.' : 'Sem sede, o clã recebe os chamados no salão\nde Brumavale. Erga uma sede quando virar Clã.');
    this.offers.forEach((c, i) => this.fill(c, offers[i], false));
    this.actives.forEach((c, i) => this.fill(c, M.active[i], true));
    for (const c of this.offers) c.btn.setEnabled(M.active.length < 3);
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const win = this.win;
    win.place(u, Math.min(width * 0.96, 800 * u), Math.min(height * 0.94, 380 * u));
    const pad = win.pad;
    const top = win.head + pad / 2;
    const L = (win.W - pad * 3) / 2;
    const ch = (win.H - top - pad - 36 * u) / 3;
    const place = (c: Card, x: number, y: number) => {
      sizeFrame(c.box, x, y, L, ch - 4 * u, u);
      fit(c.title, 10, u).setPosition(x + 10 * u, y + 8 * u).setWordWrapWidth(L - 20 * u);
      fit(c.desc, 8, u).setPosition(x + 10 * u, y + 22 * u).setWordWrapWidth(L - 104 * u);
      fit(c.reward, 8, u).setPosition(x + 10 * u, y + ch - 20 * u);
      c.btn.place(x + L - 90 * u, y + ch - 34 * u, u, 82 * u, 24 * u);
    };
    fit(this.lordTitle, 11, u).setPosition(pad, top);
    fit(this.activeTitle, 11, u).setPosition(pad * 2 + L, top);
    this.offers.forEach((c, i) => place(c, pad, top + 18 * u + i * ch));
    this.actives.forEach((c, i) => place(c, pad * 2 + L, top + 18 * u + i * ch));
    fit(this.none, 10, u).setPosition(pad + L / 2, top + 18 * u + ch * 1.5);
    fit(this.status, 9, u).setPosition(pad, win.H - pad - 12 * u);
    this.refresh(true);
  }
}
