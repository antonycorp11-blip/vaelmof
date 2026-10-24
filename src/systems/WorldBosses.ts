import Phaser from 'phaser';
import { TILE } from '../config';
import { BOSS_ART, BOSS_FRAME } from '../data/bossArt';
import { rollGear } from '../data/gear';
import { rollJewel } from '../data/enhancement';
import { MOUNTS } from '../data/mounts';
import { DEPTH } from '../entities/Creature';
import type { Hittable } from '../entities/Hittable';
import type { WorldScene } from '../scenes/WorldScene';

export type GiantId = (typeof BOSS_ART)[number]['id'];

/**
 * Ataques dos gigantes. Todos avisam no chão (marca vermelha que se enche)
 * antes de acertar: dá para esquivar, e o exército também sofre.
 */
type Move = 'slam' | 'rocks' | 'spikes' | 'bite' | 'venom' | 'claw' | 'breath' | 'meteors' | 'pincer' | 'sting' | 'sandburst' | 'stomp' | 'frostroar' | 'icefall';

interface GiantDef {
  name: string;
  title: string;
  /** Biomas onde desperta (0 vale, 1 green, 2 snow, 3 block, 4 black, 5 dust). */
  biomes: number[];
  /** Vida relativa. */
  hpK: number;
  speed: number;
  /** Raio do corpo (px do mundo). */
  size: number;
  color: number;
  /** Boca/mãos (px do mundo, virado para a direita) para sopros e cuspes. */
  mouth: [number, number];
  atk: Move;
  cast: Move;
  /** Especial que aparece na segunda fase. */
  cast2: Move;
  /** Ovos que pode deixar cair (montarias). */
  eggs: string[];
}

export const GIANTS: Record<GiantId, GiantDef> = {
  colossus: { name: 'Ormund', title: 'o Colosso de Pedra', biomes: [3, 0], hpK: 1.15, speed: 26, size: 34, color: 0x7af4ff, mouth: [56, -96], atk: 'slam', cast: 'rocks', cast2: 'spikes', eggs: ['rhino', 'boar', 'griffin'] },
  hydra: { name: 'Thalassa', title: 'a Hidra das Marés', biomes: [1, 0], hpK: 1, speed: 30, size: 44, color: 0x9aff4a, mouth: [70, -62], atk: 'bite', cast: 'venom', cast2: 'venom', eggs: ['salamander', 'emerald', 'raptor'] },
  dragon: { name: 'Vermithrax', title: 'o Dragão Ancestral', biomes: [4], hpK: 1.3, speed: 34, size: 46, color: 0xff8a2a, mouth: [72, -58], atk: 'claw', cast: 'breath', cast2: 'meteors', eggs: ['ruby', 'nightmare', 'salamander'] },
  scorpion: { name: 'Sarkath', title: 'o Escorpião-Rei', biomes: [5], hpK: 1.05, speed: 40, size: 46, color: 0xd070ff, mouth: [60, -40], atk: 'pincer', cast: 'sting', cast2: 'sandburst', eggs: ['sabre', 'panther', 'raptor'] },
  mammoth: { name: 'Yrrsa', title: 'a Mãe do Gelo', biomes: [2], hpK: 1.2, speed: 28, size: 48, color: 0x9ad8ff, mouth: [66, -40], atk: 'stomp', cast: 'frostroar', cast2: 'icefall', eggs: ['polar', 'frostwolf', 'bear'] },
};

const ANIM = { walk: [0, 6], atk: [6, 6], cast: [12, 4] } as const;
/** Achatamento das áreas no chão (perspectiva). */
const FLAT = 0.62;
const RED = 0xff3a2a;

interface Tele {
  g: Phaser.GameObjects.Graphics;
  at: number;
  ms: number;
  draw: (g: Phaser.GameObjects.Graphics, k: number) => void;
  hit: () => void;
}

/** O gigante no mundo: sprite enorme, alvo do herói e do exército. */
export class Giant implements Hittable {
  readonly def: GiantDef;
  readonly spr: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  hp: number;
  maxHp: number;
  dead = false;
  x: number;
  y: number;
  face = 1;
  phase = 1;
  /** Última vez que alguém o acertou (some sem luta, cura devagar). */
  hitAt = -1e9;
  private flashAt = 0;
  private mode: 'walk' | 'idle' | 'atk' | 'cast' = 'idle';
  private modeAt = 0;
  private nextAct = 0;
  private castN = 0;
  private struck = false;
  private slowUntil = 0;
  private teles: Tele[] = [];
  private wander = { x: 0, y: 0, until: 0 };

