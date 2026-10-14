import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { SOLDIER_TYPES, SOLDIERS, type SoldierType } from '../systems/Army';
import { Button, COLOR, drawBar, fit, frame, label, sizeFrame, Window } from './kit';

type Txt = Phaser.GameObjects.Text;

interface Card {
  type: SoldierType;
  box: Phaser.GameObjects.NineSlice;
  portrait: Phaser.GameObjects.Image;
  name: Txt;
  stats: Txt;
  count: Txt;
  plus1: Button;
  plus5: Button;
}

const ROLE: Record<SoldierType, string> = {
  sword: 'linha de frente',
  greatsword: 'tropa de choque',
  bow: 'atiradores',
  staff: 'magia em área',
};

/**
 * Quartel de Brumavale: cartas dos quatro tipos de soldado (retrato, números,
 * custo em recrutas e +1 / +5), a reserva de recrutas, como o exército se
 * cura e as ordens de aquartelar/convocar e declarar guerra.
 */
export class ArmyPanel {
  private win: Window;
  private poolBar: Phaser.GameObjects.Graphics;
  private poolText: Txt;
  private where: Txt;
  private status: Txt;
  private infoBox: Phaser.GameObjects.NineSlice;
  private info: Txt;
  private campBtn: Button;
  private warBtn: Button;
  private cards: Card[] = [];
  private u = 1;
  private lastTick = 0;
  private bar = { x: 0, y: 0, w: 10, h: 10 };

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.win = new Window(scene, 'QUARTEL DE BRUMAVALE', 2, () => this.setOpen(false));
    this.poolBar = scene.add.graphics();
    this.poolText = label(scene, '', 10, COLOR.text).setOrigin(0.5);
    this.where = label(scene, '', 10, COLOR.dim, 1, false);
    this.status = label(scene, '', 10, COLOR.red).setOrigin(0.5, 0);
    this.infoBox = frame(scene, 'frame-inner');
    this.info = label(scene, '', 9, COLOR.text, 1, false).setLineSpacing(3);
    this.campBtn = new Button(scene, { label: 'AQUARTELAR', icon: 10, color: 'gold', size: 11, onTap: () => this.camp() });
    this.warBtn = new Button(scene, { label: 'DECLARAR GUERRA', icon: 5, color: 'red', size: 11, onTap: () => this.war() });
    this.win.add(this.poolBar, this.poolText, this.where, this.status, this.infoBox, this.info);
    this.campBtn.addTo(this.win.root);
    this.warBtn.addTo(this.win.root);
    for (const type of SOLDIER_TYPES) {
      const c: Card = {
        type,
        box: frame(scene, 'frame-inner'),
        portrait: scene.add.image(0, 0, 'ui-menu', 2),
        name: label(scene, SOLDIERS[type].name, 11, COLOR.gold).setOrigin(0.5, 0),
        stats: label(scene, '', 8, COLOR.dim, 1, false).setOrigin(0.5, 0).setAlign('center').setLineSpacing(2),
        count: label(scene, '', 9, COLOR.blue).setOrigin(0.5, 0),
        plus1: new Button(scene, { label: '+1', color: 'blue', size: 11, onTap: () => this.recruit(type, 1) }),
        plus5: new Button(scene, { label: '+5', color: 'blue', size: 11, onTap: () => this.recruit(type, 5) }),
      };
      this.win.add(c.box, c.portrait, c.name, c.stats, c.count);
      c.plus1.addTo(this.win.root);
      c.plus5.addTo(this.win.root);
      this.cards.push(c);
    }
    world.army.on('change', () => this.refresh());
    world.army.on('war', () => this.refresh());
    world.army.on('war-end', () => this.refresh());
    world.progress.on('change', () => this.refresh());
  }

  get open() {
    return this.win.open;
  }

  contains(x: number, y: number): boolean {
    return this.win.contains(x, y);
  }

  setOpen(on: boolean) {
    this.win.setOpen(on);
    this.status.setText('');
    if (!on) return;
    this.layout(this.u);
    // os retratos são as folhas dos soldados, fundidas na primeira vez
    this.world.army.prepare(() => {
      for (const c of this.cards) c.portrait.setTexture(`sold-0-${c.type}`, 0);
      this.layout(this.u);
    });
  }

  toggle() {
    this.setOpen(!this.open);
  }

  update(time: number) {
    if (!this.open || time - this.lastTick < 500) return;
    this.lastTick = time;
    this.refresh();
  }

  private say(msg: string, color = COLOR.red) {
    this.status.setText(msg).setColor(color);
  }

  private recruit(type: SoldierType, n: number) {
    const a = this.world.army;
    const why = a.recruitBlock(type, 1);
    if (why) return this.say(why);
    a.prepare(() => {
      const k = a.recruit(type, n);
      this.say(`${k} ${SOLDIERS[type].name} ${k > 1 ? 'entraram' : 'entrou'} no exército`, COLOR.green);
      this.refresh();
    });
  }

  private camp() {
    const a = this.world.army;
    if (a.garrison.length) this.say(`${a.summon()} soldados convocados: chegam marchando, curados`, COLOR.green);
    else if (a.war) this.say('Não dá para aquartelar no meio de uma guerra');
    else if (a.quarter()) this.say('Exército aquartelado · você segue sozinho', COLOR.gold);
    else this.say('Não há soldados para aquartelar');
    this.refresh();
  }

  /** Abre o painel de Clãs (definido pela UIScene). */
  onClans?: () => void;

  private war() {
    if (this.world.army.war) return;
    this.onClans?.();
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const w = this.world;
    const a = w.army;
    const P = w.progress;
    const u = this.u;
    const field = a.allies.length;
    const order = a.mode === 'follow' ? 'seguir' : a.mode === 'attack' ? 'atacar' : 'segurar';
    this.win.sub.setText(`${P.rank.name} · ${a.size}/${P.armyCap} soldados · ordem: ${order}`);
    // reserva de recrutas
    const g = this.poolBar;
    g.clear();
    drawBar(g, this.bar.x, this.bar.y, this.bar.w, this.bar.h, a.pool / a.poolMax, 0x5aa0ff, u);
    this.poolText.setText(`Recrutas ${a.pool}/${a.poolMax} · +1 a cada 3 s`);
    this.where.setText(a.inCapital ? 'Você está em Brumavale: pode recrutar' : 'Volte a Brumavale (cidade dourada no mapa) para recrutar').setColor(a.inCapital ? COLOR.green : COLOR.dim);
    for (const c of this.cards) {
      const D = SOLDIERS[c.type];
      const mine = a.allies.filter((s) => s.type === c.type);
      const kept = a.garrison.filter((s) => s.t === c.type).length;
      const role = D.ranged ? `${ROLE[c.type]} · alcance ${D.range}` : ROLE[c.type];
      c.stats.setText(`vida ${D.hp} · dano ${D.damage}\n${role}\ncusto: ${D.cost} recruta${D.cost > 1 ? 's' : ''}`);
      c.count.setText(`${mine.length} no campo${kept ? ` · ${kept} no quartel` : ''}`);
      const ok = !a.recruitBlock(c.type, 1);
      c.plus1.setEnabled(ok);
      c.plus5.setEnabled(ok);
      c.portrait.setAlpha(ok || mine.length ? 1 : 0.6);
    }
    this.campBtn.setLabel(a.garrison.length ? `CONVOCAR (${a.garrison.length})` : 'AQUARTELAR').setIcon(a.garrison.length ? 11 : 10);
    this.campBtn.setEnabled(!!a.garrison.length || (field > 0 && !a.war));
    this.warBtn.setLabel(a.war ? `EM GUERRA: ${a.war.house}` : 'DESAFIAR UM CLÃ').setEnabled(!a.war);
    this.info.setText(
      [
        this.world.hq.founded
          ? 'CURA · os soldados só se curam na sede do clã (8% da vida por segundo; a Enfermaria acelera). Fora dela, não.'
          : 'CURA · sem sede, os soldados se curam aqui em Brumavale (15% por segundo). Com sede, só lá.',
        'AQUARTELAR · o exército vai para o quartel (a sede, se houver) e você anda sozinho; convocar traz todos curados.',
        'TREINO · os soldados não sobem de patente por abates: ficam mais fortes no Arsenal da sede (ataque, defesa, vida).',
      ].join('\n\n'),
    );
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const W = Math.min(width * 0.96, 800 * u);
    const H = Math.min(height * 0.94, 380 * u);
    const win = this.win;
    win.place(u, W, H);
    const pad = win.pad;
    const top = win.head + pad / 2;
    // --- cartas dos soldados
    const gap = 8 * u;
    const cw = (win.W - pad * 2 - gap * 3) / 4;
    const ch = Math.min(176 * u, win.H * 0.52);
    this.cards.forEach((c, i) => {
      const x = pad + i * (cw + gap);
      sizeFrame(c.box, x, top, cw, ch, u);
      const cx = x + cw / 2;
      fit(c.name, 11, u).setPosition(cx, top + 7 * u);
      // retrato: a folha tem quadros de 96 px com o soldado ocupando ~64
      const ph = ch * 0.36;
      const isSheet = c.portrait.texture.key.startsWith('sold-');
      const sc = Math.max(1, Math.round(isSheet ? ph / 52 : ph / 16));
      c.portrait.setScale(sc).setPosition(cx, top + 22 * u + ph / 2 + (isSheet ? 6 * sc : 0));
      const sy = top + 30 * u + ph;
      fit(c.stats, 8, u).setPosition(cx, sy);
      fit(c.count, 9, u).setPosition(cx, sy + c.stats.height + 2 * u);
      const bh = 24 * u;
      const bw = (cw - 24 * u) / 2;
      c.plus1.place(x + 8 * u, top + ch - bh - 8 * u, u, bw, bh);
      c.plus5.place(x + cw - 8 * u - bw, top + ch - bh - 8 * u, u, bw, bh);
    });
    // --- recrutas
    let y = top + ch + 10 * u;
    const lw = (win.W - pad * 3) * 0.5;
    this.bar = { x: pad + 2 * u, y, w: lw - 4 * u, h: 14 * u };
    fit(this.poolText, 10, u).setPosition(this.bar.x + this.bar.w / 2, y + this.bar.h / 2);
    fit(this.where, 9, u).setPosition(pad, y + this.bar.h + 6 * u).setWordWrapWidth(lw);
    // --- ordens
    y = this.where.y + this.where.height + 8 * u;
    const bh = 28 * u;
    this.campBtn.place(pad, y, u, lw * 0.44, bh);
    this.warBtn.place(pad + lw * 0.44 + 6 * u, y, u, lw * 0.56 - 6 * u, bh);
    fit(this.status, 9, u).setPosition(pad + lw / 2, y + bh + 6 * u).setWordWrapWidth(lw);
    // --- como funciona
    const ix = pad * 2 + lw;
    const iy = top + ch + 6 * u;
    sizeFrame(this.infoBox, ix, iy, win.W - ix - pad, win.H - iy - pad, u);
    fit(this.info, 8, u).setPosition(ix + 10 * u, iy + 8 * u).setWordWrapWidth(this.infoBox.displayWidth - 20 * u);
    this.refresh(true);
  }
}
