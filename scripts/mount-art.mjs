// Montarias em pixel art, esculpidas por código.
//
// Cada parte do bicho (tronco+pescoço+cabeça, cada perna, cauda, crina, asas)
// é um campo de distância (SDF) feito de formas simples — círculos, elipses,
// cones arredondados e polígonos — unidas de forma SUAVE (sem "gomos" entre
// as peças, como se fosse argila). O campo dá a silhueta e também a normal de
// cada pixel: a luz vem de cima à esquerda, com luz refletida do chão por
// baixo e sombra projetada de uma parte sobre a outra. Marcas (barriga,
// manchas, listras, meias, armadura) são regiões pintadas com outra rampa de
// cor mas a MESMA luz da parte, então parecem estar na pele. Contorno seletivo:
// escuro embaixo, mais claro onde bate luz.
//
// As pernas têm esqueleto (ombro/quadril, joelho/jarrete, boleto) resolvido
// por cinemática inversa num ciclo de galope de 6 quadros.
//
// Folha: 21 montarias × (4 direções × 6 quadros) de 112×80 px de arte,
// exibidas a 0,5 (56×40 px do mundo). A sela fica sempre no centro do quadro.

export const FW = 112;
export const FH = 80;
const W = FW;
const H = FH;
const GROUND = 76;
const NF = 6;
const CX = W / 2;

// ------------------------------------------------------------------ cores
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
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
const shade = (c, k) => {
  const [h, s, l] = rgb2hsl(hex(c));
  return toHex(...hsl2rgb([h, s, Math.max(0, Math.min(1, l + k))]));
};
/**
 * Rampa de 6 tons: contorno, sombra funda, sombra, base, luz, brilho. As
 * sombras puxam o matiz para o azul/roxo e ganham saturação; as luzes puxam
 * para o amarelo e perdem um pouco de saturação.
 */
const RAMPS = new Map();
function ramp(base) {
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
    const tmp = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let m = 0;
        for (let k = Math.max(0, x - w); k <= Math.min(W - 1, x + w); k++) m = Math.max(m, t[y * W + k]);
        tmp[y * W + x] = m;
      }
    const loc = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let m = 0;
        for (let k = Math.max(0, y - w); k <= Math.min(H - 1, y + w); k++) m = Math.max(m, tmp[k * W + x]);
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

// ------------------------------------------------------------------ espécies (vista de lado, virado para a direita)
// coordenadas de arte; `saddle` é o x da sela (vai para o centro do quadro)
const SPECIES = {
  horse: {
    saddle: 49,
    torso: (s) => {
      s.circle(34, 41, 10.5).ellipse(48, 44, 15, 10.5).circle(63, 45, 9.5).circle(59, 37, 6.5).circle(38, 37, 7);
    },
    neck: [
      [61, 41, 8.5],
      [67, 31, 6.4],
      [72, 22, 5],
    ],
    crest: [
      [58, 35, 5.5],
      [70, 19, 4],
    ],
    head: (s) => {
      s.cone(72, 19, 5.2, 84, 30, 3.3).circle(74.5, 24, 4.6);
    },
    eye: [75, 21],
    muzzle: [83, 30, 3.6],
    ears: [
      [69, 15, 1.8, 69, 8.5, 0.6],
      [72, 15, 1.6, 73.5, 9.5, 0.5],
    ],
    front: { px: 63, py: 47, a: 12, b: 12, r: [5.4, 2.7, 2.1, 2.5], foot: 'hoof', stride: 20, lift: 9 },
    hind: { hind: true, px: 35, py: 45, a: 16, b: 11, r: [8.5, 5.2, 2.8, 2.1], foot: 'hoof', stride: 20, lift: 8 },
    tail: { kind: 'hair', pts: [[26, 35, 3.2], [19, 41, 3.8], [15, 51, 3.2], [15, 62, 2]] },
    belly: [48, 50, 13, 5],
    bob: 1,
  },
  stag: {
    saddle: 49,
    torso: (s) => {
      s.circle(35, 42, 9).ellipse(48, 44, 13.5, 9).circle(62, 44, 8.5).circle(59, 38, 6);
    },
    neck: [
      [61, 41, 7],
      [66, 31, 5],
      [70, 23, 4],
    ],
    crest: [[59, 37, 4.5], [68, 22, 3.4]],
    head: (s) => {
      s.cone(70, 21, 4.6, 81, 27, 2.4).circle(71.5, 23, 4);
    },
    eye: [73, 21.5],
    muzzle: [80.5, 26.5, 2.4],
    ears: [
      [68, 18, 1.8, 62, 14, 0.9],
      [70, 18, 1.6, 75, 13, 0.8],
    ],
    front: { px: 62, py: 47, a: 12.5, b: 12, r: [4.4, 2.1, 1.6, 1.9], foot: 'hoof', hoofW: 2.2, stride: 22, lift: 11 },
    hind: { hind: true, px: 36, py: 45, a: 16, b: 11.5, r: [7, 4.2, 2.2, 1.6], foot: 'hoof', hoofW: 2.2, stride: 22, lift: 10 },
    tail: { kind: 'stub', pts: [[26, 38, 3.2]] },
    belly: [48, 49, 12, 4],
    bob: 2,
  },
  bear: {
    saddle: 46,
    torso: (s) => {
      s.circle(30, 47, 13).ellipse(46, 46, 18, 13).circle(59, 44, 12.5).circle(55, 37, 8.5);
    },
    neck: [
      [65, 47, 10],
      [72, 50, 8],
    ],
    head: (s) => {
      s.circle(76, 49, 7.6).cone(77, 50, 6, 88, 53, 3.4);
    },
    eye: [79, 47],
    muzzle: [86, 53, 3.6],
    nose: [89, 51.5],
    roundEars: [
      [71, 42.5, 2.8],
      [75, 41.5, 2.6],
    ],
    front: { px: 62, py: 55, a: 10, b: 9, r: [7, 4.6, 4.2, 4.4], foot: 'paw', pawW: 4.6, stride: 15, lift: 6 },
    hind: { hind: true, px: 32, py: 54, a: 11, b: 9, r: [9.5, 7, 4.6, 4.2], foot: 'paw', pawW: 4.6, stride: 15, lift: 6 },
    tail: { kind: 'stub', pts: [[17, 42, 3]] },
    belly: [46, 55, 16, 5],
    bob: 1,
  },
  wolf: {
    saddle: 47,
    torso: (s) => {
      s.circle(32, 45, 8.5).ellipse(45, 46, 12, 7.5).circle(59, 47, 10).circle(57, 41, 7.5);
    },
    neck: [
      [62, 45, 8],
      [69, 37, 6.5],
    ],
    head: (s) => {
      s.circle(72.5, 35.5, 5.8).cone(74, 36, 4.4, 87, 40, 2.3).cone(75, 40, 2.6, 85, 42.5, 1.6);
    },
    eye: [75, 34],
    nose: [87.5, 38.5],
    pointEars: [
      [69, 31, 71.5, 22, 75, 30],
      [71.5, 30.5, 74.5, 22.5, 77, 30.5],
    ],
    ruff: true,
    front: { px: 60, py: 52, a: 11, b: 11, r: [5, 2.8, 2.2, 2.4], foot: 'paw', stride: 21, lift: 9 },
    hind: { hind: true, px: 32, py: 50, a: 14, b: 10, r: [7, 4.4, 2.6, 2.1], foot: 'paw', stride: 21, lift: 9 },
    tail: { kind: 'brush', pts: [[24, 41, 3], [16, 44, 4.4], [10, 50, 4], [8, 56, 2.2]] },
    belly: [46, 51, 12, 3.5],
    bob: 2,
  },
  cat: {
    saddle: 46,
    torso: (s) => {
      s.circle(30, 46, 9).ellipse(45, 47, 14.5, 8.5).circle(60, 46, 9.5).circle(58, 41, 7);
    },
    neck: [
      [63, 44, 7.5],
      [69, 40, 7],
    ],
    head: (s) => {
      s.circle(74.5, 40, 7).circle(80.5, 43.5, 4.2).ellipse(77, 46, 4.5, 2.5);
    },
    eye: [77, 38.5],
    nose: [84, 41.5],
    roundEars: [
      [70.5, 33.5, 2.5],
      [74.5, 33, 2.3],
    ],
    front: { px: 61, py: 53, a: 10.5, b: 10.5, r: [5.6, 3.2, 2.6, 2.9], foot: 'paw', pawW: 4, stride: 23, lift: 9 },
    hind: { hind: true, px: 31, py: 51, a: 13, b: 10, r: [8, 5, 2.8, 2.5], foot: 'paw', pawW: 4, stride: 23, lift: 9 },
    tail: { kind: 'long', pts: [[22, 43, 2.8], [13, 46, 2.4], [7, 41, 2.2], [6, 33, 2]] },
    belly: [45, 52, 13, 3.5],
    bob: 1,
  },
  rhino: {
    saddle: 46,
    torso: (s) => {
      s.circle(28, 47, 13.5).ellipse(45, 47, 19, 14).circle(61, 46, 13).circle(56, 37, 8.5);
    },
    neck: [
      [67, 48, 11],
      [74, 50, 9],
    ],
    head: (s) => {
      s.cone(75, 48, 9, 92, 57, 5).circle(78, 51, 8.2);
    },
    eye: [82, 47],
    pointEars: [[71, 42, 70, 33, 74.5, 41]],
    front: { px: 61, py: 58, a: 8, b: 8, r: [8, 6, 5.4, 5.6], foot: 'hoof', hoofW: 5, pastern: 1, stride: 13, lift: 5 },
    hind: { hind: true, px: 30, py: 58, a: 9, b: 8, r: [10.5, 7.5, 6, 5.4], foot: 'hoof', hoofW: 5, pastern: 1, stride: 13, lift: 5 },
    tail: { kind: 'thin', pts: [[15, 44, 1.6], [12, 55, 1]] },
    bob: 1,
  },
  boar: {
    saddle: 46,
    torso: (s) => {
      s.circle(30, 52, 10).ellipse(45, 50, 15, 10).circle(59, 47, 11.5).circle(56, 40, 7.5);
    },
    neck: [
      [66, 50, 9.5],
      [70, 52, 8.5],
    ],
    head: (s) => {
      s.cone(70, 50, 8.4, 86, 59, 4).circle(73, 53, 7);
    },
    eye: [76, 49],
    snout: [87, 58.5],
    pointEars: [[66, 43, 64, 34, 71, 42]],
    front: { px: 60, py: 58, a: 8, b: 8, r: [6.4, 4, 3, 3.2], foot: 'hoof', hoofW: 3, pastern: 1.5, stride: 13, lift: 5 },
    hind: { hind: true, px: 31, py: 59, a: 9, b: 7.5, r: [8, 5.4, 3.2, 2.8], foot: 'hoof', hoofW: 3, pastern: 1.5, stride: 13, lift: 5 },
    tail: { kind: 'thin', pts: [[20, 49, 1.4], [17, 56, 1.2]] },
    bob: 1,
  },
  raptor: {
    saddle: 47,
    biped: true,
    torso: (s) => {
      s.ellipse(49, 40, 12.5, 8.5, -0.28).circle(40, 42, 8.5).circle(57, 36, 6);
    },
    neck: [
      [58, 35, 5.4],
      [63, 26, 4.2],
      [67, 18, 4],
    ],
    head: (s) => {
      s.cone(66, 16, 5, 82, 20, 2.8).cone(68, 20, 3, 80, 22.5, 1.8);
    },
    eye: [70, 14.5],
    front: null,
    hind: { hind: true, px: 42, py: 46, a: 14, b: 13, r: [8.5, 5, 2.6, 2], foot: 'talon', pastern: 4, stride: 24, lift: 11, knee: 1 },
    arms: [[58, 41, 2.2], [62, 46, 1.6], [65, 48, 1]],
    tail: { kind: 'lizard', pts: [[36, 40, 7], [24, 42, 5], [13, 46, 3], [4, 48, 1.2]] },
    belly: [50, 46, 10, 3.5],
    bob: 2,
  },
  lizard: {
    saddle: 46,
    torso: (s) => {
      s.ellipse(46, 60, 17, 7.5).circle(30, 61, 7).circle(61, 60, 7.5);
    },
    neck: [
      [64, 60, 6.5],
      [72, 59, 5.5],
    ],
    head: (s) => {
      s.cone(72, 58.5, 6, 89, 61.5, 3.2).cone(73, 62, 4, 87, 63.5, 2.2);
    },
    eye: [77, 56],
    front: { px: 60, py: 63, a: 6.5, b: 6, r: [4, 3, 2.4, 2.6], foot: 'paw', pawW: 4, pastern: 1, stride: 14, lift: 5, sprawl: true },
    hind: { hind: true, px: 32, py: 63, a: 7, b: 6.5, r: [5, 3.6, 2.6, 2.4], foot: 'paw', pawW: 4, pastern: 1, stride: 14, lift: 5, sprawl: true },
    tail: { kind: 'lizard', pts: [[30, 61, 6.5], [18, 64, 4.6], [8, 66, 2.8], [2, 62, 1.2]] },
    belly: [46, 65, 16, 2.5],
    bob: 1,
  },
  griffin: {
    saddle: 46,
    torso: (s) => {
      s.circle(32, 45, 9.5).ellipse(46, 46, 14, 9).circle(60, 44, 10.5).circle(58, 38, 7);
    },
    neck: [
      [62, 40, 8],
      [67, 31, 6],
      [71, 24, 5.2],
    ],
    head: (s) => {
      s.circle(73.5, 22, 5.8).circle(70, 25, 4.5);
    },
    eye: [75, 20],
    beak: true,
    front: { px: 60, py: 51, a: 11, b: 11, r: [5.4, 2.6, 2, 2.2], foot: 'talon', stride: 21, lift: 9 },
    hind: { hind: true, px: 33, py: 50, a: 14, b: 10, r: [7.5, 4.6, 2.6, 2.2], foot: 'paw', stride: 21, lift: 9 },
    tail: { kind: 'long', pts: [[24, 42, 2.4], [15, 46, 2], [9, 44, 1.8], [6, 38, 1.8]], tuft: true },
    wings: 'feather',
    bob: 2,
  },
  dragon: {
    saddle: 46,
    torso: (s) => {
      s.circle(32, 46, 10.5).ellipse(47, 46, 15, 10.5).circle(61, 45, 11);
    },
    neck: [
      [63, 41, 8],
      [69, 31, 6],
      [75, 23, 5],
      [79, 17, 4.5],
    ],
    head: (s) => {
      s.cone(79, 15, 5.2, 95, 19, 2.8).cone(81, 19, 3.6, 93, 22.5, 2);
    },
    eye: [83, 13.5],
    horns: true,
    front: { px: 61, py: 53, a: 10, b: 10, r: [6.2, 3.8, 3, 3], foot: 'paw', pawW: 4, stride: 18, lift: 8 },
    hind: { hind: true, px: 33, py: 52, a: 13, b: 9.5, r: [9, 6, 3.4, 2.8], foot: 'paw', pawW: 4.2, stride: 18, lift: 8 },
    tail: { kind: 'lizard', pts: [[24, 44, 7], [14, 49, 5], [6, 56, 3.4], [3, 64, 2]], spade: true },
    belly: [48, 52, 14, 4.5],
    wings: 'bat',
    spikes: true,
    bob: 2,
  },
};
SPECIES.griffin.belly = null;

