import Phaser from 'phaser';
import { inputState } from './InputState';

type ButtonId = 'attack' | 'dodge' | 'flame';

interface Button {
  id: ButtonId;
  label: string;
  icon: number;
  /** Raio em px CSS (diâmetro mínimo 56px exigido; usamos 68–88px). */
  radius: number;
  x: number;
  y: number;
  pointerId: number | null;
  bg: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  img: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  cd: Phaser.GameObjects.Graphics;
}

/** Lê as áreas seguras (notch) do CSS em px CSS. */
function safeAreas() {
  const probe = document.getElementById('safe-probe');
  if (!probe) return { left: 0, right: 0, top: 0, bottom: 0 };
  const cs = getComputedStyle(probe);
  return {
    left: parseFloat(cs.paddingLeft) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    top: parseFloat(cs.paddingTop) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
  };
}

/**
 * Joystick flutuante (metade esquerda) + três botões (direita).
 * Coordenadas internas em px do jogo; tamanhos definidos em px CSS e
 * convertidos pelo fator `u` (px do jogo por px CSS).
 */
export class VirtualControls {
  private scene: Phaser.Scene;
  private u = 1;
  private visible = false;
  private joyPointer: number | null = null;
  private joyBase!: Phaser.GameObjects.Arc;
  private joyKnob!: Phaser.GameObjects.Arc;
  private joyOrigin = new Phaser.Math.Vector2();
  private joyRest = new Phaser.Math.Vector2();
  private joyRadius = 54;
  private buttons: Button[] = [];
  /** Altura (px do jogo) reservada ao HUD no topo — os botões ficam abaixo. */
  hudBottom = 0;
  /** Áreas de outra UI (ex.: painel de debug) que não devem acionar o joystick. */
  blocker?: (x: number, y: number) => boolean;

