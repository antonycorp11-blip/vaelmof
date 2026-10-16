// Motor de escultura em pixel art (o mesmo das montarias, em scripts/mount-art.mjs),
// com o tamanho do quadro como parâmetro: campos de distância somados de forma
// suave, luz pela normal, sombra projetada, rampas de 6 tons e contorno seletivo.
// ------------------------------------------------------------------ cores
export const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
export const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function rgb2hsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
export const shade = (c, k) => {
  const [h, s, l] = rgb2hsl(hex(c));
  return toHex(...hsl2rgb([h, s, Math.max(0, Math.min(1, l + k))]));
};
/**
 * Rampa de 6 tons: contorno, sombra funda, sombra, base, luz, brilho. As
 * sombras puxam o matiz para o azul/roxo e ganham saturação; as luzes puxam
 * para o amarelo e perdem um pouco de saturação.
 */
const RAMPS = new Map();
export function ramp(base) {
  if (RAMPS.has(base)) return RAMPS.get(base);
  const [h, s, l] = rgb2hsl(hex(base));
  const toward = (target, amt) => {
    const d = ((target - h + 540) % 360) - 180;
    return h + Math.sign(d) * Math.min(Math.abs(d), amt);
  };
  const tone = (dh, ds, dl) => toHex(...hsl2rgb([dl < 0 ? toward(255, dh) : toward(50, dh), Math.max(0, Math.min(1, s + ds)), Math.max(0, Math.min(1, l + dl))]));
  const r = [tone(26, 0.08, -l * 0.74), tone(18, 0.07, -l * 0.46), tone(9, 0.04, -l * 0.22), base, tone(8, -0.02, (1 - l) * 0.26), tone(14, -0.08, (1 - l) * 0.52)];
  RAMPS.set(base, r);
  return r;
}


