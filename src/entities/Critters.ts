import type { WorldScene } from '../scenes/WorldScene';
import { Animal, type AnimalTraits } from './Animal';

type Traits = Omit<AnimalTraits, 'walkAnim' | 'runAnim' | 'idleFrame' | 'alertFrame'>;

/** Fauna pacífica dos biomas (folhas 16×16: 0–1 andar, 2 alerta, 3 correndo). */
export const CRITTERS: Record<string, Traits> = {
  fox: { wanderSpeed: 26, fleeSpeed: 110, fleeRadius: 70, leash: 120, reaction: 160 },
  hare: { wanderSpeed: 20, fleeSpeed: 130, fleeRadius: 64, leash: 90, reaction: 120 },
  goat: { wanderSpeed: 18, fleeSpeed: 92, fleeRadius: 60, leash: 100, reaction: 260 },
  lizard: { wanderSpeed: 16, fleeSpeed: 120, fleeRadius: 50, leash: 70, reaction: 90 },
};

export function makeCritter(scene: WorldScene, kind: string, x: number, y: number): Animal {
  return new Animal(scene, x, y, kind, { ...CRITTERS[kind], walkAnim: `${kind}-walk`, runAnim: `${kind}-run`, idleFrame: 0, alertFrame: 2 });
}
