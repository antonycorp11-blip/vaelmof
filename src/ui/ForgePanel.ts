import Phaser from 'phaser';
import { armorEnhancementGuard, enhancementCooldownMul, JEWEL_INFO, weaponEnhancementPower, type JewelId } from '../data/enhancement';
import { ITEMS } from '../data/items';
import type { WorldScene } from '../scenes/WorldScene';
import type { GearKind, UpgradeResult } from '../systems/Enhancement';
import { Button, COLOR, fit, label, Window } from './kit';

const JEWELS = Object.keys(JEWEL_INFO) as JewelId[];

/** Forja completa: seleção da peça equipada, custo, chance e proteção. */
export class ForgePanel {
  private win: Window;
  private kind: GearKind = 'weapon';
  private tabs: Record<GearKind, Button>;
  private item: Phaser.GameObjects.Text;
  private stats: Phaser.GameObjects.Text;
  private cost: Phaser.GameObjects.Text;
  private chance: Phaser.GameObjects.Text;
  private protection: Phaser.GameObjects.Text;
  private sources: Phaser.GameObjects.Text;
  private jewelLines: Phaser.GameObjects.Text[] = [];
  private upgradeBtn: Button;
  private feedback?: UpgradeResult;
  private feedbackUntil = 0;
  private u = 1;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldScene,
  ) {
    this.win = new Window(scene, 'FORJA RÚNICA', 25, () => this.setOpen(false));
    this.win.sub.setText('Aprimore a peça equipada até +15 · falhas nunca quebram o item');
    const tab = (kind: GearKind, text: string) =>
      new Button(scene, { label: text, color: 'dark', size: 11, onTap: () => this.select(kind) }).addTo(this.win.root);
    this.tabs = { weapon: tab('weapon', 'ARMA'), armor: tab('armor', 'ARMADURA') };
    this.item = label(scene, '', 15, COLOR.gold);
    this.stats = label(scene, '', 10, COLOR.text, 1, false).setLineSpacing(3);
    this.cost = label(scene, '', 11, COLOR.text);
    this.chance = label(scene, '', 12, COLOR.blue);
    this.protection = label(scene, '', 10, COLOR.dim, 1, false);
    this.sources = label(scene, 'ONDE ENCONTRAR: baús do mundo · Chefes e Gigantes · vitórias em batalhas e fortes · masmorras dos Tiranos', 9, COLOR.dim, 1, false).setLineSpacing(2);
    this.win.add(this.item, this.stats, this.cost, this.chance, this.protection, this.sources);
    for (const id of JEWELS) {
      const t = label(scene, '', 10, JEWEL_INFO[id].colorCss);
      this.jewelLines.push(t);
      this.win.add(t);
    }
    this.upgradeBtn = new Button(scene, { label: 'APRIMORAR', color: 'gold', size: 12, onTap: () => this.upgrade() }).addTo(this.win.root);
    world.inventory.on('change', () => this.refresh());
    world.hq.on('gold', () => this.refresh());
    this.refresh();
  }

  get open() {
    return this.win.open;
  }

  contains(x: number, y: number) {
    return this.win.contains(x, y);
  }

  setOpen(on: boolean) {
    this.win.setOpen(on);
    if (on) this.layout(this.u);
  }

  toggle() {
    this.setOpen(!this.open);
  }

  private select(kind: GearKind) {
    this.kind = kind;
    this.refresh();
  }

  private upgrade() {
    const r = this.world.enhancement.upgrade(this.kind);
    this.refresh(r);
  }

  refresh(result?: UpgradeResult) {
    if (!this.win) return;
    if (result) {
      this.feedback = result;
      this.feedbackUntil = this.scene.time.now + 3600;
    }
    const shown = this.scene.time.now < this.feedbackUntil ? this.feedback : undefined;
    const w = this.world;
    const p = w.enhancement.preview(this.kind);
    const def = ITEMS[p.itemId];
    this.tabs.weapon.setColor(this.kind === 'weapon' ? 'blue' : 'dark');
    this.tabs.armor.setColor(this.kind === 'armor' ? 'blue' : 'dark');
    this.item.setText(`${def.name}  +${p.level}`).setColor(p.level >= 10 ? COLOR.gold : '#f3ead2');
    if (this.kind === 'weapon') {
      const dmg = Math.round((weaponEnhancementPower(p.level) - 1) * 100);
      const cd = Math.round((1 - enhancementCooldownMul(p.level)) * 100);
      this.stats.setText(`Dano do equipamento: +${dmg}%${cd ? `\nRecarga das habilidades: -${cd}%` : '\nMarco +5: reduz a recarga das habilidades'}`);
    } else {
      const guard = Math.round(armorEnhancementGuard(p.level) * 100);
      this.stats.setText(`Defesa adicional: +${guard}%\nMarcos +5/+10/+15: aura da armadura mais intensa`);
    }
    this.jewelLines.forEach((t, i) => {
      const id = JEWELS[i];
      const j = JEWEL_INFO[id];
      t.setText(`${j.name} (${j.band}): ${w.inventory.count(id)}`);
    });
    if (p.maxed) {
      this.cost.setText('Aprimoramento máximo alcançado');
      this.chance.setText('PODER MÁXIMO +15').setColor('#ff8ae8');
      this.protection.setText(shown?.message ?? 'Esta peça não pode mais ser aprimorada.');
      this.upgradeBtn.setLabel('MÁXIMO +15').setEnabled(false).setColor('dark');
      return;
    }
    const j = JEWEL_INFO[p.jewel!];
    this.cost.setText(`Custo: ${p.jewels} × ${j.name} + ${p.gold} ouro`);
    this.chance.setText(p.guaranteed ? 'CHANCE: 100% · GARANTIDA' : `CHANCE: ${Math.round(p.chance * 100)}%`).setColor(p.guaranteed ? COLOR.green : COLOR.blue);
    this.protection
      .setText(shown?.message ?? `Proteção da peça: ${p.pity} falhas · a garantia se aproxima a cada falha. O item nunca quebra nem perde nível.`)
      .setColor(shown ? (shown.success ? COLOR.green : shown.ok ? COLOR.gold : COLOR.red) : COLOR.dim);
    const can = p.owned >= p.jewels && w.hq.gold >= p.gold;
    this.upgradeBtn.setLabel(`FORTALECER PARA +${p.target}`).setEnabled(can).setColor(can ? 'gold' : 'dark');
  }

  update() {
    if (this.open) this.refresh();
  }

  layout(u: number) {
    this.u = u;
    const { width, height } = this.scene.scale;
    this.win.place(u, Math.min(width * 0.94, 580 * u), Math.min(height * 0.92, 390 * u));
    const pad = this.win.pad;
    const top = this.win.head + pad / 2;
    const gap = 8 * u;
    const bw = (this.win.W - pad * 2 - gap) / 2;
    this.tabs.weapon.place(pad, top, u, bw, 34 * u);
    this.tabs.armor.place(pad + bw + gap, top, u, bw, 34 * u);
    let y = top + 44 * u;
    fit(this.item, 15, u).setPosition(pad, y);
    y += 26 * u;
    fit(this.stats, 10, u).setPosition(pad, y);
    y += 46 * u;
    this.jewelLines.forEach((t) => {
      fit(t, 10, u).setPosition(pad, y);
      y += 20 * u;
    });
    y += 4 * u;
    fit(this.cost, 11, u).setPosition(pad, y);
    y += 24 * u;
    fit(this.chance, 12, u).setPosition(pad, y);
    y += 25 * u;
    fit(this.protection, 10, u).setWordWrapWidth(this.win.W - pad * 2).setPosition(pad, y);
    fit(this.sources, 9, u).setWordWrapWidth(this.win.W - pad * 2).setPosition(pad, this.win.H - 76 * u);
    this.upgradeBtn.place(pad, this.win.H - 42 * u, u, this.win.W - pad * 2, 32 * u);
    this.refresh();
  }
}
