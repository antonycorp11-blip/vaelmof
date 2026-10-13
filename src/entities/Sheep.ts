import type { WorldScene } from '../scenes/WorldScene';
import { Animal } from './Animal';

/** Ovelha: lenta, pasta bastante e foge em curta distância. */
export class Sheep extends Animal {
  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'sheep', {
      wanderSpeed: 16,
      fleeSpeed: 64,
      fleeRadius: 42,
      leash: 70,
      walkAnim: 'sheep-walk',
      runAnim: 'sheep-run',
      idleFrame: 2,
      alertFrame: 0,
      reaction: 120,
    });
  }
}