  constructor(
    private sys: WorldBosses,
    readonly id: GiantId,
    x: number,
    y: number,
    hp: number,
    maxHp: number,
  ) {
    const s = sys.scene;
    this.def = GIANTS[id];
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.maxHp = maxHp;
    this.shadow = s.add.ellipse(x, y, this.def.size * 2.6, this.def.size * 0.8, 0x000000, 0.28).setDepth(DEPTH.decor + 1);
    this.spr = s.add
      .sprite(x, y, `boss-${id}`, 0)
      .setOrigin(0.5, BOSS_FRAME.ground / BOSS_FRAME.h)
      .setScale(BOSS_FRAME.scale);
    this.phase = hp / maxHp <= 0.33 ? 3 : hp / maxHp <= 0.66 ? 2 : 1;
    this.nextAct = s.time.now + 2500;
  }

  get fx() {
    return this.x;
  }
  get fy() {
    return this.y;
  }
  get size() {
    return this.def.size;
  }
  get targetable() {
    return !this.dead;
  }

  takeDamage(amount: number) {
    if (this.dead) return;
    const s = this.sys.scene;
    this.hp -= amount;
    this.hitAt = s.time.now;
    s.fx.damageText(this.x + (Math.random() - 0.5) * 40, this.y - 70 - Math.random() * 30, amount);
    // pisca de leve, no máximo a cada 350 ms (com um exército batendo, ficaria sempre branco)
    if (s.time.now - this.flashAt > 350) {
      this.flashAt = s.time.now;
      this.spr.setTint(0xffe8e0);
      s.time.delayedCall(50, () => this.spr.active && this.restoreTint());
    }
    const k = this.hp / this.maxHp;
    const ph = k <= 0.33 ? 3 : k <= 0.66 ? 2 : 1;
    if (ph > this.phase) {
      this.phase = ph;
      this.sys.phaseUp(this);
    }
    if (this.hp <= 0) this.die();
  }

  /** Gigantes não ficam atordoados; no máximo perdem o compasso. */
  stun(ms: number) {
    this.nextAct = Math.max(this.nextAct, this.sys.scene.time.now + Math.min(400, ms * 0.2));
  }

  slow(ms: number) {
    this.slowUntil = this.sys.scene.time.now + Math.min(ms, 2000);
    this.spr.setTint(0x9fe8ff);
  }

  private restoreTint() {
    if (this.phase >= 3) this.spr.setTint(0xffb0a0);
    else if (this.sys.scene.time.now < this.slowUntil) this.spr.setTint(0x9fe8ff);
    else this.spr.clearTint();
  }

  private die() {
    this.dead = true;
    const s = this.sys.scene;
    for (const t of this.teles) t.g.destroy();
    this.teles = [];
    this.spr.setFrame(ANIM.cast[0]);
    s.shake(900, 0.008);
    for (let i = 0; i < 6; i++)
      s.time.delayedCall(i * 160, () => {
        s.mountFx.stomp(this.x + (Math.random() - 0.5) * 90, this.y + (Math.random() - 0.5) * 20, 40, this.def.color, 2);
      });
    s.tweens.add({
      targets: this.spr,
      angle: this.face * -12,
      y: this.y + 10,
      alpha: 0,
      duration: 1600,
      ease: 'Quad.easeIn',
      onComplete: () => this.destroy(),
    });
    s.tweens.add({ targets: this.shadow, alpha: 0, duration: 1600 });
    this.sys.killed(this);
  }

  destroy() {
    for (const t of this.teles) t.g.destroy();
    this.teles = [];
    this.spr.destroy();
    this.shadow.destroy();
  }

  // ------------------------------------------------------------ alvos
  /** Herói e soldados aliados vivos (quem o gigante caça). */
  private foes(): { x: number; y: number; hero: boolean }[] {
    const s = this.sys.scene;
    const out: { x: number; y: number; hero: boolean }[] = [];
    if (!s.player.dead) out.push({ x: s.player.fx, y: s.player.fy, hero: true });
    for (const a of s.army.allies) if (!a.dead) out.push({ x: a.x, y: a.y, hero: false });
    return out;
  }

