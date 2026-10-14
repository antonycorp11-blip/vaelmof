import Phaser from 'phaser';
import { RARITY } from '../data/gear';
import { ITEMS, type ItemDef } from '../data/items';
import type { WorldScene } from '../scenes/WorldScene';
import { BUILD_ORDER, DEFS, HQ, TRAIN_MAX, TRAIN_NAME, trainCost, type BuildId, type Train } from '../systems/HQ';
import { Inventory } from '../systems/Inventory';
import { Button, COLOR, drawBar, fit, frame, label, sizeFrame, Window } from './kit';

type Txt = Phaser.GameObjects.Text;
type Tab = 'build' | 'troops' | 'chest';

interface BRow {
  id: BuildId;
  box: Phaser.GameObjects.NineSlice;
  name: Txt;
  desc: Txt;
  cost: Txt;
  bar: Phaser.GameObjects.Graphics;
  btn: Button;
}

interface TRow {
  id: Train;
  name: Txt;
  info: Txt;
  bar: Phaser.GameObjects.Graphics;
  btn: Button;
}

interface Cell {
  box: Phaser.GameObjects.NineSlice;
  icon: Phaser.GameObjects.Image;
  qty: Txt;
}

const TRAIN_FX: Record<Train, (lv: number) => string> = {
  atk: (lv) => `dano +${lv * 10}%`,
  def: (lv) => `dano recebido −${Math.min(50, lv * 5)}%`,
  hp: (lv) => `vida +${lv * 12}%`,
};

/**
 * Sede do clã: erguer a sede (sendo Clã, perto de uma cidade), construir e
 * melhorar muralhas, torres e prédios, treinar os soldados no Arsenal, postar
 * guardas e usar o baú do Armazém. A corneta leva o herói de volta à sede.
 */
