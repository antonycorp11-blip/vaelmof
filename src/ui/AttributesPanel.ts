import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import { BUFFS } from '../data/weapons';
import type { WorldScene } from '../scenes/WorldScene';
import { ATTR_MAX, ATTRS, fmtPts, REQUIREMENTS, type Attr } from '../systems/Progress';
import { CHAMPIONS } from '../systems/Ranks';

type Txt = Phaser.GameObjects.Text;

interface Row {
  id: Attr;
  name: Txt;
  value: Txt;
  bar: Phaser.GameObjects.Graphics;
  plus1: Txt;
  plus10: Txt;
  effect: Txt;
}

const pct = (k: number) => `${k >= 1 ? '+' : '−'}${Math.abs(Math.round((k - 1) * 100))}%`;
const mul = (k: number) => `×${k.toFixed(2).replace('.', ',')}`;

/**
 * Tela de atributos (inspirada na do MU): pontos ganhos nos abates são
 * distribuídos entre Força, Agilidade, Vitalidade e Energia (até 1000 cada),
 * com +1 / +10 por toque. Mostra o efeito de cada atributo, os números finais
 * do herói e o que falta para usar os itens bloqueados da mochila.
 */
export class AttributesPanel {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private head: Phaser.GameObjects.Rectangle;
  private title: Txt;
  private sub: Txt;
  private points: Txt;
  private close: Txt;
  private stats: Txt;
  private reqs: Txt;
  private rows: Row[] = [];
  open = false;
  private u = 1;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    const style = { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', fontStyle: 'bold' };
    this.root = scene.add.container(0, 0).setDepth(2200).setVisible(false);
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x120d0a, 0.94).setOrigin(0).setStrokeStyle(2, 0xc8a050, 0.9).setInteractive();
    this.head = scene.add.rectangle(0, 0, 10, 10, 0x3a2414, 1).setOrigin(0);
    this.title = scene.add.text(0, 0, 'TEREN', { ...style, color: '#ffd77a' });
    this.sub = scene.add.text(0, 0, '', { ...style, color: '#d8c8a8' });
    this.points = scene.add.text(0, 0, '', { ...style, color: '#9cff8a' });
    this.close = scene.add.text(0, 0, ' X ', { ...style, backgroundColor: '#7a1f2a' }).setInteractive({ useHandCursor: true });
    this.close.on('pointerdown', () => this.setOpen(false));
    this.stats = scene.add.text(0, 0, '', { ...style, color: '#e8dcc0', lineSpacing: 3 });
    this.reqs = scene.add.text(0, 0, '', { ...style, color: '#c8b8a0' });
    this.root.add([this.bg, this.head, this.title, this.sub, this.points, this.close, this.stats, this.reqs]);
    for (const a of ATTRS) {
      const btn = (label: string, n: number) => {
        const b = scene.add.text(0, 0, label, { ...style, backgroundColor: '#5a3a1a', color: '#ffd77a' }).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => {
          if (world.progress.spend(a.id, n)) {
            b.setBackgroundColor('#8a5a2a');
            scene.time.delayedCall(90, () => b.setBackgroundColor('#5a3a1a'));
          }
        });
        return b;
      };
      const row: Row = {
        id: a.id,
        name: scene.add.text(0, 0, a.name.toUpperCase(), { ...style, color: '#ffd77a' }),
        value: scene.add.text(0, 0, '', style),
        bar: scene.add.graphics(),
        plus1: btn(' +1 ', 1),
        plus10: btn(' +10 ', 10),
        effect: scene.add.text(0, 0, '', { ...style, color: '#c8b8a0' }),
      };
      this.root.add([row.name, row.value, row.bar, row.plus1, row.plus10, row.effect]);
      this.rows.push(row);
    }
    world.progress.on('change', () => this.refresh());
    world.inventory.on('change', () => this.refresh());
  }

  contains(x: number, y: number): boolean {
    return this.open && this.bg.getBounds().contains(x, y);
  }

  setOpen(on: boolean) {
    this.open = on;
    this.root.setVisible(on);
    // os textos mudam de tamanho: mede de novo ao abrir
    if (on) this.layout(this.u);
  }

  private lastTick = 0;
  /** Atualiza a vida e o tempo dos fortalecimentos enquanto aberto. */
  update(time: number) {
    if (!this.open || time - this.lastTick < 400) return;
    this.lastTick = time;
    this.refresh();
  }

  toggle() {
    this.setOpen(!this.open);
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const P = this.world.progress;
    const p = this.world.player;
    const A = P.attrs;
    const free = P.free;
    const w = p.weapon;
    const gl = (n: number) => Math.round(n).toLocaleString('pt-BR');
    this.sub.setText(`Patente ${P.rank.name} · Glória ${gl(P.glory)} (recorde ${gl(P.gloryRecord)}) · ${w.className}   Abates ${P.kills}`);
    const frac = P.points - free;
    this.points.setText(`PONTOS: ${free}${frac > 0.001 ? `  (+${fmtPts(frac)})` : ''}`).setColor(free > 0 ? '#9cff8a' : '#a89880');
    const effects: Record<Attr, string> = {
      str: `corpo a corpo ${pct(P.meleeMul)} · carga +${Math.round(P.extraWeight)} kg`,
      agi: `arco ${pct(P.rangedMul)} · ataque ${pct(P.attackRate)} · passo ${pct(P.moveMul)}`,
      vit: `vida ${P.maxHp}`,
      ene: `magia ${pct(P.magicMul)} · recarga ${pct(P.cooldownMul)}`,
    };
    const u = this.u;
    for (const r of this.rows) {
      const v = A[r.id];
      r.value.setText(`${v}`);
      r.effect.setText(effects[r.id]);
      const can = free > 0 && v < ATTR_MAX;
      for (const b of [r.plus1, r.plus10]) b.setAlpha(can ? 1 : 0.35);
      // barra do atributo até 1000, sob o nome e o valor
      const bw = Math.max(10, r.plus1.x - r.name.x - 8 * u);
      const by = r.name.y + r.name.height + 2 * u;
      r.bar.clear();
      r.bar.fillStyle(0x4a3420, 1).fillRect(r.name.x, by, bw, 3 * u);
      r.bar.fillStyle(0xffc850, 1).fillRect(r.name.x, by, Math.max(1, (bw * v) / ATTR_MAX), 3 * u);
    }
    const buffs = p.activeBuffs.map((b) => `${BUFFS[b].name} ${Math.ceil(p.buffLeft(b) / 1000)}s`);
    this.stats.setText(
      [
        `Vida ${p.hp}/${p.maxHp}   Defesa ${Math.round(p.defense * 100)}%   Dano da arma ${mul(p.dmgMul)}`,
        `Vel. de ataque ${mul(p.attackRate)}   Recarga ${mul(P.cooldownMul)}   Carga ${Math.round(this.world.inventory.maxWeight)} kg`,
        buffs.length ? `Ativo: ${buffs.join(' · ')}` : '1 ponto a cada 10 de Glória acima do recorde · derrotas e baixas tiram Glória',
      ].join('\n'),
    );
    // o que falta para os itens bloqueados da mochila
    const inv = this.world.inventory;
    const locked = new Set<string>();
    for (const s of inv.slots) if (s && ITEMS[s.id].equip && inv.missing(s.id)) locked.add(s.id);
    const lines = [...locked].slice(0, 4).map((id) => {
      const req = REQUIREMENTS[id] ?? {};
      const need = ATTRS.filter((a) => (req[a.id] ?? 0) > A[a.id]).map((a) => `${a.short} ${req[a.id]}`);
      return `${ITEMS[id].name}: ${need.join(' ')}`;
    });
    const N = P.nextRank;
    const nextLine = N
      ? `Próxima patente: ${N.name} — todos os atributos ${N.min} · Glória ${gl(N.glory)}${N.duel ? `${P.duels.has(N.duel) ? '' : ` · vencer ${CHAMPIONS[N.duel].name} (ao sul de ${CHAMPIONS[N.duel].city})`}` : ''} · exército ${N.army}`
      : 'Patente máxima: Marechal.';
    this.reqs.setText(`${nextLine}\n${lines.length ? `Bloqueados: ${lines.join('  ·  ')}` : 'Todos os itens da mochila podem ser usados.'}`);
  }

  layout(u: number) {
    this.u = u;
    this.refresh(true);
    const { width, height } = this.scene.scale;
    const W = Math.round(Math.min(width * 0.92, 600 * u));
    const pad = 12 * u;
    const fs = (n: number) => Math.round(n * u);
    this.title.setFontSize(fs(15)).setPosition(pad, pad);
    this.close.setFontSize(fs(13)).setPadding(fs(8), fs(5), fs(8), fs(5));
    this.close.setPosition(W - pad - this.close.width, pad - 4 * u);
    this.sub.setFontSize(fs(10)).setPosition(pad, pad + 20 * u);
    const headH = pad + 38 * u;
    this.head.setSize(W, headH);
    this.points.setFontSize(fs(13)).setPosition(pad, headH + 8 * u);
    let y = headH + 32 * u;
    const nameW = 96 * u;
    const valW = 44 * u;
    for (const r of this.rows) {
      r.name.setFontSize(fs(12)).setPosition(pad, y);
      r.value.setFontSize(fs(12)).setPosition(pad + nameW, y);
      r.plus1.setFontSize(fs(11)).setPadding(fs(4), fs(5), fs(4), fs(5)).setPosition(pad + nameW + valW, y - 4 * u);
      r.plus10.setFontSize(fs(11)).setPadding(fs(4), fs(5), fs(4), fs(5)).setPosition(r.plus1.x + r.plus1.width + 6 * u, y - 4 * u);
      r.effect.setFontSize(fs(10)).setPosition(r.plus10.x + r.plus10.width + 10 * u, y + 1 * u).setWordWrapWidth(W - (r.plus10.x + r.plus10.width + 10 * u) - pad);
      y += Math.max(30 * u, r.effect.height + 14 * u);
    }
    this.stats.setFontSize(fs(10)).setPosition(pad, y + 2 * u).setWordWrapWidth(W - pad * 2);
    y += this.stats.height + 10 * u;
    this.reqs.setFontSize(fs(9)).setPosition(pad, y).setWordWrapWidth(W - pad * 2);
    const H = y + Math.max(this.reqs.height, 24 * u) + pad;
    this.bg.setSize(W, H);
    this.root.setPosition(Math.round((width - W) / 2), Math.round(Math.max(4 * u, (height - H) / 2)));
    this.refresh(true);
  }
}