  private nearestFoe(r: number) {
    let best: { x: number; y: number; hero: boolean } | null = null;
    let bd = r;
    for (const f of this.foes()) {
      const d = Math.hypot(f.x - this.x, (f.y - this.y) * 1.3);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ tempo
  update(time: number, dt: number) {
    if (this.dead) return;
    const s = this.sys.scene;
    if (this.slowUntil && time > this.slowUntil) {
      this.slowUntil = 0;
      this.restoreTint();
    }
    const fast = this.phase >= 3 ? 1.35 : 1;
    // marcas de aviso
    for (const t of [...this.teles]) {
      const k = (time - t.at) / t.ms;
      if (k >= 1) {
        t.g.destroy();
        this.teles.splice(this.teles.indexOf(t), 1);
        t.hit();
        continue;
      }
      t.g.clear();
      t.draw(t.g, Math.max(0, k));
    }
    const foe = this.nearestFoe(300);
    if (this.mode === 'atk' || this.mode === 'cast') {
      const [f0, n] = ANIM[this.mode];
      const el = (time - this.modeAt) * fast;
      // preparo lento (o aviso no chão corre junto), golpe rápido
      const hold = this.mode === 'atk' ? 900 : 1000;
      const per = 110;
      const strike = this.mode === 'atk' ? 4 : 2;
      let fi: number;
      if (el < hold) fi = Math.min(strike - 1, Math.floor((el / hold) * strike));
      else fi = Math.min(n - 1, strike + Math.floor((el - hold) / per));
      this.spr.setFrame(f0 + fi);
      if (!this.struck && el >= hold) {
        this.struck = true;
        if (this.mode === 'cast') this.castFx();
      }
      if (el >= hold + per * (n - strike)) {
        this.mode = 'idle';
        this.nextAct = time + (this.phase >= 2 ? 900 : 1400) / fast;
      }
    } else {
      // anda até o alvo; perto, ataca; com o alvo longe, um especial
      let tx = this.wander.x;
      let ty = this.wander.y;
      if (foe) {
        tx = foe.x;
        ty = foe.y;
      } else if (time > this.wander.until) {
        const h = this.sys.home;
        const a = Math.random() * Math.PI * 2;
        this.wander = { x: h.x + Math.cos(a) * 120, y: h.y + Math.sin(a) * 80, until: time + 6000 };
      }
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 8) this.face = dx > 0 ? 1 : -1;
      this.spr.setFlipX(this.face < 0);
      const reach = this.def.size + 40;
      if (foe && time > this.nextAct) {
        if (d < reach + 30) return this.begin('atk', foe);
        // um especial a cada tanto (ou já, se o alvo foge para longe)
        if (d > 140 || Math.random() < 0.012 * dt) return this.begin('cast', foe);
      }
      if (d > (foe ? reach * 0.75 : 6)) {
        const sp = (this.def.speed * fast * (this.slowUntil ? 0.5 : 1) * dt) / 1000;
        this.x += (dx / d) * sp;
        this.y += (dy / d) * sp * 0.8;
        this.mode = 'walk';
        const [f0] = ANIM.walk;
        this.spr.setFrame(f0 + (Math.floor(time / (170 / fast)) % 6));
        // passos pesados
        if (Math.floor(time / (170 / fast)) % 3 === 0 && Math.random() < 0.06) s.mountFx.stomp(this.x - this.face * 10, this.y, 18, 0xcdb894, 0);
      } else {
        this.mode = 'idle';
        this.spr.setFrame(ANIM.walk[0]);
      }
    }
    this.spr.setPosition(this.x, this.y).setDepth(DEPTH.entities + this.y);
    this.shadow.setPosition(this.x, this.y + 2);
  }

  private begin(mode: 'atk' | 'cast', foe: { x: number; y: number }) {
    const time = this.sys.scene.time.now;
    this.mode = mode;
    this.modeAt = time;
    this.struck = false;
    this.face = foe.x >= this.x ? 1 : -1;
    this.spr.setFlipX(this.face < 0);
    const fast = this.phase >= 3 ? 1.35 : 1;
    const ms = (mode === 'atk' ? 900 : 1000) / fast;
    let move = mode === 'atk' ? this.def.atk : this.def.cast;
    if (mode === 'cast' && this.phase >= 2 && this.castN++ % 2 === 1) move = this.def.cast2;
    this.plan(move, foe, ms);
  }

  // ------------------------------------------------------------ ataques
  /** Dano de um acerto: proporcional à vida do herói (vale para qualquer nível). */
  private get heroDmg() {
    const s = this.sys.scene;
    return Math.max(3, Math.round(s.player.maxHp * (0.22 + 0.05 * this.phase)));
  }
  private get soldierDmg() {
    return 3 + this.sys.scene.progress.rankIdx * 0.5 + this.phase * 1.5;
  }

  /** Acerta quem estiver dentro de `inside` (herói e aliados). */
  private hitArea(inside: (x: number, y: number) => boolean, k = 1, onHit?: (x: number, y: number) => void) {
    const s = this.sys.scene;
    const p = s.player;
    if (!p.dead && inside(p.fx, p.fy)) {
      p.hurt(this.heroDmg * k, this.x, this.y);
      onHit?.(p.fx, p.fy);
    }
    for (const a of s.army.allies)
      if (!a.dead && inside(a.x, a.y)) {
        a.takeDamage(this.soldierDmg * k, this.x, this.y, 200);
        onHit?.(a.x, a.y);
      }
  }

  private tele(ms: number, draw: Tele['draw'], hit: () => void) {
    const g = this.sys.scene.add.graphics().setDepth(DEPTH.decor + 2);
    this.teles.push({ g, at: this.sys.scene.time.now, ms, draw, hit });
  }

  /** Círculo no chão que se enche até explodir. */
  private circle(x: number, y: number, r: number, ms: number, hit: () => void) {
    this.tele(
      ms,
      (g, k) => {
        g.fillStyle(RED, 0.12 + 0.1 * k).fillEllipse(x, y, r * 2, r * 2 * FLAT);
        g.fillStyle(RED, 0.3).fillEllipse(x, y, r * 2 * k, r * 2 * FLAT * k);
        g.lineStyle(2, RED, 0.85).strokeEllipse(x, y, r * 2, r * 2 * FLAT);
      },
      hit,
    );
  }
  private inCircle(x: number, y: number, r: number) {
    return (px: number, py: number) => ((px - x) / r) ** 2 + ((py - y) / (r * FLAT)) ** 2 <= 1;
  }

  /** Leque no chão a partir de (x, y). */
  private cone(x: number, y: number, ang: number, range: number, half: number, ms: number, hit: () => void) {
    const pts = (rr: number) => {
      const out = [{ x, y }];
      for (let i = 0; i <= 12; i++) {
        const a = ang - half + (i / 12) * half * 2;
        out.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * FLAT });
      }
      return out;
    };
    this.tele(
      ms,
      (g, k) => {
        g.fillStyle(RED, 0.14 + 0.1 * k).fillPoints(pts(range), true);
        g.fillStyle(RED, 0.3).fillPoints(pts(range * k), true);
        g.lineStyle(2, RED, 0.85).strokePoints(pts(range), true);
      },
      hit,
    );
  }
  private inCone(x: number, y: number, ang: number, range: number, half: number) {
    return (px: number, py: number) => {
      const dx = px - x;
      const dy = (py - y) / FLAT;
      return Math.hypot(dx, dy) <= range && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - ang)) <= half;
    };
  }

  /** Faixa reta no chão. */
  private lane(x0: number, y0: number, x1: number, y1: number, w: number, ms: number, hit: () => void) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    const nx = -Math.sin(a) * w * 0.5;
    const ny = Math.cos(a) * w * 0.5;
    const quad = (k: number) => {
      const ex = x0 + (x1 - x0) * k;
      const ey = y0 + (y1 - y0) * k;
      return [
        { x: x0 + nx, y: y0 + ny },
        { x: ex + nx, y: ey + ny },
        { x: ex - nx, y: ey - ny },
        { x: x0 - nx, y: y0 - ny },
      ];
    };
    this.tele(
      ms,
      (g, k) => {
        g.fillStyle(RED, 0.14 + 0.1 * k).fillPoints(quad(1), true);
        g.fillStyle(RED, 0.3).fillPoints(quad(k), true);
        g.lineStyle(2, RED, 0.85).strokePoints(quad(1), true);
      },
      hit,
    );
  }
  private inLane(x0: number, y0: number, x1: number, y1: number, w: number) {
    return (px: number, py: number) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const L = dx * dx + dy * dy || 1;
      const t = Phaser.Math.Clamp(((px - x0) * dx + (py - y0) * dy) / L, 0, 1);
      return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t)) <= w * 0.5;
    };
  }

  /** Pontos de alvo do especial: o herói e alguns soldados (mais na fase 2). */
  private targets(n: number, foe: { x: number; y: number }) {
    const pts = [{ x: foe.x, y: foe.y }];
    const others = this.foes().filter((f) => Math.hypot(f.x - foe.x, f.y - foe.y) > 30);
    Phaser.Utils.Array.Shuffle(others);
    for (const o of others.slice(0, n - 1)) pts.push({ x: o.x, y: o.y });
    while (pts.length < n) pts.push({ x: foe.x + (Math.random() - 0.5) * 140, y: foe.y + (Math.random() - 0.5) * 90 });
    return pts;
  }

  private mouthAt() {
    const [mx, my] = this.def.mouth;
    return { x: this.x + mx * this.face, y: this.y + my };
  }

  private pendingCast: (() => void) | null = null;

  private plan(move: Move, foe: { x: number; y: number }, ms: number) {
    const s = this.sys.scene;
    const F = s.mountFx;
    const c = this.def.color;
    const ang = Math.atan2((foe.y - this.y) / FLAT, foe.x - this.x);
    const fwd = (k: number) => ({ x: this.x + this.face * k, y: this.y });
    const many = this.phase >= 2 ? 5 : 3;
    this.pendingCast = null;
    switch (move) {
      case 'slam':
      case 'stomp': {
        const r = move === 'slam' ? 66 : 84;
        const at = fwd(move === 'slam' ? this.def.size + 30 : this.def.size + 20);
        this.circle(at.x, at.y, r, ms, () => {
          F.stomp(at.x, at.y, r * 0.8, move === 'slam' ? 0xcdb894 : 0xd8f0ff, 3);
          if (move === 'stomp') F.frost(at.x, at.y, r * 0.7, 0x9ad8ff);
          s.shake(320, 0.009);
          this.hitArea(this.inCircle(at.x, at.y, r), 1.2);
        });
        break;
      }
      case 'bite':
      case 'claw':
      case 'pincer': {
        const range = move === 'bite' ? 130 : move === 'claw' ? 110 : 115;
        const half = move === 'claw' ? 0.85 : move === 'bite' ? 0.6 : 0.45;
        const o = fwd(this.def.size * 0.3);
        const a = this.face > 0 ? Phaser.Math.Clamp(ang, -0.7, 0.7) : Phaser.Math.Angle.Wrap(Math.PI + Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(ang - Math.PI), -0.7, 0.7));
        this.cone(o.x, o.y, a, range, half, ms, () => {
          const tip = { x: o.x + Math.cos(a) * range * 0.7, y: o.y + Math.sin(a) * range * 0.7 * FLAT };
          F.chargeHit(tip.x, tip.y, new Phaser.Math.Vector2(Math.cos(a), Math.sin(a)), c, move !== 'bite');
          s.shake(200, 0.006);
          this.hitArea(this.inCone(o.x, o.y, a, range, half), move === 'pincer' ? 1.1 : 1);
        });
        break;
      }
      case 'rocks':
      case 'meteors':
      case 'icefall':
      case 'sandburst':
      case 'venom': {
        const pts = this.targets(move === 'meteors' || move === 'icefall' ? many + 2 : many, foe);
        const r = move === 'venom' ? 32 : move === 'sandburst' ? 36 : 34;
        const lag = ms + 450;
        pts.forEach((p, i) => {
          const dl = lag + i * 120;
          // o projétil sai da boca/mão na hora do golpe
          this.circle(p.x, p.y, r, dl, () => this.land(move, p.x, p.y, r));
        });
        this.pendingCast = () => {
          const m = this.mouthAt();
          for (const p of pts) this.missile(move, m.x, m.y, p.x, p.y, 450);
        };
        break;
      }
      case 'spikes': {
        // fileiras de cristais que brotam do chão em estrela
        const n = this.phase >= 3 ? 8 : 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
          const x1 = this.x + Math.cos(a) * 190;
          const y1 = this.y + Math.sin(a) * 190 * FLAT;
          this.lane(this.x, this.y, x1, y1, 26, ms + 250, () => {
            for (let k = 1; k <= 7; k++) F.shard(lerp(this.x, x1, k / 7), lerp(this.y, y1, k / 7), Math.cos(a), 0.6 + Math.random() * 0.3, k * 35, 700);
            this.hitArea(this.inLane(this.x, this.y, x1, y1, 26), 0.9);
          });
        }
        break;
      }
      case 'sting': {
        const L = 210;
        const x1 = this.x + Math.cos(ang) * L;
        const y1 = this.y + Math.sin(ang) * L * FLAT;
        this.lane(this.x, this.y, x1, y1, 30, ms, () => {
          for (let k = 1; k <= 5; k++) s.time.delayedCall(k * 30, () => F.chargeHit(lerp(this.x, x1, k / 5), lerp(this.y, y1, k / 5), new Phaser.Math.Vector2(Math.cos(ang), Math.sin(ang)), c, false));
          s.shake(220, 0.007);
          this.hitArea(this.inLane(this.x, this.y, x1, y1, 30), 1.3, () => {});
          // veneno: lentidão em quem foi picado
          const p = s.player;
          if (this.inLane(this.x, this.y, x1, y1, 30)(p.fx, p.fy)) p.applySlow(2500);
        });
        break;
      }
      case 'breath': {
        const range = 190;
        const half = 0.42;
        const a = this.face > 0 ? Phaser.Math.Clamp(ang, -0.6, 0.6) : Phaser.Math.Angle.Wrap(Math.PI + Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(ang - Math.PI), -0.6, 0.6));
        const o = this.mouthAt();
        const gy = this.y;
        this.cone(o.x, gy, a, range, half, ms, () => {});
        this.pendingCast = () => {
          const dir = new Phaser.Math.Vector2(Math.cos(a), Math.sin(a) * FLAT).normalize();
          let ticks = 0;
          F.breath(() => this.mouthAt(), dir, c, 1200, range, () => {
            if (ticks++ % 2) return;
            this.hitArea(this.inCone(o.x, gy, a, range, half), 0.35);
          });
          // o fogo dura um pouco mais que o aviso: mantém a área marcada
          this.tele(1200, (g) => g.lineStyle(2, 0xffa040, 0.6).strokePoints(this.conePts(o.x, gy, a, range, half), true), () => {});
        };
        break;
      }
      case 'frostroar': {
        const r = 150;
        this.circle(this.x, this.y, r, ms + 200, () => {
          F.roar(this.x, this.y - 40, r, c, []);
          F.frost(this.x, this.y, r * 0.9, c);
          this.hitArea(this.inCircle(this.x, this.y, r), 0.8, (x, y) => s.mountFx.freeze({ fx: x, fy: y }, 900));
          const p = s.player;
          if (this.inCircle(this.x, this.y, r)(p.fx, p.fy)) p.applySlow(2500);
        });
        break;
      }
    }
  }

  private conePts(x: number, y: number, ang: number, range: number, half: number) {
    const out = [{ x, y }];
    for (let i = 0; i <= 12; i++) {
      const a = ang - half + (i / 12) * half * 2;
      out.push({ x: x + Math.cos(a) * range, y: y + Math.sin(a) * range * FLAT });
    }
    return out;
  }

  /** O especial é solto (quadro do golpe da animação). */
  private castFx() {
    const s = this.sys.scene;
    const m = this.mouthAt();
    s.mountFx.flash(m.x, m.y, this.def.color, 90, 300);
    this.pendingCast?.();
    this.pendingCast = null;
  }

  /** Rocha, bola de fogo, veneno… voando em arco até o alvo. */
  private missile(move: Move, x0: number, y0: number, x1: number, y1: number, ms: number) {
    const s = this.sys.scene;
    const look: Record<string, [string, number, number]> = {
      rocks: ['fx-rock', 0, 0xb0a898],
      meteors: ['fx-blob', 0, 0xff8a2a],
      icefall: ['fx-shard', 0, 0xd8f4ff],
      sandburst: ['fx-puff', 0, 0xe0c080],
      venom: ['fx-blob', 0, 0x9aff4a],
    };
    const [key, frame, tint] = look[move] ?? look.rocks;
    const img = s.add.image(x0, y0, key, frame).setDepth(DEPTH.fx).setTint(tint).setScale(move === 'rocks' ? 2.4 : 1.4);
    if (move === 'meteors' || move === 'venom') img.setBlendMode(Phaser.BlendModes.ADD);
    // meteoros e gelo caem do céu; o resto vem em arco da boca
    const sky = move === 'meteors' || move === 'icefall';
    const sx = sky ? x1 - 60 : x0;
    const sy = sky ? y1 - 260 : y0;
    img.setPosition(sx, sy);
    s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms + (sky ? 200 : 0),
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        const arc = sky ? 0 : Math.sin(k * Math.PI) * 70;
        img.setPosition(lerp(sx, x1, k), lerp(sy, y1, k) - arc).setAngle(k * 540);
        if (Math.random() < 0.5) s.fx.burst(img.x, img.y, tint, 1);
      },
      onComplete: () => img.destroy(),
    });
  }

  /** Impacto de um projétil no chão. */
  private land(move: Move, x: number, y: number, r: number) {
    const s = this.sys.scene;
    const F = s.mountFx;
    switch (move) {
      case 'rocks':
        F.stomp(x, y, r, 0xcdb894, 2);
        this.hitArea(this.inCircle(x, y, r), 0.9);
        break;
      case 'meteors':
        F.stomp(x, y, r, 0xff8a2a, 2);
        F.flash(x, y - 6, 0xffb040, r * 2.4, 260);
        for (let i = 0; i < 6; i++) s.fx.ember(x + (Math.random() - 0.5) * r, y - Math.random() * 10);
        this.hitArea(this.inCircle(x, y, r), 0.9);
        break;
      case 'icefall':
        F.frost(x, y, r, 0x9ad8ff);
        this.hitArea(this.inCircle(x, y, r), 0.8, (hx, hy) => F.freeze({ fx: hx, fy: hy }, 700));
        break;
      case 'sandburst':
        F.stomp(x, y, r, 0xe0c080, 1);
        this.hitArea(this.inCircle(x, y, r), 0.8, () => {});
        break;
      case 'venom':
        this.puddle(x, y, r);
        break;
    }
  }

  /** Poça de veneno: dói enquanto alguém pisa nela (5 s). */
  private puddle(x: number, y: number, r: number) {
    const s = this.sys.scene;
    const g = s.add.graphics().setDepth(DEPTH.decor + 2);
    const born = s.time.now;
    s.mountFx.flash(x, y, 0x9aff4a, r * 2, 300);
    const tick = s.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => {
        const age = s.time.now - born;
        const k = Math.min(1, age / 200) * (age > 4500 ? Math.max(0, 1 - (age - 4500) / 500) : 1);
        g.clear();
        g.fillStyle(0x3a8a1a, 0.55 * k).fillEllipse(x, y, r * 2, r * 2 * FLAT);
        g.fillStyle(0x9aff4a, 0.35 * k).fillEllipse(x - 3, y - 2, r * 1.4, r * 1.4 * FLAT);
        for (let i = 0; i < 2; i++) if (Math.random() < 0.4) s.fx.burst(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r, 0x9aff4a, 1);
        if (age % 600 < 120 && !this.dead) this.hitArea(this.inCircle(x, y, r), 0.18);
        if (age > 5000) {
          tick.remove();
          g.destroy();
        }
      },
    });
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const SAVE_KEY = 'vaelmor.giants.v1';
/** Quanto um gigante fica acordado (relógio dos clãs). */
const AWAKE = 25 * 60000;

