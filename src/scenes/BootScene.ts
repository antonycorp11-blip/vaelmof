import Phaser from 'phaser';
import { BUILDINGS } from '../data/buildings';
import { HERO } from '../entities/heroSheet';
import { HERO_SHEETS } from '../entities/heroSheets';
import { WRAITH_SHEET } from '../entities/wraithSheet';

const S = 'assets/sprites/';

/** Carrega os assets (PNG em public/assets) e registra as animações. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 120, height / 2, 0, 8, 0xffd34a).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 244, 12).setStrokeStyle(2, 0xffffff, 0.6);
    this.add
      .text(width / 2, height / 2 - 26, 'VAELMOR', { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.load.on('progress', (v: number) => (bar.width = 240 * v));

    this.load.image('tiles', 'assets/tilesets/vaelmor-tiles.png');
    const sheet = (key: string, file: string, w = 16, h = 16) => this.load.spritesheet(key, S + file, { frameWidth: w, frameHeight: h });
    // Teren: camadas LPC montadas por scripts/hero; Errante: scripts/wraith
    // Teren em camadas: traje inicial e espada (os outros carregam ao equipar)
    for (const k of ['outfit-leather', 'outfit-leather-back', 'wpn-sword-bg', 'wpn-sword-fg']) sheet(k, `${k}.png`, HERO.frame, HERO.frame);
    for (const side of ['bg', 'fg']) sheet(`wpn-sword-slash-${side}`, `wpn-sword-slash-${side}.png`, HERO_SHEETS.sword.big.slash.frame, HERO_SHEETS.sword.big.slash.frame);
    sheet('armor-icons', 'armor-icons.png', 40, 54);
    sheet('arrow', 'arrow.png');
    sheet('bolt', 'bolt.png');
    sheet('items', 'items.png');
    sheet('wraith', 'wraith.png', WRAITH_SHEET.frameW, WRAITH_SHEET.frameH);
    sheet('bandit', 'bandit.png', 48, 48);
    // criaturas dos biomas
    for (const k of ['boar', 'spider', 'scorpion', 'fox', 'hare', 'goat', 'lizard']) sheet(k, `${k}.png`);
    for (const k of ['bear', 'golem']) sheet(k, `${k}.png`, 24, 24);
    sheet('slime', 'slime.png');
    sheet('wolf', 'wolf.png');
    sheet('sheep', 'sheep.png');
    sheet('deer', 'deer.png');
    sheet('bird', 'bird.png');
    sheet('torch', 'torch.png');
    sheet('flame', 'flame.png');
    sheet('slash', 'slash.png', 32, 32);
    sheet('explosion', 'explosion.png', 32, 32);
    sheet('splash', 'splash.png', 8, 8);
    sheet('ui-icons', 'ui-icons.png');
    // insígnias de patente: 10 patentes × (aliado, inimigo)
    sheet('rank-icons', 'rank-icons.png', 11, 11);
    for (const k of ['pixel', 'raindrop', 'shadow', 'glow', 'fog']) this.load.image(k, `${S}${k}.png`);
    // construções das cidades (variantes × janelas apagadas/acesas), torres, fonte e barracas
    for (const [k, B] of Object.entries(BUILDINGS)) this.load.spritesheet(`bld-${k}`, `assets/tiles/bld-${k}.png`, { frameWidth: B.w, frameHeight: B.h });
    this.load.spritesheet('tower', 'assets/tiles/tower.png', { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('stall', 'assets/tiles/stall.png', { frameWidth: 32, frameHeight: 32 });
    this.load.image('fountain', 'assets/tiles/fountain.png');
  }

  create() {
    const a = this.anims;
    const range = (key: string, start: number, end: number) => a.generateFrameNumbers(key, { start, end });
    const frames = (key: string, list: number[]) => a.generateFrameNumbers(key, { frames: list });
    a.create({ key: 'bolt-fly', frames: range('bolt', 0, 1), frameRate: 12, repeat: -1 });
    // Errante: por direção, 12 quadros flutuando + 12 em movimento
    const wc = WRAITH_SHEET.cols;
    for (let d = 0; d < 4; d++) {
      a.create({ key: `wraith-idle-${d}`, frames: range('wraith', d * wc, d * wc + WRAITH_SHEET.idle - 1), frameRate: 10, repeat: -1 });
      a.create({ key: `wraith-move-${d}`, frames: range('wraith', d * wc + WRAITH_SHEET.idle, d * wc + wc - 1), frameRate: 14, repeat: -1 });
    }
    for (let d = 0; d < 4; d++) {
      const br = 16;
      a.create({ key: `bandit-idle-${d}`, frames: range('bandit', d * br, d * br + 3), frameRate: 3, repeat: -1 });
      a.create({ key: `bandit-walk-${d}`, frames: range('bandit', d * br + 4, d * br + 9), frameRate: 10, repeat: -1 });
      a.create({
        key: `bandit-atk-${d}`,
        frames: [11, 12, 13, 14].map((c, i) => ({ key: 'bandit', frame: d * br + c, duration: [40, 70, 80, 110][i] })),
        repeat: 0,
      });
    }
    for (const k of ['boar', 'spider', 'scorpion', 'bear', 'golem']) a.create({ key: `${k}-walk`, frames: range(k, 0, 1), frameRate: k === 'golem' || k === 'bear' ? 4 : 7, repeat: -1 });
    for (const k of ['fox', 'hare', 'goat', 'lizard']) {
      a.create({ key: `${k}-walk`, frames: range(k, 0, 1), frameRate: 5, repeat: -1 });
      a.create({ key: `${k}-run`, frames: frames(k, [3, 1, 3, 0]), frameRate: 12, repeat: -1 });
    }
    a.create({ key: 'slime-hop', frames: frames('slime', [0, 1, 2, 3, 2, 1]), frameRate: 9, repeat: -1 });
    a.create({ key: 'wolf-walk', frames: range('wolf', 0, 1), frameRate: 6, repeat: -1 });
    a.create({ key: 'sheep-walk', frames: range('sheep', 0, 1), frameRate: 4, repeat: -1 });
    a.create({ key: 'sheep-run', frames: range('sheep', 0, 1), frameRate: 10, repeat: -1 });
    a.create({ key: 'deer-walk', frames: range('deer', 0, 1), frameRate: 4, repeat: -1 });
    a.create({ key: 'deer-run', frames: frames('deer', [3, 1, 3, 0]), frameRate: 12, repeat: -1 });
    a.create({ key: 'bird-flap', frames: frames('bird', [0, 1, 2, 1]), frameRate: 10, repeat: -1 });
    a.create({ key: 'torch-burn', frames: range('torch', 1, 3), frameRate: 8, repeat: -1 });
    a.create({ key: 'flame-fly', frames: range('flame', 0, 2), frameRate: 14, repeat: -1 });
    a.create({ key: 'slash', frames: range('slash', 0, 2), frameRate: 24, repeat: 0 });
    a.create({ key: 'explosion', frames: range('explosion', 0, 4), frameRate: 16, repeat: 0 });

    this.scene.start('World');
    this.scene.launch('UI');
  }
}
