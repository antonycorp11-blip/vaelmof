import { TILE } from '../config';
import { DEPTH } from '../entities/Creature';
import type { WorldScene } from '../scenes/WorldScene';
import type { City } from './Cities';

const SAVE_KEY = 'vaelmor.races.v1';

/**
 * Corrida de montaria em volta de uma cidade: 6 bandeiras na ordem, contra o
 * relógio. Dentro do tempo-alvo paga ouro e Glória (mais se bater o recorde).
 */
export class Races {
  best: Record<string, number> = {};
  private run: { city: City; pts: { x: number; y: number }[]; i: number; t0: number; par: number } | null = null;
  private g: Phaser.GameObjects.Graphics;

  constructor(private scene: WorldScene) {
    this.g = scene.add.graphics().setDepth(DEPTH.fx - 2);
    try {
      this.best = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') ?? {};
    } catch {
      this.best = {};
    }
  }

  get active() {
    return !!this.run;
  }

  /** Próxima bandeira (para a seta e o mapa). */
  get target(): { x: number; y: number; name: string } | null {
    const r = this.run;
    if (!r) return null;
    const left = Math.max(0, Math.ceil((r.par - (this.scene.time.now - r.t0)) / 1000));
    return { ...r.pts[r.i], name: `Corrida ${r.i + 1}/${r.pts.length} · ${left} s` };
  }

  startBlock(city?: City): string {
    const s = this.scene;
    if (!city) return 'Corridas saem das cidades';
    if (!s.player.mount) return 'Monte para correr';
    if (s.army.war) return 'Não durante uma guerra';
    if (this.run) return 'Já há uma corrida em andamento';
    return '';
  }

  start(city?: City): string {
    const why = this.startBlock(city);
    if (why) return why;
    const s = this.scene;
    const c = city!;
    const m = s.map;
    const pts: { x: number; y: number }[] = [];
    const rx = (c.x1 - c.x0) / 2 + 16;
    const ry = (c.y1 - c.y0) / 2 + 14;
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k / 6) * Math.PI * 2;
      // procura chão livre perto do ponto do anel
      let best: { x: number; y: number } | null = null;
      for (let d = 0; d < 10 && !best; d++)
        for (const [ox, oy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) {
          const tx = Math.round(c.cx + Math.cos(a) * rx) + ox;
          const ty = Math.round(c.cy + Math.sin(a) * ry) + oy;
          const i = ty * m.width + tx;
          if (tx > 2 && ty > 2 && tx < m.width - 2 && ty < m.height - 2 && !m.collision[i] && m.water[i] < 0) {
            best = { x: tx * TILE + 8, y: ty * TILE + 8 };
            break;
          }
        }
      if (best) pts.push(best);
    }
    if (pts.length < 4) return 'Sem pista boa em volta desta cidade';
    // tempo-alvo: a volta no passo da montaria, com folga
    let len = Math.hypot(pts[0].x - s.player.x, pts[0].y - s.player.y);
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    const v = 58 * s.player.mount!.speed;
    const par = (len / v) * 1000 * 1.45;
    this.run = { city: c, pts, i: 0, t0: s.time.now, par };
    s.events.emit('area', 'CORRIDA!', `${pts.length} bandeiras em volta de ${c.name} · tempo-alvo ${Math.round(par / 1000)} s`);
    return '';
  }

  update(time: number) {
    const r = this.run;
    const g = this.g.clear();
    if (!r) return;
    const s = this.scene;
    const p = s.player;
    // bandeiras: a próxima pulsa
    r.pts.forEach((q, k) => {
      if (k < r.i) return;
      const on = k === r.i;
      const rr = on ? 12 + 2 * Math.sin(time / 120) : 8;
      g.lineStyle(3, 0x1a1028, 0.5).strokeEllipse(q.x, q.y, rr * 2, rr * 1.3);
      g.lineStyle(2, on ? 0xffd34a : 0xbfe0ff, on ? 1 : 0.6).strokeEllipse(q.x, q.y, rr * 2, rr * 1.3);
      g.fillStyle(0x6e4426, 1).fillRect(q.x - 1, q.y - 22, 2, 22);
      g.fillStyle(on ? 0xffd34a : 0xbfe0ff, 1).fillTriangle(q.x + 1, q.y - 22, q.x + 12, q.y - 18, q.x + 1, q.y - 14);
    });
    const el = time - r.t0;
    if (el > r.par * 2 || !p.mount || s.army.war) {
      this.run = null;
      s.events.emit('area', 'CORRIDA PERDIDA', p.mount ? 'tempo esgotado' : 'você desmontou');
      return;
    }
    const q = r.pts[r.i];
    if (Math.hypot(p.x - q.x, p.y - q.y) > 26) return;
    s.fx.burst(q.x, q.y - 10, 0xffd34a, 12);
    r.i++;
    if (r.i < r.pts.length) {
      s.events.emit('toast', `Bandeira ${r.i}/${r.pts.length} · ${(el / 1000).toFixed(1)} s`);
      return;
    }
    // chegada
    this.run = null;
    const secs = el / 1000;
    const rec = this.best[r.city.name];
    const record = !rec || secs < rec;
    if (secs <= r.par / 1000) {
      const gold = Math.round(80 + (r.par / 1000 - secs) * 6 + (record ? 60 : 0));
      s.hq.addGold(gold);
      s.gainGlory(record ? 30 : 12, p.x, p.y - 40);
      s.events.emit('area', record ? 'RECORDE!' : 'CORRIDA VENCIDA', `${secs.toFixed(1)} s em ${r.city.name} · +${gold} ouro`);
    } else s.events.emit('area', 'FORA DO TEMPO', `${secs.toFixed(1)} s · alvo ${(r.par / 1000).toFixed(0)} s`);
    if (record) {
      this.best[r.city.name] = Math.round(secs * 10) / 10;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.best));
      } catch {
        /* sem espaço */
      }
    }
  }
}