interface State {
  id: GiantId;
  x: number;
  y: number;
  /** Vida (fração) e até quando fica acordado. */
  hpK: number;
  until: number;
}

/**
 * Chefes de mundo: de tempos em tempos um gigante desperta em algum lugar do
 * mapa (anúncio, marca no minimapa e no mapa, seta de objetivo). Enormes, com
 * muita vida, três fases e ataques que avisam no chão. Derrotados, deixam
 * ovos de montaria (chocados no estábulo), ouro, uma peça rara e muita Glória.
 */
export class WorldBosses {
  st: State | null = null;
  nextAt = 0;
  giant: Giant | null = null;
  private loading = false;
  private checkAt = 0;
  /** Já foram derrotados (para o primeiro ovo garantido de cada um). */
  slain: string[] = [];

  constructor(readonly scene: WorldScene) {
    this.load();
    // O primeiro aparecia tarde demais e muitos jogadores nunca o viam.
    // Depois do primeiro, volta ao ritmo de evento raro do mundo.
    if (!this.nextAt) this.nextAt = scene.clans.now + (this.slain.length ? 15 : 2) * 60000;
  }

  /** Garante que o primeiro Gigante entre no horizonte da sessão atual. */
  hastenFirstAwakening(withinMs: number) {
    if (this.st || this.slain.length) return;
    const at = this.scene.clans.now + Math.max(15_000, withinMs);
    if (!this.nextAt || this.nextAt > at) this.nextAt = at;
    this.save();
  }

