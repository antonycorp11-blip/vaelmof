import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import { CLAN_COLORS, CREST_COUNT, CREST_NAMES } from '../systems/Clans';
import { Button, COLOR, Crest, FONT, fit, frame, label, sizeFrame } from './kit';

const FIRST = ['Lobos', 'Corvos', 'Lâminas', 'Filhos', 'Guardiões', 'Falcões', 'Martelos', 'Juramentados', 'Andarilhos', 'Presas'];
const SECOND = ['de Teren', 'do Vale', 'da Aurora', 'de Ferro', 'da Bruma', 'do Norte', 'Rubros', 'de Cinza', 'do Juramento', 'de Prata'];

/**
 * Começo do jogo: fundar o clã. Nome (campo de texto de verdade, para o
 * teclado do celular), brasão e cor — a cor vai para os soldados. O mundo
 * fica pausado até fundar.
 */
export class ClanCreate {
  open = false;
  private root: Phaser.GameObjects.Container;
  private shade: Phaser.GameObjects.Rectangle;
  private box: Phaser.GameObjects.NineSlice;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private lName: Phaser.GameObjects.Text;
  private lCrest: Phaser.GameObjects.Text;
  private lColor: Phaser.GameObjects.Text;
  private nameBox: Phaser.GameObjects.NineSlice;
  private preview: Crest;
  private pName: Phaser.GameObjects.Text;
  private pInfo: Phaser.GameObjects.Text;
  private loop: Phaser.GameObjects.Text;
  private crestBtns: { bg: Phaser.GameObjects.NineSlice; crest: Crest }[] = [];
  private colorBtns: { bg: Phaser.GameObjects.NineSlice; sw: Phaser.GameObjects.Rectangle }[] = [];
  private found: Button;
  private dice: Button;
  private input?: HTMLInputElement;
  private crest = 0;
  private color = CLAN_COLORS[0];
  private u = 1;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.root = scene.add.container(0, 0).setDepth(3000).setVisible(false);
    this.shade = scene.add.rectangle(0, 0, 10, 10, 0x05060a, 0.86).setOrigin(0).setInteractive();
    this.box = frame(scene, 'frame');
    this.title = label(scene, 'FUNDE O TEU CLÃ', 18, COLOR.gold);
    this.sub = label(scene, 'Todo clã de Vaelmor sonha em virar Casa.', 10, COLOR.dim, 1, false);
    this.lName = label(scene, 'NOME', 10, COLOR.blue);
    this.lCrest = label(scene, 'BRASÃO', 10, COLOR.blue);
    this.lColor = label(scene, 'COR (vai para os soldados)', 10, COLOR.blue);
    this.nameBox = frame(scene, 'frame-inner');
    this.preview = new Crest(scene, 0, this.color);
    this.pName = label(scene, '', 13, COLOR.gold).setOrigin(0.5, 0).setAlign('center');
    this.pInfo = label(scene, '', 9, COLOR.dim, 1, false).setOrigin(0.5, 0).setAlign('center');
    this.loop = label(scene, '', 8.5, COLOR.text, 1, false).setLineSpacing(3);
    this.found = new Button(scene, { label: 'FUNDAR O CLÃ', icon: 19, color: 'gold', size: 13, onTap: () => this.submit() });
    this.dice = new Button(scene, { label: 'SORTEAR', color: 'dark', size: 10, onTap: () => this.randomName() });
    this.root.add([this.shade, this.box, this.title, this.sub, this.lName, this.lCrest, this.lColor, this.nameBox, ...this.preview.parts, this.pName, this.pInfo, this.loop]);
    this.found.addTo(this.root);
    this.dice.addTo(this.root);
    for (let i = 0; i < CREST_COUNT; i++) {
      const bg = frame(scene, 'frame-inner').setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        this.crest = i;
        this.refresh();
      });
      const crest = new Crest(scene, i, 0x9a9488);
      this.root.add([bg, ...crest.parts]);
      this.crestBtns.push({ bg, crest });
    }
    CLAN_COLORS.forEach((c) => {
      const bg = frame(scene, 'frame-inner').setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        this.color = c;
        this.refresh();
      });
      const sw = scene.add.rectangle(0, 0, 10, 10, c).setOrigin(0.5);
      this.root.add([bg, sw]);
      this.colorBtns.push({ bg, sw });
    });
  }

  contains() {
    return this.open;
  }

  setOpen(on: boolean) {
    this.open = on;
    this.root.setVisible(on);
    if (on) {
      if (!this.input) this.makeInput();
      this.input!.style.display = 'block';
      if (!this.input!.value) this.randomName();
      this.layout(this.u);
      this.scene.scene.pause('World');
    } else {
      if (this.input) this.input.style.display = 'none';
      this.scene.scene.resume('World');
    }
  }

  private makeInput() {
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = 24;
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.setAttribute('aria-label', 'Nome do clã');
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: '20',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      color: COLOR.gold,
      fontFamily: FONT,
      padding: '0 8px',
      margin: '0',
      boxSizing: 'border-box',
      display: 'none',
    } as CSSStyleDeclaration);
    el.addEventListener('input', () => this.refresh());
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') el.blur();
    });
    document.body.appendChild(el);
    this.input = el;
  }

  private randomName() {
    const p = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    if (this.input) this.input.value = `${p(FIRST)} ${p(SECOND)}`;
    this.refresh();
  }

  private submit() {
    const name = (this.input?.value ?? '').trim();
    if (!name) return this.randomName();
    this.input?.blur();
    this.world.clans.found(name, this.crest, this.color);
    this.setOpen(false);
  }

  private refresh() {
    const name = (this.input?.value ?? '').trim() || '…';
    this.preview.set(this.crest, this.color);
    this.pName.setText(name);
    this.pInfo.setText(`Bando · sede em ${this.world.clans.player.city}\nbrasão: ${CREST_NAMES[this.crest]}`);
    this.crestBtns.forEach((b, i) => {
      b.bg.setTexture(i === this.crest ? 'ui-frame-hl' : 'ui-frame-inner');
      b.crest.set(i, i === this.crest ? this.color : 0x9a9488);
    });
    this.colorBtns.forEach((b, i) => b.bg.setTexture(CLAN_COLORS[i] === this.color ? 'ui-frame-hl' : 'ui-frame-inner'));
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    this.shade.setSize(width, height);
    const W = Math.min(width * 0.96, 760 * u);
    const H = Math.min(height * 0.96, 370 * u);
    const x0 = Math.round((width - W) / 2);
    const y0 = Math.round((height - H) / 2);
    sizeFrame(this.box, x0, y0, W, H, u);
    const pad = 16 * u;
    fit(this.title, 18, u).setPosition(x0 + pad, y0 + pad);
    fit(this.sub, 10, u).setPosition(x0 + pad, y0 + pad + 24 * u);
    // coluna da esquerda: nome, brasão, cor
    const L = (W - pad * 3) * 0.64;
    let y = y0 + pad + 46 * u;
    fit(this.lName, 10, u).setPosition(x0 + pad, y);
    y += 14 * u;
    const nh = 30 * u;
    sizeFrame(this.nameBox, x0 + pad, y, L - 90 * u, nh, u);
    this.dice.place(x0 + pad + L - 84 * u, y, u, 84 * u, nh);
    this.placeInput(x0 + pad, y, L - 90 * u, nh, u);
    y += nh + 10 * u;
    fit(this.lCrest, 10, u).setPosition(x0 + pad, y);
    y += 14 * u;
    const per = 6;
    const cs = Math.min((L - 5 * 4 * u) / per, 44 * u);
    this.crestBtns.forEach((b, i) => {
      const bx = x0 + pad + (i % per) * (cs + 4 * u);
      const by = y + Math.floor(i / per) * (cs + 4 * u);
      sizeFrame(b.bg, bx, by, cs, cs, u);
      b.crest.place(bx + b.bg.displayWidth / 2, by + b.bg.displayHeight / 2 + u, Math.floor((cs * 0.62) / 18));
    });
    y += 2 * (cs + 4 * u) + 6 * u;
    fit(this.lColor, 10, u).setPosition(x0 + pad, y);
    y += 14 * u;
    const ss = Math.min((L - 11 * 4 * u) / 12, 30 * u);
    this.colorBtns.forEach((b, i) => {
      const bx = x0 + pad + i * (ss + 4 * u);
      sizeFrame(b.bg, bx, y, ss, ss, u);
      b.sw.setSize(b.bg.displayWidth - 10 * u, b.bg.displayHeight - 10 * u).setOrigin(0.5).setPosition(bx + b.bg.displayWidth / 2, y + b.bg.displayHeight / 2);
    });
    // coluna da direita: prévia, o objetivo e fundar
    const rx = x0 + pad * 2 + L;
    const rw = W - L - pad * 3;
    const cx = rx + rw / 2;
    this.preview.place(cx, y0 + pad + 70 * u, Math.max(3, Math.round(3.4 * u)));
    fit(this.pName, 13, u).setPosition(cx, y0 + pad + 110 * u).setWordWrapWidth(rw);
    fit(this.pInfo, 9, u).setPosition(cx, this.pName.y + this.pName.height + 3 * u);
    fit(this.loop, 8.5, u)
      .setText('Desafie clãs rivais, cumpra missões dos Lordes e derrote personagens para ganhar Glória e armas raras. Chegue à última patente e seu clã vira Casa.')
      .setWordWrapWidth(rw)
      .setPosition(rx, this.pInfo.y + this.pInfo.height + 10 * u);
    this.found.place(rx, y0 + H - pad - 34 * u, u, rw, 34 * u);
    this.refresh();
  }

  /** O campo HTML fica exatamente sobre a moldura do nome. */
  private placeInput(x: number, y: number, w: number, h: number, u: number) {
    const el = this.input;
    if (!el) return;
    const r = this.scene.game.canvas.getBoundingClientRect();
    const k = r.width / this.scene.scale.width;
    Object.assign(el.style, {
      left: `${r.left + x * k}px`,
      top: `${r.top + y * k}px`,
      width: `${w * k}px`,
      height: `${h * k}px`,
      fontSize: `${Math.round(14 * u * k)}px`,
    });
  }
}
