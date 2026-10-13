import type { WorldScene } from '../scenes/WorldScene';
import { Animal } from './Animal';

/** Cervo: arisco, percebe o jogador de longe e dispara em alta velocidade. */
export class Deer extends Animal {
  constructor(scene: WorldScene, x: number, y: number) {
    super(scene, x, y, 'deer', {
      wanderSpeed: 24,
      fleeSpeed: 118,
      fleeRadius: 78,
      leash: 110,
      walkAnim: 'deer-walk',
      runAnim: 'deer-run',
      idleFrame: 0,
      alertFrame: 2,
      reaction: 220,
    });
  }
}