  get home() {
    return this.st ? { x: this.st.x, y: this.st.y } : { x: 0, y: 0 };
  }

  get def(): GiantDef | null {
    return this.st ? GIANTS[this.st.id] : null;
  }

  /** Nome completo do gigante acordado. */
  get label() {
    const d = this.def;
    return d ? `${d.name}, ${d.title}` : '';
  }

  /** Alvos para o exército e o herói. */
  get targets(): Hittable[] {
    return this.giant && !this.giant.dead ? [this.giant] : [];
  }

  maxHpFor(id: GiantId) {
    const r = this.scene.progress.rankIdx;
    return Math.round((7000 + r * 1200) * GIANTS[id].hpK);
  }

  /** Acorda um gigante agora (debug, ou pelo relógio). */
  awaken(id?: GiantId, at?: { x: number; y: number }) {
    const s = this.scene;
    const spot = at ?? this.pickSpot();
    if (!spot) return false;
    const biome = s.biomeAt(spot.x, spot.y);
    const ids = Object.keys(GIANTS) as GiantId[];
    const fit = ids.filter((k) => GIANTS[k].biomes.includes(biome));
    const pick = id ?? (fit.length ? fit[Math.floor(Math.random() * fit.length)] : ids[Math.floor(Math.random() * ids.length)]);
    this.unrealize();
    this.st = { id: pick, x: spot.x, y: spot.y, hpK: 1, until: s.clans.now + AWAKE };
    const d = GIANTS[pick];
    s.events.emit('area', 'UM GIGANTE DESPERTOU!', `${d.name}, ${d.title} · veja no mapa`);
    s.audio.sfx('danger');
    s.clans.log(`A terra treme: ${d.name}, ${d.title}, despertou. Quem o derrubar leva ovos de montaria.`, true);
    s.shake(700, 0.004);
    this.save();
    return true;
  }

