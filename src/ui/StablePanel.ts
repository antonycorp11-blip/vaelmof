import Phaser from 'phaser';
import { MOUNTS, type MountDef } from '../data/mounts';
import type { WorldScene } from '../scenes/WorldScene';
import { HQ } from '../systems/HQ';
import { Stable } from '../systems/Stable';
import { BIOMES } from '../systems/WorldGenerator';
import { Button, COLOR, fit, frame, label, sizeFrame, Window } from './kit';

type Txt = Phaser.GameObjects.Text;

interface Card {
  m: MountDef;
  box: Phaser.GameObjects.NineSlice;
  img: Phaser.GameObjects.Image;
  name: Txt;
}

const pct = (k: number) => `+${Math.round(k * 100)}%`;

/**
 * Estábulo: as 21 montarias (as que você tem coloridas, as outras em sombra),
 * a ficha da escolhida — velocidade, bônus e como conseguir — e os botões de
 * usar, comprar (no estábulo da cidade) e montar/desmontar.
 */
export class StablePanel {
  private win: Window;
  private cards: Card[] = [];
  private sel: MountDef = MOUNTS.bay;
  private info: Txt;
  private use: Button;
  private buy: Button;
  private ride: Button;
  private knight: Button;
  private recallBtn: Button;
  private breedBtn: Button;
  private raceBtn: Button;
  private status: Txt;
  private u = 1;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    const w = (this.win = new Window(scene, 'ESTÁBULO', 26, () => this.setOpen(false)));
    for (const m of Object.values(MOUNTS)) {
      const c: Card = {
        m,
        box: frame(scene, 'frame-inner').setInteractive({ useHandCursor: true }),
        img: scene.add.image(0, 0, 'mount-icons', m.row),
        name: label(scene, m.name, 7, COLOR.text, 1, false).setOrigin(0.5, 0).setAlign('center'),
      };
      c.box.on('pointerdown', () => {
        this.sel = m;
        this.status.setText('');
        this.refresh();
      });
      w.add(c.box, c.img, c.name);
      this.cards.push(c);
    }
    this.info = label(scene, '', 9, COLOR.text, 1, false).setLineSpacing(3);
    this.status = label(scene, '', 9, COLOR.green, 1, false);
    this.use = new Button(scene, { label: 'USAR ESTA', color: 'blue', size: 10, onTap: () => this.say(this.choose()) }).addTo(w.root);
    this.buy = new Button(scene, { label: 'COMPRAR', color: 'gold', size: 10, onTap: () => this.say(world.stable.buy(this.sel.id)) }).addTo(w.root);
    this.ride = new Button(scene, { label: 'MONTAR', icon: 26, color: 'green', size: 10, onTap: () => this.say(world.stable.toggle()) }).addTo(w.root);
    // cavalaria: uma montaria parada vira a de um soldado; procriação multiplica o rebanho
    this.knight = new Button(scene, { label: 'DAR A UM SOLDADO', icon: 2, color: 'blue', size: 9, onTap: () => this.say(this.promote()) }).addTo(w.root);
    this.recallBtn = new Button(scene, { label: 'RECOLHER', color: 'dark', size: 9, onTap: () => this.say(world.army.recall(this.sel.id) ? `${this.sel.name} voltou ao estábulo` : 'Nenhum cavaleiro com esta montaria') }).addTo(w.root);
    this.raceBtn = new Button(scene, { label: 'CORRIDA', icon: 7, color: 'green', size: 9, onTap: () => {
      const why = world.races.start(world.market.cityHere());
      if (why) this.say(why);
      else this.setOpen(false);
    } }).addTo(w.root);
    this.breedBtn = new Button(scene, { label: 'PROCRIAR', icon: 14, color: 'gold', size: 9, onTap: () => this.say(world.stable.breed(this.sel.id)) }).addTo(w.root);
    w.add(this.info, this.status);
    world.stable.on('change', () => this.refresh());
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
      const st = this.world.stable;
      if (st.active) this.sel = MOUNTS[st.active];
      this.status.setText('');
      this.layout(this.u);
    }
  }

  toggle() {
    this.setOpen(!this.open);
  }

  private tick = 0;
  /** Contagem dos filhotes com o painel aberto. */
  update(time = 0) {
    if (!this.open || time < this.tick) return;
    this.tick = time + 1000;
    if (this.world.stable.breeding.length) this.refresh();
  }

  private promote(): string {
    const st = this.world.stable;
    if (!st.owned.has(this.sel.id)) return 'Você ainda não tem esta montaria';
    if (st.free(this.sel.id) <= 0) return st.count(this.sel.id) > 1 ? 'Todas as cópias estão em uso (procrie mais)' : 'Esta é a sua montaria: procrie para ter outra';
    return this.world.army.promote(this.sel.id);
  }

  private choose(): string {
    if (!this.world.stable.owned.has(this.sel.id)) return 'Você ainda não tem esta montaria';
    this.world.stable.choose(this.sel.id);
    return `${this.sel.name} selada`;
  }

  private say(msg: string) {
    this.status.setText(msg).setColor(/^(Falt|Você ainda|Este|Você já|Nenhum|Todas|Baias)/.test(msg) ? COLOR.red : COLOR.green);
    this.refresh();
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const st = this.world.stable;
    const sale = st.forSale();
    this.win.sub.setText(`${st.owned.size}/${Object.keys(MOUNTS).length} montarias · ${this.world.hq.gold} ouro${this.world.market.cityHere() ? ` · estábulo de ${this.world.market.cityHere()!.name}` : ''}`);
    for (const c of this.cards) {
      const has = st.owned.has(c.m.id);
      c.img.setTint(has ? 0xffffff : 0x202028).setAlpha(has ? 1 : 0.85);
      c.box.setTexture(c.m === this.sel ? 'ui-frame-hl' : 'ui-frame-inner');
      c.name.setColor(st.active === c.m.id ? COLOR.green : has ? COLOR.text : COLOR.dim);
      const n = st.count(c.m.id);
      const cub = st.breeding.some((b) => b.id === c.m.id);
      c.name.setText(`${c.m.name}${n > 1 ? ` ×${n}` : ''}${cub ? ' ♥' : ''}`);
    }
    const m = this.sel;
    const has = st.owned.has(m.id);
    const bonus = [m.guard ? `defesa ${pct(m.guard)}` : '', m.power ? `dano ${pct(m.power)}` : ''].filter(Boolean).join(' · ');
    const how = m.price
      ? `Vende por ${m.price} ouro em ${m.biomes.length ? m.biomes.map((b) => BIOMES[b].name).join(', ') : 'qualquer cidade'}`
      : 'Não se compra: cai de campeões, líderes de clã e procurados fortes';
    const n = st.count(m.id);
    const riders = this.world.army.ridersOf(m.id);
    const herd = has ? `Rebanho: ${n}${st.active === m.id ? ' · 1 é a sua' : ''}${riders ? ` · ${riders} com cavaleiro${riders > 1 ? 's' : ''}` : ''} · ${Math.max(0, st.free(m.id))} livre${st.free(m.id) === 1 ? '' : 's'}` : '';
    const cubs = st.breeding.filter((b) => b.id === m.id).map((b) => `filhote em ${Math.max(0, Math.ceil((b.readyAt - Date.now()) / 60000))} min`);
    const breed = has ? `Procriar: ${HQ.costText(Stable.breedCost(m))} · ${Stable.breedMinutes(m)} min · baias ${st.breeding.length}/${st.breedSlots}${cubs.length ? ` · ${cubs.join(', ')}` : ''}` : '';
    this.info.setText([`${m.name}${has ? '  (sua)' : ''} · velocidade ×${m.speed.toFixed(2).replace('.', ',')}${bonus ? ` · ${bonus}` : ''}`, `${m.desc} ${how}.`, herd, breed].filter(Boolean).join('\n'));
    this.knight.setVisible(has).setColor(st.free(m.id) > 0 ? 'blue' : 'dark');
    this.recallBtn.setVisible(has && riders > 0);
    this.breedBtn.setVisible(has).setColor(st.breedBlock(m.id) ? 'dark' : 'gold');
    const city = this.world.market.cityHere();
    const best = city ? this.world.races.best[city.name] : undefined;
    this.raceBtn.setVisible(!!city).setColor(this.world.races.startBlock(city) ? 'dark' : 'green').setLabel(best ? `CORRIDA (${best} s)` : 'CORRIDA');
    this.use.setEnabled(has && st.active !== m.id);
    this.buy.setVisible(!has && sale.includes(m)).setLabel(`COMPRAR ${m.price}`);
    this.ride.setLabel(st.riding ? 'DESMONTAR' : 'MONTAR').setEnabled(!!st.active);
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const win = this.win;
    win.place(u, Math.min(width * 0.97, 820 * u), Math.min(height * 0.95, 384 * u));
    const pad = win.pad;
    const top = win.head + pad / 2;
    const cols = 7;
    const cw = (win.W - pad * 2) / cols;
    const ch = Math.min(76 * u, (win.H - top - pad - 92 * u) / 3);
    this.cards.forEach((c, i) => {
      const x = pad + (i % cols) * cw;
      const y = top + Math.floor(i / cols) * ch;
      sizeFrame(c.box, x + 1, y + 1, cw - 3 * u, ch - 3 * u, u);
      const k = Math.min((ch - 16 * u) / 80, (cw - 6 * u) / 112);
      c.img.setScale(k).setPosition(Math.round(x + cw / 2), Math.round(y + (ch - 14 * u) / 2 + 1 * u));
      fit(c.name, 7, u).setPosition(x + cw / 2, y + ch - 14 * u).setWordWrapWidth(cw - 6 * u);
    });
    const by = top + ch * 3 + 6 * u;
    fit(this.info, 8.5, u).setPosition(pad, by).setWordWrapWidth(win.W - pad * 2 - 310 * u);
    const bx = win.W - pad - 300 * u;
    this.use.place(bx, by, u, 96 * u, 24 * u);
    this.buy.place(bx + 100 * u, by, u, 100 * u, 24 * u);
    this.ride.place(bx + 204 * u, by, u, 96 * u, 24 * u);
    this.knight.place(bx, by + 28 * u, u, 132 * u, 24 * u);
    this.recallBtn.place(bx + 136 * u, by + 28 * u, u, 74 * u, 24 * u);
    this.breedBtn.place(bx + 214 * u, by + 28 * u, u, 86 * u, 24 * u);
    this.raceBtn.place(pad, win.H - pad - 24 * u, u, 140 * u, 22 * u);
    fit(this.status, 9, u).setPosition(bx, by + 58 * u).setWordWrapWidth(300 * u);
    this.refresh(true);
  }
}
