import { TILE } from '../config';
import { rollGear } from '../data/gear';
import { MOUNTS } from '../data/mounts';
import { rollJewel } from '../data/enhancement';
import type { WorldScene } from '../scenes/WorldScene';
import type { Soldier, SoldierType } from './Army';

/** Um Tirano por bioma (0–5): nome, arma e a fera que monta. */
export const TYRANTS: { name: string; type: SoldierType; mount: string; color: number }[] = [
  { name: 'Corvane, o Usurpador do Vale', type: 'greatsword', mount: 'unicorn', color: 0xd8c8ff },
  { name: 'Verdalia, a Rainha das Raízes', type: 'staff', mount: 'emerald', color: 0x7aff8a },
  { name: 'Hrodgar, o Jarl Branco', type: 'greatsword', mount: 'polar', color: 0x9ad8ff },
  { name: 'Kastor, o Senhor das Pedreiras', type: 'sword', mount: 'griffin', color: 0xf0e0b0 },
  { name: 'Nyx, a Cinza Viva', type: 'staff', mount: 'nightmare', color: 0xff7a2a },
  { name: 'Zahir, o Rei das Dunas', type: 'bow', mount: 'panther', color: 0xb070ff },
];

const SAVE_KEY = 'vaelmor.tyrants.v1';
/** Volta depois de 40 min (relógio dos clãs). */
const RESPAWN = 40 * 60000;

/**
 * Masmorras dos Tiranos: um chefe único no coração de cada bioma, montado na
 * fera mais poderosa da região e cercado de uma guarda de elite. Derrotado,
 * deixa joias altas, a montaria e uma peça lendária; volta depois de 40 min.
 */
export class Tyrants {
  /** Quando cada um caiu pela última vez (-1 = nunca). */
  fallen: number[] = TYRANTS.map(() => -1);
  private live: (Soldier[] | null | undefined)[] = TYRANTS.map(() => undefined);
  private checkAt = 0;

  constructor(private scene: WorldScene) {
    this.load();
  }

  /** Entrada/coração da masmorra de cada Tirano (px). */
  lair(i: number) {
    const p = this.scene.map.poi[i] ?? this.scene.map.start;
    return { x: p.x + 40, y: p.y + 30 };
  }

  alive(i: number) {
    const f = this.fallen[i];
    return f < 0 || this.scene.clans.now - f > RESPAWN;
  }

  update(time: number) {
    if (time < this.checkAt) return;
    this.checkAt = time + 1000;
    const s = this.scene;
    const p = s.player;
    TYRANTS.forEach((_, i) => {
      const at = this.lair(i);
      const d = Math.hypot(at.x - p.x, at.y - p.y);
      if (this.live[i] === undefined && this.alive(i) && d < 40 * TILE) this.spawn(i);
      else if (this.live[i] && d > 80 * TILE) this.despawn(i);
    });
  }

  private spawn(i: number) {
    const s = this.scene;
    const T = TYRANTS[i];
    const at = this.lair(i);
    const group: Soldier[] = [];
    this.live[i] = null;
    s.bosses.spawn(
      {
        name: T.name,
        x: at.x,
        y: at.y,
        type: T.type,
        faction: i,
        hp: 900 + s.progress.rankIdx * 120,
        damage: 6 + s.progress.rankIdx * 0.6,
        tint: 0xffffff,
        scale: 1.45,
        points: 90,
        rank: 9,
        loot: rollGear(4),
        mount: T.mount,
        onKill: () => {
          const first = this.fallen[i] < 0;
          this.fallen[i] = s.clans.now;
          this.save();
          if (!s.stable.owned.has(T.mount)) s.stable.give(T.mount);
          else s.hq.addGold(1000);
          s.time.delayedCall(300, () => s.loot.drop(rollJewel('dungeon', 8 + i), at.x - 12, at.y));
          s.time.delayedCall(520, () => s.loot.drop(rollJewel('dungeon', 8 + i), at.x + 12, at.y));
          s.clans.log(`${T.name} caiu diante do ${s.clans.player.name}!${first ? ' O povo canta o feito.' : ''}`, true);
          s.events.emit('area', 'MASMORRA CONCLUÍDA!', `${T.name} derrotado · joias ancestrais · ${MOUNTS[T.mount]?.name ?? 'tesouro'}`);
          s.time.delayedCall(60000, () => this.despawn(i));
        },
      },
      (u) => {
        group.push(u);
        // guarda de elite em volta
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const types: SoldierType[] = ['greatsword', 'sword', 'bow', 'staff'];
          group.push(
            s.army.spawnChampion({
              x: at.x + Math.cos(a) * 34,
              y: at.y + Math.sin(a) * 22,
              type: types[k % types.length],
              faction: i,
              tier: 3,
              hp: 60 + s.progress.rankIdx * 10,
              damage: 3 + s.progress.rankIdx * 0.4,
              tint: 0xffe8e8,
              scale: 1.1,
              rank: 3,
            }),
          );
        }
        this.live[i] = group;
      },
    );
  }

  private despawn(i: number) {
    const g = this.live[i];
    this.live[i] = undefined;
    if (!g) return;
    for (const u of g) {
      if (u.dead) continue;
      if (this.scene.bosses.list.some((b) => b.unit === u)) this.scene.bosses.remove(u);
      else this.scene.army.remove(u);
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.fallen));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
      if (Array.isArray(d)) this.fallen = TYRANTS.map((_, i) => (typeof d[i] === 'number' ? d[i] : -1));
    } catch {
      /* nunca caíram */
    }
  }
}
