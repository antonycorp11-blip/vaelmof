import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import { BUFFS } from '../data/weapons';
import type { WorldScene } from '../scenes/WorldScene';
import { ATTR_MAX, ATTRS, fmtPts, REQUIREMENTS, type Attr } from '../systems/Progress';
import { CHAMPIONS, RANKS } from '../systems/Ranks';
import { Button, COLOR, drawBar, fit, frame, label, sizeFrame, Window } from './kit';

type Txt = Phaser.GameObjects.Text;

interface Row {
  id: Attr;
  name: Txt;
  value: Txt;
  bar: Phaser.GameObjects.Graphics;
  plus1: Button;
  plus10: Button;
  effect: Txt;
}

interface Step {
  hl: Phaser.GameObjects.NineSlice;
  icon: Phaser.GameObjects.Image;
  name: Txt;
  req: Txt;
}

const pct = (k: number) => `${k >= 1 ? '+' : '−'}${Math.abs(Math.round((k - 1) * 100))}%`;
const mul = (k: number) => `×${k.toFixed(2).replace('.', ',')}`;
const gl = (n: number) => Math.round(n).toLocaleString('pt-BR');

/**
 * Tela de Teren: à esquerda os atributos (pontos ganhos com Glória, +1 / +10
 * por toque, até 1000 cada) com o efeito de cada um e os números do herói;
 * à direita a escada de patentes com as insígnias e o que cada uma pede.
 */
