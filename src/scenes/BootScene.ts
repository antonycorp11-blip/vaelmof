import Phaser from 'phaser';

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
    sheet('teren', 'teren.png');
    sheet('bandit', 'bandit.png');
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
    for (const k of ['pixel', 'raindrop', 'shadow', 'glow', 'fog']) this.load.image(k, `${S}${k}.png`);
    for (const k of ['house-brumavale-a', 'house-brumavale-b', 'house-pedrafria-a', 'house-pedrafria-b'])
      this.load.spritesheet(k, `assets/tiles/${k}.png`, { frameWidth: 48, frameHeight: 48 });
    this.load.image('well', 'assets/tiles/well.png');
  }

  create() {
    const a = this.anims;
    const range = (key: string, start: number, end: number) => a.generateFrameNumbers(key, { start, end });
    const frames = (key: string, list: number[]) => a.generateFrameNumbers(key, { frames: list });
    // Teren: 5 colunas (idle, passoA, passoB, ataque, rolagem) × 4 direções
    for (let d = 0; d < 4; d++) {
      a.create({ key: `teren-walk-${d}`, frames: frames('teren', [d * 5 + 1, d * 5, d * 5 + 2, d * 5]), frameRate: 9, repeat: -1 });
      a.create({ key: `bandit-walk-${d}`, frames: frames('bandit', [d * 4 + 1, d * 4, d * 4 + 2, d * 4]), frameRate: 7, repeat: -1 });
    }
    a.create({ key: 'teren-roll', frames: frames('teren', [4, 9, 14, 19]), frameRate: 18, repeat: -1 });
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
