import Phaser from 'phaser';
import { TILE } from '../config';

type Body = Phaser.Physics.Arcade.Body;

/**
 * Colisão das criaturas com o grid de colisão do mundo (Uint8Array, 1 =
 * sólido), resolvida depois de cada passo da física: primeiro no eixo X,
 * depois no Y, a partir da posição anterior do corpo. Substitui o collider
 * de tilemap do Arcade, que exigiria um TilemapLayer do tamanho do mundo.
 */
export class TileCollision {
  private bodies = new Set<Body>();
  /** Corpos que atravessam tudo (modo voo do debug). */
  readonly ghosts = new Set<Body>();

  constructor(
    world: Phaser.Physics.Arcade.World,
    private grid: Uint8Array,
    private w: number,
    private h: number,
  ) {
    world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, () => {
      for (const b of this.bodies) if (b.enable && !this.ghosts.has(b)) this.resolve(b);
    });
  }

  add(...bodies: Body[]) {
    for (const b of bodies) this.bodies.add(b);
  }

  solid(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.grid[ty * this.w + tx] === 1;
  }

  /** Há tile sólido sob a caixa (x, y, w, h)? */
  private hits(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / TILE);
    const y0 = Math.floor(y / TILE);
    const x1 = Math.floor((x + w - 0.001) / TILE);
    const y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solid(tx, ty)) return true;
    return false;
  }

  private resolve(b: Body) {
    const w = b.width;
    const h = b.height;
    const px = b.prev.x;
    const py = b.prev.y;
    let x = b.position.x;
    let y = b.position.y;
    // já estava preso dentro de algo (nasceu ou foi empurrado ali): deixa sair
    if (this.hits(px, py, w, h)) return;
    if (x !== px && this.hits(x, py, w, h)) {
      if (x > px) {
        x = Math.floor((x + w) / TILE) * TILE - w - 0.01;
        b.blocked.right = true;
      } else {
        x = (Math.floor(x / TILE) + 1) * TILE + 0.01;
        b.blocked.left = true;
      }
      b.blocked.none = false;
      b.velocity.x = 0;
      if (this.hits(x, py, w, h)) x = px;
    }
    if (y !== py && this.hits(x, y, w, h)) {
      if (y > py) {
        y = Math.floor((y + h) / TILE) * TILE - h - 0.01;
        b.blocked.down = true;
      } else {
        y = (Math.floor(y / TILE) + 1) * TILE + 0.01;
        b.blocked.up = true;
      }
      b.blocked.none = false;
      b.velocity.y = 0;
      if (this.hits(x, y, w, h)) y = py;
    }
    if (x !== b.position.x || y !== b.position.y) {
      b.position.set(x, y);
      b.updateCenter();
    }
  }
}