// ------------------------------------------------------------------ paletas e montarias
/** id, nome, espécie, cor, opções. */
export const MOUNT_DEFS = [
  ['bay', 'Cavalo Baio', 'horse', '#94582e', { mane: '#2a1810', socks: '#22160e', belly: '#b07a4a' }],
  ['black', 'Corcel Negro', 'horse', '#2e2b36', { mane: '#121016', blaze: '#e8e4dc', socks: '#e8e4dc' }],
  ['white', 'Égua Branca do Vale', 'horse', '#e8e3d8', { mane: '#c8bca8', muzzleCol: '#b8a8a0' }],
  ['pinto', 'Cavalo Malhado', 'horse', '#ece4d4', { mane: '#3a2414', spots: '#7a4a28' }],
  ['war', 'Corcel de Guerra', 'horse', '#6a4426', { mane: '#1c120c', barding: '#9aa4b6', cloth: '#2e4ea0', trim: '#e8c04a' }],
  ['unicorn', 'Unicórnio Lunar', 'horse', '#f2f0fa', { mane: '#a890ff', mane2: '#80dcff', horn: '#ffe08a', glow: 0xbfa8ff, hoofCol: '#c8b8ff' }],
  ['nightmare', 'Pesadelo Flamejante', 'horse', '#2a2430', { fire: '#ff7a1a', fire2: '#ffe060', eyes: '#ff4a1a', hoofFire: true, glow: 0xff6a1a }],
  ['bear', 'Urso Pardo de Batalha', 'bear', '#6e4a2e', { barding: '#8c96a8', cloth: '#a8322a', trim: '#e8c04a', muzzleCol: '#a07850' }],
  ['polar', 'Urso Polar Rúnico', 'bear', '#e8eef4', { runes: '#4ab0ff', glow: 0x7ac8ff }],
  ['wolf', 'Lobo Gigante', 'wolf', '#7a7a86', { belly: '#cacad0', back: '#4a4a56' }],
  ['frostwolf', 'Lobo da Geada', 'wolf', '#b0d4ee', { belly: '#f0faff', back: '#7aaad8', runes: '#ffffff', glow: 0x9fe8ff }],
  ['rhino', 'Rinoceronte Couraçado', 'rhino', '#8c867a', { barding: '#8c96a8', cloth: '#6a4a2a', trim: '#c8a050' }],
  ['boar', 'Javali de Presas', 'boar', '#5e4434', { mane: '#2a1a12', tusk: '#f2ead6' }],
  ['stag', 'Cervo Espiritual', 'stag', '#8ee4ff', { antler: '#f0fcff', glow: 0x7ae8ff, ghost: true, belly: '#d8f8ff', sparkle: '#ffffff' }],
  ['sabre', 'Tigre-Dente-de-Sabre', 'cat', '#de8a2c', { stripes: '#2a1a0e', belly: '#f4e6c8', fangs: '#f6f0e0' }],
  ['panther', 'Pantera das Sombras', 'cat', '#2c2436', { eyes: '#d080ff', runes: '#9a5aff', glow: 0x9a4aff }],
  ['raptor', 'Raptor do Deserto', 'raptor', '#d6ae6e', { stripes: '#8a5a2a', belly: '#f0dcb0', crest: '#c84a2a' }],
  ['salamander', 'Salamandra de Lava', 'lizard', '#c43e1c', { fire: '#ffb030', fire2: '#ffe880', belly: '#ff9a3a', cracks: '#ffd060', glow: 0xff5a1a }],
  ['griffin', 'Grifo Real', 'griffin', '#c89c4e', { head: '#f6f2ea', wing: '#a8783a', beak: '#f0b030' }],
  ['emerald', 'Dragão Esmeralda', 'dragon', '#3c9a5a', { wing: '#24563a', membrane: '#7acc8a', horn: '#ece4c8', belly: '#c8e0a0' }],
  ['ruby', 'Dragão Rubro', 'dragon', '#b8302a', { wing: '#5a1414', membrane: '#e8584a', horn: '#ffe08a', belly: '#f0c070', fire: '#ffb030', glow: 0xff4a2a }],
];

// ------------------------------------------------------------------ vista de lado
const FUR_ANG = { horse: 0.35, stag: 0.35, bear: 0.6, wolf: 0.5, cat: 0.5, rhino: 0, boar: 0.6, raptor: 0, lizard: 0, griffin: 0.4, dragon: 0 };