  constructor(scene: Phaser.Scene, show: boolean) {
    this.scene = scene;
    scene.input.addPointer(3);
    const depth = 1000;
    this.joyBase = scene.add.circle(0, 0, 10, 0x0b0a12, 0.28).setStrokeStyle(2, 0xffffff, 0.35).setDepth(depth);
    this.joyKnob = scene.add.circle(0, 0, 10, 0xffffff, 0.42).setStrokeStyle(2, 0x1e1a24, 0.5).setDepth(depth + 1);
    const defs: [ButtonId, string, number, number][] = [
      ['attack', 'GOLPE', 0, 44],
      ['dodge', 'ESQUIVA', 1, 34],
      ['flame', 'CHAMA', 2, 34],
    ];
    for (const [id, label, icon, radius] of defs) {
      const bg = scene.add.circle(0, 0, 10, 0x0b0a12, 0.38).setDepth(depth);
      const ring = scene.add.circle(0, 0, 10).setStrokeStyle(3, 0xffffff, 0.55).setDepth(depth + 2);
      const img = scene.add.image(0, 0, 'ui-icons', icon).setDepth(depth + 1);
      const cd = scene.add.graphics().setDepth(depth + 3);
      const text = scene.add
        .text(0, 0, label, { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(depth + 4)
        .setAlpha(0.85);
      this.buttons.push({ id, label, icon, radius, x: 0, y: 0, pointerId: null, bg, ring, img, text, cd });
    }

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('gameout', () => this.releaseAll());
    window.addEventListener('blur', () => this.releaseAll());

    this.setVisible(show);
    // aparece automaticamente no primeiro toque (ex.: notebook com touch)
    window.addEventListener('touchstart', () => this.setVisible(true), { once: true, passive: true });
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.joyBase.setVisible(v);
    this.joyKnob.setVisible(v);
    for (const b of this.buttons) [b.bg, b.ring, b.img, b.text, b.cd].forEach((o) => o.setVisible(v));
  }

  /** Recalcula posições/tamanhos. `u` = px do jogo por px CSS. */
  layout(width: number, height: number, u: number) {
    this.u = u;
    const safe = safeAreas();
    const right = width - (safe.right + 18) * u;
    const bottom = height - (safe.bottom + 16) * u;
    const pos: Record<ButtonId, [number, number]> = {
      attack: [right - 44 * u, bottom - 44 * u],
      dodge: [right - 44 * u - 98 * u, bottom - 30 * u],
      flame: [right - 34 * u, bottom - 44 * u - 92 * u],
    };
    for (const b of this.buttons) {
      const [x, y] = pos[b.id];
      b.x = x;
      b.y = Math.max(y, this.hudBottom + b.radius * u);
      const r = b.radius * u;
      b.bg.setPosition(b.x, b.y).setRadius(r);
      b.ring.setPosition(b.x, b.y).setRadius(r);
      b.img.setPosition(b.x, b.y - 5 * u).setScale(((b.radius > 40 ? 2.6 : 2.1) * u));
      b.text.setPosition(b.x, b.y + r * 0.58).setFontSize(Math.round(9 * u));
    }
    this.joyRadius = 54 * u;
    this.joyRest.set((safe.left + 34) * u + this.joyRadius, height - (safe.bottom + 28) * u - this.joyRadius);
    this.joyBase.setRadius(this.joyRadius);
    this.joyKnob.setRadius(24 * u);
    if (this.joyPointer === null) this.resetJoystick();
  }

  private resetJoystick() {
    this.joyBase.setPosition(this.joyRest.x, this.joyRest.y).setAlpha(0.45);
    this.joyKnob.setPosition(this.joyRest.x, this.joyRest.y).setAlpha(0.45);
    inputState.touchX = 0;
    inputState.touchY = 0;
  }

  private hitButton(x: number, y: number): Button | undefined {
    // área de toque 15% maior que o desenho
    return this.buttons.find((b) => Phaser.Math.Distance.Between(x, y, b.x, b.y) <= b.radius * this.u * 1.15);
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (!this.visible || this.blocker?.(p.x, p.y)) return;
    const b = this.hitButton(p.x, p.y);
    if (b) {
      if (b.pointerId === null) {
        b.pointerId = p.id;
        inputState[b.id] = true;
        b.bg.setFillStyle(0xffffff, 0.3);
      }
      return;
    }
    if (p.x < this.scene.scale.width * 0.5 && this.joyPointer === null) {
      this.joyPointer = p.id;
      this.joyOrigin.set(p.x, p.y);
      this.joyBase.setPosition(p.x, p.y).setAlpha(1);
      this.joyKnob.setPosition(p.x, p.y).setAlpha(1);
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.joyPointer) return;
    const dx = p.x - this.joyOrigin.x;
    const dy = p.y - this.joyOrigin.y;
    const len = Math.hypot(dx, dy);
    const max = this.joyRadius;
    // joystick "arrastável": se o dedo passar do limite, a base o acompanha
    if (len > max * 1.35) {
      const k = (len - max * 1.35) / len;
      this.joyOrigin.x += dx * k;
      this.joyOrigin.y += dy * k;
      this.joyBase.setPosition(this.joyOrigin.x, this.joyOrigin.y);
    }
    const ddx = p.x - this.joyOrigin.x;
    const ddy = p.y - this.joyOrigin.y;
    const l2 = Math.hypot(ddx, ddy);
    const clamped = Math.min(l2, max);
    const nx = l2 > 0 ? ddx / l2 : 0;
    const ny = l2 > 0 ? ddy / l2 : 0;
    this.joyKnob.setPosition(this.joyOrigin.x + nx * clamped, this.joyOrigin.y + ny * clamped);
    const dead = 0.18;
    const mag = clamped / max;
    const m = mag < dead ? 0 : (mag - dead) / (1 - dead);
    inputState.touchX = nx * m;
    inputState.touchY = ny * m;
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id === this.joyPointer) {
      this.joyPointer = null;
      this.resetJoystick();
    }
    for (const b of this.buttons)
      if (b.pointerId === p.id) {
        b.pointerId = null;
        b.bg.setFillStyle(0x0b0a12, 0.38);
      }
  }

  private releaseAll() {
    this.joyPointer = null;
    this.resetJoystick();
    for (const b of this.buttons) {
      b.pointerId = null;
      b.bg.setFillStyle(0x0b0a12, 0.38);
    }
  }

  update() {
    if (!this.visible) return;
    for (const b of this.buttons) {
      // segurar o botão de golpe repete o ataque
      if (b.id === 'attack' && b.pointerId !== null) inputState.attack = true;
      const cd = inputState.cooldowns[b.id];
      b.cd.clear();
      const r = b.radius * this.u;
      if (cd > 0) {
        b.cd.fillStyle(0x000000, 0.55);
        b.cd.slice(b.x, b.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd, false);
        b.cd.fillPath();
        b.img.setAlpha(0.5);
        b.ring.setStrokeStyle(3 * this.u, 0xffffff, 0.25);
      } else {
        b.img.setAlpha(1);
        b.ring.setStrokeStyle(3 * this.u, 0xffffff, 0.6);
      }
    }
  }
}