/** Ferramentas de escultura para quadros de W×H com o chão na linha GROUND. */
export function sculptor(W, H, GROUND) {
  // ------------------------------------------------------------------ campos de distância
  const len = (x, y) => Math.sqrt(x * x + y * y);
  const prim = {
    circle(cx, cy, r) {
      return { bb: [cx - r, cy - r, cx + r, cy + r], f: (x, y) => len(x - cx, y - cy) - r };
    },
    ellipse(cx, cy, rx, ry, rot = 0) {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const R = Math.max(rx, ry);
      const m = Math.min(rx, ry);
      return {
        bb: [cx - R, cy - R, cx + R, cy + R],
        f: (x, y) => {
          const dx = x - cx;
          const dy = y - cy;
          const u = (dx * c + dy * s) / rx;
          const v = (-dx * s + dy * c) / ry;
          return (len(u, v) - 1) * m;
        },
      };
    },
    /** Cone arredondado (cápsula afinada) de A (raio ra) a B (raio rb). */
    cone(ax, ay, ra, bx, by, rb) {
      const R = Math.max(ra, rb);
      const pbx = bx - ax;
      const pby = by - ay;
      const h = pbx * pbx + pby * pby || 1e-6;
      const b = ra - rb;
      const cx2 = Math.sqrt(Math.max(1e-6, h - b * b));
      return {
        bb: [Math.min(ax, bx) - R, Math.min(ay, by) - R, Math.max(ax, bx) + R, Math.max(ay, by) + R],
        f: (x, y) => {
          const px = x - ax;
          const py = y - ay;
          const qx = Math.abs((px * pby - py * pbx) / h);
          const qy = (px * pbx + py * pby) / h;
          const k = cx2 * qy - b * qx;
          const m = cx2 * qx + b * qy;
          const n = qx * qx + qy * qy;
          if (k < 0) return Math.sqrt(h * n) - ra;
          if (k > cx2) return Math.sqrt(h * (n + 1 - 2 * qy)) - rb;
          return m - ra;
        },
      };
    },
    poly(pts) {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return {
        bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        f: (x, y) => {
          let d = Infinity;
          let s = 1;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
            const [vix, viy] = pts[i];
            const [vjx, vjy] = pts[j];
            const ex = vjx - vix;
            const ey = vjy - viy;
            const wx = x - vix;
            const wy = y - viy;
            const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
            d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2);
            const c1 = y >= viy;
            const c2 = y < vjy;
            const c3 = ex * wy > ey * wx;
            if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
          }
          return s * Math.sqrt(d);
        },
      };
    },
  };
  const smin = (a, b, k) => {
    if (k <= 0) return Math.min(a, b);
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  };
  const smax = (a, b, k) => -smin(-a, -b, k);

  /** Uma parte: formas somadas (união suave de raio k) e recortadas. */
  class Shape {
    constructor(k = 2) {
      this.k = k;
      this.ops = [];
      this.ox = 0;
    }
    add(p, k = this.k) {
      this.ops.push({ p, k, sub: false });
      return this;
    }
    sub(p, k = 0) {
      this.ops.push({ p, k, sub: true });
      return this;
    }
    circle(...a) {
      return this.add(prim.circle(...a));
    }
    ellipse(...a) {
      return this.add(prim.ellipse(...a));
    }
    cone(...a) {
      return this.add(prim.cone(...a));
    }
    poly(pts, k) {
      return this.add(prim.poly(pts), k);
    }
    /** Corrente de cones por pontos [x, y, r]. */
    chain(pts, k) {
      for (let i = 0; i + 1 < pts.length; i++) this.add(prim.cone(pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]), k);
      return this;
    }
    /** Distâncias no centro de cada pixel (com o deslocamento horizontal da vista). */
    grid() {
      if (this._g) return this._g;
      const g = new Float32Array(W * H).fill(99);
      for (const { p, k, sub } of this.ops) {
        const m = k + 3;
        const x0 = Math.max(0, Math.floor(p.bb[0] + this.ox - m));
        const x1 = Math.min(W - 1, Math.ceil(p.bb[2] + this.ox + m));
        const y0 = Math.max(0, Math.floor(p.bb[1] - m));
        const y1 = Math.min(H - 1, Math.ceil(p.bb[3] + m));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const i = y * W + x;
            const d = p.f(x + 0.5 - this.ox, y + 0.5);
            g[i] = sub ? smax(g[i], -d, k) : smin(g[i], d, k);
          }
      }
      for (let x = 0; x < W; x++) g[(GROUND) * W + x] = Math.max(g[GROUND * W + x], 0.01);
      for (let y = GROUND; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = Math.max(g[y * W + x], 0.01);
      this._g = g;
      return g;
    }
    inside(x, y) {
      return x >= 0 && y >= 0 && x < W && y < H && this.grid()[y * W + x] < 0;
    }
    /** Primeira linha (de cima) ocupada na coluna x. */
    top(x) {
      for (let y = 0; y < H; y++) if (this.inside(Math.round(x + this.ox), y)) return y;
      return H;
    }
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
  const LX = -0.52;
  const LY = -0.72;
  const LZ = 0.46;

  // ------------------------------------------------------------------ tela
  class Canvas {
    constructor(ox = 0) {
      this.ox = ox;
      this.ramps = [];
      this.rid = new Int16Array(W * H).fill(-1);
      this.idx = new Int8Array(W * H);
      this.part = new Int16Array(W * H).fill(-1);
      this.fixed = new Array(W * H).fill(null);
      this.shadowed = new Uint8Array(W * H);
      this.n = 0;
    }
    rampId(r) {
      let i = this.ramps.indexOf(r);
      if (i < 0) {
        i = this.ramps.length;
        this.ramps.push(r);
      }
      return i;
    }
    shape(k) {
      const s = new Shape(k);
      s.ox = this.ox;
      return s;
    }
    /**
     * Esculpe a parte: luz pela normal do campo (perfil arredondado com raio
     * igual à espessura local), luz refletida embaixo, pontilhado leve,
     * linha onde passa por cima de outra parte e sombra projetada logo abaixo.
     */
    sculpt(shape, r, o = {}) {
      const g = shape.grid();
      const id = this.n++;
      const rid = this.rampId(r);
      const regions = (o.regions ?? []).map(([s, rr, flat]) => [s.grid(), this.rampId(rr), flat]);
      const Rcap = o.R ?? 9;
      // espessura local: máximo da profundidade numa janela (separável)
      const t = new Float32Array(W * H);
      for (let i = 0; i < t.length; i++) t[i] = g[i] < 0 ? -g[i] : 0;
      const w = Math.ceil(Rcap);
      // só a caixa da parte (quadros grandes ficariam lentos varrendo tudo)
      let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (g[y * W + x] < 0) {
            if (x < bx0) bx0 = x;
            if (x > bx1) bx1 = x;
            if (y < by0) by0 = y;
            if (y > by1) by1 = y;
          }
      const tmp = new Float32Array(W * H);
      for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
          let m = 0;
          for (let k = Math.max(bx0, x - w); k <= Math.min(bx1, x + w); k++) m = Math.max(m, t[y * W + k]);
          tmp[y * W + x] = m;
        }
      const loc = new Float32Array(W * H);
      for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
          let m = 0;
          for (let k = Math.max(by0, y - w); k <= Math.min(by1, y + w); k++) m = Math.max(m, tmp[k * W + x]);
          loc[y * W + x] = Math.max(1.2, Math.min(Rcap, m));
        }
      const amb = o.amb ?? 0.16;
      const dith = o.dither ?? 0.28;
      const bright = o.bright ?? 0;
      const mine = new Uint8Array(W * H);
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (g[i] >= 0) continue;
          mine[i] = 1;
          let gx = (g[i + 1] - g[i - 1]) / 2;
          let gy = (g[i + W] - g[i - W]) / 2;
          const gl = len(gx, gy) || 1;
          gx /= gl;
          gy /= gl;
          const s = Math.max(0, Math.min(1, 1 - (-g[i] - 0.35) / loc[i]));
          const sp = Math.pow(s, o.round ?? 1.25);
          const nx = gx * sp;
          const ny = gy * sp;
          const nz = Math.sqrt(Math.max(0, 1 - sp * sp));
          let v = Math.max(0, nx * LX + ny * LY + nz * LZ) / 0.99;
          if (o.flat) v = 0.55 + (v - 0.55) * (1 - o.flat);
          v = amb + (1 - amb) * v;
          if (gy > 0.3) v += 0.16 * gy * sp * (o.bounce ?? 1);
          v += bright;
          let k = 1 + v * 4.4 + BAYER[(y & 3) * 4 + (x & 3)] * dith;
          k = Math.max(1, Math.min(5, Math.round(k)));
          let use = rid;
          for (const [rg, rr, flat] of regions)
            if (rg[i] < 0) {
              use = rr;
              if (flat) k = Math.max(1, Math.min(5, Math.round(3 + (k - 3) * (1 - flat))));
            }
          this.rid[i] = use;
          this.idx[i] = k;
          this.fixed[i] = null;
          this.part[i] = id;
          this.shadowed[i] = 0;
        }
      // linha de separação onde esta parte passa por cima de outra
      if (o.line !== false)
        for (let y = 1; y < H - 1; y++)
          for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            if (!mine[i]) continue;
            const nb = [i + 1, i - 1, i + W, i - W];
            if (nb.some((j) => !mine[j] && this.part[j] >= 0 && this.part[j] !== id)) this.idx[i] = Math.min(this.idx[i], o.lineIdx ?? 1);
          }
      // sombra projetada nas partes de trás, logo abaixo desta
      if (o.cast !== false)
        for (let y = 1; y < H - 3; y++)
          for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            if (!mine[i]) continue;
            for (const j of [i + W, i + 2 * W, i + W + 1]) {
              if (mine[j] || this.part[j] < 0 || this.part[j] === id || this.shadowed[j] || this.fixed[j]) continue;
              this.idx[j] = Math.max(1, this.idx[j] - 1);
              this.shadowed[j] = 1;
            }
          }
      return mine;
    }
    /** Fios (crina, pelo, penas): baixa um tom em linhas paralelas dentro da parte. */
    streaks(mask, ang, gap = 3, depth = 1, phase = 0) {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!mask[i]) continue;
          const u = (x - this.ox) * -s + y * c + phase;
          if (((u % gap) + gap) % gap < 1) this.idx[i] = Math.max(1, this.idx[i] - depth);
        }
    }
    /** Pinta região (máscara de outra Shape) por dentro de uma parte já esculpida, trocando a rampa. */
    tint(mask, shape, r, dk = 0) {
      const g = shape.grid();
      const rid = this.rampId(r);
      for (let i = 0; i < g.length; i++)
        if (g[i] < 0 && mask[i]) {
          this.rid[i] = rid;
          if (dk) this.idx[i] = Math.max(1, Math.min(5, this.idx[i] + dk));
        }
    }
    /** Pixel de cor fixa (olhos, brilho, rebites). Coordenadas da vista. */
    px(x, y, col, w = 1, h = 1) {
      for (let j = 0; j < h; j++)
        for (let k = 0; k < w; k++) {
          const xx = Math.round(x + this.ox) + k;
          const yy = Math.round(y) + j;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const i = yy * W + xx;
          this.fixed[i] = col;
          if (this.part[i] < 0) this.part[i] = 9999;
        }
    }
    /** Linha de cor fixa. */
    line(x0, y0, x1, y1, col) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col);
    }
    /** Escurece/clareia um tom dentro de uma forma (sobre o que já está pintado). */
    nudge(shape, dk) {
      const g = shape.grid();
      for (let i = 0; i < g.length; i++) if (g[i] < 0 && this.rid[i] >= 0 && !this.fixed[i]) this.idx[i] = Math.max(1, Math.min(5, this.idx[i] + dk));
    }
    color(i) {
      if (this.fixed[i]) return this.fixed[i];
      if (this.rid[i] < 0) return null;
      return this.ramps[this.rid[i]][this.idx[i]];
    }
    /** Contorno seletivo: tom mais escuro do vizinho; no topo iluminado, um tom acima. */
    finish() {
      const out = new Uint8ClampedArray(W * H * 4);
      const filled = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (this.rid[y * W + x] >= 0 || this.fixed[y * W + x]);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          let col = this.color(i);
          if (!col) {
            let best = null;
            for (const [nx, ny, top] of [
              [x, y + 1, true],
              [x + 1, y, false],
              [x - 1, y, false],
              [x, y - 1, false],
            ]) {
              if (!filled(nx, ny)) continue;
              const j = ny * W + nx;
              if (this.rid[j] < 0) {
                best = shade(this.fixed[j], -0.35);
                break;
              }
              const r = this.ramps[this.rid[j]];
              best = top && this.idx[j] >= 4 ? r[1] : r[0];
              break;
            }
            col = best;
          }
          if (!col) continue;
          const [r, g, b] = hex(col);
          out[i * 4] = r;
          out[i * 4 + 1] = g;
          out[i * 4 + 2] = b;
          out[i * 4 + 3] = 255;
        }
      return out;
    }
  }

  // ------------------------------------------------------------------ pernas
  /** Joelho por cinemática inversa: `bend` +1 põe a junta à frente (+x), −1 atrás. */
  function ik(hx, hy, fx, fy, a, b, bend) {
    let dx = fx - hx;
    let dy = fy - hy;
    let d = len(dx, dy);
    const max = a + b - 0.05;
    if (d > max) {
      fx = hx + (dx / d) * max;
      fy = hy + (dy / d) * max;
      dx = fx - hx;
      dy = fy - hy;
      d = max;
    }
    d = Math.max(d, Math.abs(a - b) + 0.1);
    const ca = (a * a + d * d - b * b) / (2 * a * d);
    const base = Math.atan2(dy, dx);
    const ang = base + bend * -Math.acos(Math.max(-1, Math.min(1, ca)));
    return [hx + Math.cos(ang) * a, hy + Math.sin(ang) * a, fx, fy];
  }

  /** Ciclo do pé: apoio (no chão, indo para trás) e voo (erguido, voltando). */
  function stepCycle(p, stride, lift) {
    p = ((p % 1) + 1) % 1;
    const duty = 0.5;
    if (p < duty) {
      const t = p / duty;
      return { x: stride * (0.5 - t), lift: 0, swing: 0 };
    }
    const t = (p - duty) / (1 - duty);
    const e = t * t * (3 - 2 * t);
    return { x: stride * (e - 0.5), lift: Math.sin(t * Math.PI) * lift, swing: Math.sin(t * Math.PI) };
  }

  /**
   * Perna vista de lado. `L` é a definição: pivô, ossos, raios e o pé.
   * Devolve a Shape da perna e o ponto do pé.
   */
  function sideLeg(C, L, phase, dx, bob, far) {
    const st = stepCycle(phase, L.stride, L.lift);
    const px = L.px + dx;
    const py = L.py + bob;
    const footH = L.foot === 'hoof' ? 3 : L.foot === 'talon' ? 2 : 2.5;
    // alvo do boleto: em cima do pé
    const fx = px + st.x + (L.hind ? -1 : 1);
    const fy = GROUND - footH - (L.pastern ?? 2) - st.lift;
    const [kx, ky, ex, ey] = ik(px, py, fx, fy, L.a, L.b, L.hind ? -1 : 1);
    const s = C.shape(1.6);
    const r = L.r;
    if (L.hind) {
      // coxa grossa que sai da garupa, com o joelho (soldra) marcando à frente
      const mx = px + (kx - px) * 0.45 + 2.5;
      const my = py + (ky - py) * 0.45;
      s.chain([
        [px, py, r[0]],
        [mx, my, r[1]],
        [kx, ky, r[2]],
      ]);
      s.chain([
        [kx, ky, r[2]],
        [ex, ey, r[3]],
      ]);
    } else {
      // antebraço musculoso afinando até o joelho
      const mx = px + (kx - px) * 0.4;
      const my = py + (ky - py) * 0.4;
      s.chain([
        [px, py, r[0]],
        [mx, my, r[0] * 0.8],
        [kx, ky, r[1]],
        [ex, ey, r[2]],
      ]);
    }
    // quartela até o chão (inclinada para a frente quando apoiada)
    const tx = ex + (st.swing > 0.3 ? (L.hind ? -2 : -1.5) : 1.5);
    const ty = ey + (L.pastern ?? 2) + (st.swing > 0.3 ? -0.5 : 0);
    s.cone(ex, ey, r[3] ?? r[2] + 0.4, tx, ty, (r[3] ?? r[2]) * 0.9);
    return { s, ex, ey, tx, ty, kx, ky, swing: st.swing, footH, far };
  }

  /** Casco, pata ou garra no fim da perna. */
  function footShape(C, L, leg, o) {
    const { tx, ty, swing } = leg;
    const s = C.shape(1);
    if (L.foot === 'hoof') {
      const w = L.hoofW ?? 3;
      const lift = swing > 0.3;
      if (lift) s.poly([[tx - w, ty - 1], [tx + w - 1, ty - 1], [tx + w - 2, ty + 2.5], [tx - w - 1, ty + 2]]);
      else s.poly([[tx - w + 0.5, ty - 1], [tx + w - 1.5, ty - 1], [tx + w + 0.5, ty + 3], [tx - w, ty + 3]]);
    } else if (L.foot === 'talon') {
      s.cone(tx - 1, ty, 1.6, tx + 4, ty + 2, 0.9);
      s.cone(tx, ty, 1.4, tx - 3, ty + 2, 0.8);
    } else {
      const w = L.pawW ?? 3.6;
      s.ellipse(tx + 1.5, ty + 0.8, w, 2.2);
    }
    return s;
  }

  return { prim, smin, smax, Shape, Canvas, ik, stepCycle, sideLeg, footShape, len };
}