function drawSide(C, sp, base, o, f) {
  const S = SPECIES[sp];
  const phi = f / NF;
  const bob = Math.round(Math.sin(phi * Math.PI * 4) * (S.bob ?? 1) * 0.5);
  const R = ramp(base);
  const Rd = ramp(shade(base, -0.13));
  const legR = o.ghost ? R : R;
  const legs = S.biped
    ? [
        { L: S.hind, ph: 0.5, far: true },
        { L: S.hind, ph: 0, far: false },
      ]
    : [
        { L: S.hind, ph: 0.1, far: true },
        { L: S.front, ph: 0.5, far: true },
        { L: S.hind, ph: 0, far: false },
        { L: S.front, ph: 0.62, far: false },
      ];
  const hoofR = ramp(o.hoofCol ?? (o.hoofFire ? '#3a2018' : '#3a3036'));
  const drawLeg = (L, ph, far) => {
    const lg = sideLeg(C, L, phi + ph, far ? (L.hind ? 3 : -2) : 0, far ? bob - 1 : bob, far);
    const mask = C.sculpt(lg.s, far ? Rd : legR, { R: 5, bright: far ? -0.08 : 0 });
    if (o.socks && sp === 'horse') {
      const sk = C.shape(1).circle(lg.ex, lg.ey + 1, 3.4).cone(lg.ex, lg.ey, 2.6, lg.ex, lg.ey - 5, 2.4);
      C.tint(mask, sk, ramp(far ? shade(o.socks, -0.1) : o.socks));
    }
    if (S.biped || sp === 'griffin' && !L.hind) {
      // canela escamada (raptor e garras do grifo)
      const sc = C.shape(1).cone(lg.kx, lg.ky + 1, 3, lg.tx, lg.ty, 2.5);
      C.tint(mask, sc, ramp(sp === 'griffin' ? '#e0a830' : shade(base, -0.05)));
    }
    const ft = footShape(C, L, lg, o);
    const fr = L.foot === 'hoof' ? hoofR : L.foot === 'talon' ? ramp(sp === 'griffin' ? '#e0a830' : shade(base, -0.1)) : far ? Rd : legR;
    C.sculpt(ft, fr, { R: 3, line: L.foot === 'hoof', cast: false });
    if (L.foot === 'paw' || L.foot === 'talon') {
      // garras
      const cx = lg.tx + (L.foot === 'talon' ? 4 : 4.5);
      C.px(cx, lg.ty + 2, '#1a1418');
      if (L.foot === 'paw' && (sp === 'dragon' || sp === 'bear' || sp === 'lizard')) C.px(cx - 2, lg.ty + 2.5, '#efe6d0');
    }
    if (o.hoofFire && L.foot === 'hoof') {
      const t = (f + (far ? 1 : 0)) % 2;
      C.px(lg.tx - 3, lg.ty + 1 - t, o.fire, 2, 2);
      C.px(lg.tx + 1, lg.ty - t, o.fire2);
    }
    return lg;
  };

  // asa de lá
  if (S.wings) drawWingSide(C, S, o, phi, bob, true);
  // cauda de crina (atrás de tudo)
  if (S.tail.kind === 'hair' || S.tail.kind === 'long' || S.tail.kind === 'brush' || S.tail.kind === 'thin') drawTailSide(C, S, R, o, phi, bob);
  // orelha de lá
  if (S.ears) {
    const [x0, y0, r0, x1, y1, r1] = S.ears[1];
    C.sculpt(C.shape(1).cone(x0, y0 + bob, r0, x1, y1 + bob, r1), Rd, { R: 2 });
  }
  if (S.pointEars && S.pointEars[1]) C.sculpt(C.shape(0.6).poly(tri(S.pointEars[1], bob)), Rd, { R: 2 });
  if (S.roundEars) C.sculpt(C.shape(1).circle(S.roundEars[1][0], S.roundEars[1][1] + bob, S.roundEars[1][2]), Rd, { R: 2 });
  // pernas de lá
  for (const l of legs) if (l.far) drawLeg(l.L, l.ph, true);
  // tronco + pescoço + cabeça (+ cauda de lagarto): uma peça só
  const body = C.shape(4);
  const torsoS = C.shape(4);
  S.torso(torsoS);
  body.ops.push(...torsoS.ops.map((op) => ({ ...op, p: shift(op.p, bob) })));
  const nk = S.neck.map(([x, y, r]) => [x, y + bob, r]);
  body.chain(nk, 4);
  if (S.crest) body.chain(S.crest.map(([x, y, r]) => [x, y + bob, r]), 3);
  const head = C.shape(2.5);
  S.head(head);
  body.ops.push(...head.ops.map((op) => ({ ...op, k: 3, p: shift(op.p, bob) })));
  if (S.tail.kind === 'lizard') {
    const sway = Math.sin(phi * Math.PI * 2) * 1.6;
    body.chain(S.tail.pts.map(([x, y, r], i) => [x, y + bob + (i ? sway * i * 0.6 : 0), r]), 4);
  }
  if (S.tail.kind === 'stub') body.add(prim.circle(S.tail.pts[0][0], S.tail.pts[0][1] + bob, S.tail.pts[0][2]), 2);
  const regions = [];
  if (S.belly && (o.belly || sp === 'dragon' || sp === 'raptor' || sp === 'lizard')) {
    const [bx, by, rx, ry] = S.belly;
    const bs = C.shape(3).ellipse(bx, by + bob + ry * 0.6, rx, ry * 1.6);
    if (sp === 'dragon' || sp === 'raptor' || sp === 'lizard') bs.chain(nk.map(([x, y, r], i) => [x + r * 0.5, y + r * 0.6, r * 0.55]), 2);
    regions.push([bs, ramp(o.belly ?? shade(base, 0.2)), 0.3]);
  }
  if (sp === 'griffin') {
    const hs = C.shape(3).chain(nk.map(([x, y, r]) => [x, y, r + 1]), 3).circle(73.5, 22 + bob, 7).circle(62, 44 + bob, 9);
    regions.push([hs, ramp(o.head)]);
  }
  if (o.back) regions.push([C.shape(3).ellipse(44, 37 + bob, 16, 4.5).cone(58, 38 + bob, 4, 68, 32 + bob, 3), ramp(o.back), 0.2]);
  if (o.muzzleCol || sp === 'horse' || sp === 'bear' || sp === 'stag') {
    const mz = S.muzzle ? C.shape(2).circle(S.muzzle[0], S.muzzle[1] + bob, S.muzzle[2]) : C.shape(2).circle(87, 53 + bob, 3.6);
    regions.push([mz, ramp(o.muzzleCol ?? shade(base, sp === 'bear' ? 0.12 : -0.06)), 0.2]);
  }
  if (o.spots) {
    const sp2 = C.shape(2.5);
    for (const [x, y, r] of [[38, 40, 6], [50, 47, 5.5], [30, 48, 4.5], [57, 38, 3.5], [66, 30, 3], [44, 52, 3]]) sp2.ellipse(x, y + bob, r * 1.2, r);
    regions.push([sp2, ramp(o.spots)]);
  }
  if (o.barding) {
    const bd = C.shape(2);
    if (sp === 'horse') bd.chain(nk.map(([x, y, r]) => [x, y, r + 1]), 2).circle(63, 45 + bob, 10);
    else if (sp === 'bear') bd.ellipse(57, 40 + bob, 10, 9);
    else bd.ellipse(46, 39 + bob, 21, 8.5).ellipse(62, 42 + bob, 9, 9).circle(80, 46 + bob, 5.5);
    regions.push([bd, ramp(o.barding)]);
  }
  const bodyMask = C.sculpt(body, R, { R: 10, regions });
  if (FUR_ANG[sp] && !o.barding && !o.ghost) C.streaks(bodyMask, FUR_ANG[sp], 9, 0, 0);
  // listras de tigre, raptor
  if (o.stripes) {
    const st = C.shape(0.5);
    const xs = sp === 'raptor' ? [34, 40, 46, 52, 58] : [24, 30, 36, 42, 48, 54, 60, 66];
    for (const x of xs) st.poly([[x - 1.2, 34 + bob], [x + 1.2, 34 + bob], [x + 2.5, 44 + bob], [x + 0.6, 52 + bob], [x - 0.4, 44 + bob]]);
    for (let i = 0; i < bodyMask.length; i++) if (!bodyMask[i]) continue;
    C.tint(bodyMask, st, ramp(o.stripes), -1);
    if (sp === 'cat') C.tint(bodyMask, C.shape(0.5).poly([[70, 34 + bob], [72, 34 + bob], [73, 39 + bob]]).poly([[76, 33 + bob], [78, 33 + bob], [77, 38 + bob]]), ramp(o.stripes), -1);
  }
  if (o.barding) bardingSide(C, S, sp, o, bob, bodyMask);
  if (o.runes) runesSide(C, sp, o, bob, f);
  if (o.cracks) for (const [x0, y0, x1, y1] of [[36, 58, 42, 61], [42, 61, 46, 58], [50, 57, 55, 60], [58, 58, 62, 61], [26, 60, 30, 63]]) C.line(x0, y0 + bob, x1, y1 + bob, (f + x0) % 3 ? o.cracks : o.fire2);
  // espinhos (dragão) e brasas (salamandra) ao longo das costas
  if (S.spikes) spikesSide(C, S, o, bob, body);
  if (o.fire && sp === 'lizard') fireBackSide(C, o, bob, f, body);
  if (sp === 'boar') bristles(C, o, bob);
  // orelha de cá, chifres
  if (S.ears) {
    const [x0, y0, r0, x1, y1, r1] = S.ears[0];
    C.sculpt(C.shape(1).cone(x0, y0 + bob, r0, x1, y1 + bob, r1), R, { R: 2 });
  }
  if (S.pointEars) C.sculpt(C.shape(0.6).poly(tri(S.pointEars[0], bob)), R, { R: 2.5 });
  if (S.roundEars) {
    const [x, y, r] = S.roundEars[0];
    C.sculpt(C.shape(1).circle(x, y + bob, r), R, { R: 2 });
    C.px(x - 0.5, y + bob, R[1]);
  }
  // crina
  if (S.crest && !o.fire && o.mane) maneSide(C, S, o, nk, bob, phi);
  if (sp === 'wolf' || sp === 'griffin') ruffSide(C, sp, o, nk, bob, phi, base);
  if (sp === 'boar' && o.mane) {
    /* cerdas já desenhadas */
  }
  // sela
  saddleSide(C, S, o, bob, body);
  // pernas de cá
  for (const l of legs) if (!l.far) drawLeg(l.L, l.ph, false);
  if (S.arms) {
    const a = C.shape(1).chain(S.arms.map(([x, y, r]) => [x, y + bob, r]));
    C.sculpt(a, R, { R: 2 });
  }
  // cabeça: olho, focinho, chifres…
  headDetails(C, sp, S, o, base, bob, f);
  if (S.wings) drawWingSide(C, S, o, phi, bob, false);
  if (o.fire && sp === 'horse') fireManeSide(C, S, o, nk, bob, f);
  if (o.fire && sp === 'horse') fireTailSide(C, o, bob, f);
  if (o.sparkle) for (const [x, y] of [[30, 30], [62, 18], [44, 58], [76, 40]]) if ((x + f * 3) % 4 < 2) C.px(x + ((f * 7) % 5), y + bob - (f % 3), o.sparkle);
}

const tri = (t, bob) => [
  [t[0], t[1] + bob],
  [t[2], t[3] + bob],
  [t[4], t[5] + bob],
];
/** Desloca uma forma pronta verticalmente (balanço do corpo). */
function shift(p, dy) {
  if (!dy) return p;
  return { bb: [p.bb[0], p.bb[1] + dy, p.bb[2], p.bb[3] + dy], f: (x, y) => p.f(x, y - dy) };
}

