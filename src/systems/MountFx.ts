import Phaser from 'phaser';
import { DEPTH } from '../entities/Creature';

/**
 * Efeitos das habilidades das montarias. Cada habilidade tem uma coreografia
 * própria feita de peças de pixel art (scripts/fx-art.mjs): onda de choque com
 * rachadura e pedras (Coice), ondas sonoras (Rugido), círculo mágico com coluna
 * de luz (Bênção), cone de fogo com fumaça e chão queimado (Sopro), cristais de
 * gelo brotando do chão (Gelo), rastro e garras (Bote) e meias-luas de vento
 * (Rajada). Os emissores de partículas são criados uma vez e reaproveitados.
 */

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type Img = Phaser.GameObjects.Image;

/** Chão (abaixo dos personagens) e luz (acima de tudo, até da noite). */
const GROUND = DEPTH.decor + 1;
const LIGHT = DEPTH.fx;
/** Achatamento do chão visto de cima em perspectiva. */
const FLAT = 0.55;

/** Clareia (k > 0) ou escurece (k < 0) uma cor. */
export function shade(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** Troca uma propriedade de um emissor já criado (ângulo, velocidade, tom…). */
type Op = { loadConfig: (c: object) => void; active: boolean };
const opsOf = (e: Emitter) => (e as unknown as { ops: Record<string, Op> }).ops;
function op(e: Emitter, key: string, value: unknown) {
  opsOf(e)[key].loadConfig({ [key]: value });
}
/** Velocidade explícita (vx, vy). */
function vel(e: Emitter, vx: unknown, vy: unknown) {
  e.radial = false;
  op(e, 'speedX', vx);
  op(e, 'speedY', vy);
  opsOf(e).speedY.active = true;
}
/** Velocidade por ângulo (graus) e rapidez. */
function rad(e: Emitter, angle: unknown, speed: unknown) {
  e.radial = true;
  op(e, 'angle', angle);
  op(e, 'speedX', speed);
  opsOf(e).speedY.active = false;
}

/** Do branco quente ao fim da chama: fogo de verdade (amarelo → laranja → vermelho) ou na cor da montaria. */
function firePalette(color: number): number[] {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  if (r > g && r > b) return [0xffffff, 0xfff4b0, 0xffc83a, 0xff7a1e, 0xd83a14, 0x6a2418];
  return [0xffffff, shade(color, 0.7), shade(color, 0.3), color, shade(color, -0.35), shade(color, -0.65)];
}

export class MountFx {
  private dust: Emitter;
  private rocks: Emitter;
  private sparks: Emitter;
  private motes: Emitter;
  private smoke: Emitter;
  private snow: Emitter;
  private bits: Emitter;
  private fires = new Map<number, Emitter>();
  /** Núcleo quente (luz somada) na boca, por cima das labaredas. */
  private fireCore: Emitter;

  constructor(private scene: Phaser.Scene) {
    const add = (tex: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth: number) => scene.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(depth);
    this.dust = add('fx-puff', { frame: [0, 1, 2], lifespan: { min: 450, max: 800 }, scale: { start: 0.35, end: 1.15 }, alpha: { start: 0.75, end: 0 }, rotate: { min: 0, max: 360 }, maxAliveParticles: 70 }, LIGHT - 3);
    this.rocks = add('fx-rock', { frame: [0, 1, 2, 3], lifespan: { min: 480, max: 620 }, gravityY: 460, rotate: { start: 0, end: 540 }, alpha: { start: 1, end: 0.6 }, maxAliveParticles: 40 }, LIGHT - 2);
    this.sparks = add('fx-spark', { lifespan: { min: 220, max: 420 }, scale: { start: 1, end: 0 }, blendMode: 'ADD', maxAliveParticles: 90 }, LIGHT + 1);
    this.motes = add('fx-blob', { lifespan: { min: 700, max: 1300 }, scale: { start: 0.38, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD', maxAliveParticles: 90 }, LIGHT);
    this.smoke = add('fx-puff', { frame: [0, 1, 2], lifespan: { min: 700, max: 1000 }, scale: { start: 0.35, end: 1.5 }, alpha: { start: 0.55, end: 0 }, rotate: { min: 0, max: 360 }, accelerationY: -40, tint: 0x3a3036, maxAliveParticles: 60 }, LIGHT - 2);
    this.snow = add('fx-snow', { lifespan: { min: 800, max: 1400 }, scale: { start: 0.9, end: 0.2 }, alpha: { start: 1, end: 0 }, rotate: { min: -180, max: 180 }, blendMode: 'ADD', maxAliveParticles: 60 }, LIGHT);
    this.fireCore = add('fx-blob', { lifespan: { min: 140, max: 240 }, scale: { start: 0.55, end: 0.15 }, alpha: { start: 0.95, end: 0 }, blendMode: 'ADD', maxAliveParticles: 80 }, LIGHT + 1);
    this.bits = add('fx-bits', { lifespan: { min: 600, max: 1100 }, rotate: { start: 0, end: 720 }, alpha: { start: 1, end: 0 }, maxAliveParticles: 50 }, LIGHT - 1);
  }

  // ------------------------------------------------------------ peças
  private img(x: number, y: number, key: string, frame = 0, depth: number = LIGHT, add = true): Img {
    const i = this.scene.add.image(x, y, key, frame).setDepth(depth);
    if (add) i.setBlendMode(Phaser.BlendModes.ADD);
    return i;
  }

  /** Clarão redondo (luz) que cresce e some. */
  flash(x: number, y: number, color: number, size: number, ms = 180, alpha = 0.9) {
    const g = this.img(x, y, 'glow').setTint(color).setAlpha(alpha).setScale((size / 64) * 0.4);
    this.scene.tweens.add({ targets: g, scale: size / 64, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  /** Onda de choque achatada no chão (ou no ar, `air`). */
  private wave(x: number, y: number, r: number, color: number, ms: number, delay = 0, air = false, alpha = 1, glow = false) {
    // mistura normal: no gramado, a soma de luz deixava tudo esverdeado
    const w = this.img(x, y, 'fx-ring', 0, air ? LIGHT : GROUND + 1, glow).setTint(color).setAlpha(0);
    const k = (r * 2) / 96;
    const s = { v: 0.12 };
    const set = () => w.setScale(k * s.v, k * s.v * (air ? 0.72 : FLAT));
    set();
    this.scene.tweens.add({
      targets: s,
      v: 1,
      delay,
      duration: ms,
      ease: 'Cubic.easeOut',
      onStart: () => w.setAlpha(alpha),
      onUpdate: (tw) => {
        set();
        w.setAlpha(alpha * (1 - tw.progress) ** 1.4);
      },
      onComplete: () => w.destroy(),
    });
  }

  /**
   * Onda sonora: traço de espessura fixa (contorno escuro, cor, brilho) que
   * cresce — aparece em qualquer chão, ao contrário de um anel de luz.
   */
  private sonic(x: number, y: number, r: number, color: number, ms: number, delay: number, flat = 0.7) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(LIGHT);
    const st = { v: 0.15 };
    s.tweens.add({
      targets: st,
      v: 1,
      delay,
      duration: ms,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const rr = r * st.v;
        const a = (1 - tw.progress) ** 1.2;
        g.clear();
        // arco de cima mais fino (de longe) e de baixo mais grosso (de perto)
        g.lineStyle(4.5, 0x1a1028, 0.45 * a).strokeEllipse(x, y, rr * 2, rr * 2 * flat);
        g.lineStyle(3, color, 0.95 * a).strokeEllipse(x, y, rr * 2, rr * 2 * flat);
        g.lineStyle(1, 0xffffff, 0.9 * a).strokeEllipse(x, y - 0.5, rr * 2 - 1, rr * 2 * flat - 1);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** Poeira levantada em volta (achatada como o chão). */
  private dustRing(x: number, y: number, r: number, n: number, tint: number) {
    const e = this.dust;
    op(e, 'tint', tint);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const sp = r * (1.3 + Math.random() * 0.9);
      vel(e, Math.cos(a) * sp, Math.sin(a) * sp * FLAT - 8);
      e.emitParticleAt(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25 * FLAT, 1);
    }
  }

  /** Faíscas em leque (ângulo em graus) ou em volta. */
  private sparkBurst(x: number, y: number, color: number, n: number, speed: number, angle: { min: number; max: number } = { min: 0, max: 360 }) {
    const e = this.sparks;
    op(e, 'tint', color);
    rad(e, angle, { min: speed * 0.4, max: speed });
    e.explode(n, x, y);
  }

  /** Marca no chão que some devagar (rachadura, queimado). */
  private decal(x: number, y: number, key: string, scale: number, hold: number, alpha = 1, angle = 0) {
    const d = this.img(x, y, key, 0, GROUND, false).setAlpha(alpha).setScale(scale * 0.6).setAngle(angle);
    this.scene.tweens.add({ targets: d, scale, duration: 90, ease: 'Quad.easeOut' });
    this.scene.tweens.add({ targets: d, alpha: 0, delay: hold, duration: 700, onComplete: () => d.destroy() });
  }

  // ------------------------------------------------------------ COICE / ATROPELAR
  stomp(x: number, y: number, r: number, color: number, p: number) {
    const s = this.scene;
    s.cameras.main.shake(200, 0.003 + 0.0015 * p);
    this.flash(x, y - 6, 0xfff4d8, r * 1.4, 160);
    this.decal(x, y, 'fx-crack', (r * 1.5) / 96, 900 + p * 200, 0.95, Math.random() < 0.5 ? 0 : 180);
    this.wave(x, y, r, color, 380);
    this.wave(x, y, r * 1.25, 0xffffff, 460, 70, false, 0.55);
    this.dustRing(x, y, r, 14 + Math.round(p * 4), 0xcdb894);
    const rk = this.rocks;
    vel(rk, { min: -r * 2.2, max: r * 2.2 }, { min: -190, max: -90 });
    op(rk, 'scaleX', { min: 0.8, max: 1.3 });
    rk.explode(8 + Math.round(p * 4), x, y - 2);
    this.sparkBurst(x, y - 4, shade(color, 0.4), 10, 160);
  }

  // ------------------------------------------------------------ RUGIDO / UIVO
  roar(x: number, y: number, r: number, color: number, allies: { x: number; y: number }[]) {
    const s = this.scene;
    s.cameras.main.shake(280, 0.0025);
    const hy = y - 16;
    this.flash(x, hy, color, 70, 420, 0.8);
    for (let k = 0; k < 3; k++) this.sonic(x, hy, r * (0.8 + k * 0.28), shade(color, k * 0.2), 460, k * 120);
    this.wave(x, y, r * 0.9, shade(color, -0.2), 420, 40, false, 0.6);
    this.dustRing(x, y, r * 0.6, 10, 0xcdb894);
    // riscos de som saindo em volta
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + Math.random() * 0.2;
      const w = this.img(x + Math.cos(a) * 10, hy + Math.sin(a) * 7, 'fx-wind', 0, LIGHT, false).setTint(k % 2 ? 0xffffff : shade(color, 0.4)).setRotation(a + Math.PI / 2).setScale(0.4).setAlpha(0.95);
      s.tweens.add({ targets: w, x: x + Math.cos(a) * r * 1.05, y: hy + Math.sin(a) * r * 0.72, scale: 0.95, alpha: 0, delay: (k % 3) * 45, duration: 460, ease: 'Quad.easeOut', onComplete: () => w.destroy() });
    }
    // ânimo no exército perto: seta dourada e faíscas subindo
    for (const a of allies.slice(0, 24)) {
      const i = this.img(a.x, a.y - 22, 'fx-icons', 0, LIGHT + 1, false).setTint(0xffd34a).setAlpha(0);
      s.tweens.add({ targets: i, y: a.y - 36, alpha: { from: 1, to: 0 }, delay: 120 + Math.random() * 200, duration: 700, ease: 'Quad.easeOut', onComplete: () => i.destroy() });
      this.rise(a.x, a.y, color, 3);
    }
    this.rise(x, y, color, 10);
  }

  /** Brilhos subindo dos pés (ânimo, cura). */
  private rise(x: number, y: number, color: number, n: number, w = 10) {
    const e = this.motes;
    op(e, 'tint', [color, shade(color, 0.5), 0xffffff]);
    vel(e, { min: -8, max: 8 }, { min: -55, max: -20 });
    for (let i = 0; i < n; i++) e.emitParticleAt(x + (Math.random() - 0.5) * w * 2, y - Math.random() * 6, 1);
  }

  // ------------------------------------------------------------ BÊNÇÃO / LUZ CURATIVA
  heal(x: number, y: number, color: number, targets: { x: number; y: number }[]) {
    const s = this.scene;
    const light = shade(color, 0.45);
    // círculo mágico no chão, girando, e outro menor ao contrário
    // o giro vem dos quadros (girar a imagem achatada entortaria a perspectiva)
    const circle = (scale: number, spin: number, alpha: number, delay: number) => {
      const c = this.img(x, y, 'fx-rune', 0, GROUND + 1).setTint(color).setAlpha(0);
      const st = { k: 0, a: 0, f: 0 };
      const set = () => c.setScale(scale * st.k, scale * st.k * FLAT).setAlpha(alpha * st.a).setFrame(((Math.floor(st.f) % 6) + 6) % 6);
      s.tweens.add({ targets: st, k: 1, a: 1, delay, duration: 260, ease: 'Back.easeOut', onUpdate: set });
      s.tweens.add({ targets: st, f: spin, delay, duration: 1500, onUpdate: set });
      s.tweens.add({ targets: st, a: 0, delay: delay + 1100, duration: 400, onUpdate: set, onComplete: () => c.destroy() });
    };
    circle(1.25, 14, 1, 0);
    circle(0.7, -18, 0.75, 80);
    // coluna de luz do céu
    this.beam(x, y, light, 1.3, 120);
    this.flash(x, y - 10, light, 90, 500, 0.7);
    this.wave(x, y, 46, light, 520, 150, false, 0.8);
    // luzinhas subindo e caindo do alto
    this.rise(x, y, color, 22, 20);
    const sp = this.sparks;
    op(sp, 'tint', [0xffffff, light]);
    rad(sp, { min: 80, max: 100 }, { min: 20, max: 45 });
    for (let i = 0; i < 10; i++) sp.emitParticleAt(x + (Math.random() - 0.5) * 50, y - 50 - Math.random() * 20, 1);
    // cada um curado: luz menor e cruz verde subindo
    for (const t of targets.slice(0, 24)) {
      s.time.delayedCall(200 + Math.random() * 250, () => {
        this.beam(t.x, t.y, light, 0.5, 0);
        const c = this.img(t.x, t.y - 20, 'fx-icons', 1, LIGHT + 1, false).setTint(0x8aff9a);
        s.tweens.add({ targets: c, y: t.y - 34, alpha: 0, duration: 750, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
        this.rise(t.x, t.y, color, 4);
      });
    }
  }

  private beam(x: number, y: number, color: number, k: number, delay: number) {
    for (const [tint, w, a] of [
      [color, 1.25, 1],
      [color, 0.8, 1],
      [0xffffff, 0.4, 1],
    ] as [number, number, number][]) {
      const b = this.img(x, y + 3, 'fx-beam').setOrigin(0.5, 1).setTint(tint).setAlpha(0).setScale(0.15 * k * w, 1.3 * k);
      this.scene.tweens.add({ targets: b, scaleX: w * k, alpha: a, delay, duration: 170, ease: 'Quad.easeOut' });
      this.scene.tweens.add({ targets: b, scaleX: 0.04, alpha: 0, delay: delay + 560, duration: 380, ease: 'Quad.easeIn', onComplete: () => b.destroy() });
    }
  }

  // ------------------------------------------------------------ SOPRO / CHAMAS / LAVA
  private fireFor(color: number): Emitter {
    let e = this.fires.get(color);
    if (!e) {
      e = this.scene.add
        .particles(0, 0, 'fx-flame', {
          emitting: false,
          frame: [0, 1, 2],
          lifespan: { min: 300, max: 460 },
          scale: { start: 0.55, end: 1.35 },
          alpha: { start: 1, end: 0, ease: 'Sine.easeIn' },
          // o calor sobe
          accelerationY: -70,
          // cores sólidas (no gramado a soma de luz desbotava o fogo); o brilho vem das luzes por baixo
          color: firePalette(color),
          colorEase: 'quad.out',
          rotate: { min: 0, max: 360 },
          maxAliveParticles: 320,
        })
        .setDepth(LIGHT);
      this.fires.set(color, e);
    }
    return e;
  }

  /**
   * Cone de fogo saindo da boca da montaria por `ms`; `mouth` dá a posição a
   * cada instante (ela anda) e `onTick` (a cada 100 ms) aplica o dano.
   */
  breath(mouth: () => { x: number; y: number }, aim: Phaser.Math.Vector2, color: number, ms: number, range: number, onTick: (x: number, y: number, ang: number) => void) {
    const s = this.scene;
    const fire = this.fireFor(color);
    const ang = Math.atan2(aim.y, aim.x);
    const deg = Phaser.Math.RadToDeg(ang);
    const speed = range / 0.42;
    rad(fire, { min: deg - 22, max: deg + 22 }, { min: speed * 0.5, max: speed });
    const core = this.fireCore;
    op(core, 'tint', [0xffffff, 0xfff2b0, shade(color, 0.6)]);
    rad(core, { min: deg - 8, max: deg + 8 }, { min: speed * 0.3, max: speed * 0.5 });
    const glow = this.img(0, 0, 'glow').setTint(shade(color, 0.3)).setAlpha(0.9).setScale(0.5);
    const ground = this.img(0, 0, 'glow', 0, GROUND + 1).setTint(color).setAlpha(0).setScale(1.6, 0.8);
    let lastTick = -1e9;
    let lastK = 0;
    let done = false;
    // o relógio é uma contagem (segue a velocidade do jogo e não perde quadros)
    s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      onUpdate: (tw) => {
        if (done) return;
        const k = tw.getValue() ?? 0;
        const elapsed = k * ms;
        const step = Math.min(8, ((k - lastK) * ms) / 30);
        lastK = k;
        const m = mouth();
        // começa e termina mais fraco
        const amt = Math.sin(Math.min(1, k * 1.15) * Math.PI);
        const n = Math.round((14 * amt + 1) * step + Math.random() * 0.5);
        // saem um pouco à frente da boca, espalhadas, para o cone ficar cheio desde o começo
        for (let i = 0; i < n; i++) {
          const f = Math.random() * 12;
          fire.emitParticleAt(m.x + aim.x * f + (Math.random() - 0.5) * 3, m.y + aim.y * f + (Math.random() - 0.5) * 3, 1);
        }
        for (let i = 0; i < Math.round(3 * amt * step + 0.4); i++) core.emitParticleAt(m.x + aim.x * 3, m.y + aim.y * 2, 1);
        if (Math.random() < 0.45 * step) {
          rad(this.smoke, { min: deg - 20, max: deg + 20 }, { min: speed * 0.35, max: speed * 0.55 });
          this.smoke.explode(1, m.x + aim.x * range * 0.4, m.y + aim.y * range * 0.3);
        }
        if (Math.random() < 0.6 * step) this.sparkBurst(m.x + aim.x * 10, m.y, 0xffc860, 1, speed * 0.9, { min: deg - 25, max: deg + 25 });
        glow.setPosition(m.x + aim.x * 6, m.y).setScale(0.5 + Math.random() * 0.25);
        ground.setPosition(m.x + aim.x * range * 0.5, m.y + 10 + aim.y * range * 0.4).setAlpha(0.4 * amt);
        if (elapsed - lastTick >= 100) {
          lastTick = elapsed;
          onTick(m.x, m.y, ang);
        }
      },
      onComplete: () => {
        done = true;
        const m = mouth();
        s.tweens.add({ targets: [glow, ground], alpha: 0, duration: 200, onComplete: () => (glow.destroy(), ground.destroy()) });
        // chão queimado ao longo do cone
        for (let i = 1; i <= 3; i++) this.decal(m.x + aim.x * range * i * 0.28, m.y + 10 + aim.y * range * i * 0.25, 'fx-scorch', 0.7 + i * 0.25, 1600, 0.85, deg * 0.15);
      },
    });
  }

  // ------------------------------------------------------------ GELO
  frost(x: number, y: number, r: number, color: number) {
    const s = this.scene;
    const pale = shade(color, 0.55);
    s.cameras.main.shake(160, 0.002);
    this.flash(x, y - 8, pale, r * 1.6, 260, 0.85);
    this.wave(x, y, r * 1.05, pale, 300);
    this.wave(x, y, r * 0.7, 0xffffff, 360, 60, false, 0.7);
    // névoa gelada
    this.dustRing(x, y, r * 0.8, 12, 0xd8f0ff);
    // cristais brotando do chão em duas voltas (de dentro para fora)
    const rings: [number, number][] = [
      [r * 0.4, 8],
      [r * 0.82, 15],
    ];
    rings.forEach(([rr, n], ri) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ri * 0.3 + (Math.random() - 0.5) * 0.25;
        const sx = x + Math.cos(a) * rr;
        const sy = y + Math.sin(a) * rr * FLAT;
        this.shard(sx, sy, Math.cos(a), ri ? 0.5 + Math.random() * 0.25 : 0.38 + Math.random() * 0.14, 40 + ri * 90 + Math.random() * 30, 650 + Math.random() * 250);
      }
    });
    // flocos girando
    const e = this.snow;
    op(e, 'tint', [0xffffff, pale]);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      vel(e, Math.cos(a + Math.PI / 2) * 40 + Math.cos(a) * 20, Math.sin(a + Math.PI / 2) * 22 - 18);
      e.emitParticleAt(x + Math.cos(a) * r * 0.6, y - 6 + Math.sin(a) * r * 0.4, 1);
    }
  }

  /** Um cristal de gelo que brota, fica e se parte. */
  shard(x: number, y: number, lean: number, k: number, delay: number, hold: number) {
    const s = this.scene;
    const c = this.img(x, y + 1, 'fx-shard', Math.floor(Math.random() * 3), DEPTH.entities + y, false)
      .setOrigin(0.5, 1)
      .setScale(k * (0.85 + Math.random() * 0.3), 0)
      .setFlipX(Math.random() < 0.5)
      .setAngle(lean * 14);
    const sy = k;
    s.tweens.add({
      targets: c,
      scaleY: sy,
      delay,
      duration: 130,
      ease: 'Back.easeOut',
      onStart: () => this.sparkBurst(x, y - 2, 0xd8f4ff, 2, 70, { min: 200, max: 340 }),
    });
    s.tweens.add({
      targets: c,
      alpha: 0,
      scaleY: sy * 0.55,
      delay: delay + hold,
      duration: 180,
      onStart: () => {
        const rk = this.sparks;
        op(rk, 'tint', [0xffffff, 0xbfe6ff]);
        rad(rk, { min: 200, max: 340 }, { min: 30, max: 80 });
        rk.explode(4, x, y - 10 * k);
      },
      onComplete: () => c.destroy(),
    });
  }

  /** Inimigo congelado: tom azul e crosta de gelo nos pés pelo tempo do atordoamento. */
  freeze(t: { fx: number; fy: number }, ms: number) {
    const s = this.scene;
    const spr = t as unknown as { setTint?: (c: number) => void; clearTint?: () => void; active?: boolean };
    if (spr.setTint && spr.clearTint) {
      spr.setTint(0x9ad8ff);
      s.time.delayedCall(ms, () => spr.active !== false && spr.clearTint!());
    }
    for (let i = 0; i < 3; i++) this.shard(t.fx + (i - 1) * 4, t.fy + 1, (i - 1) * 0.8, 0.28 + (i === 1 ? 0.08 : 0), 30 * i, Math.max(200, ms - 200));
  }

  // ------------------------------------------------------------ BOTE / ESTOURO / DISPARADA
  chargeStart(x: number, y: number, dir: Phaser.Math.Vector2, color: number) {
    this.wave(x, y, 22, color, 260);
    const e = this.dust;
    op(e, 'tint', 0xcdb894);
    for (let i = 0; i < 8; i++) {
      const a = Math.atan2(-dir.y, -dir.x) + (Math.random() - 0.5) * 1.4;
      vel(e, Math.cos(a) * (60 + Math.random() * 60), Math.sin(a) * 40 - 10);
      e.emitParticleAt(x, y, 1);
    }
  }

  /** Riscos de velocidade atrás de quem corre. */
  chargeTrail(x: number, y: number, dir: Phaser.Math.Vector2, color: number) {
    const s = this.scene;
    const a = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < 2; i++) {
      const off = (Math.random() - 0.5) * 18;
      const px = x - dir.x * 8 - dir.y * off;
      const py = y - 10 - dir.y * 6 + dir.x * off * 0.6;
      const w = this.img(px, py, 'fx-wind', 0, LIGHT, false).setTint(color).setRotation(a + Math.PI / 2).setScale(0.3, 0.5).setAlpha(0.75);
      s.tweens.add({ targets: w, x: px - dir.x * 26, y: py - dir.y * 18, alpha: 0, duration: 200, onComplete: () => w.destroy() });
    }
    if (Math.random() < 0.5) {
      op(this.dust, 'tint', 0xcdb894);
      vel(this.dust, -dir.x * 40, -dir.y * 25 - 6);
      this.dust.emitParticleAt(x, y, 1);
    }
  }

  /** Quem foi atropelado: garras (felinos, lobos, raptor) ou impacto pesado. */
  chargeHit(x: number, y: number, dir: Phaser.Math.Vector2, color: number, claws: boolean) {
    const s = this.scene;
    if (claws) {
      for (const [k, tint, d] of [
        [1, shade(color, 0.2), 0],
        [0.8, 0xffffff, 40],
      ] as [number, number, number][]) {
        const c = this.img(x, y - 10, 'fx-claw', 0, LIGHT + 1, false)
          .setTint(tint)
          .setAngle((dir.x >= 0 ? 0 : 90) + (Math.random() - 0.5) * 30)
          .setScale(0.5 * k)
          .setAlpha(0);
        s.tweens.add({ targets: c, scale: 1.1 * k, alpha: { from: 1, to: 0 }, delay: d, duration: 300, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
      }
      this.sparkBurst(x, y - 10, shade(color, 0.4), 6, 120);
    } else {
      this.flash(x, y - 8, 0xfff0d0, 46, 160);
      this.wave(x, y, 18, color, 240);
      const rk = this.rocks;
      vel(rk, { min: -70, max: 70 }, { min: -150, max: -70 });
      op(rk, 'scaleX', { min: 0.6, max: 1 });
      rk.explode(4, x, y - 2);
      this.sparkBurst(x, y - 8, 0xffe0a0, 6, 140);
    }
  }

  // ------------------------------------------------------------ RAJADA
  gust(x: number, y: number, dir: Phaser.Math.Vector2, r: number, color: number) {
    const s = this.scene;
    const a0 = Math.atan2(dir.y, dir.x);
    const cy = y - 12;
    this.flash(x + dir.x * 12, cy, 0xffffff, 60, 200, 0.6);
    // pulsos de vento: três meias-luas em fila na direção da rajada e duas menores nos lados
    const pulses: [number, number, number, number][] = [
      [0, 0, 1.25, 0xffffff],
      [0, 95, 1.1, shade(color, 0.35)],
      [0, 190, 0.95, 0xffffff],
      [-0.42, 45, 0.7, shade(color, 0.35)],
      [0.42, 45, 0.7, shade(color, 0.35)],
    ];
    for (const [da, delay, k, tint] of pulses) {
      const a = a0 + da;
      const d = r * (da ? 1.2 : 1.8);
      const w = this.img(x + Math.cos(a) * 12, cy + Math.sin(a) * 8, 'fx-wind', 0, LIGHT, false)
        .setTint(tint)
        .setRotation(a - Math.PI / 2)
        .setScale(0.5 * k, 0.7 * k)
        .setAlpha(0);
      s.tweens.add({ targets: w, x: x + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.75, scaleX: 1.15 * k, scaleY: 1.1 * k, alpha: { from: 1, to: 0 }, delay, duration: 420, ease: 'Quad.easeOut', onComplete: () => w.destroy() });
    }
    // redemoinho na frente
    for (let i = 0; i < 2; i++) {
      const w = this.img(x + dir.x * r * 0.6, cy + dir.y * r * 0.4, 'fx-wind', 0, LIGHT, false).setTint(0xffffff).setScale(0.7).setAlpha(0.85).setAngle(i * 180);
      s.tweens.add({ targets: w, angle: w.angle + 360, scale: 1.1, alpha: 0, duration: 480, ease: 'Quad.easeOut', onComplete: () => w.destroy() });
    }
    // folhas e penas levadas pelo vento
    const b = this.bits;
    b.setEmitterFrame([2, 3, 4]);
    rad(b, { min: Phaser.Math.RadToDeg(a0) - 25, max: Phaser.Math.RadToDeg(a0) + 25 }, { min: r * 2, max: r * 3.2 });
    b.setParticleGravity(0, 0);
    b.explode(10, x + dir.x * 10, cy + 6);
    b.setEmitterFrame([0, 1]);
    rad(b, { min: 0, max: 360 }, { min: 10, max: 40 });
    b.setParticleGravity(0, 40);
    b.setParticleTint(shade(color, 0.2));
    b.explode(6, x, cy - 6);
    b.setParticleTint(0xffffff);
    // poeira rasteira empurrada
    op(this.dust, 'tint', 0xd8ccb0);
    for (let i = 0; i < 8; i++) {
      const a = a0 + (Math.random() - 0.5) * 0.9;
      vel(this.dust, Math.cos(a) * r * 2.4, Math.sin(a) * r * 1.4);
      this.dust.emitParticleAt(x + dir.x * 14, y + dir.y * 8, 1);
    }
  }
}
