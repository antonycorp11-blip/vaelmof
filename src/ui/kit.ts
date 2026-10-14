import Phaser from 'phaser';

/**
 * Kit visual da interface: fonte, cores, molduras 9-slice e botões em pixel
 * art (assets/ui, gerados por scripts/ui-art.mjs). Todas as telas usam estas
 * peças, para o jogo ter uma cara só.
 */
export const FONT = 'Tiny5, monospace';

export const COLOR = {
  text: '#f3ead2',
  dim: '#a99f8a',
  gold: '#ffd77a',
  blue: '#bfe0ff',
  red: '#ff8a7a',
  green: '#9cff8a',
  ink: '#0b0d14',
};

export type BtnColor = 'blue' | 'red' | 'gold' | 'dark' | 'green';
type Frame = 'frame' | 'frame-inner' | 'frame-hl';

/** Tamanho do "pixel" das molduras na tela (cantos e bordas ficam grossos e nítidos). */
export const pxOf = (u: number) => Math.max(2, Math.round(u * 1.5));

/** Texto com a fonte do jogo, contorno escuro e sombra. */
export function label(scene: Phaser.Scene, text: string, size: number, color = COLOR.text, u = 1, bold = true): Phaser.GameObjects.Text {
  const t = scene.add.text(0, 0, text, {
    fontFamily: FONT,
    fontSize: `${Math.round(size * u)}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color,
    stroke: COLOR.ink,
    strokeThickness: Math.max(2, Math.round(2.5 * u)),
  });
  t.setShadow(0, Math.round(u), '#000000', 0, true, false);
  return t;
}

/** Ajusta tamanho de fonte e contorno de um texto do kit para a escala `u`. */
export function fit(t: Phaser.GameObjects.Text, size: number, u: number) {
  t.setFontSize(Math.round(size * u)).setStroke(COLOR.ink, Math.max(2, Math.round(2.5 * u)));
  t.setShadow(0, Math.round(u), '#000000', 0, true, false);
  return t;
}

/** Moldura 9-slice (origem no canto superior esquerdo). Redimensione com `sizeFrame`. */
export function frame(scene: Phaser.Scene, kind: Frame = 'frame'): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(0, 0, `ui-${kind}`, undefined, 24, 24, 8, 8, 8, 8).setOrigin(0);
}

/** Coloca a moldura em (x, y) com w × h px de tela, pixels da arte em escala `px`. */
export function sizeFrame(f: Phaser.GameObjects.NineSlice, x: number, y: number, w: number, h: number, u: number) {
  const k = pxOf(u);
  f.setScale(k).setSize(Math.max(18, Math.round(w / k)), Math.max(18, Math.round(h / k))).setPosition(Math.round(x), Math.round(y));
  return f;
}

export interface BtnOpts {
  label?: string;
  icon?: number;
  /** Folha do ícone (padrão: ui-menu). */
  iconSheet?: string;
  color?: BtnColor;
  size?: number;
  onTap: () => void;
}

/**
 * Botão do kit: fundo 9-slice com bisel (afunda ao tocar), rótulo e/ou ícone.
 * Não é um container: as peças são posicionadas juntas por `place`.
 */
export class Button {
  readonly bg: Phaser.GameObjects.NineSlice;
  readonly text?: Phaser.GameObjects.Text;
  readonly icon?: Phaser.GameObjects.Image;
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  enabled = true;
  private color: BtnColor;
  private u = 1;

  constructor(
    scene: Phaser.Scene,
    private opts: BtnOpts,
  ) {
    this.color = opts.color ?? 'blue';
    this.bg = scene.add.nineslice(0, 0, `ui-btn-${this.color}`, 0, 24, 14, 5, 5, 5, 5).setOrigin(0).setInteractive({ useHandCursor: true });
    if (opts.icon !== undefined) this.icon = scene.add.image(0, 0, opts.iconSheet ?? 'ui-menu', opts.icon);
    if (opts.label !== undefined) this.text = label(scene, opts.label, opts.size ?? 12);
    this.bg.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e?.stopPropagation?.();
      if (!this.enabled) return;
      this.bg.setFrame(1);
      this.nudge(1);
      scene.time.delayedCall(110, () => {
        this.bg.setFrame(0);
        this.nudge(0);
      });
      opts.onTap();
    });
  }

  get parts(): Phaser.GameObjects.GameObject[] {
    return [this.bg, ...(this.icon ? [this.icon] : []), ...(this.text ? [this.text] : [])];
  }

  addTo(c: Phaser.GameObjects.Container) {
    c.add(this.parts);
    return this;
  }

  private nudge(down: number) {
    const d = down * pxOf(this.u);
    this.layoutParts(d);
  }

  /** Posiciona em (x, y). Sem `w`/`h`, o tamanho vem do rótulo/ícone. */
  place(x: number, y: number, u: number, w?: number, h?: number) {
    this.u = u;
    const k = pxOf(u);
    if (this.text) fit(this.text, this.opts.size ?? 12, u);
    const iw = this.icon ? 16 * Math.max(1, Math.round(u * 1.25)) : 0;
    this.icon?.setScale(iw / 16);
    const tw = this.text ? this.text.width : 0;
    const gap = this.icon && this.text ? 6 * u : 0;
    this.w = Math.round(w ?? iw + gap + tw + 20 * u);
    this.h = Math.round(h ?? Math.max(iw, this.text ? this.text.height : 0) + 12 * u);
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.bg.setScale(k).setSize(Math.max(12, Math.round(this.w / k)), Math.max(10, Math.round(this.h / k))).setPosition(this.x, this.y);
    // o tamanho real (arredondado à escala) manda
    this.w = this.bg.width * k;
    this.h = this.bg.height * k;
    this.layoutParts(0);
    return this;
  }

  private layoutParts(d: number) {
    const iw = this.icon ? this.icon.displayWidth : 0;
    const tw = this.text ? this.text.width : 0;
    const gap = this.icon && this.text ? 6 * this.u : 0;
    const total = iw + gap + tw;
    let cx = this.x + (this.w - total) / 2;
    const cy = this.y + this.h / 2 - pxOf(this.u) * 0.5 + d;
    if (this.icon) {
      this.icon.setPosition(Math.round(cx + iw / 2), Math.round(cy));
      cx += iw + gap;
    }
    this.text?.setOrigin(0, 0.5).setPosition(Math.round(cx), Math.round(cy));
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    for (const p of this.parts) (p as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(on ? 1 : 0.45);
    return this;
  }

  setLabel(s: string) {
    this.text?.setText(s);
    return this;
  }

  setColor(c: BtnColor) {
    if (c === this.color) return this;
    this.color = c;
    this.bg.setTexture(`ui-btn-${c}`, 0);
    return this;
  }

  setIcon(frameIdx: number) {
    this.icon?.setFrame(frameIdx);
    return this;
  }

  setVisible(on: boolean) {
    for (const p of this.parts) (p as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
    return this;
  }

  setDepth(d: number) {
    for (const p of this.parts) (p as unknown as Phaser.GameObjects.Components.Depth).setDepth(d + (p === this.bg ? 0 : 1));
    return this;
  }

  contains(x: number, y: number) {
    return this.bg.visible && x >= this.x && x <= this.x + this.w && y >= this.y && y <= this.y + this.h;
  }
}

/** Barra de progresso desenhada num Graphics (vida, recrutas…). */
export function drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, k: number, color: number, u: number) {
  const b = Math.max(1, Math.round(u));
  g.fillStyle(0x0b0d14, 1).fillRect(x - b * 2, y - b * 2, w + b * 4, h + b * 4);
  g.fillStyle(0x8a6a2a, 1).fillRect(x - b, y - b, w + b * 2, h + b * 2);
  g.fillStyle(0x2a2234, 1).fillRect(x, y, w, h);
  const fw = Math.max(0, Math.min(1, k)) * w;
  g.fillStyle(color, 1).fillRect(x, y, fw, h);
  g.fillStyle(0xffffff, 0.22).fillRect(x, y, fw, Math.max(1, Math.round(h * 0.3)));
  g.fillStyle(0x000000, 0.25).fillRect(x, y + h - Math.max(1, Math.round(h * 0.2)), fw, Math.max(1, Math.round(h * 0.2)));
}

/**
 * Janela padrão das telas: moldura, faixa de título com ícone, botão de
 * fechar e um container onde a tela põe o conteúdo. `place` centraliza.
 */
export class Window {
  readonly root: Phaser.GameObjects.Container;
  readonly box: Phaser.GameObjects.NineSlice;
  readonly band: Phaser.GameObjects.Rectangle;
  readonly title: Phaser.GameObjects.Text;
  readonly sub: Phaser.GameObjects.Text;
  readonly icon: Phaser.GameObjects.Image;
  readonly close: Button;
  open = false;
  W = 0;
  H = 0;
  /** Altura da faixa de título (px de tela). */
  head = 0;
  pad = 0;

  constructor(
    private scene: Phaser.Scene,
    title: string,
    icon: number,
    onClose: () => void,
    depth = 2200,
  ) {
    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false);
    this.box = frame(scene, 'frame').setInteractive();
    this.band = scene.add.rectangle(0, 0, 10, 10, 0x0b0d14, 0.45).setOrigin(0);
    this.icon = scene.add.image(0, 0, 'ui-menu', icon);
    this.title = label(scene, title, 16, COLOR.gold);
    this.sub = label(scene, '', 10, COLOR.dim, 1, false);
    this.close = new Button(scene, { icon: 12, color: 'red', onTap: onClose });
    this.root.add([this.box, this.band, this.icon, this.title, this.sub, ...this.close.parts]);
  }

  add(...objs: Phaser.GameObjects.GameObject[]) {
    this.root.add(objs);
  }

  setOpen(on: boolean) {
    this.open = on;
    this.root.setVisible(on);
  }

  contains(x: number, y: number) {
    return this.open && x >= this.root.x && y >= this.root.y && x <= this.root.x + this.W && y <= this.root.y + this.H;
  }

  /** Tamanho da janela (já em px de tela) e centraliza. Conteúdo começa em (pad, head + pad/2). */
  place(u: number, W: number, H: number) {
    const { width, height } = this.scene.scale;
    this.pad = 14 * u;
    this.head = 38 * u;
    sizeFrame(this.box, 0, 0, W, H, u);
    this.W = this.box.displayWidth;
    this.H = this.box.displayHeight;
    const b = pxOf(u) * 4;
    this.band.setPosition(b, b).setSize(this.W - b * 2, this.head - b);
    this.icon.setScale(Math.max(1, Math.round(1.5 * u))).setPosition(this.pad + 10 * u, b + (this.head - b) / 2);
    fit(this.title, 16, u).setPosition(this.pad + 24 * u, b + (this.head - b) / 2).setOrigin(0, 0.5);
    fit(this.sub, 10, u).setPosition(this.title.x + this.title.width + 12 * u, b + (this.head - b) / 2 + 1 * u).setOrigin(0, 0.5);
    this.close.place(this.W - b - 34 * u, b + 4 * u, u, 30 * u, this.head - b - 8 * u);
    this.root.setPosition(Math.round((width - this.W) / 2), Math.round(Math.max(4 * u, (height - this.H) / 2)));
  }
}