function drawTailSide(C, S, R, o, phi, bob) {
  const sway = Math.sin(phi * Math.PI * 2) * 2.2;
  const pts = S.tail.pts.map(([x, y, r], i) => [x + (i ? sway * i * 0.5 : 0) - (i > 1 ? Math.cos(phi * Math.PI * 2) * i * 0.6 : 0), y + bob, r]);
  const s = C.shape(2.5).chain(pts, 2.5);
  if (S.tail.kind === 'hair') {
    // mechas extras abrindo no fim
    const [ex, ey] = pts[pts.length - 1];
    s.cone(pts[1][0], pts[1][1], 3, ex - 3, ey + 2, 1.4).cone(pts[1][0], pts[1][1], 2.8, ex + 2.5, ey + 1, 1.4);
    const col = o.fire ? '#3a2030' : o.mane ?? R[1];
    const m = C.sculpt(s, ramp(col), { R: 4 });
    C.streaks(m, 1.35, 2.6, 1, phi * 4);
    if (o.mane2) C.streaks(m, 1.35, 5, 0, 1), tintStreak(C, m, o.mane2, 1.35, 5);
  } else if (S.tail.kind === 'brush') {
    s.circle(pts[2][0], pts[2][1], 4.6);
    const m = C.sculpt(s, ramp(shade(o.back ?? R[3], 0)), { R: 4.5 });
    C.streaks(m, 0.9, 3, 1, 0);
    const tip = C.shape(1.5).circle(pts[3][0], pts[3][1], 2.6);
    C.tint(m, tip, ramp(o.belly ?? R[4]));
  } else if (S.tail.kind === 'long') {
    const m = C.sculpt(s, R, { R: 3 });
    if (S.tail.tuft) {
      const [tx, ty] = pts[pts.length - 1];
      const t = C.shape(1.5).ellipse(tx, ty - 2, 3, 4.2);
      const tm = C.sculpt(t, ramp(shade(o.head ? '#7a5428' : R[2], 0)), { R: 3 });
      C.streaks(tm, 1.6, 2, 1, 0);
    } else if (o.stripes) for (let i = 1; i < pts.length; i++) C.px(pts[i][0] - 1, pts[i][1] - 2, o.stripes, 2, 4);
    void m;
  } else if (S.tail.kind === 'thin') {
    C.sculpt(s, R, { R: 2 });
    const [tx, ty] = pts[pts.length - 1];
    C.sculpt(C.shape(1).ellipse(tx, ty + 1.5, 1.6, 2.6), ramp(o.mane ?? R[1]), { R: 2 });
  }
}

function tintStreak(C, mask, col, ang, gap) {
  const r = ramp(col);
  const rid = C.rampId(r);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      const u = (x - C.ox) * -s + y * c;
      if (((u % gap) + gap) % gap < 2) C.rid[i] = rid;
    }
}

function maneSide(C, S, o, nk, bob, phi) {
  // crina caindo do alto do pescoço, ondulando com o galope
  const s = C.shape(2);
  const n = nk.length;
  const a = S.crest[0];
  const b = S.crest[S.crest.length - 1];
  const flow = Math.sin(phi * Math.PI * 2) * 1.2;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + bob + (b[1] - a[1]) * t;
    const r = a[2] + (b[2] - a[2]) * t;
    s.cone(x + 0.5, y - r + 1.2, 2.6, x - 4.5 + flow * (1 - t), y - r * 0.2 + 4, 1.2);
  }
  // topete
  s.cone(b[0] + 1, b[1] + bob - b[2] + 1, 2.4, b[0] + 5, b[1] + bob + 2, 1.2);
  void n;
  const m = C.sculpt(s, ramp(o.mane), { R: 3, bright: 0.04 });
  C.streaks(m, 1.1, 2.4, 1, phi * 3);
  if (o.mane2) tintStreak(C, m, o.mane2, 1.1, 5);
}

function ruffSide(C, sp, o, nk, bob, phi, base) {
  // juba/coleira de pelo (lobo) ou penas do pescoço (grifo)
  const s = C.shape(1.5);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = nk[0][0] + (nk[nk.length - 1][0] - nk[0][0]) * t;
    const y = nk[0][1] + (nk[nk.length - 1][1] - nk[0][1]) * t;
    s.cone(x, y, sp === 'wolf' ? 3.4 : 3, x - 3, y + 6 + (i % 2), 1.2);
  }
  const col = sp === 'griffin' ? o.head : o.belly ?? shade(base, 0.12);
  const m = C.sculpt(s, ramp(col), { R: 3, line: false });
  C.streaks(m, 1.2, 2.5, 1, 0);
}

function saddleSide(C, S, o, bob, body) {
  const x = S.saddle;
  const top = body.top(x) - 0.5;
  const cloth = ramp(o.cloth ?? '#8a2a1e');
  // manta
  const bl = C.shape(1).poly([
    [x - 10, top + 1],
    [x + 9, top + 0.5],
    [x + 8, top + 10],
    [x - 9, top + 10.5],
  ]);
  const bm = C.sculpt(bl, cloth, { R: 3, flat: 0.25 });
  void bm;
  for (let k = -9; k <= 8; k += 2) C.px(x + k, top + 10, o.trim ?? '#e8c04a');
  // assento com arção e patilha
  const seat = C.shape(1.5).poly([
    [x - 8, top + 2],
    [x - 7.5, top - 2.5],
    [x - 4, top + 0.5],
    [x + 3, top + 0.5],
    [x + 6.5, top - 3],
    [x + 7.5, top + 2.5],
  ]);
  C.sculpt(seat, ramp('#7a4422'), { R: 3 });
  // barrigueira e estribo
  C.line(x - 1, top + 3, x - 1, top + 13, '#3a2414');
  C.px(x - 2.5, top + 13, '#c8c8d0', 4, 1);
  C.px(x - 2.5, top + 14, '#8a8a98', 4, 1);
  C.px(x + 4, top - 1, '#e8c04a');
}

function bardingSide(C, S, sp, o, bob, mask) {
  // placas: juntas escuras e rebites dourados por cima do aço
  const steel = ramp(o.barding);
  const sx = sp === 'horse' ? [56, 61, 66, 70] : sp === 'bear' ? [52, 58, 63] : [56, 62, 68];
  for (const x of sx)
    for (let y = 0; y < H; y++) {
      const i = y * W + Math.round(x + C.ox);
      if (mask[i] && C.rid[i] === C.rampId(steel)) C.idx[i] = 1;
    }
  for (const x of sx) C.px(x + 2, (sp === 'horse' ? 40 : 44) + bob, o.trim);
  if (sp === 'rhino') {
    for (const x of [30, 38, 46]) C.line(x, 33 + bob, x - 1, 46 + bob, steel[1]);
    for (const x of [26, 34, 42, 50]) C.px(x, 44 + bob, o.trim);
    return;
  }
  // caparazão (pano) cobrindo o tronco, borda recortada
  const x0 = sp === 'horse' ? 24 : sp === 'bear' ? 18 : 18;
  const x1 = sp === 'horse' ? 56 : sp === 'bear' ? 52 : 54;
  const y0 = (sp === 'horse' ? 38 : sp === 'bear' ? 40 : 40) + bob;
  const y1 = (sp === 'horse' ? 54 : sp === 'bear' ? 60 : 62) + bob;
  const s = C.shape(2).poly([
    [x0 + 2, y0],
    [x1, y0 - 1],
    [x1 + 2, y1 - 2],
    [x0, y1],
  ]);
  for (let x = x0 + 2; x < x1; x += 5) s.sub(prim.circle(x + 2.5, y1 + 1.8, 2.2), 0.5);
  const cm = C.sculpt(s, ramp(o.cloth), { R: 5, flat: 0.15 });
  // brasão: losango dourado
  const cxm = (x0 + x1) / 2;
  const cym = (y0 + y1) / 2 + 1;
  C.tint(cm, C.shape(0.5).poly([[cxm, cym - 4], [cxm + 3.5, cym], [cxm, cym + 4], [cxm - 3.5, cym]]), ramp(o.trim));
  for (let x = x0 + 1; x <= x1 + 1; x += 2) C.px(x, y1 - 3 + ((x - x0) * -0.03), o.trim);
}

function runesSide(C, sp, o, bob, f) {
  const pts = sp === 'bear' ? [[40, 42], [50, 40], [30, 46], [60, 46]] : sp === 'cat' ? [[38, 42], [48, 42], [58, 42]] : [[36, 42], [46, 43], [56, 44]];
  pts.forEach(([x, y], k) => {
    const on = (k + f) % 3 !== 0;
    const c = on ? o.runes : shade(o.runes, -0.2);
    C.px(x, y + bob - 2, c, 1, 5);
    C.px(x - 1, y + bob, c, 3, 1);
    C.px(x + (k % 2 ? 1 : -1), y + bob - 2, c);
  });
}

function spikesSide(C, S, o, bob, body) {
  const s = C.shape(0.6);
  const pts = [];
  for (let x = 6; x <= 80; x += 5) {
    const y = body.top(x);
    if (y >= H) continue;
    if (x > 66 && x < 74) continue;
    pts.push([x, y]);
  }
  for (const [x, y] of pts) {
    const h = x < 20 ? 3 : x > 60 ? 3.5 : 4.5;
    s.poly([[x - 2.2, y + 2], [x + 0.5, y - h], [x + 2.2, y + 2]]);
  }
  C.sculpt(s, ramp(o.horn ?? '#e8e0c8'), { R: 2, cast: false });
  void bob;
}

function fireBackSide(C, o, bob, f, body) {
  for (let x = 14; x <= 68; x += 4) {
    const y = body.top(x);
    if (y >= H) continue;
    const h = 2 + ((x / 4 + f) % 3);
    for (let k = 0; k < h; k++) C.px(x - (k > 1 ? 1 : 0), y - 1 - k, k < 1 ? o.fire : k < h - 1 ? o.fire2 : '#fff8d0', 2, 1);
  }
  void bob;
}

function bristles(C, o, bob) {
  for (let k = 0; k < 14; k++) {
    const x = 36 + k * 2.2;
    const y = 41 + bob - Math.sin((k / 13) * Math.PI) * 4 - (k > 9 ? (k - 9) * 0.5 : 0);
    C.px(x, y - 2 - (k % 2), o.mane, 1, 3);
  }
}

