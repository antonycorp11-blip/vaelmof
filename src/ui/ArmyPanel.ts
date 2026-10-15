import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { SKINS } from '../data/skins';
import { allyTint, FORMATION_ORDER, FORMATIONS, SOLDIER_TYPES, SOLDIERS, type SoldierType } from '../systems/Army';
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

/** Nome do escalão do exército (sobe com o treino no Arsenal da sede). */
export const TIER_NAME = ['Recrutas', 'Veteranos', 'Elite', 'Campeões'];
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

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
  private formLabel: Txt;
  private formDesc: Txt;
  private formBtns: Button[];
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
    // formações: arqueiros atrás, quebra-escudos na frente, arcanos nos flancos…
    this.formLabel = label(scene, 'FORMAÇÃO', 9, COLOR.gold);
    this.formDesc = label(scene, '', 8, COLOR.dim, 1, false);
    this.win.add(this.formLabel, this.formDesc);
    this.formBtns = FORMATION_ORDER.map((f) => new Button(scene, { label: FORMATIONS[f].name, color: 'dark', size: 9, onTap: () => world.army.setFormation(f) }).addTo(this.win.root));
    world.army.on('formation', () => this.refresh());
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
    this.portraits();
  }

  /** Retratos: o soldado do clã com o equipamento do treino atual. */
  private portraits() {
    const a = this.world.army;
    const keys = this.cards.map((c) => `sk-${SKINS.ally[a.upTier][c.type][0]}`);
    a.need(keys, () => {
      this.cards.forEach((c, i) => {
        if (c.portrait.texture.key !== keys[i]) c.portrait.setTexture(keys[i], 0);
        const tint = a.clanColor >= 0 ? allyTint(a.clanColor) : 0xffffff;
        c.portrait.setTint(tint);
      });
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
    const up = a.upg;
    this.win.sub.setText(`${P.rank.name} · ${a.size}/${P.armyCap} soldados · ${TIER_NAME[a.upTier]} (treino: ataque ${up.atk} · defesa ${up.def} · vida ${up.hp}) · ordem: ${order}`);
    if (this.open && this.cards[0].portrait.texture.key !== `sk-${SKINS.ally[a.upTier][this.cards[0].type][0]}`) this.portraits();
    // reserva de recrutas
    const g = this.poolBar;
    g.clear();
    drawBar(g, this.bar.x, this.bar.y, this.bar.w, this.bar.h, a.pool / a.poolMax, 0x5aa0ff, u);
    this.poolText.setText(`Recrutas ${a.pool}/${a.poolMax} · +1 a cada 3 s`);
    const bc = a.barracksCity;
    this.win.title.setText(bc ? `QUARTEL DE ${bc.name.toUpperCase()}` : 'EXÉRCITO');
    this.where.setText(bc ? `Você está no quartel de ${bc.name}: pode recrutar (cada cidade tem a sua reserva)` : 'Entre em qualquer cidade (ou no Alojamento da sede) para recrutar').setColor(bc ? COLOR.green : COLOR.dim);
    for (const c of this.cards) {
      const D = SOLDIERS[c.type];
      const mine = a.allies.filter((s) => s.type === c.type);
      const kept = a.garrison.filter((s) => s.t === c.type).length;
      const role = D.ranged ? `${ROLE[c.type]} · alcance ${D.range}` : ROLE[c.type];
      // números com o treino do Arsenal (o que o exército ganhou fica visível)
      const hp = D.hp * (1 + 0.12 * up.hp);
      const dmg = D.damage * (1 + 0.1 * up.atk);
      const def = Math.min(50, 5 * up.def);
      const boost = up.atk + up.def + up.hp > 0;
      c.stats
        .setText(`vida ${fmt(hp)}${up.hp ? ` (+${up.hp * 12}%)` : ''} · dano ${fmt(dmg)}${up.atk ? ` (+${up.atk * 10}%)` : ''}${def ? `\ndefesa −${def}% de dano` : ''}\n${role}\ncusto: ${D.cost} recruta${D.cost > 1 ? 's' : ''}`)
        .setColor(boost ? COLOR.green : COLOR.dim);
      c.count.setText(`${mine.length} no campo${kept ? ` · ${kept} no quartel` : ''}`);
      const ok = !a.recruitBlock(c.type, 1);
      c.plus1.setEnabled(ok);
      c.plus5.setEnabled(ok);
      c.portrait.setAlpha(ok || mine.length ? 1 : 0.6);
    }
    this.campBtn.setLabel(a.garrison.length ? `CONVOCAR (${a.garrison.length})` : 'AQUARTELAR').setIcon(a.garrison.length ? 11 : 10);
    this.campBtn.setEnabled(!!a.garrison.length || (field > 0 && !a.war));
    FORMATION_ORDER.forEach((f, i) => this.formBtns[i].setColor(a.formation === f ? 'blue' : 'dark'));
    this.formDesc.setText(FORMATIONS[a.formation].desc);
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
      const ph = ch * 0.32;
      const isSheet = c.portrait.texture.key.startsWith('sk-');
      const sc = Math.max(1, Math.round(isSheet ? ph / 52 : ph / 16));
      c.portrait.setScale(sc).setOrigin(0.5, isSheet ? 77 / 96 : 0.5).setPosition(cx, isSheet ? top + 22 * u + ph + 2 * u : top + 22 * u + ph / 2);
      const sy = top + 30 * u + ph;
      fit(c.stats, 8, u).setPosition(cx, sy);
      const bh = 24 * u;
      fit(c.count, 9, u).setPosition(cx, Math.max(sy + c.stats.height + 1 * u, top + ch - bh - 22 * u));
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
    // --- formação de guerra
    const fy = y + bh + 6 * u;
    fit(this.formLabel, 9, u).setPosition(pad, fy + 6 * u);
    const fl = 74 * u;
    const fw = (lw - fl - 3 * 4 * u) / 4;
    this.formBtns.forEach((b, i) => b.place(pad + fl + i * (fw + 4 * u), fy, u, fw, 22 * u));
    fit(this.formDesc, 8, u).setPosition(pad, fy + 26 * u).setWordWrapWidth(lw);
    fit(this.status, 9, u).setPosition(pad + lw / 2, fy + 40 * u).setWordWrapWidth(lw);
    // --- como funciona
    const ix = pad * 2 + lw;
    const iy = top + ch + 6 * u;
    sizeFrame(this.infoBox, ix, iy, win.W - ix - pad, win.H - iy - pad, u);
    fit(this.info, 8, u).setPosition(ix + 10 * u, iy + 8 * u).setWordWrapWidth(this.infoBox.displayWidth - 20 * u);
    this.refresh(true);
  }
}