export class HQPanel {
  private win: Window;
  private tab: Tab = 'build';
  private tabs: Record<Tab, Button>;
  private home: Button;
  private status: Txt;
  // sem sede
  private intro: Txt;
  private foundBtn: Button;
  // construir
  private rows: BRow[] = [];
  // soldados
  private trows: TRow[] = [];
  private guardTitle: Txt;
  private guardInfo: Txt;
  private guardBtns: Button[] = [];
  private infoBox: Phaser.GameObjects.NineSlice;
  // baú
  private bagTitle: Txt;
  private chestTitle: Txt;
  private bagCells: Cell[] = [];
  private chestCells: Cell[] = [];
  private u = 1;
  private lastTick = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    const w = (this.win = new Window(scene, 'SEDE DO CLÃ', 23, () => this.setOpen(false)));
    const tab = (t: Tab, text: string, icon: number) => new Button(scene, { label: text, icon, color: 'dark', size: 10, onTap: () => this.show(t) }).addTo(w.root);
    this.tabs = { build: tab('build', 'CONSTRUIR', 25), troops: tab('troops', 'SOLDADOS', 2), chest: tab('chest', 'BAÚ', 24) };
    this.home = new Button(scene, { label: 'VOLTAR À SEDE', icon: 11, color: 'gold', size: 10, onTap: () => this.say(world.hq.returnHome() || '') }).addTo(w.root);
    this.status = label(scene, '', 9, COLOR.red, 1, false);
    this.intro = label(scene, '', 10, COLOR.text, 1, false).setLineSpacing(4);
    this.foundBtn = new Button(scene, { label: 'ERGUER A SEDE AQUI', icon: 23, color: 'gold', size: 12, onTap: () => this.found() }).addTo(w.root);
    w.add(this.status, this.intro);
    for (const id of BUILD_ORDER) {
      const r: BRow = {
        id,
        box: frame(scene, 'frame-inner'),
        name: label(scene, '', 9, COLOR.gold),
        desc: label(scene, '', 7.5, COLOR.dim, 1, false),
        cost: label(scene, '', 7.5, COLOR.text, 1, false),
        bar: scene.add.graphics(),
        btn: new Button(scene, { label: '', color: 'green', size: 8, onTap: () => this.say(world.hq.build(id)) }),
      };
      w.add(r.box, r.bar, r.name, r.desc, r.cost);
      r.btn.addTo(w.root);
      this.rows.push(r);
    }
    for (const id of ['atk', 'def', 'hp'] as Train[]) {
      const r: TRow = {
        id,
        name: label(scene, TRAIN_NAME[id].toUpperCase(), 11, COLOR.gold),
        info: label(scene, '', 8, COLOR.dim, 1, false),
        bar: scene.add.graphics(),
        btn: new Button(scene, { label: 'TREINAR', color: 'green', size: 9, onTap: () => this.say(world.hq.train(id)) }),
      };
      w.add(r.bar, r.name, r.info);
      r.btn.addTo(w.root);
      this.trows.push(r);
    }
    this.infoBox = frame(scene, 'frame-inner');
    this.guardTitle = label(scene, 'GUARDA DA SEDE', 11, COLOR.blue);
    this.guardInfo = label(scene, '', 8.5, COLOR.text, 1, false).setLineSpacing(3);
    w.add(this.infoBox, this.guardTitle, this.guardInfo);
    const gb = (text: string, fn: () => void, color: 'blue' | 'dark' = 'blue') => {
      const b = new Button(scene, { label: text, color, size: 9, onTap: fn }).addTo(w.root);
      this.guardBtns.push(b);
    };
    const room = () => Math.max(0, world.hq.stationCap - world.army.stationed.length);
    gb('POSTAR +5', () => this.say(this.post(Math.min(5, room()))));
    gb('POSTAR TODOS', () => this.say(this.post(room())));
    gb('CHAMAR +5', () => this.say(`${world.army.unstation(5)} soldados voltam para você`), 'dark');
    gb('CHAMAR TODOS', () => this.say(`${world.army.unstation(9999)} soldados voltam para você`), 'dark');
    this.bagTitle = label(scene, 'MOCHILA (toque para guardar)', 9, COLOR.blue);
    this.chestTitle = label(scene, 'BAÚ (toque para pegar)', 9, COLOR.gold);
    w.add(this.bagTitle, this.chestTitle);
    const cell = (list: Cell[], from: 'bag' | 'chest', i: number) => {
      const box = frame(scene, 'frame-inner').setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => this.say(world.hq.move(from, i)));
      const icon = scene.add.image(0, 0, 'items', 0).setVisible(false);
      const qty = label(scene, '', 8, COLOR.text).setOrigin(1, 1);
      w.add(box, icon, qty);
      list.push({ box, icon, qty });
    };
    for (let i = 0; i < Inventory.SLOTS; i++) cell(this.bagCells, 'bag', i);
    for (let i = 0; i < 48; i++) cell(this.chestCells, 'chest', i);
    world.hq.on('change', () => this.refresh());
    world.inventory.on('change', () => this.refresh());
    world.army.on('change', () => this.refresh());
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
    if (!this.open || time - this.lastTick < 700) return;
    this.lastTick = time;
    this.refresh();
  }

  private say(msg: string, ok = false) {
    this.status.setText(msg).setColor(ok ? COLOR.green : COLOR.red);
    this.refresh();
  }

  private post(n: number): string {
    const hq = this.world.hq;
    if (!hq.founded) return 'Sem sede';
    if (hq.stationCap <= 0) return 'Construa o Alojamento para ter guarda';
    if (n <= 0) return 'Alojamento cheio (melhore para mais guarda)';
    const k = this.world.army.station(n);
    return k ? `${k} soldados seguem para a sede` : 'Nenhum soldado com você para postar';
  }

  private found() {
    const why = this.world.hq.found();
    if (why) return this.say(why);
    this.say('Sede erguida! Construa a muralha, torres e prédios.', true);
    this.layout(this.u);
  }

  private show(t: Tab) {
    this.tab = t;
    this.status.setText('');
    this.layout(this.u);
  }

  private setIcon(c: Cell, def: ItemDef | null, qty: number, size: number) {
    if (!def) {
      c.icon.setVisible(false);
      c.qty.setText('');
      c.box.clearTint();
      return;
    }
    const sheet = def.sheet ?? 'items';
    c.icon.setTexture(sheet, def.icon).setVisible(true);
    c.icon.setScale((size * (sheet === 'armor-icons' ? 0.8 : 0.56)) / (sheet === 'armor-icons' ? 54 : 16));
    if (def.tint) c.icon.setTint(def.tint);
    else c.icon.clearTint();
    if (def.tier) c.box.setTint(RARITY[def.tier].frame);
    else c.box.clearTint();
    c.qty.setText(qty > 1 ? String(qty) : '');
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const w = this.world;
    const hq = w.hq;
    const founded = hq.founded;
    const inv = w.inventory;
    this.win.sub.setText(
      founded
        ? `perto de ${hq.city.name} · ${hq.gold} ouro (+${hq.incomePerMin}/min) · guarda ${w.army.stationed.length}/${hq.stationCap}${hq.st.raid ? ' · ATAQUE A CAMINHO' : ''}`
        : `${hq.gold} ouro · ainda sem sede`,
    );
    for (const [t, b] of Object.entries(this.tabs) as [Tab, Button][]) b.setVisible(founded).setColor(t === this.tab ? 'blue' : 'dark');
    const rb = hq.returnBlock();
    this.home.setVisible(founded).setEnabled(!rb);
    // sem sede: o que precisa para erguer
    this.intro.setVisible(!founded);
    this.foundBtn.setVisible(!founded);
    if (!founded) {
      const why = hq.foundBlock();
      const mats = `Você tem: ${inv.countFamily('wood')} madeira · ${inv.countFamily('stone')} pedra · ${inv.countFamily('ore')} minério · ${inv.countFamily('fiber')} fibra · ${inv.countFamily('crystal')} cristal`;
      this.intro.setText(
        [
          'A sede é o quartel-general do clã, erguida nas vizinhanças de uma cidade com o que você coleta.',
          '· Só lá os soldados se curam, se treinam e montam guarda.',
          '· Só lá chegam os chamados dos Lordes (missões).',
          '· Rende ouro, guarda um baú e pode ser atacada por clãs rivais. Se o Salão cair, o clã acaba.',
          '',
          `Para erguer: ser Clã (600 de Glória) e ${HQ.costText(DEFS.hall.cost[1])}. Fique num terreno plano a até 60 tiles de uma cidade.`,
          mats,
          why ? `Ainda não: ${why}.` : 'Tudo pronto: a sede será erguida em volta de você.',
        ].join('\n'),
      );
      this.foundBtn.setEnabled(!why);
    }
    const tab = founded ? this.tab : null;
    // construir
    const u = this.u;
    for (const r of this.rows) {
      const on = tab === 'build';
      for (const o of [r.box, r.name, r.desc, r.cost, r.bar]) o.setVisible(on);
      r.btn.setVisible(on);
      if (!on) continue;
      const D = DEFS[r.id];
      const lv = hq.level(r.id);
      const max = D.hp.length - 1;
      const hp = hq.st.hp[r.id];
      const broken = lv > 0 && hp < D.hp[lv];
      r.name.setText(`${D.name}  ${lv ? `nível ${lv}/${max}` : 'não construída'}`).setColor(lv ? (hp > 0 ? COLOR.gold : COLOR.red) : COLOR.dim);
      r.desc.setText(D.desc[Math.min(max, lv + (lv < max ? 1 : 0))] || D.desc[lv] || '');
      const next = hq.nextCost(r.id);
      r.cost.setText(broken ? `reparar: ${HQ.costText(hq.repairCost(r.id))}` : next ? `custo: ${HQ.costText(next)}` : 'nível máximo').setColor(broken ? COLOR.red : COLOR.blue);
      const why = broken ? '' : hq.buildBlock(r.id);
      r.btn.setLabel(broken ? 'REPARAR' : !next ? 'MÁXIMO' : lv ? 'MELHORAR' : 'CONSTRUIR').setColor(broken ? 'gold' : 'green').setEnabled(broken || !why);
      r.bar.clear();
      if (lv) drawBar(r.bar, r.box.x + 8 * u, r.box.y + r.box.displayHeight - 7 * u, r.box.displayWidth - 100 * u, 3 * u, hp / D.hp[lv], hp / D.hp[lv] > 0.4 ? 0x5fbf52 : 0xd83c3c, u);
    }
    // soldados
    const tr = tab === 'troops';
    for (const r of this.trows) {
      for (const o of [r.name, r.info, r.bar]) o.setVisible(tr);
      r.btn.setVisible(tr);
      if (!tr) continue;
      const lv = hq.st.train[r.id];
      const why = hq.trainBlock(r.id);
      r.info.setText(`nível ${lv}/${TRAIN_MAX} · ${TRAIN_FX[r.id](lv)}${lv < TRAIN_MAX ? ` · próximo: ${HQ.costText(trainCost(lv))}` : ''}${why && why !== 'Nível máximo' ? ` · ${why}` : ''}`);
      r.btn.setEnabled(!why);
      r.bar.clear();
      drawBar(r.bar, r.name.x, r.name.y + 16 * u, this.win.W * 0.42, 5 * u, lv / TRAIN_MAX, 0xffc850, u);
    }
    for (const o of [this.infoBox, this.guardTitle, this.guardInfo]) o.setVisible(tr);
    for (const b of this.guardBtns) b.setVisible(tr);
    if (tr) {
      const a = w.army;
      const raid = hq.st.raid;
      const rc = raid && w.clans.byId(raid.clan);
      this.guardInfo.setText(
        [
          `De guarda: ${a.stationed.length}/${hq.stationCap} · aquartelados: ${a.garrison.length} · com você: ${a.field.length}`,
          'Os guardas ficam na sede e lutam quando ela é atacada; os aquartelados também defendem.',
          'Os soldados só se curam aqui na sede (Enfermaria acelera).',
          `Insígnia do exército: ${['Miliciano', 'Escudeiro', 'Lâmina Jurada', 'Guardião de Ferro'][a.upTier]} (sobe com o treino, não com abates).`,
          rc ? `ATAQUE: ${rc.name} chega em ${Math.max(0, Math.ceil((raid!.at - w.clans.now) / 1000))} s!` : '',
        ].join('\n'),
      );
    }
    // baú
    const ch = tab === 'chest';
    for (const o of [this.bagTitle, this.chestTitle]) o.setVisible(ch);
    const size = hq.chestSize;
    const cs = this.cellSize;
    this.bagCells.forEach((c, i) => {
      for (const o of [c.box, c.icon, c.qty]) o.setVisible(ch);
      if (!ch) return;
      const s = inv.slots[i];
      this.setIcon(c, s ? ITEMS[s.id] : null, s?.qty ?? 0, cs);
    });
    this.chestCells.forEach((c, i) => {
      const vis = ch && i < size;
      for (const o of [c.box, c.icon, c.qty]) o.setVisible(vis);
      if (!vis) return;
      const s = hq.st.chest[i];
      this.setIcon(c, s ? ITEMS[s.id] : null, s?.qty ?? 0, cs);
    });
    if (ch) this.chestTitle.setText(size ? `BAÚ ${hq.st.chest.filter(Boolean).length}/${size} (toque para pegar)` : 'BAÚ: construa o Armazém');
  }

  private cellSize = 20;

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const win = this.win;
    win.place(u, Math.min(width * 0.97, 820 * u), Math.min(height * 0.95, 384 * u));
    const pad = win.pad;
    let top = win.head + pad / 2;
    const founded = this.world.hq.founded;
    // abas
    const tw = 104 * u;
    (['build', 'troops', 'chest'] as Tab[]).forEach((t, i) => this.tabs[t].place(pad + i * (tw + 4 * u), top, u, tw, 24 * u));
    this.home.place(win.W - pad - 130 * u, top, u, 130 * u, 24 * u);
    fit(this.status, 9, u).setPosition(pad + 3 * (tw + 4 * u) + 6 * u, top + 6 * u).setWordWrapWidth(win.W - pad * 2 - 3 * (tw + 4 * u) - 140 * u);
    if (founded) top += 30 * u;
    // sem sede
    fit(this.intro, 9.5, u).setPosition(pad, top).setWordWrapWidth(win.W - pad * 2);
    this.foundBtn.place(win.W / 2 - 120 * u, win.H - pad - 34 * u, u, 240 * u, 32 * u);
    if (!founded) fit(this.status, 9, u).setPosition(pad, win.H - pad - 50 * u).setWordWrapWidth(win.W - pad * 2);
    // construir: 2 colunas × 7
    const L = (win.W - pad * 2 - 6 * u) / 2;
    const rh = (win.H - top - pad) / 7;
    this.rows.forEach((r, i) => {
      const x = pad + Math.floor(i / 7) * (L + 6 * u);
      const y = top + (i % 7) * rh;
      sizeFrame(r.box, x, y, L, rh - 3 * u, u);
      fit(r.name, 9, u).setPosition(x + 8 * u, y + 5 * u);
      fit(r.desc, 7.5, u).setPosition(x + 8 * u, y + 16 * u).setWordWrapWidth(L - 104 * u);
      fit(r.cost, 7.5, u).setPosition(x + 8 * u, y + 27 * u).setOrigin(0, 0).setWordWrapWidth(L - 104 * u);
      r.btn.place(x + L - 92 * u, y + (rh - 3 * u) / 2 - 11 * u, u, 84 * u, 22 * u);
    });
    // soldados
    this.trows.forEach((r, i) => {
      const y = top + i * 52 * u;
      fit(r.name, 11, u).setPosition(pad, y);
      fit(r.info, 8, u).setPosition(pad, y + 26 * u).setWordWrapWidth(win.W * 0.5);
      r.btn.place(pad + win.W * 0.42 + 10 * u, y + 4 * u, u, 84 * u, 24 * u);
    });
    const gx = win.W * 0.6;
    const gw = win.W - gx - pad;
    sizeFrame(this.infoBox, gx, top, gw, win.H - top - pad, u);
    fit(this.guardTitle, 11, u).setPosition(gx + 10 * u, top + 8 * u);
    this.guardBtns.forEach((b, i) => b.place(gx + 10 * u + (i % 2) * ((gw - 26 * u) / 2 + 6 * u), top + 26 * u + Math.floor(i / 2) * 28 * u, u, (gw - 26 * u) / 2, 24 * u));
    fit(this.guardInfo, 8.5, u).setPosition(gx + 10 * u, top + 84 * u).setWordWrapWidth(gw - 20 * u);
    // baú: mochila à esquerda, baú à direita
    const half = (win.W - pad * 3) / 2;
    const cs = Math.floor(Math.min(half / 8, (win.H - top - pad - 16 * u) / 6));
    this.cellSize = cs;
    fit(this.bagTitle, 9, u).setPosition(pad, top);
    fit(this.chestTitle, 9, u).setPosition(pad * 2 + half, top);
    const grid = (list: Cell[], x0: number) =>
      list.forEach((c, i) => {
        const x = x0 + (i % 8) * cs;
        const y = top + 14 * u + Math.floor(i / 8) * cs;
        sizeFrame(c.box, x + 1, y + 1, cs - 2, cs - 2, u);
        c.icon.setPosition(x + cs / 2, y + cs / 2);
        fit(c.qty, 8, u).setPosition(x + cs - 3 * u, y + cs - 2 * u);
      });
    grid(this.bagCells, pad);
    grid(this.chestCells, pad * 2 + half);
    this.refresh(true);
  }
}