function fireManeSide(C, S, o, nk, bob, f) {
  const a = S.crest[0];
  const b = S.crest[1];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + bob + (b[1] - a[1]) * t - (a[2] + (b[2] - a[2]) * t) + 1;
    const h = 3 + ((i + f) % 3) * 2;
    for (let k = 0; k < h; k++) C.px(x - k * 0.8, y - k, k < 2 ? o.fire : k < h - 1 ? o.fire2 : '#fff6c8', 2, 1);
  }
  void nk;
}

function fireTailSide(C, o, bob, f) {
  for (let i = 0; i < 12; i++) {
    const x = 24 - i * 0.9 + Math.sin((i + f) * 1.3) * 1.5;
    const y = 36 + bob + i * 2;
    C.px(x - 1, y, i % 3 ? o.fire : o.fire2, 3, 2);
    if ((i + f) % 3 === 0) C.px(x - 3, y - 1, o.fire2);
  }
}

function headDetails(C, sp, S, o, base, bob, f) {
  const [ex, ey] = S.eye;
  const y = ey + bob;
  // olho com brilho
  if (o.eyes) {
    C.px(ex, y, o.eyes, 2, 2);
    C.px(ex + 1, y, '#ffe8c0');
  } else {
    C.px(ex, y, '#141018', 2, 2);
    C.px(ex + 1, y, '#f4f0e8');
  }
  if (sp === 'horse' || sp === 'stag') {
    const [mx, my] = S.muzzle;
    C.px(mx + 1, my + bob - 1.5, '#1e1418');
    C.line(mx - 3, my + bob + 2.2, mx + 1, my + bob + 2.2, shade(base, -0.3));
    if (o.blaze) C.line(ex + 2, y - 2, mx, my + bob - 2.5, o.blaze), C.line(ex + 3, y - 2, mx + 1, my + bob - 2.5, o.blaze);
  }
  if (S.nose) C.px(S.nose[0] - 1, S.nose[1] + bob, '#141018', 2, 2);
  if (sp === 'bear') C.line(84, 55.5 + bob, 88, 55 + bob, '#3a2418');
  if (sp === 'wolf') C.line(78, 41.5 + bob, 85, 41 + bob, '#2a2028');
  if (sp === 'cat') {
    C.px(84, 41.5 + bob, '#3a2020', 2, 1);
    C.line(80, 45.5 + bob, 83, 45 + bob, '#3a2020');
    if (o.fangs) {
      C.line(80, 46 + bob, 80, 52 + bob, o.fangs);
      C.line(81, 46 + bob, 81, 50 + bob, o.fangs);
      C.px(80, 52 + bob, '#c8bca8');
    }
    // bigodes
    C.px(85, 44 + bob, '#f0e8d8');
    C.px(86, 45 + bob, '#f0e8d8');
  }
  if (sp === 'rhino') {
    // chifre grande e o pequeno, curvos
    const h = C.shape(1).chain([[89, 53 + bob, 3.6], [92, 46 + bob, 2.4], [93, 39 + bob, 0.8]]).chain([[82, 49 + bob, 2.4], [83.5, 44 + bob, 1.4], [84, 41 + bob, 0.5]]);
    C.sculpt(h, ramp('#e8dcc0'), { R: 2.5 });
    C.line(86, 58 + bob, 91, 58 + bob, '#3a3430');
    // dobras da pele
    for (const [x0, y0, x1, y1] of [[54, 36, 52, 58], [36, 36, 38, 58], [70, 42, 70, 56]]) C.line(x0, y0 + bob, x1, y1 + bob, ramp(base)[1]);
  }
  if (sp === 'boar') {
    const [sx, sy] = S.snout;
    C.sculpt(C.shape(1).ellipse(sx, sy + bob, 2, 3.4), ramp('#c8887a'), { R: 2 });
    C.px(sx, sy + bob - 1, '#3a1a18');
    C.px(sx, sy + bob + 1, '#3a1a18');
    const t = C.shape(0.8).chain([[83, 61 + bob, 1.4], [86, 58 + bob, 1.2], [87, 54 + bob, 0.6]]);
    C.sculpt(t, ramp(o.tusk), { R: 1.5 });
  }
  if (sp === 'raptor') {
    C.line(70, 20.5 + bob, 81, 21 + bob, '#3a2418');
    for (let k = 0; k < 4; k++) C.px(72 + k * 2.5, 21.5 + bob, '#f6f0e0');
    if (o.crest) {
      const c = C.shape(0.6);
      for (let k = 0; k < 5; k++) c.poly([[64 - k * 2.5, 13 + bob + k * 0.8], [62 - k * 2.5, 6 + bob + k * 1.5], [66 - k * 2.5, 12 + bob + k]]);
      C.sculpt(c, ramp(o.crest), { R: 2 });
    }
  }
  if (sp === 'lizard') {
    C.line(76, 62 + bob, 87, 62.5 + bob, '#2a1010');
    C.px(87, 59 + bob, '#2a1010');
    if (o.fire && f % 2) C.px(90, 61 + bob, o.fire2, 2, 1);
  }
  if (S.beak) {
    const bk = C.shape(0.8).poly([[77, 18 + bob], [83, 18.5 + bob], [87.5, 21.5 + bob], [87, 25.5 + bob], [84.5, 23.5 + bob], [78, 25.5 + bob]]);
    C.sculpt(bk, ramp(o.beak), { R: 2.5 });
    C.line(78, 23 + bob, 84, 22.5 + bob, shade(o.beak, -0.3));
    // penas do alto da cabeça
    const fe = C.shape(0.8).cone(70, 19 + bob, 2, 64, 15 + bob, 0.8).cone(70, 21 + bob, 2, 64, 19 + bob, 0.8);
    C.sculpt(fe, ramp(o.head), { R: 2 });
    C.px(76, 19 + bob, '#141018', 2, 2);
    C.px(77, 19 + bob, '#ffd040');
  }
  if (S.horns) {
    const h = C.shape(0.8).chain([[80, 11 + bob, 2.2], [75, 6 + bob, 1.6], [70, 5 + bob, 0.6]]).chain([[83, 11 + bob, 1.8], [80, 4 + bob, 1.1], [77, 1.5 + bob, 0.4]]);
    C.sculpt(h, ramp(o.horn), { R: 2 });
    C.px(93, 17 + bob, '#141018');
    C.line(84, 21 + bob, 93, 20.5 + bob, '#2a1010');
    for (let k = 0; k < 3; k++) C.px(86 + k * 2.5, 21.5 + bob, '#f6f0e0');
    if (o.fire && f % 3 !== 2) {
      C.px(96, 19 + bob, o.fire, 2, 2);
      C.px(98, 18 + bob - (f % 2), o.fire2, 2, 2);
    }
    // sobrancelha
    C.line(81, 12 + bob, 85, 12.5 + bob, shade(base, -0.3));
  }
  if (o.horn && sp === 'horse') {
    const h = C.shape(0.6).cone(74, 15 + bob, 1.8, 81, 3 + bob, 0.4);
    C.sculpt(h, ramp(o.horn), { R: 2, bright: 0.1 });
    for (let k = 0; k < 3; k++) C.px(75.5 + k * 2, 12 + bob - k * 3.5, shade(o.horn, -0.25));
  }
  if (sp === 'stag') antlersSide(C, o, bob);
}

function antlersSide(C, o, bob) {
  const s = C.shape(0.8);
  const branch = (pts, r0, r1) => s.chain(pts.map(([x, y], i) => [x, y + bob, r0 + ((r1 - r0) * i) / (pts.length - 1)]), 0.8);
  branch([[71, 17], [68, 10], [63, 4], [56, 1]], 1.4, 0.6);
  branch([[68, 10], [70, 3]], 1, 0.5);
  branch([[63, 4.5], [63, -1]], 0.9, 0.4);
  branch([[73, 17], [76, 10], [76, 3]], 1.3, 0.5);
  branch([[76, 10], [81, 7]], 0.9, 0.4);
  const m = C.sculpt(s, ramp(o.antler), { R: 1.5, bright: 0.15 });
  void m;
}

/**
 * Asa erguida. Desenho num referencial local (u = para trás/para fora,
 * v = para cima) a partir do ombro; `toX` converte u em x da vista e o
 * bater de asas gira tudo em torno do ombro.
 */
function wing(C, kind, o, sx, sy, toX, flapA, dark, forward = true, vs = 1, swept = false) {
  const ca = Math.cos(flapA);
  const sa = Math.sin(flapA);
  const P = (u, v) => {
    const ru = u * ca - v * sa;
    const rv = u * sa + v * ca;
    return [sx + toX(ru), sy - rv * vs];
  };
  const bat = kind === 'bat';
  const S = P(0, 0);
  const E = swept ? P(10, 12) : P(5, 14);
  const Wr = swept ? P(17, 24) : P(1, 26);
  const T1 = swept ? P(13, 29) : forward ? P(-6, 30) : P(0, 31);
  const T2 = swept ? P(35, 31) : bat ? P(11, 35) : P(10, 35);
  const T3 = swept ? P(45, 20) : bat ? P(24, 30) : P(25, 29);
  const T4 = swept ? P(46, 6) : bat ? P(32, 17) : P(33, 14);
  const B = swept ? P(24, -3) : bat ? P(21, 0) : P(17, -1);
  if (kind === 'bat') {
    const mem = C.shape(1).poly([S, E, Wr, T2, T3, T4, B]);
    // recortes em arco entre os dedos
    for (const [a, b] of [[T2, T3], [T3, T4], [T4, B]]) {
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const dx = mx - Wr[0];
      const dy = my - Wr[1];
      const dl = len(dx, dy) || 1;
      mem.sub(prim.circle(mx + (dx / dl) * 1.5, my + (dy / dl) * 1.5, len(b[0] - a[0], b[1] - a[1]) * 0.4), 0.8);
    }
    const mr = ramp(dark ? shade(o.membrane, -0.16) : o.membrane);
    const mm = C.sculpt(mem, mr, { R: 8, flat: 0.35, line: !dark, cast: !dark });
    // veias finas
    for (const t of [T2, T3, T4]) C.streaks(mm, Math.atan2(t[1] - Wr[1], t[0] - Wr[0]) + Math.PI / 2, 40, 0, 0);
    const wr = ramp(dark ? shade(o.wing, -0.1) : o.wing);
    const bones = C.shape(1).chain([[S[0], S[1], 3], [E[0], E[1], 2.2], [Wr[0], Wr[1], 1.8]]);
    bones.cone(Wr[0], Wr[1], 1.4, T1[0], T1[1], 0.7);
    for (const t of [T2, T3, T4]) bones.cone(Wr[0], Wr[1], 1.3, t[0], t[1], 0.55);
    C.sculpt(bones, wr, { R: 2.5, cast: false });
    C.px(T1[0] - 0.5, T1[1] - 1, o.horn ?? '#e8e0c8');
    C.px(Wr[0] - 0.5, Wr[1] - 1.5, o.horn ?? '#e8e0c8');
  } else {
    const col = dark ? shade(o.wing, -0.14) : o.wing;
    const R0 = ramp(col);
    // penas de voo: das primárias (na mão) às secundárias (no antebraço)
    const roots = [Wr, Wr, E, P(3, 7)];
    const tips = [T2, T3, T4, B];
    const along = (pts, t) => {
      const n = pts.length - 1;
      const k = Math.min(n - 1, Math.floor(t * n));
      const u = t * n - k;
      return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u];
    };
    const NFE = 9;
    for (let i = NFE - 1; i >= 0; i--) {
      const t = i / (NFE - 1);
      const r = along(roots, t);
      const tp = along(tips, t);
      const fe = C.shape(0.6).cone(r[0], r[1], 3, tp[0], tp[1], 1.6);
      const fm = C.sculpt(fe, ramp(shade(col, i % 2 ? -0.03 : 0.02)), { R: 3, line: i % 3 === 0, cast: false });
      // ponta mais escura
      C.tint(fm, C.shape(0.5).circle(tp[0], tp[1], 3.4), ramp(shade(col, -0.2)));
    }
    // braço e coberteiras em escamas
    const arm = C.shape(1.5).chain([[S[0], S[1], 3.6], [E[0], E[1], 3.2], [Wr[0], Wr[1], 2.6]]).cone(Wr[0], Wr[1], 2.4, T1[0], T1[1], 1.2);
    C.sculpt(arm, ramp(shade(col, 0.06)), { R: 3 });
    const cv = C.shape(0.6);
    for (let i = 0; i < 6; i++) {
      const p = along([S, E, Wr], i / 5);
      const q = along([B, T4, T3], i / 5);
      cv.circle(p[0] + (q[0] - p[0]) * 0.25, p[1] + (q[1] - p[1]) * 0.25, 3.2);
    }
    const cm = C.sculpt(cv, ramp(shade(col, 0.12)), { R: 3, cast: false });
    C.streaks(cm, 0.6, 3, 1, 0);
  }
}

