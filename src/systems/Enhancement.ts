import Phaser from 'phaser';
import { JEWEL_INFO, MAX_ENHANCEMENT, ruleFor, type JewelId } from '../data/enhancement';
import { ITEMS } from '../data/items';
import type { WorldScene } from '../scenes/WorldScene';

export type GearKind = 'weapon' | 'armor';

export interface UpgradePreview {
  kind: GearKind;
  itemId: string;
  level: number;
  pity: number;
  target: number;
  jewel: JewelId | null;
  jewels: number;
  owned: number;
  chance: number;
  gold: number;
  guaranteed: boolean;
  maxed: boolean;
}

export interface UpgradeResult {
  ok: boolean;
  success: boolean;
  message: string;
  preview: UpgradePreview;
}

/**
 * Forja Rúnica: aprimora a peça equipada. Falha nunca destrói nem reduz o
 * nível; cada peça guarda as próprias falhas e recebe uma tentativa garantida.
 */
export class Enhancement extends Phaser.Events.EventEmitter {
  constructor(readonly scene: WorldScene) {
    super();
  }

  preview(kind: GearKind): UpgradePreview {
    const inv = this.scene.inventory;
    const state = inv.gearState[kind];
    const rule = ruleFor(state.level);
    return {
      kind,
      itemId: inv.gear[kind],
      level: state.level,
      pity: state.pity,
      target: Math.min(MAX_ENHANCEMENT, state.level + 1),
      jewel: rule?.jewel ?? null,
      jewels: rule?.jewels ?? 0,
      owned: rule ? inv.count(rule.jewel) : 0,
      chance: rule?.chance ?? 1,
      gold: rule ? Math.round(rule.gold * (1 + (ITEMS[inv.gear[kind]].tier ?? 0) * 0.25)) : 0,
      guaranteed: !!rule && state.pity >= rule.pity - 1,
      maxed: !rule,
    };
  }

  upgrade(kind: GearKind): UpgradeResult {
    const s = this.scene;
    const inv = s.inventory;
    const p = this.preview(kind);
    if (p.maxed || !p.jewel) return { ok: false, success: false, message: `${ITEMS[p.itemId].name} já alcançou +${MAX_ENHANCEMENT}`, preview: p };
    const jewel = JEWEL_INFO[p.jewel];
    if (p.owned < p.jewels) return { ok: false, success: false, message: `Faltam ${p.jewels - p.owned} × ${jewel.name}`, preview: p };
    if (s.hq.gold < p.gold) return { ok: false, success: false, message: `Faltam ${p.gold - s.hq.gold} de ouro para a forja`, preview: p };

    inv.remove(p.jewel, p.jewels);
    s.hq.addGold(-p.gold);
    const success = p.guaranteed || Math.random() < p.chance;
    const state = inv.gearState[kind];
    if (success) {
      state.level = p.target;
      state.pity = 0;
    } else state.pity++;
    inv.emit('change');
    inv.save();
    s.player.applyLook();

    const name = ITEMS[p.itemId].name;
    const message = success
      ? `${name} chegou a +${state.level}!`
      : `A forja resistiu. ${name} continua +${state.level} · garantia ${state.pity}/${ruleFor(state.level)?.pity ?? 0}`;
    const out = { ok: true, success, message, preview: this.preview(kind) };
    this.emit('result', out);
    return out;
  }
}
