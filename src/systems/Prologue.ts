import { TILE } from '../config';
import { rollGear } from '../data/gear';
import type { WorldScene } from '../scenes/WorldScene';

interface PrologueSave {
  phase: 'waiting' | 'hunt' | 'done';
  target?: { x: number; y: number };
}

const KEY = 'vaelmor.prologue.v1';

/**
 * Primeiro arco guiado: dá um objetivo visível logo após fundar o clã e leva
 * o jogador até um mini-chefe. É curto de propósito; apresenta território,
 * mapa, combate e as missões sem abrir vários painéis de uma vez.
 */
export class Prologue {
  private st: PrologueSave = { phase: 'waiting' };
  private spawned = false;
  private announced = false;

  constructor(private scene: WorldScene) {
    this.load();
    scene.clans.on('founded', () => this.begin());
    if (scene.clans.founded && this.st.phase === 'waiting') scene.time.delayedCall(900, () => this.begin());
  }

  get objective(): { x: number; y: number; name: string; color: number } | null {
    return this.st.phase === 'hunt' && this.st.target ? { ...this.st.target, name: 'Mini-chefe: Gorvak', color: 0xff8a42 } : null;
  }

  private begin() {
    if (this.st.phase !== 'waiting') return;
    const c = this.scene.map.cities.find((x) => x.capital) ?? this.scene.map.cities[0];
    this.st = { phase: 'hunt', target: this.freeNear(c.cx, c.y1 + 15) };
    this.save();
    this.scene.time.delayedCall(700, () => {
      this.scene.events.emit('dialog', {
        name: 'Lorde de Brumavale',
        title: 'PRIMEIRO JURAMENTO',
        color: 0xd8b860,
        crest: 7,
        text: `Brumavale reconhece o seu clã e este território é seu. Recursos de outras terras só poderão ser colhidos depois da conquista. Gorvak, o Quebra-Estandartes, ameaça o portão sul. Siga a estrela no minimapa e derrube-o.`,
        options: [{ label: 'DEFENDER BRUMAVALE', color: 'gold', onPick: () => this.scene.events.emit('toast', 'Siga a estrela laranja no minimapa') }],
      });
      this.scene.events.emit('area', 'PRIMEIRO JURAMENTO', 'encontre Gorvak ao sul · objetivo marcado no mapa');
    });
  }

  update() {
    if (this.st.phase !== 'hunt' || !this.st.target || this.spawned) return;
    const t = this.st.target;
    const p = this.scene.player;
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (!this.announced && d < 28 * TILE) {
      this.announced = true;
      this.scene.events.emit('toast', 'MINI-CHEFE PRÓXIMO · prepare suas habilidades', 3200);
      this.scene.audio.sfx('danger');
    }
    if (d > 34 * TILE) return;
    this.spawned = true;
    this.scene.bosses.spawn({
      name: 'Gorvak, Quebra-Estandartes',
      x: t.x,
      y: t.y,
      hp: 72,
      damage: 3.2,
      tint: 0xf0b080,
      scale: 1.22,
      points: 18,
      rank: 2,
      type: 'greatsword',
      loot: rollGear(1),
      onKill: () => this.complete(),
    });
  }

  private complete() {
    if (this.st.phase === 'done') return;
    const s = this.scene;
    this.st = { phase: 'done' };
    s.hq.addGold(180);
    s.army.pool = Math.min(s.army.poolMax, s.army.pool + 10);
    s.army.emit('change');
    s.gainGlory(80, s.player.x, s.player.y - 45);
    s.events.emit('area', 'BRUMAVALE DEFENDIDA!', 'mini-chefe derrotado · +180 ouro · +10 recrutas');
    s.events.emit('toast', 'Agora visite MISSÕES e prepare-se: um Gigante despertará em breve', 4200);
    s.audio.sfx('reward');
    s.giants.hastenFirstAwakening(90_000);
    this.save();
  }

  private freeNear(tx: number, ty: number) {
    const m = this.scene.map;
    for (let r = 0; r < 18; r++)
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.max(2, Math.min(m.width - 3, tx + dx));
        const y = Math.max(2, Math.min(m.height - 3, ty + r));
        const i = y * m.width + x;
        if (!m.collision[i] && m.water[i] < 0) return { x: x * TILE + 8, y: y * TILE + 8 };
      }
    return { x: tx * TILE + 8, y: ty * TILE + 8 };
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.st));
    } catch {
      /* sem espaço */
    }
  }

  private load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (d && ['waiting', 'hunt', 'done'].includes(d.phase)) this.st = d;
    } catch {
      /* começa do início */
    }
  }
}