function drawWingSide(C, S, o, phi, bob, far) {
  const flap = Math.sin(phi * Math.PI * 2) * 0.22;
  const sx = 55 + (far ? 5 : 0);
  const sy = 38 + bob + (far ? -2 : 0);
  wing(C, S.wings, o, sx, sy, (u) => -u * (S.wings === 'bat' ? 1 : 1.2), flap + (far ? 0.1 : 0), far, true, S.wings === 'bat' ? 1 : 0.92, S.wings === 'bat');
}

// ------------------------------------------------------------------ frente e costas (3/4 de cima)
// largura do corpo, raio do peito/garupa, cabeça e tipo de focinho
const FB = {
  horse: { bw: 10.5, chest: 10, rump: 11, head: 'long', hr: 5, legs: [4.6, 2.5, 2.1], hind: [6.4, 3.4, 2.1] },
  stag: { bw: 9, chest: 8.5, rump: 9, head: 'long', hr: 4.4, legs: [3.8, 2, 1.7], hind: [5.4, 2.8, 1.7] },
  bear: { bw: 15, chest: 13, rump: 14, head: 'bear', hr: 7.5, legs: [6.4, 4.6, 4.4], hind: [8, 5.4, 4.4] },
  wolf: { bw: 9.5, chest: 10, rump: 8.5, head: 'wolf', hr: 6, legs: [4.4, 2.6, 2.4], hind: [5.6, 3, 2.4] },
  cat: { bw: 10, chest: 9.5, rump: 9, head: 'cat', hr: 6.6, legs: [5, 3, 2.9], hind: [6.4, 3.4, 2.9] },
  rhino: { bw: 16, chest: 13.5, rump: 14, head: 'rhino', hr: 8, legs: [7, 6, 5.6], hind: [9, 6.4, 5.6] },
  boar: { bw: 12, chest: 11.5, rump: 10, head: 'boar', hr: 7, legs: [5.4, 3.4, 3.2], hind: [6.4, 3.4, 3] },
  raptor: { bw: 10, chest: 8.5, rump: 10, head: 'raptor', hr: 5, legs: null, hind: [7, 3.8, 2.4] },
  lizard: { bw: 12.5, chest: 7, rump: 7, head: 'lizard', hr: 7, legs: [4.2, 3.2, 2.8], hind: [4.8, 3.4, 2.8] },
  griffin: { bw: 10.5, chest: 10.5, rump: 9.5, head: 'griffin', hr: 5.6, legs: [4.6, 2.4, 2.2], hind: [6, 3.2, 2.4] },
  dragon: { bw: 12, chest: 11, rump: 11, head: 'dragon', hr: 5.4, legs: [5.6, 3.6, 3.2], hind: [7.4, 4.2, 3.2] },
};

function saddleTop(sp) {
  const S = SPECIES[sp];
  const s = new Shape(4);
  S.torso(s);
  s.chain(S.neck, 4);
  return s.top(S.saddle);
}

function drawFront(C, sp, base, o, f, back) {
  const S = SPECIES[sp];
  const F = FB[sp];
  const phi = f / NF;
  const bob = Math.round(Math.sin(phi * Math.PI * 4) * (S.bob ?? 1) * 0.5);
  const R = ramp(base);
  const Rd = ramp(shade(base, -0.15));
  const cx = CX;
  const sy = saddleTop(sp) + bob;
  const bw = F.bw;
  const far = sy + 3;
  const near = sy + (sp === 'lizard' ? 9 : F.chest * 1.15 + 3);
  const nearR = back ? F.rump : F.chest;
  const farR = (back ? F.chest : F.rump) * 0.78;
  const hoofR = ramp(o.hoofCol ?? (o.hoofFire ? '#3a2018' : '#3a3036'));
  const lift = (ph) => Math.max(0, Math.sin((phi + ph) * Math.PI * 2));
  const leg = (x, top, footY, ph, Rm, radii, isFar) => {
    const l = lift(ph) * (S.front?.lift ?? S.hind.lift) * 0.55;
    const side = Math.sign(x - cx) || 1;
    const spr = sp === 'lizard';
    const fx = x + (spr ? side * 6 : side * 0.6);
    const fy = footY - l;
    const kx = (x + fx) / 2 + side * (l * 0.25 + (spr ? 3 : 0));
    const ky = top + (fy - top) * (spr ? 0.3 : 0.48);
    const s = C.shape(1.5).chain([
      [x, top, radii[0]],
      [kx, ky, radii[1]],
      [fx, fy - 2, radii[2]],
    ]);
    const m = C.sculpt(s, Rm, { R: 5, bright: isFar ? -0.08 : 0 });
    if (o.socks && sp === 'horse') C.tint(m, C.shape(1).cone(fx, fy - 2, radii[2] + 1, fx, fy - 7, radii[2] + 1), ramp(o.socks));
    const isHoof = S.front ? S.front.foot === 'hoof' : false;
    const ft = C.shape(1);
    if (isHoof) ft.poly([[fx - radii[2] - 0.8, fy - 3], [fx + radii[2] + 0.8, fy - 3], [fx + radii[2] + 1.3, fy], [fx - radii[2] - 1.3, fy]]);
    else ft.ellipse(fx, fy - 1.2, radii[2] + 1.6, 2);
    C.sculpt(ft, isHoof ? hoofR : Rm, { R: 2, cast: false });
    if (!isHoof) for (const d of [-1.5, 1.5]) C.px(fx + d - 0.5, fy - 1, Rm[1]);
    if (o.hoofFire && isHoof && (f + (isFar ? 1 : 0)) % 2) C.px(fx - 1, fy - 2, o.fire2, 2, 2);
  };
  // asas abertas para os lados
  if (S.wings) drawWingFront(C, S, o, phi, cx, sy + 4, bw);
  if (back) {
    // de costas: pescoço e cabeça lá na frente, mais alto
    backHead(C, sp, S, F, o, base, R, cx, sy, far, farR, f, phi);
  }
  // pernas de lá, entre as de cá e com os pés mais altos
  if (F.legs) {
    const fr = back ? F.legs : F.hind;
    const ox = bw * (sp === 'lizard' ? 0.5 : 0.3);
    leg(cx - ox, far + 4, GROUND - 5, back ? 0.65 : 0.15, Rd, fr, true);
    leg(cx + ox, far + 4, GROUND - 5, back ? 0.15 : 0.65, Rd, fr, true);
  }
  // corpo
  const body = C.shape(4);
  body.ellipse(cx, far, bw * 0.9, farR);
  body.cone(cx, far, bw * 0.95, cx, near, bw);
  body.ellipse(cx, near, bw, nearR * (sp === 'lizard' ? 0.8 : 1));
  if (false) {
    // cauda vista lá atrás, saindo por cima da garupa
    const sway = Math.sin(phi * Math.PI * 2) * 3;
    body.chain([[cx, far - 2, bw * 0.5], [cx + sway, far - 8, bw * 0.3], [cx + sway * 1.6, far - 13, 1.4]], 3);
  }
  const regions = [];
  if (!back && (o.belly || sp === 'dragon' || sp === 'raptor')) regions.push([C.shape(3).ellipse(cx, near + nearR * 0.35, bw * 0.55, nearR * 0.62), ramp(o.belly ?? shade(base, 0.2)), 0.3]);
  if (!back && sp === 'griffin') regions.push([C.shape(3).ellipse(cx, near, bw * 0.9, nearR * 1.05), ramp(o.head)]);
  if (o.back) regions.push([C.shape(3).cone(cx, far - 2, bw * 0.5, cx, near - 2, bw * 0.4), ramp(o.back), 0.2]);
  if (o.spots) regions.push([C.shape(2).ellipse(cx - 5, sy + 6, 4.5, 3.5).ellipse(cx + 4, sy + 12, 4, 3).ellipse(cx - 2, near + 4, 3.5, 3), ramp(o.spots)]);
  if (o.barding) regions.push([C.shape(2).ellipse(cx, back ? far : near, bw * 1.05, (back ? farR : nearR) * 1.05), ramp(o.barding)]);
  const bm = C.sculpt(body, R, { R: 10, regions });
  if (o.stripes)
    C.tint(
      bm,
      (() => {
        const s = C.shape(0.5);
        for (let y = far - 4; y < near + nearR; y += 4.5) for (const sd of [-1, 1]) s.poly([[cx + sd * (bw + 1), y], [cx + sd * (bw - 6), y + 1.2], [cx + sd * (bw + 1), y + 2.4]]);
        return s;
      })(),
      ramp(o.stripes),
      -1,
    );
  if (o.runes) for (const sd of [-1, 1]) {
    const c = (f + (sd > 0 ? 1 : 0)) % 3 ? o.runes : shade(o.runes, -0.2);
    C.px(cx + sd * (bw - 4) - 0.5, near - 4, c, 1, 5);
    C.px(cx + sd * (bw - 4) - 1.5, near - 2, c, 3, 1);
  }
  if (o.cracks) for (const [x0, y0, x1, y1] of [[-6, 2, -2, 6], [3, 4, 7, 1], [-3, 10, 2, 12]]) C.line(cx + x0, sy + y0, cx + x1, sy + y1, (f + x0) % 2 ? o.cracks : o.fire2);
  if (o.fire && sp === 'lizard')
    for (let y = far - 3, k = 0; y < near + 2; y += 3.5, k++) {
      const h = 2 + ((k + f) % 3);
      for (const sd of [-1, 1]) for (let j = 0; j < h; j++) C.px(cx + sd * 4 - 1, y - j, j ? o.fire2 : o.fire, 2, 1);
    }
  if (S.spikes && back) {
    const s = C.shape(0.5);
    for (let y = near + nearR - 4; y > sy + 6; y -= 4) s.poly([[cx - 2.2, y + 2], [cx, y - 3], [cx + 2.2, y + 2]]);
    C.sculpt(s, ramp(o.horn), { R: 2, cast: false });
  }
  if (o.barding) {
    // caparazão caindo pelos flancos
    const cl = C.shape(1.5);
    for (const sd of [-1, 1]) cl.poly([[cx + sd * (bw - 3), sy + 4], [cx + sd * (bw + 2), sy + 5], [cx + sd * (bw + 2.5), near + 6], [cx + sd * (bw - 3), near + 7]]);
    const cm = C.sculpt(cl, ramp(o.cloth), { R: 3 });
    void cm;
    for (const sd of [-1, 1]) for (let y = sy + 6; y < near + 6; y += 2) C.px(cx + sd * (bw + 1.5) - (sd > 0 ? 1 : 0), y, o.trim);
  }
  // sela
  const cloth = ramp(o.cloth ?? '#8a2a1e');
  C.sculpt(C.shape(2).cone(cx - bw + 0.5, sy + 4.5, 3.6, cx + bw - 0.5, sy + 4.5, 3.6), cloth, { R: 3, flat: 0.25 });
  for (let x = -bw + 2; x <= bw - 2; x += 2) C.px(cx + x, sy + 7.5, o.trim ?? '#e8c04a');
  C.sculpt(C.shape(1.5).ellipse(cx, sy + 2.5, 6.5, 3.4), ramp('#7a4422'), { R: 3 });
  for (const sd of [-1, 1]) {
    C.line(cx + sd * (bw - 0.5), sy + 6, cx + sd * (bw + 0.5), sy + 12, '#3a2414');
    C.px(cx + sd * (bw + 0.5) - 1.5, sy + 12, '#c8c8d0', 3, 1);
    C.px(cx + sd * (bw + 0.5) - 1.5, sy + 13, '#8a8a98', 3, 1);
  }
  // pernas de cá
  if (!F.legs) {
    leg(cx - bw * 0.5, near, GROUND - 1, 0, R, F.hind, false);
    leg(cx + bw * 0.5, near, GROUND - 1, 0.5, R, F.hind, false);
  } else {
    const nr = back ? F.hind : F.legs;
    const lx = bw * (sp === 'lizard' ? 0.85 : 0.62);
    leg(cx - lx, near + (back ? -1 : 1), GROUND - 1, back ? 0.5 : 0, R, nr, false);
    leg(cx + lx, near + (back ? -1 : 1), GROUND - 1, back ? 0 : 0.5, R, nr, false);
  }
  if (S.arms && !back) for (const sd of [-1, 1]) C.sculpt(C.shape(1).chain([[cx + sd * 5, near - 2, 2], [cx + sd * 6, near + 4, 1.4], [cx + sd * 5, near + 7, 1]]), R, { R: 2 });
  if (back) backTail(C, sp, S, o, R, base, cx, near, nearR, phi);
  else frontHead(C, sp, S, F, o, base, R, cx, sy, near, nearR, f, phi);
  if (o.sparkle) for (const [x, y] of [[-14, 6], [12, -4], [16, 22], [-10, 26]]) if ((x + f * 3) % 4 < 2) C.px(cx + x, sy + y - (f % 3), o.sparkle);
}

