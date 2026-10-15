import Phaser from 'phaser';
import { Button, COLOR, fit, frame, label, sizeFrame, type BtnColor } from './kit';

export interface DialogOption {
  label: string;
  color?: BtnColor;
  /** Bloqueada (aparece apagada) com o motivo ao tocar. */
  why?: string;
  onPick: () => void;
}

export interface DialogSpec {
  /** Quem fala (nome e título). */
  name: string;
  title?: string;
  /** Brasão (cor e emblema) ou um retrato de pele de soldado (textura e quadro). */
  color?: number;
  crest?: number;
  portrait?: { key: string; frame: number; tint?: number };
  text: string;
  options: DialogOption[];
}

/**
 * Conversa no estilo de RPG: retrato com o brasão (ou o personagem), nome,
 * fala e até 4 respostas. O mundo pausa enquanto a conversa está aberta.
 */
export class Dialog {
  private root: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Rectangle;
  private box: Phaser.GameObjects.NineSlice;
  private pbox: Phaser.GameObjects.NineSlice;
  private shield: Phaser.GameObjects.Image;
  private emblem: Phaser.GameObjects.Image;
  private face: Phaser.GameObjects.Sprite;
  private name: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private text: Phaser.GameObjects.Text;
  private note: Phaser.GameObjects.Text;
  private buttons: Button[] = [];
  private spec: DialogSpec | null = null;
  private typed = 0;
  private startAt = 0;
  private u = 1;

  constructor(private scene: Phaser.Scene) {
    const s = scene;
    this.root = s.add.container(0, 0).setDepth(5800).setVisible(false);
    this.dim = s.add.rectangle(0, 0, 10, 10, 0x05040a, 0.55).setOrigin(0).setInteractive();
    this.box = frame(s, 'frame');
    this.pbox = frame(s, 'frame-inner');
    this.shield = s.add.image(0, 0, 'crest-shield');
    this.emblem = s.add.image(0, 0, 'crests', 0);
    this.face = s.add.sprite(0, 0, '__DEFAULT');
    this.name = label(s, '', 14, COLOR.gold);
    this.title = label(s, '', 9, COLOR.dim, 1, false);
    this.text = label(s, '', 11, COLOR.text, 1, false).setLineSpacing(4);
    this.note = label(s, '', 9, COLOR.red, 1, false);
    this.root.add([this.dim, this.box, this.pbox, this.shield, this.emblem, this.face, this.name, this.title, this.text, this.note]);
    for (let i = 0; i < 4; i++) {
      const b = new Button(s, { label: '', color: 'blue', size: 10, onTap: () => this.pick(i) }).addTo(this.root);
      this.buttons.push(b);
    }
  }

  get open() {
    return this.root.visible;
  }

  show(spec: DialogSpec) {
    this.spec = spec;
    this.typed = 0;
    const s = this.scene;
    this.startAt = s.time.now;
    s.scene.pause('World');
    this.root.setVisible(true).setAlpha(0);
    s.tweens.add({ targets: this.root, alpha: 1, duration: 180 });
    const crest = spec.portrait === undefined;
    this.shield.setVisible(crest).setTint(spec.color ?? 0x888888);
    this.emblem.setVisible(crest).setFrame(spec.crest ?? 0);
    this.face.setVisible(!crest);
    if (spec.portrait && s.textures.exists(spec.portrait.key)) {
      this.face.setTexture(spec.portrait.key, spec.portrait.frame);
      if (spec.portrait.tint !== undefined) this.face.setTint(spec.portrait.tint);
      else this.face.clearTint();
    } else this.face.setVisible(false);
    this.name.setText(spec.name);
    this.title.setText(spec.title ?? '');
    this.text.setText('');
    this.note.setText('');
    spec.options.slice(0, 4).forEach((o, i) => this.buttons[i].setLabel(o.label).setColor(o.why ? 'dark' : (o.color ?? 'blue')));
    this.buttons.forEach((b, i) => b.setVisible(i < spec.options.length));
    this.layout(this.u);
  }

  private pick(i: number) {
    const o = this.spec?.options[i];
    if (!o) return;
    // a fala ainda escrevendo: o toque só termina a frase
    if (this.typed < (this.spec?.text.length ?? 0)) {
      this.typed = this.spec!.text.length;
      return;
    }
    if (o.why) {
      this.note.setText(o.why);
      return;
    }
    this.close();
    o.onPick();
  }

  close() {
    if (!this.open) return;
    this.root.setVisible(false);
    this.spec = null;
    this.scene.scene.resume('World');
  }

  /** A fala aparece letra a letra. */
  update() {
    if (!this.open || !this.spec) return;
    const full = this.spec.text;
    if (this.typed >= full.length) return;
    // ~60 letras por segundo, pelo relógio (não pelo FPS)
    this.typed = Math.min(full.length, Math.max(this.typed, Math.floor((this.scene.time.now - this.startAt) * 0.06)));
    this.text.setText(full.slice(0, this.typed));
  }

  layout(u: number) {
    this.u = u;
    const { width: W, height: H } = this.scene.scale;
    this.dim.setSize(W, H);
    const bw = Math.min(W * 0.94, 760 * u);
    const bh = Math.min(H * 0.5, 190 * u);
    const bx = (W - bw) / 2;
    const by = H - bh - 10 * u;
    sizeFrame(this.box, bx, by, bw, bh, u);
    const ps = bh - 24 * u;
    sizeFrame(this.pbox, bx + 12 * u, by + 12 * u, ps, ps, u);
    const pcx = bx + 12 * u + ps / 2;
    const pcy = by + 12 * u + ps / 2;
    const k = Math.max(1, Math.floor((ps * 0.62) / 18));
    this.shield.setScale(k).setPosition(pcx, pcy);
    this.emblem.setScale(k).setPosition(pcx, pcy - k);
    this.face.setScale(Math.max(1, Math.floor((ps * 0.9) / 64))).setPosition(pcx, pcy);
    const tx = bx + 24 * u + ps;
    const tw = bw - (tx - bx) - 14 * u;
    fit(this.name, 14, u).setPosition(tx, by + 12 * u);
    fit(this.title, 9, u).setPosition(tx + this.name.width + 10 * u, by + 16 * u);
    fit(this.text, 11, u).setPosition(tx, by + 34 * u).setWordWrapWidth(tw);
    const n = this.spec?.options.length ?? 0;
    const gap = 6 * u;
    const bwid = n ? (tw - gap * (n - 1)) / n : tw;
    const bhh = 26 * u;
    this.buttons.forEach((b, i) => b.place(tx + i * (bwid + gap), by + bh - bhh - 12 * u, u, bwid, bhh));
    fit(this.note, 9, u).setPosition(tx, by + bh - bhh - 28 * u).setWordWrapWidth(tw);
  }
}
