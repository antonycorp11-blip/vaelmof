import Phaser from 'phaser';
import type { WorldScene } from '../scenes/WorldScene';
import type { Soldier, SoldierType } from './Army';
import { rollJewel } from '../data/enhancement';

export interface BossSpec {
  name: string;
  x: number;
  y: number;
  hp: number;
  damage: number;
  tint: number;
  scale: number;
  points: number;
  /** Patente mostrada na insígnia vermelha (0–9). */
  rank: number;
  /** Arma (sorteada se faltar) e povo (o do bioma, se faltar): roupa, armas e raça do lugar. */
  type?: SoldierType;
  faction?: number;
  /** Peça rara que cai ao morrer. */
  loot?: string;
  /** Vem montado (id da montaria). */
  mount?: string;
  onKill?: () => void;
}

interface Live {
  spec: BossSpec;
  unit: Soldier;
  label: Phaser.GameObjects.Text;
}

const TYPES: SoldierType[] = ['sword', 'greatsword', 'bow', 'staff'];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/**
 * Personagens nomeados (líderes de clã, procurados): soldados inimigos com
 * a roupa de elite do povo do lugar e a arma própria, maiores e mais
 * fortes, com nome e insígnia sobre a cabeça. Ao morrer, deixam cair a peça
 * rara que carregavam e avisam quem os chamou.
 */
export class Bosses {
  readonly list: Live[] = [];

  constructor(private scene: WorldScene) {}

  spawn(spec: BossSpec, done?: (s: Soldier) => void) {
    const s = this.scene;
    const army = s.army;
    army.prepare(() => {
      const type = spec.type ?? pick(TYPES);
      const live: Partial<Live> = { spec };
      const unit = army.spawnChampion({
        x: spec.x,
        y: spec.y,
        type,
        faction: spec.faction,
        tier: Math.min(3, 1 + Math.floor(spec.rank / 3)),
        hp: spec.hp,
        damage: spec.damage,
        tint: spec.tint,
        scale: spec.scale,
        rank: Math.min(3, Math.floor(spec.rank / 3)),
        onDeath: () => {
          const i = this.list.indexOf(live as Live);
          if (i >= 0) this.list.splice(i, 1);
          live.label?.destroy();
          s.gainGlory(spec.points * 4, unit.x, unit.y - 50);
          if (spec.loot) s.loot.drop(spec.loot, unit.x, unit.y);
          // Todo personagem nomeado alimenta a progressão da Forja.
          s.time.delayedCall(180, () => s.loot.drop(rollJewel('boss', spec.rank), unit.x + 10, unit.y + 4));
          spec.onKill?.();
        },
      });
      // insígnia vermelha com a patente do personagem
      unit.icon.setFrame(10 + Math.max(0, Math.min(9, spec.rank)));
      if (spec.mount) army.mountChampion(unit, spec.mount);
      live.unit = unit;
      live.label = s.add
        .text(spec.x, spec.y - 40, spec.name, { fontFamily: 'Tiny5, monospace', fontSize: '7px', color: '#ffd34a', stroke: '#1e1a24', strokeThickness: 2 })
        .setOrigin(0.5)
        .setResolution(4)
        .setDepth(4250);
      this.list.push(live as Live);
      done?.(unit);
    });
  }

  /** Remove sem recompensa (fim de guerra, missão cancelada, longe demais). */
  remove(unit: Soldier) {
    const i = this.list.findIndex((l) => l.unit === unit);
    if (i >= 0) {
      this.list[i].label.destroy();
      this.list.splice(i, 1);
    }
    if (!unit.dead) this.scene.army.remove(unit);
  }

  update() {
    for (const b of this.list) {
      const u = b.unit;
      b.label.setPosition(Math.round(u.x), Math.round(u.y - 34 - 10 * u.sizeK - (u.mount ? u.mount.seat * u.sizeK : 0))).setVisible(u.sprite.visible);
    }
  }
}