function backTail(C, sp, S, o, R, base, cx, near, nearR, phi) {
  const sway = Math.sin(phi * Math.PI * 2) * 3;
  const ty = near + nearR * 0.2;
  const k = S.tail.kind;
  const s = C.shape(2.5);
  if (k === 'hair') {
    for (const d of [-1.2, 0, 1.2]) s.chain([[cx + d, ty - 5, 2.6], [cx + d * 2 + sway, ty + 6, 2.6], [cx + d * 2.6 + sway * 1.5, ty + 17, 1.4]]);
    const m = C.sculpt(s, ramp(o.fire ? '#3a2030' : o.mane ?? R[1]), { R: 4 });
    C.streaks(m, 1.5, 2.4, 1, 0);
    if (o.mane2) tintStreak(C, m, o.mane2, 1.5, 5);
    if (o.fire) for (let i = 0; i < 8; i++) C.px(cx - 1 + sway * (i / 8) + Math.sin(i + phi * 6), ty - 3 + i * 2.4, i % 3 ? o.fire : o.fire2, 3, 2);
  } else if (k === 'lizard') {
    s.chain([[cx, ty - 6, 6], [cx + sway, ty + 6, 4], [cx + sway * 2, GROUND - 3, 2]]);
    if (S.tail.spade) s.poly([[cx + sway * 2 - 4, GROUND - 3], [cx + sway * 2, GROUND - 8], [cx + sway * 2 + 4, GROUND - 3], [cx + sway * 2, GROUND]]);
    const regions = sp === 'dragon' || sp === 'raptor' ? [] : [];
    C.sculpt(s, R, { R: 5, regions });
  } else if (k === 'brush') {
    s.chain([[cx, ty - 4, 3], [cx + sway, ty + 5, 4.4], [cx + sway * 1.5, ty + 13, 2.6]]);
    const m = C.sculpt(s, ramp(o.back ?? R[3]), { R: 4 });
    C.streaks(m, 1.5, 3, 1, 0);
    C.tint(m, C.shape(1).circle(cx + sway * 1.5, ty + 13, 2.8), ramp(o.belly ?? R[4]));
  } else if (k === 'long') {
    s.chain([[cx, ty - 4, 2.6], [cx + sway, ty + 6, 2.2], [cx + sway * 2.4, ty + 13, 2], [cx + sway * 3.4, ty + 9, 2]]);
    C.sculpt(s, R, { R: 3 });
    if (S.tail.tuft) C.sculpt(C.shape(1).ellipse(cx + sway * 3.4, ty + 7, 3, 4), ramp('#7a5428'), { R: 3 });
    if (o.stripes) for (let i = 0; i < 3; i++) C.px(cx + sway * (0.6 + i * 0.8) - 1.5, ty + i * 4, o.stripes, 3, 1);
  } else if (k === 'thin') {
    s.chain([[cx, ty - 3, 1.6], [cx + sway * 0.4, ty + 7, 1.2]]);
    C.sculpt(s, R, { R: 2 });
    C.sculpt(C.shape(1).ellipse(cx + sway * 0.4, ty + 9, 1.8, 2.6), ramp(o.mane ?? R[1]), { R: 2 });
  } else {
    C.sculpt(C.shape(1).circle(cx, ty - 3, 3.4), ramp(o.belly ?? shade(base, 0.2)), { R: 3 });
  }
}

function earsFB(C, sp, S, F, o, HR, cx, hy) {
  const r = F.hr;
  if (S.ears) for (const sd of [-1, 1]) C.sculpt(C.shape(0.8).cone(cx + sd * (r * 0.55), hy - r + 1.5, 1.8, cx + sd * (r * 0.9), hy - r - 5.5, 0.6), HR, { R: 2 });
  if (S.pointEars) for (const sd of [-1, 1]) C.sculpt(C.shape(0.6).poly([[cx + sd * (r * 0.3), hy - r + 2], [cx + sd * (r * 0.75), hy - r - (sp === 'rhino' ? 4 : 7)], [cx + sd * (r + 0.5), hy - r + 2.5]]), HR, { R: 2 });
  if (S.roundEars) for (const sd of [-1, 1]) C.sculpt(C.shape(1).circle(cx + sd * (r - 0.8), hy - r + 1.2, 2.5), HR, { R: 2 });
  if (o.horn && sp === 'horse') C.sculpt(C.shape(0.6).cone(cx, hy - r + 1, 1.8, cx, hy - r - 12, 0.4), ramp(o.horn), { R: 2, bright: 0.1 });
  if (S.horns) for (const sd of [-1, 1]) C.sculpt(C.shape(0.8).chain([[cx + sd * 2.5, hy - r + 1, 2], [cx + sd * 6, hy - r - 4, 1.4], [cx + sd * 7, hy - r - 9, 0.5]]), ramp(o.horn), { R: 2 });
  if (sp === 'stag')
    for (const sd of [-1, 1]) {
      const s = C.shape(0.8);
      s.chain([[cx + sd * 2.5, hy - r + 1, 1.4], [cx + sd * 8, hy - r - 7, 1], [cx + sd * 13, hy - r - 15, 0.5]]);
      s.chain([[cx + sd * 8, hy - r - 7, 0.9], [cx + sd * 6, hy - r - 15, 0.4]]);
      s.chain([[cx + sd * 11, hy - r - 12, 0.8], [cx + sd * 17, hy - r - 13, 0.4]]);
      C.sculpt(s, ramp(o.antler), { R: 1.5, bright: 0.15 });
    }
  if (sp === 'raptor' && o.crest) for (let k = 0; k < 4; k++) C.px(cx - 1, hy - r - 1 - k * 2, o.crest, 2, 2);
  if (sp === 'griffin') for (const sd of [-1, 1]) C.sculpt(C.shape(0.6).cone(cx + sd * 3, hy - r + 2, 1.6, cx + sd * 6, hy - r - 4, 0.5), ramp(o.head), { R: 1.5 });
  if (sp === 'boar') for (let k = -2; k <= 2; k++) C.px(cx + k * 1.6, hy - r - (k % 2 ? 1 : 2), o.mane, 1, 3);
}

