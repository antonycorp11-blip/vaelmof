import Phaser from 'phaser';

/** Resolução da folha de letras (a fonte é desenhada 4× maior e reduzida). */
const R = 4;
const SIZE = 8;
const FONT_KEY = 'ft-font';
const CHARS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~' +
  'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÇ·×';
const MAX = 70;

/**
 * Números de dano e avisos flutuantes do mundo. Antes cada um era um Text novo
 * (um canvas e uma textura por número — caro no iPhone em batalhas grandes);
 * agora são BitmapText de uma folha de letras gerada uma vez com a fonte do
 * jogo (contorno escuro, preenchimento branco tingido) e reaproveitados.
 */
export class FloatTexts {
  private pool: Phaser.GameObjects.BitmapText[] = [];
  private next = 0;

  constructor(
    private scene: Phaser.Scene,
    private depth: number,
  ) {
    if (!scene.cache.bitmapFont.exists(FONT_KEY)) buildFont(scene);
  }

  /** Mostra `text` subindo e sumindo. Sem vaga livre, reaproveita o mais antigo. */
  show(x: number, y: number, text: string, color: string, size: number, rise: number, delay: number, duration: number) {
    let t = this.pool.find((b) => !b.visible);
    if (!t) {
      if (this.pool.length < MAX) {
        t = this.scene.add.bitmapText(0, 0, FONT_KEY, '', SIZE * R).setOrigin(0.5).setDepth(this.depth);
        this.pool.push(t);
      } else {
        t = this.pool[this.next];
        this.next = (this.next + 1) % MAX;
      }
    }
    const b = t;
    this.scene.tweens.killTweensOf(b);
    b.setText(text)
      .setFontSize(size)
      .setTint(Phaser.Display.Color.HexStringToColor(color).color)
      .setPosition(Math.round(x), Math.round(y))
      .setAlpha(1)
      .setVisible(true);
    this.scene.tweens.add({ targets: b, y: y - rise, alpha: 0, delay, duration, ease: 'Quad.easeOut', onComplete: () => b.setVisible(false) });
  }
}

/** Desenha as letras numa folha e registra a fonte bitmap proporcional. */
function buildFont(scene: Phaser.Scene) {
  const px = SIZE * R;
  const pad = R; // espaço para o contorno
  const h = Math.ceil(px * 1.25) + pad * 2;
  const meas = document.createElement('canvas').getContext('2d')!;
  const font = `${px}px Tiny5, monospace`;
  meas.font = font;
  const widths = [...CHARS].map((c) => Math.ceil(meas.measureText(c).width));
  const cols = 24;
  const cellW = Math.max(...widths) + pad * 2;
  const rows = Math.ceil(CHARS.length / cols);
  const tex = scene.textures.createCanvas(FONT_KEY, cols * cellW, rows * h)!;
  const ctx = tex.getContext();
  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2 * R;
  ctx.strokeStyle = '#1e1a24';
  ctx.fillStyle = '#ffffff';
  const W = cols * cellW;
  const H = rows * h;
  const chars: Record<number, unknown> = {};
  [...CHARS].forEach((c, i) => {
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * h;
    const w = widths[i] + pad * 2;
    ctx.strokeText(c, x + pad, y + pad);
    ctx.fillText(c, x + pad, y + pad);
    chars[c.charCodeAt(0)] = {
      x,
      y,
      width: w,
      height: h,
      centerX: Math.floor(w / 2),
      centerY: Math.floor(h / 2),
      xOffset: -pad,
      yOffset: 0,
      xAdvance: widths[i],
      data: {},
      kerning: {},
      u0: x / W,
      v0: y / H,
      u1: (x + w) / W,
      v1: (y + h) / H,
    };
  });
  tex.refresh();
  scene.cache.bitmapFont.add(FONT_KEY, { data: { retroFont: false, font: FONT_KEY, size: px, lineHeight: h, chars }, texture: FONT_KEY, frame: null });
}