export class AttributesPanel {
  private win: Window;
  private points: Txt;
  private glory: Txt;
  private stats: Txt;
  private reqs: Txt;
  private ladderBox: Phaser.GameObjects.NineSlice;
  private ladderTitle: Txt;
  private rows: Row[] = [];
  private steps: Step[] = [];
  private u = 1;
  private lastTick = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.win = new Window(scene, 'TEREN', 1, () => this.setOpen(false));
    this.points = label(scene, '', 13, COLOR.green);
    this.glory = label(scene, '', 10, COLOR.gold, 1, false);
    this.stats = label(scene, '', 9, COLOR.text, 1, false).setLineSpacing(3);
    this.reqs = label(scene, '', 9, COLOR.dim, 1, false);
    this.ladderBox = frame(scene, 'frame-inner');
    this.ladderTitle = label(scene, 'PATENTES', 11, COLOR.blue);
    this.win.add(this.points, this.glory, this.stats, this.reqs, this.ladderBox, this.ladderTitle);
    for (const a of ATTRS) {
      const spend = (n: number) => world.progress.spend(a.id, n);
      const row: Row = {
        id: a.id,
        name: label(scene, a.name.toUpperCase(), 12, COLOR.gold),
        value: label(scene, '', 12, COLOR.text).setOrigin(1, 0),
        bar: scene.add.graphics(),
        plus1: new Button(scene, { label: '+1', color: 'green', size: 11, onTap: () => spend(1) }),
        plus10: new Button(scene, { label: '+10', color: 'green', size: 11, onTap: () => spend(10) }),
        effect: label(scene, '', 9, COLOR.dim, 1, false),
      };
      this.win.add(row.bar, row.name, row.value, row.effect);
      row.plus1.addTo(this.win.root);
      row.plus10.addTo(this.win.root);
      this.rows.push(row);
    }
    RANKS.forEach((_, i) => {
      const st: Step = {
        hl: frame(scene, 'frame-hl').setVisible(false),
        icon: scene.add.image(0, 0, 'rank-icons', i),
        name: label(scene, '', 10, COLOR.text),
        req: label(scene, '', 8, COLOR.dim, 1, false),
      };
      this.win.add(st.hl, st.icon, st.name, st.req);
      this.steps.push(st);
    });
    world.progress.on('change', () => this.refresh());
    world.inventory.on('change', () => this.refresh());
  }

  get open() {
    return this.win.open;
  }

  contains(x: number, y: number): boolean {
    return this.win.contains(x, y);
  }

  setOpen(on: boolean) {
    this.win.setOpen(on);
    // os textos mudam de tamanho: mede de novo ao abrir
    if (on) this.layout(this.u);
  }

  toggle() {
    this.setOpen(!this.open);
  }

  /** Atualiza a vida e o tempo dos fortalecimentos enquanto aberto. */
  update(time: number) {
    if (!this.open || time - this.lastTick < 400) return;
    this.lastTick = time;
    this.refresh();
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const P = this.world.progress;
    const p = this.world.player;
    const A = P.attrs;
    const free = P.free;
    const u = this.u;
    this.win.sub.setText(`${P.rank.name} · ${p.weapon.className} · ${P.kills} abates`);
    const frac = P.points - free;
    this.points.setText(`PONTOS: ${free}${frac > 0.001 ? `  (+${fmtPts(frac)})` : ''}`).setColor(free > 0 ? COLOR.green : COLOR.dim);
    this.glory.setText(`Glória ${gl(P.glory)} · recorde ${gl(P.gloryRecord)}`);
    const effects: Record<Attr, string> = {
      str: `corpo a corpo ${pct(P.meleeMul)} · carga +${Math.round(P.extraWeight)} kg`,
      agi: `arco ${pct(P.rangedMul)} · ataque ${pct(P.attackRate)} · passo ${pct(P.moveMul)}`,
      vit: `vida máxima ${P.maxHp}`,
      ene: `magia ${pct(P.magicMul)} · recarga ${pct(P.cooldownMul)}`,
    };
    const next = P.nextRank;
    for (const r of this.rows) {
      const v = A[r.id];
      r.value.setText(`${v}`).setColor(next && v < next.min ? COLOR.text : COLOR.green);
      r.effect.setText(effects[r.id]);
      const can = free > 0 && v < ATTR_MAX;
      r.plus1.setEnabled(can);
      r.plus10.setEnabled(can);
      // barra até 1000, com a marca do mínimo da próxima patente
      const bx = r.name.x;
      const bw = Math.max(10, r.plus1.x - bx - 10 * u);
      const by = r.name.y + r.name.height + 3 * u;
      r.bar.clear();
      drawBar(r.bar, bx, by, bw, 5 * u, v / ATTR_MAX, 0xffc850, u);
      if (next) r.bar.fillStyle(0x9cff8a, 1).fillRect(bx + (bw * next.min) / ATTR_MAX - u, by - 2 * u, 2 * u, 9 * u);
    }
    const buffs = p.activeBuffs.map((b) => `${BUFFS[b].name} ${Math.ceil(p.buffLeft(b) / 1000)}s`);
    this.stats.setText(
      [
        `Vida ${p.hp}/${p.maxHp}   Defesa ${Math.round(p.defense * 100)}%   Dano ${mul(p.dmgMul)}`,
        `Ataque ${mul(p.attackRate)}   Recarga ${mul(P.cooldownMul)}   Carga ${Math.round(this.world.inventory.maxWeight)} kg`,
        buffs.length ? `Ativo: ${buffs.join(' · ')}` : '1 ponto a cada 10 de Glória acima do recorde',
      ].join('\n'),
    );
    // o que falta para os itens bloqueados da mochila
    const inv = this.world.inventory;
    const locked = new Set<string>();
    for (const s of inv.slots) if (s && ITEMS[s.id].equip && inv.missing(s.id)) locked.add(s.id);
    const lines = [...locked].slice(0, 2).map((id) => {
      const req = REQUIREMENTS[id] ?? {};
      const need = ATTRS.filter((a) => (req[a.id] ?? 0) > A[a.id]).map((a) => `${a.short} ${req[a.id]}`);
      return `${ITEMS[id].name}: ${need.join(' ')}`;
    });
    this.reqs.setText(lines.length ? `Bloqueados: ${lines.join(' · ')}` : 'Glória sobe com vitórias e abates; derrotas e baixas tiram Glória.');
    // escada de patentes
    const cur = P.rankIdx;
    RANKS.forEach((R, i) => {
      const st = this.steps[i];
      const done = i <= cur;
      const duel = R.duel ? ` · vencer ${CHAMPIONS[R.duel].name.split(',')[0]}${P.duels.has(R.duel) ? ' ✓' : ''}` : '';
      st.name.setText(`${R.name}${i === cur ? '  ◄ você' : ''}`).setColor(i === cur ? COLOR.gold : done ? COLOR.green : i === cur + 1 ? COLOR.text : COLOR.dim);
      st.req.setText(i === 0 ? `início · ${R.army} soldados` : `atributos ≥ ${R.min} · ${gl(R.glory)} glória${duel} · ${R.army} soldados`).setColor(i === cur + 1 ? COLOR.blue : COLOR.dim);
      st.icon.setAlpha(done || i === cur + 1 ? 1 : 0.45);
      st.hl.setVisible(i === cur);
    });
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    const W = Math.min(width * 0.96, 780 * u);
    const H = Math.min(height * 0.94, 380 * u);
    const win = this.win;
    win.place(u, W, H);
    const pad = win.pad;
    const top = win.head + pad / 2;
    const L = Math.round((win.W - pad * 3) * 0.52);
    // --- esquerda: pontos e atributos
    fit(this.points, 13, u).setPosition(pad, top);
    fit(this.glory, 10, u).setPosition(pad + L, top + 3 * u).setOrigin(1, 0);
    const bottomText = 64 * u;
    const rowsTop = top + 24 * u;
    const rowH = Math.max(34 * u, (win.H - pad - bottomText - rowsTop) / this.rows.length);
    let y = rowsTop;
    for (const r of this.rows) {
      fit(r.name, 12, u).setPosition(pad, y);
      const bw = 34 * u;
      const bh = 24 * u;
      r.plus10.place(pad + L - 42 * u, y, u, 42 * u, bh);
      r.plus1.place(r.plus10.x - 4 * u - bw, y, u, bw, bh);
      fit(r.value, 12, u).setPosition(r.plus1.x - 10 * u, y);
      fit(r.effect, 9, u).setPosition(pad, y + 26 * u);
      y += rowH;
    }
    fit(this.stats, 9, u).setPosition(pad, win.H - pad - bottomText).setWordWrapWidth(L);
    fit(this.reqs, 8.5, u).setPosition(pad, win.H - pad - 22 * u).setWordWrapWidth(L);
    // --- direita: escada de patentes
    const rx = pad * 2 + L;
    const rw = win.W - rx - pad;
    const ry = top - 2 * u;
    const rh = win.H - ry - pad;
    sizeFrame(this.ladderBox, rx, ry, rw, rh, u);
    fit(this.ladderTitle, 11, u).setPosition(rx + 10 * u, ry + 8 * u);
    const sy = ry + 24 * u;
    const sh = (this.ladderBox.y + this.ladderBox.displayHeight - 6 * u - sy) / this.steps.length;
    const isc = Math.max(1, Math.round(sh / 13));
    this.steps.forEach((st, i) => {
      const yy = sy + i * sh;
      sizeFrame(st.hl, rx + 4 * u, yy - 1 * u, rw - 8 * u, sh + 2 * u, u);
      st.icon.setScale(isc).setPosition(rx + 8 * u + (11 * isc) / 2, yy + sh / 2);
      const tx = rx + 14 * u + 11 * isc;
      fit(st.name, 10, u).setPosition(tx, yy + sh / 2 + 1 * u).setOrigin(0, 1);
      fit(st.req, 8, u).setPosition(tx, yy + sh / 2 + 1 * u).setOrigin(0, 0);
    });
    this.refresh(true);
  }
}