function frontHead(C, sp, S, F, o, base, R, cx, sy, near, nearR, f, phi) {
  const r = F.hr;
  const HR = sp === 'griffin' ? ramp(o.head) : R;
  const longNeck = S.neck.length >= 3;
  const hy = sp === 'lizard' ? near + 2 : near - (longNeck ? 4 : 1);
  // pescoço descendo do alto do peito
  if (longNeck) C.sculpt(C.shape(2).cone(cx, sy + 3, r * 1.15, cx, hy, r * 0.9), HR, { R: 5 });
  if (o.mane && S.crest && !o.fire) {
    const m = C.sculpt(C.shape(1.5).cone(cx, sy + 1, 3, cx, hy - r + 2, 2.4), ramp(o.mane), { R: 3 });
    C.streaks(m, 0, 2, 1, 0);
  }
  if (sp === 'wolf' || sp === 'griffin') {
    const s = C.shape(1.5);
    for (let k = -2; k <= 2; k++) s.cone(cx + k * 2.6, hy + 1, 2.6, cx + k * 3.6, hy + 7 + Math.abs(k), 1);
    const m = C.sculpt(s, ramp(sp === 'griffin' ? o.head : o.belly ?? shade(base, 0.12)), { R: 3 });
    C.streaks(m, 1.57, 2.5, 1, 0);
  }
  const h = C.shape(2.5);
  const t = F.head;
  if (t === 'long') h.circle(cx, hy, r).cone(cx, hy, r * 0.85, cx, hy + 10, r * 0.62);
  else if (t === 'bear') h.circle(cx, hy, r).ellipse(cx, hy + r * 0.55, r * 0.6, r * 0.5);
  else if (t === 'wolf') h.circle(cx, hy, r).cone(cx, hy + 1, r * 0.55, cx, hy + r + 3, r * 0.38);
  else if (t === 'cat') h.ellipse(cx, hy, r * 1.05, r * 0.95).ellipse(cx, hy + r * 0.5, r * 0.6, r * 0.45);
  else if (t === 'rhino') h.ellipse(cx, hy, r * 0.95, r).cone(cx, hy, r * 0.8, cx, hy + r + 3, r * 0.65);
  else if (t === 'boar') h.ellipse(cx, hy, r, r * 0.9).cone(cx, hy, r * 0.7, cx, hy + r + 2, r * 0.5);
  else if (t === 'raptor' || t === 'dragon') h.circle(cx, hy, r).cone(cx, hy, r * 0.8, cx, hy + r + 4, r * 0.5);
  else if (t === 'lizard') h.ellipse(cx, hy, r * 1.1, r * 0.7).ellipse(cx, hy + 3, r * 0.8, r * 0.55);
  else h.circle(cx, hy, r);
  const regions = [];
  if (t === 'long' || t === 'bear') regions.push([C.shape(2).ellipse(cx, t === 'long' ? hy + 9 : hy + r * 0.6, r * 0.62, r * 0.42), ramp(o.muzzleCol ?? shade(base, t === 'bear' ? 0.12 : -0.06)), 0.2]);
  if (o.belly && (t === 'wolf' || t === 'cat')) regions.push([C.shape(2).ellipse(cx, hy + r * 0.6, r * 0.6, r * 0.45), ramp(o.belly), 0.2]);
  if (o.blaze) regions.push([C.shape(1).cone(cx, hy - r + 1, 1.2, cx, hy + 8, 1.4), ramp(o.blaze)]);
  C.sculpt(h, HR, { R: 5, regions });
  if (o.stripes && t === 'cat') for (const sd of [-1, 1]) C.line(cx + sd * (r - 1), hy - 2, cx + sd * (r - 3), hy, o.stripes);
  earsFB(C, sp, S, F, o, HR, cx, hy);
  // olhos dos dois lados
  const ey = hy - (t === 'long' ? 1 : 1.5);
  const ex = r * (t === 'lizard' ? 0.75 : 0.5);
  for (const sd of [-1, 1]) {
    const x = cx + sd * ex - (sd > 0 ? 1 : 0);
    C.px(x, ey, o.eyes ?? '#141018', 2, 2);
    C.px(x + (sd > 0 ? 1 : 0), ey, o.eyes ? '#ffe8c0' : '#f4f0e8');
  }
  // focinho
  if (t === 'long') {
    C.px(cx - 2, hy + 9, '#1e1418');
    C.px(cx + 1, hy + 9, '#1e1418');
  } else if (t === 'bear' || t === 'wolf' || t === 'cat') {
    C.px(cx - 1, hy + (t === 'wolf' ? r + 1.5 : r * 0.45), '#141018', 2, 2);
    if (t === 'cat' && o.fangs) {
      C.line(cx - 2, hy + r * 0.8, cx - 2, hy + r * 0.8 + 5, o.fangs);
      C.line(cx + 1, hy + r * 0.8, cx + 1, hy + r * 0.8 + 5, o.fangs);
    }
  } else if (t === 'boar') {
    C.sculpt(C.shape(1).ellipse(cx, hy + r + 2, 3.2, 2.2), ramp('#c8887a'), { R: 2 });
    C.px(cx - 2, hy + r + 2, '#3a1a18');
    C.px(cx + 1, hy + r + 2, '#3a1a18');
    for (const sd of [-1, 1]) C.sculpt(C.shape(0.6).chain([[cx + sd * 3, hy + r + 2, 1.2], [cx + sd * 6, hy + r - 1, 1], [cx + sd * 6.5, hy + r - 4, 0.5]]), ramp(o.tusk), { R: 1.5 });
  } else if (t === 'rhino') {
    C.sculpt(C.shape(1).chain([[cx, hy + r, 3.4], [cx, hy + 2, 2.4], [cx, hy - 5, 0.6]]), ramp('#e8dcc0'), { R: 2 });
  } else if (t === 'griffin') {
    C.sculpt(C.shape(0.6).poly([[cx - 3, hy + 1], [cx + 3, hy + 1], [cx + 1, hy + 8], [cx, hy + 9], [cx - 1, hy + 8]]), ramp(o.beak), { R: 2 });
  } else if (t === 'dragon' || t === 'raptor') {
    C.px(cx - 2, hy + r + 3, '#1a1010');
    C.px(cx + 1, hy + r + 3, '#1a1010');
    if (o.fire && f % 3 !== 2) C.px(cx - 1, hy + r + 5 + (f % 2), o.fire2, 2, 2);
  } else if (t === 'lizard') {
    C.line(cx - 4, hy + 4.5, cx + 4, hy + 4.5, '#2a1010');
  }
  if (o.fire && sp === 'horse') for (let k = 0; k < 5; k++) C.px(cx - 1 + ((k + f) % 2), hy - r - k * 2, k % 2 ? o.fire : o.fire2, 2, 2);
  void phi;
}

function backHead(C, sp, S, F, o, base, R, cx, sy, far, farR, f, phi) {
  const r = F.hr;
  const HR = sp === 'griffin' ? ramp(o.head) : R;
  const longNeck = S.neck.length >= 3;
  const hy = longNeck ? sy - 10 : far - farR * 0.5;
  if (longNeck) C.sculpt(C.shape(2).cone(cx, far, r * 1.2, cx, hy + 2, r * 0.85), HR, { R: 5 });
  const h = C.shape(2).ellipse(cx, hy, r * 0.95, r * 0.85);
  C.sculpt(h, HR, { R: 4 });
  if (o.mane && S.crest && !o.fire) {
    const m = C.sculpt(C.shape(1.5).cone(cx, hy - 1, 2.8, cx, far + 3, 2.4), ramp(o.mane), { R: 3 });
    C.streaks(m, 0, 2, 1, 0);
    if (o.mane2) tintStreak(C, m, o.mane2, 0, 5);
  }
  if (o.fire && sp === 'horse') for (let k = 0; k < 8; k++) C.px(cx - 1 + ((k + f) % 2), hy + k * 2.2 - 2, k % 2 ? o.fire : o.fire2, 2, 2);
  earsFB(C, sp, S, F, o, HR, cx, hy);
  void phi;
  void base;
}

/** Asas abertas para os lados (frente e costas). */
function drawWingFront(C, S, o, phi, cx, wy, bw) {
  const flap = Math.sin(phi * Math.PI * 2) * 0.22;
  for (const sd of [-1, 1]) wing(C, S.wings, o, cx + sd * (bw - 3), wy, (u) => sd * u * 0.95, -0.35 + flap, false, false);
}

// ------------------------------------------------------------------ folha
export function renderFrame(mi, dir, f) {
  const [, , sp, col, o] = MOUNT_DEFS[mi];
  if (dir === 0 || dir === 3) {
    const C = new Canvas(0);
    drawFront(C, sp, col, o, f, dir === 3);
    return C.finish();
  }
  // de lado: a sela vai para o centro do quadro
  const C = new Canvas(CX - SPECIES[sp].saddle);
  drawSide(C, sp, col, o, f);
  const img = C.finish();
  if (dir === 2) return img;
  const m = new Uint8ClampedArray(img.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = (y * W + x) * 4;
      const b = (y * W + (W - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) m[a + k] = img[b + k];
    }
  return m;
}

export function drawMounts({ Img, save }) {
  const N = MOUNT_DEFS.length;
  const sheet = new Img(FW * NF * 4, FH * N);
  MOUNT_DEFS.forEach((_, mi) => {
    // ordem das direções igual à do herói: baixo, esquerda, direita, cima
    for (let dir = 0; dir < 4; dir++)
      for (let f = 0; f < NF; f++) {
        const px = renderFrame(mi, dir, f);
        const ox = (dir * NF + f) * FW;
        const oy = mi * FH;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (px[i + 3]) sheet.put(ox + x, oy + y, px[i], px[i + 1], px[i + 2], px[i + 3]);
          }
      }
  });
  save('assets/sprites/mounts.png', sheet);
  // altura da sela em px do mundo (a arte é exibida a 0,5)
  return MOUNT_DEFS.map(([id, name, sp, , o]) => ({ id, name, kind: sp, seat: Math.round((GROUND - (saddleTop(sp) + 5)) / 2), glow: o.glow ?? 0, ghost: !!o.ghost }));
}

export const MOUNT_FRAME = { w: FW, h: FH, ground: GROUND, frames: NF, scale: 0.5 };
