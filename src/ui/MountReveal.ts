import Phaser from 'phaser';
import { MOUNTS, type MountDef } from '../data/mounts';
import type { WorldScene } from '../scenes/WorldScene';
import { Button, COLOR, fit, frame, label, sizeFrame } from './kit';

/**
 * Cartão de montaria nova: ganhar uma montaria (campeão, líder de clã,
 * procurado) é um momento — o jogo pausa, a montaria aparece num feixe de luz
 * com o nome, a raridade, a velocidade e a habilidade, e dá para montar na hora.
 */
export class MountReveal {
  private root: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Rectangle;
  private rays: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Image;
  private box: Phaser.GameObjects.NineSlice;
  private title: Phaser.GameObjects.Text;
  private tier: Phaser.GameObjects.Text;
  private portrait: Phaser.GameObjects.Image;
  private name: Phaser.GameObjects.Text;
  private info: Phaser.GameObjects.Text;
  private ride: Button;
  private later: Button;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private queue: MountDef[] = [];
  private cur: MountDef | null = null;
  private u = 1;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    const s = scene;
    this.root = s.add.container(0, 0).setDepth(6000).setVisible(false);
    this.dim = s.add.rectangle(0, 0, 10, 10, 0x05040a, 0.72).setOrigin(0).setInteractive();
    this.rays = s.add.graphics();
    this.glow = s.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD);
    this.box = frame(s, 'frame');
    this.title = label(s, 'NOVA MONTARIA!', 20, COLOR.gold).setOrigin(0.5);
    this.tier = label(s, '', 10, COLOR.text).setOrigin(0.5);
    this.portrait = s.add.image(0, 0, 'mount-icons', 0).setOrigin(0.5, 1);
    this.name = label(s, '', 16, COLOR.text).setOrigin(0.5);
    this.info = label(s, '', 9, COLOR.dim, 1, false).setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
    this.sparks = s.add.particles(0, 0, 'fx-spark', {
      emitting: false,
      lifespan: { min: 600, max: 1200 },
      speed: { min: 40, max: 160 },
      scale: { start: 2, end: 0 },
      gravityY: 60,
      tint: [0xffffff, 0xffe08a, 0xffc850],
      blendMode: 'ADD',
    });
    this.root.add([this.dim, this.rays, this.glow, this.box, this.portrait, this.sparks, this.title, this.tier, this.name, this.info]);
    this.ride = new Button(s, { label: 'MONTAR AGORA', icon: 26, color: 'gold', size: 12, onTap: () => this.close(true) }).addTo(this.root);
    this.later = new Button(s, { label: 'DEPOIS', color: 'dark', size: 11, onTap: () => this.close(false) }).addTo(this.root);
    world.stable.on('new-mount', (id: string) => this.show(id));
  }

  get open() {
    return this.root.visible;
  }

  private show(id: string) {
    const m = MOUNTS[id];
    if (!m) return;
    if (this.cur) {
      this.queue.push(m);
      return;
    }
    this.cur = m;
    const s = this.scene;
    // o mundo para enquanto o cartão está aberto (ninguém ataca o herói)
    s.scene.pause('World');
    const tier = m.desc.startsWith('Lendária') ? 'LENDÁRIA' : m.desc.startsWith('Rara') ? 'RARA' : 'COMUM';
    const tierColor = tier === 'LENDÁRIA' ? '#ffb84a' : tier === 'RARA' ? '#bfe0ff' : COLOR.text;
    const light = m.glow || (tier === 'LENDÁRIA' ? 0xffc850 : tier === 'RARA' ? 0x9ad0ff : 0xffe8b0);
    this.tier.setText(`— ${tier} —`).setColor(tierColor);
    this.name.setText(m.name.toUpperCase());
    const bonus = [m.guard ? `defesa +${Math.round(m.guard * 100)}%` : '', m.power ? `dano +${Math.round(m.power * 100)}%` : ''].filter(Boolean).join(' · ');
    this.info.setText(
      [`velocidade ×${m.speed.toFixed(2).replace('.', ',')}${bonus ? ` · ${bonus}` : ''}`, `habilidade: ${m.skill.name} (botão de coletar, montado) · disparada no botão de esquiva`, m.desc].join('\n'),
    );
    this.portrait.setFrame(m.row);
    this.glow.setTint(light);
    this.root.setVisible(true).setAlpha(0);
    this.layout(this.u);
    // entrada: tudo aparece, a montaria salta para dentro do feixe
    s.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    const k = this.portrait.scale;
    this.portrait.setScale(0.1);
    s.tweens.add({ targets: this.portrait, scale: k, duration: 520, delay: 120, ease: 'Back.easeOut' });
    this.title.setScale(1.6).setAlpha(0);
    s.tweens.add({ targets: this.title, scale: 1, alpha: 1, duration: 360, delay: 60, ease: 'Back.easeOut' });
    s.tweens.add({ targets: this.glow, alpha: { from: 0.55, to: 0.95 }, yoyo: true, repeat: -1, duration: 900 });
    s.time.delayedCall(260, () => this.sparks.explode(40, this.portrait.x, this.portrait.y - this.portrait.displayHeight * 0.5));
    s.cameras.main.flash(180, 255, 240, 200);
  }

  private close(ride: boolean) {
    const m = this.cur;
    if (!m) return;
    const st = this.world.stable;
    if (ride) {
      st.choose(m.id);
      if (!st.riding) st.toggle();
    }
    this.cur = null;
    this.scene.tweens.killTweensOf([this.glow]);
    this.root.setVisible(false);
    this.scene.scene.resume('World');
    const next = this.queue.shift();
    if (next) this.show(next.id);
  }

  update(time: number) {
    if (!this.open) return;
    // raios de luz girando atrás da montaria
    const g = this.rays.clear();
    const cx = this.portrait.x;
    const cy = this.portrait.y - this.portrait.displayHeight * 0.5;
    const R = Math.max(this.scene.scale.width, this.scene.scale.height) * 0.6;
    const a0 = time / 3000;
    const col = this.cur?.glow || 0xffd77a;
    for (let i = 0; i < 14; i++) {
      const a = a0 + (i / 14) * Math.PI * 2;
      g.fillStyle(col, i % 2 ? 0.07 : 0.12);
      g.fillTriangle(cx, cy, cx + Math.cos(a - 0.09) * R, cy + Math.sin(a - 0.09) * R, cx + Math.cos(a + 0.09) * R, cy + Math.sin(a + 0.09) * R);
    }
  }

  layout(u: number) {
    this.u = u;
    const { width: W, height: H } = this.scene.scale;
    this.dim.setSize(W, H);
    const bw = Math.min(W * 0.9, 470 * u);
    const bh = Math.min(H * 0.92, 300 * u);
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    sizeFrame(this.box, bx, by, bw, bh, u);
    fit(this.title, 20, u).setPosition(W / 2, by + 20 * u);
    fit(this.tier, 10, u).setPosition(W / 2, by + 38 * u);
    // retrato: a folha tem 112×80; ocupa ~40% da altura do cartão, em escala inteira
    const sc = Math.max(1, Math.floor((bh * 0.42) / 80));
    this.portrait.setScale(sc).setPosition(W / 2, by + 50 * u + 80 * sc);
    this.glow.setPosition(W / 2, by + 50 * u + 40 * sc).setScale((112 * sc * 1.6) / 64);
    const ty = by + 54 * u + 80 * sc;
    fit(this.name, 16, u).setPosition(W / 2, ty + 8 * u);
    fit(this.info, 9, u).setPosition(W / 2, ty + 20 * u).setWordWrapWidth(bw - 30 * u);
    const bH = 26 * u;
    const yb = by + bh - bH - 12 * u;
    this.ride.place(W / 2 - 150 * u, yb, u, 170 * u, bH);
    this.later.place(W / 2 + 28 * u, yb, u, 122 * u, bH);
  }
}
