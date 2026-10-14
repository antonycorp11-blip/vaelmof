import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { SOLDIER_RANKS, SOLDIER_TYPES, SOLDIERS, type SoldierType } from '../systems/Army';
import { CHAMPIONS, RANKS } from '../systems/Ranks';

type Txt = Phaser.GameObjects.Text;

interface TypeRow {
  type: SoldierType;
  name: Txt;
  count: Txt;
  plus1: Txt;
  plus5: Txt;
}

/**
 * Painel EXÉRCITO: recrutar soldados no quartel de Brumavale (cada tipo gasta
 * recrutas, que renovam com o tempo), ver a escada de patentes de Teren e
 * declarar guerra a uma casa rival (teste da batalha entre exércitos).
 */
export class ArmyPanel {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private head: Phaser.GameObjects.Rectangle;
  private title: Txt;
  private sub: Txt;
  private pool: Txt;
  private status: Txt;
  private close: Txt;
  private warBtn: Txt;
  private ladderTitle: Txt;
  private ladder: Txt[] = [];
  private rows: TypeRow[] = [];
  open = false;
  private u = 1;
  private lastTick = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    const style = { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', fontStyle: 'bold' };
    this.root = scene.add.container(0, 0).setDepth(2200).setVisible(false);
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x0c0e14, 0.95).setOrigin(0).setStrokeStyle(2, 0x6a8ec4, 0.9).setInteractive();
    this.head = scene.add.rectangle(0, 0, 10, 10, 0x1c2a44, 1).setOrigin(0);
    this.title = scene.add.text(0, 0, 'EXÉRCITO', { ...style, color: '#bfe0ff' });
    this.sub = scene.add.text(0, 0, '', { ...style, color: '#c8d4e8' });
    this.pool = scene.add.text(0, 0, '', { ...style, color: '#9cff8a' });
    this.status = scene.add.text(0, 0, '', { ...style, color: '#ffb080' });
    this.close = scene.add.text(0, 0, ' X ', { ...style, backgroundColor: '#7a1f2a' }).setInteractive({ useHandCursor: true });
    this.close.on('pointerdown', () => this.setOpen(false));
    this.warBtn = scene.add.text(0, 0, 'DECLARAR GUERRA', { ...style, backgroundColor: '#7a1f2a' }).setInteractive({ useHandCursor: true });
    this.warBtn.on('pointerdown', () => {
      const a = world.army;
      if (a.war) return;
      a.prepare(() => {
        a.declareWar(Math.max(10, a.size));
        this.setOpen(false);
      });
    });
    this.ladderTitle = scene.add.text(0, 0, 'PATENTES (todos os atributos ≥)', { ...style, color: '#bfe0ff' });
    this.root.add([this.bg, this.head, this.title, this.sub, this.pool, this.status, this.close, this.warBtn, this.ladderTitle]);
    for (const type of SOLDIER_TYPES) {
      const btn = (label: string, n: number) => {
        const b = scene.add.text(0, 0, label, { ...style, backgroundColor: '#2a3f66', color: '#bfe0ff' }).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => {
          const a = world.army;
          const why = a.recruitBlock(type, 1);
          if (why) {
            this.status.setText(why);
            return;
          }
          a.prepare(() => {
            a.recruit(type, n);
            this.refresh();
          });
        });
        return b;
      };
      const r: TypeRow = {
        type,
        name: scene.add.text(0, 0, '', style),
        count: scene.add.text(0, 0, '', { ...style, color: '#c8d4e8' }),
        plus1: btn(' +1 ', 1),
        plus5: btn(' +5 ', 5),
      };
      this.root.add([r.name, r.count, r.plus1, r.plus5]);
      this.rows.push(r);
    }
    for (let i = 0; i < RANKS.length; i++) {
      const t = scene.add.text(0, 0, '', { ...style, fontSize: '10px' });
      this.ladder.push(t);
      this.root.add(t);
    }
    world.army.on('change', () => this.refresh());
    world.progress.on('change', () => this.refresh());
  }

  contains(x: number, y: number): boolean {
    return this.open && this.bg.getBounds().contains(x, y);
  }

  setOpen(on: boolean) {
    this.open = on;
    this.root.setVisible(on);
    this.status.setText('');
    if (on) this.layout(this.u);
  }

  toggle() {
    this.setOpen(!this.open);
  }

  update(time: number) {
    if (!this.open || time - this.lastTick < 500) return;
    this.lastTick = time;
    this.refresh();
  }

  refresh(force = false) {
    if (!this.open && !force) return;
    const w = this.world;
    const a = w.army;
    const P = w.progress;
    const allies = a.allies;
    this.sub.setText(`Patente ${P.rank.name} · ${a.size}/${P.armyCap} soldados · ordem: ${a.mode === 'follow' ? 'seguir' : a.mode === 'attack' ? 'atacar' : 'segurar'}`);
    this.pool.setText(`Recrutas em Brumavale: ${a.pool}/${a.poolMax} (+1 a cada 3 s)${a.inCapital ? '' : ' · vá ao quartel de Brumavale para recrutar'}`);
    for (const r of this.rows) {
      const D = SOLDIERS[r.type];
      const mine = allies.filter((s) => s.type === r.type);
      const vets = mine.filter((s) => s.rank >= 2).length;
      r.name.setText(`${D.name} (${D.cost} recruta${D.cost > 1 ? 's' : ''})`);
      r.count.setText(`${mine.length}${vets ? ` · ${vets} ${SOLDIER_RANKS[2].name.toLowerCase()}+` : ''}`);
      const ok = !a.recruitBlock(r.type, 1);
      r.plus1.setAlpha(ok ? 1 : 0.4);
      r.plus5.setAlpha(ok ? 1 : 0.4);
    }
    const cur = P.rankIdx;
    RANKS.forEach((R, i) => {
      const done = i <= cur;
      const duel = R.duel ? ` · vencer ${CHAMPIONS[R.duel].name.split(',')[0]}${P.duels.has(R.duel) ? ' ✓' : ''}` : '';
      this.ladder[i].setText(`${done ? '✓' : ' '} ${R.name.padEnd(9)} ${String(R.min).padStart(4)}${duel} · ${R.army} soldados`).setColor(i === cur ? '#ffd34a' : done ? '#7f8aa0' : i === cur + 1 ? '#ffffff' : '#a8b4c8');
    });
    this.warBtn.setText(a.war ? `GUERRA EM CURSO: ${a.war.house}` : `DECLARAR GUERRA (${Math.max(10, a.size)} inimigos)`).setAlpha(a.war ? 0.6 : 1);
  }

  layout(u: number) {
    this.u = u;
    this.refresh(true);
    const { width, height } = this.scene.scale;
    const W = Math.round(Math.min(width * 0.94, 720 * u));
    const pad = 12 * u;
    const fs = (n: number) => Math.round(n * u);
    this.title.setFontSize(fs(15)).setPosition(pad, pad);
    this.close.setFontSize(fs(13)).setPadding(fs(8), fs(5), fs(8), fs(5));
    this.close.setPosition(W - pad - this.close.width, pad - 4 * u);
    this.sub.setFontSize(fs(10)).setPosition(pad, pad + 20 * u);
    const headH = pad + 38 * u;
    this.head.setSize(W, headH);
    const colW = Math.round((W - pad * 3) * 0.48);
    this.pool.setFontSize(fs(10)).setWordWrapWidth(colW).setPosition(pad, headH + 10 * u);
    let y = this.pool.y + this.pool.height + 12 * u;
    for (const r of this.rows) {
      r.name.setFontSize(fs(11)).setPosition(pad, y);
      r.count.setFontSize(fs(10)).setPosition(pad, y + 15 * u);
      r.plus5.setFontSize(fs(11)).setPadding(fs(5), fs(6), fs(5), fs(6));
      r.plus1.setFontSize(fs(11)).setPadding(fs(5), fs(6), fs(5), fs(6));
      r.plus5.setPosition(pad + colW - r.plus5.width, y + 2 * u);
      r.plus1.setPosition(r.plus5.x - 6 * u - r.plus1.width, y + 2 * u);
      y += 38 * u;
    }
    this.status.setFontSize(fs(10)).setWordWrapWidth(colW).setPosition(pad, y);
    y += 18 * u;
    this.warBtn.setFontSize(fs(11)).setPadding(fs(8), fs(6), fs(8), fs(6)).setPosition(pad, y);
    const leftBottom = y + this.warBtn.height;
    // escada de patentes à direita
    const rx = pad * 2 + colW;
    this.ladderTitle.setFontSize(fs(11)).setPosition(rx, headH + 10 * u);
    let ly = this.ladderTitle.y + 20 * u;
    for (const t of this.ladder) {
      t.setFontSize(fs(9.5)).setWordWrapWidth(W - rx - pad).setPosition(rx, ly);
      ly += t.height + 5 * u;
    }
    const H = Math.max(leftBottom, ly) + pad;
    this.bg.setSize(W, H);
    this.root.setPosition(Math.round((width - W) / 2), Math.round(Math.max(4 * u, (height - H) / 2)));
  }
}