  /** Um lugar aberto a 45–110 tiles do herói, fora de cidades, água e montanhas. */
  private pickSpot(): { x: number; y: number } | null {
    const s = this.scene;
    const m = s.map;
    const p = s.player;
    for (let tries = 0; tries < 200; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = (45 + Math.random() * 65) * TILE;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx < 12 || ty < 12 || tx >= m.width - 12 || ty >= m.height - 12) continue;
      if (m.cities.some((c) => tx > c.x0 - 14 && tx < c.x1 + 14 && ty > c.y0 - 14 && ty < c.y1 + 14)) continue;
      if (s.hq.founded && s.hq.inside(x, y, 20)) continue;
      let ok = true;
      for (let yy = ty - 5; yy <= ty + 5 && ok; yy++)
        for (let xx = tx - 7; xx <= tx + 7; xx++) {
          const i = yy * m.width + xx;
          if (m.water[i] >= 0 || m.cliffs[i] >= 0) {
            ok = false;
            break;
          }
        }
      if (ok) return { x, y };
    }
    return null;
  }

  update(time: number, dt: number) {
    const s = this.scene;
    this.giant?.update(time, dt);
    if (time < this.checkAt) return;
    this.checkAt = time + 1000;
    const now = s.clans.now;
    if (!this.st) {
      if (now >= this.nextAt && !s.army.war) {
        if (!this.awaken()) this.nextAt = now + 60000;
      }
      return;
    }
    const st = this.st;
    const g = this.giant;
    if (g && !g.dead) {
      st.x = g.x;
      st.y = g.y;
      st.hpK = g.hp / g.maxHp;
      // longe da luta, recupera devagar
      if (time - g.hitAt > 15000 && g.hp < g.maxHp) g.hp = Math.min(g.maxHp, g.hp + g.maxHp * 0.01);
    }
    // o tempo acabou e ninguém está lutando: volta a dormir
    if (now > st.until && (!g || time - g.hitAt > 30000)) {
      s.clans.log(`${GIANTS[st.id].name} voltou a dormir sob a terra.`, true);
      s.events.emit('toast', `${GIANTS[st.id].name} voltou a dormir`);
      this.unrealize();
      this.st = null;
      this.nextAt = now + (12 + Math.random() * 8) * 60000;
      this.save();
      return;
    }
    const p = s.player;
    const d = Math.hypot(st.x - p.x, st.y - p.y);
    if (!g && !this.loading && d < 70 * TILE) this.realize();
    else if (g && !g.dead && d > 100 * TILE) this.unrealize();
    if (time % 10000 < 1000) this.save();
  }

  private realize() {
    const s = this.scene;
    const st = this.st!;
    const key = `boss-${st.id}`;
    const make = () => {
      this.loading = false;
      if (!this.st || this.giant || this.st.id !== st.id) return;
      const max = this.maxHpFor(st.id);
      this.giant = new Giant(this, st.id, st.x, st.y, Math.max(1, Math.round(max * st.hpK)), max);
    };
    if (s.textures.exists(key)) return make();
    this.loading = true;
    s.load.atlas(key, `assets/sprites/bosses/${key}.png`, `assets/sprites/bosses/${key}.json`);
    s.load.once(`filecomplete-atlasjson-${key}`, make);
    s.load.start();
  }

  private unrealize() {
    const g = this.giant;
    if (!g) return;
    this.giant = null;
    if (!g.dead) g.destroy();
    const key = `boss-${g.id}`;
    // libera a memória da textura enorme (volta a carregar se precisar)
    this.scene.time.delayedCall(2500, () => {
      if (this.giant?.id !== g.id && this.scene.textures.exists(key)) this.scene.textures.remove(key);
    });
  }

  /** Mudou de fase: aviso e fúria. */
  phaseUp(g: Giant) {
    const s = this.scene;
    s.mountFx.roar(g.x, g.y - 60, 160, g.def.color, []);
    s.shake(500, 0.006);
    if (g.phase === 2) s.events.emit('toast', `${g.def.name} se enfurece: ataques novos!`);
    else {
      g.spr.setTint(0xffb0a0);
      s.events.emit('toast', `${g.def.name} está FURIOSO: mais rápido e mais forte!`);
    }
  }

  /** Derrotado: ovos, ouro, peça rara, Glória. */
  killed(g: Giant) {
    const s = this.scene;
    const d = g.def;
    const first = !this.slain.includes(g.id);
    if (first) this.slain.push(g.id);
    const eggs: string[] = [d.eggs[Math.floor(Math.random() * d.eggs.length)]];
    if (first || Math.random() < 0.35) eggs.push(d.eggs[Math.floor(Math.random() * d.eggs.length)]);
    eggs.forEach((e, i) => s.time.delayedCall(900 + i * 300, () => s.loot.drop(`egg_${e}`, g.x + (i - 0.5) * 30, g.y + 6)));
    s.time.delayedCall(1300, () => s.loot.drop(rollGear(Math.min(4, 3 + Math.floor(s.progress.rankIdx / 6))), g.x - 20, g.y - 4));
    s.time.delayedCall(1500, () => s.loot.drop(rollJewel('giant', s.progress.rankIdx), g.x + 4, g.y));
    s.time.delayedCall(1750, () => s.loot.drop(rollJewel('giant', s.progress.rankIdx), g.x + 22, g.y + 2));
    const gold = 600 + s.progress.rankIdx * 120;
    s.hq.addGold(gold);
    s.gainGlory(220 + s.progress.rankIdx * 20, g.x, g.y - 90);
    const names = eggs[1] === eggs[0] ? `2 ovos de ${MOUNTS[eggs[0]]?.name}` : eggs.map((e) => `ovo de ${MOUNTS[e]?.name ?? e}`).join(' e ');
    s.events.emit('area', 'GIGANTE DERRUBADO!', `${d.name} caiu · ${names} · ${gold} ouro`);
    s.events.emit('giant-killed', g.id);
    s.audio.sfx('reward');
    s.clans.log(`${s.clans.player.name || 'O herói'} derrubou ${d.name}, ${d.title}!`, true);
    this.st = null;
    this.giant = null;
    this.nextAt = s.clans.now + (25 + Math.random() * 10) * 60000;
    this.save();
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ st: this.st, nextAt: this.nextAt, slain: this.slain }));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (!d) return;
      if (d.st && GIANTS[d.st.id as GiantId] && Number.isFinite(d.st.x)) this.st = { ...d.st, hpK: Math.max(0.05, Math.min(1, Number(d.st.hpK) || 1)) };
      if (Number.isFinite(d.nextAt)) this.nextAt = d.nextAt;
      if (Array.isArray(d.slain)) this.slain = d.slain.filter((x: unknown) => typeof x === 'string');
    } catch {
      /* começa do zero */
    }
  }
}
