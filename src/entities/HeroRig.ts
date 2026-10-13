import Phaser from 'phaser';

/** Metadados gerados por scripts/hero/build.mjs (public/assets/hero/hero.json). */
export interface HeroMeta {
  frame: { w: number; h: number };
  feet: [number, number];
  scale: number;
  dirs: number;
  layers: string[];
  loadout: Record<string, string>;
  atlases: Record<string, string>;
  anims: Record<string, { frames: number; durations: number[]; loop: boolean; hit: number | null; release: number | null }>;
}

export const HERO_META_KEY = 'hero-meta';
/** Chave de textura de uma peça: hero:<slot>:<item>. */
export const heroTexture = (slot: string, item: string) => `hero:${slot}:${item}`;

/** Duração total de uma animação e instante (ms) em que um quadro começa. */
export function animTiming(meta: HeroMeta, name: string, frame: number | null = null) {
  const d = meta.anims[name].durations;
  const total = d.reduce((a, b) => a + b, 0);
  const at = frame === null ? 0 : d.slice(0, frame).reduce((a, b) => a + b, 0);
  return { total, at };
}

/**
 * Camadas visuais do herói. A camada "body" é o próprio sprite físico (o
 * Player); as demais (pernas, torso, capa, arma, efeitos) são sprites que
 * copiam o quadro, posição e estado dele antes de cada render. Todas as
 * camadas compartilham os mesmos nomes de quadro, então trocar uma peça é só
 * trocar a textura daquela camada — veja `equip()`.
 */
export class HeroRig {
  readonly layers = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly order: string[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly base: Phaser.GameObjects.Sprite,
    readonly meta: HeroMeta,
  ) {
    this.order = meta.layers.filter((l) => l !== 'body');
    for (const slot of this.order) {
      const item = slot === 'fx' ? meta.loadout.weapon : meta.loadout[slot];
      if (!item) continue;
      const key = slot === 'fx' ? heroTexture('fx', item) : heroTexture(slot, item);
      const s = scene.add.sprite(base.x, base.y, key, base.frame.name);
      s.setOrigin(base.originX, base.originY).setScale(base.scaleX);
      this.layers.set(slot, s);
    }
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.sync, this);
    base.once(Phaser.GameObjects.Events.DESTROY, () => this.destroy());
  }

  /** Troca a peça de um slot (a textura precisa estar carregada). */
  equip(slot: string, item: string | null) {
    const s = this.layers.get(slot);
    if (!item) {
      s?.setVisible(false);
      return;
    }
    const key = heroTexture(slot, item);
    if (!this.scene.textures.exists(key)) throw new Error(`Peça não carregada: ${key}`);
    s?.setTexture(key, this.base.frame.name).setVisible(true);
  }

  /** Copia quadro e estado do sprite base para as camadas. */
  sync() {
    const b = this.base;
    const name = b.frame.name;
    let i = 1;
    for (const slot of this.order) {
      const s = this.layers.get(slot);
      if (!s) continue;
      if (s.frame.name !== name && s.texture.has(name)) s.setFrame(name);
      s.setPosition(b.x, b.y);
      s.setDepth(b.depth + i++ * 0.01);
      s.setAngle(b.angle);
      s.setAlpha(b.alpha);
      s.setVisible(b.visible);
      s.setFlipX(b.flipX);
    }
  }

  tintFill(color: number) {
    for (const s of this.layers.values()) if (s.texture.key.startsWith('hero:fx') === false) s.setTintFill(color);
  }

  clearTint() {
    for (const s of this.layers.values()) s.clearTint();
  }

  /** Imagens fantasma (rastro da esquiva) de todas as camadas sólidas. */
  ghost(tint: number, alpha: number, duration: number) {
    const parts = [this.base, ...[...this.layers.entries()].filter(([k]) => k !== 'fx').map(([, s]) => s)];
    for (const p of parts) {
      const g = this.scene.add
        .image(this.base.x, this.base.y, p.texture.key, this.base.frame.name)
        .setOrigin(this.base.originX, this.base.originY)
        .setScale(this.base.scaleX)
        .setAlpha(alpha)
        .setTint(tint)
        .setDepth(this.base.depth - 1);
      this.scene.tweens.add({ targets: g, alpha: 0, duration, onComplete: () => g.destroy() });
    }
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.sync, this);
    for (const s of this.layers.values()) s.destroy();
    this.layers.clear();
  }
}
