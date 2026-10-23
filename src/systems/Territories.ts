import Phaser from 'phaser';
import { TILE } from '../config';
import { DEPTH } from '../entities/Creature';
import type { WorldScene } from '../scenes/WorldScene';
import type { City } from './Cities';

interface Banner {
  city: City;
  shield: Phaser.GameObjects.Image;
  crest: Phaser.GameObjects.Image;
}

/**
 * Faz a conquista existir no próprio mundo: os quatro portões de cada cidade
 * mostram a cor e o brasão de quem controla o território. Os objetos são bem
 * leves e só ficam visíveis quando a cidade está perto da câmera.
 */
export class Territories {
  private banners: Banner[] = [];
  private last = new Map<string, string>();
  private nextUpdate = 0;

  constructor(private scene: WorldScene) {
    for (const city of scene.map.cities) {
      const points: [number, number][] = [
        [city.cx, city.y0 + 3],
        [city.cx, city.y1 - 2],
        [city.x0 + 2, city.cy],
        [city.x1 - 2, city.cy],
      ];
      for (const [tx, ty] of points) {
        const x = tx * TILE + 8;
        const y = ty * TILE + 8;
        const shield = scene.add.image(x, y - 15, 'crest-shield').setScale(0.72).setDepth(DEPTH.entities + y + 12).setVisible(false);
        const crest = scene.add.image(x, y - 16, 'crests', 0).setScale(0.72).setDepth(DEPTH.entities + y + 13).setVisible(false);
        this.banners.push({ city, shield, crest });
      }
    }
    scene.forts.on('change', () => this.refresh(true));
    scene.clans.on('change', () => this.refresh(true));
    this.refresh(true);
  }

  private owner(city: City) {
    const id = this.scene.forts.ownerOf(city);
    if (id === 'player') return this.scene.clans.player;
    return id ? this.scene.clans.byId(id) : undefined;
  }

  /** Nome curto usado pelo mapa, avisos de entrada e bloqueio de coleta. */
  ownerName(city: City) {
    const owner = this.owner(city);
    return owner?.player ? this.scene.clans.player.name : owner?.name ?? 'Lorde local';
  }

  update(time: number) {
    if (time < this.nextUpdate) return;
    this.nextUpdate = time + 250;
    this.refresh(false);
  }

  private refresh(force: boolean) {
    const p = this.scene.player;
    for (const banner of this.banners) {
      const d = Math.hypot(banner.city.cx * TILE - p.x, banner.city.cy * TILE - p.y);
      const visible = d < 75 * TILE;
      banner.shield.setVisible(visible);
      banner.crest.setVisible(visible);
      if (!visible) continue;
      const owner = this.owner(banner.city);
      const key = owner ? `${owner.id}:${owner.color}:${owner.crest}` : 'neutral';
      if (!force && this.last.get(banner.city.name) === key) continue;
      banner.shield.setTint(owner?.color ?? 0x8c8373).setAlpha(owner ? 1 : 0.72);
      banner.crest.setFrame(owner?.crest ?? 7).setAlpha(owner ? 1 : 0.72);
      this.last.set(banner.city.name, key);
    }
  }
}
