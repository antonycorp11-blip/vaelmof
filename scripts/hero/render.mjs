// Renderizador "3D → pixel art": ray marching ortográfico sobre as SDFs,
// iluminação quantizada em rampas de cor, supersampling 2×2 com voto de
// material, contorno seletivo e linhas de profundidade.
import { COLORS, EMISSIVE, MAT_INDEX, SOFT, THIN } from './palette.mjs';

export const CFG = {
  W: 112, // frame final (px de arte)
  H: 112,
  FX: 56, // pés no frame final
  FY: 88,
  S: 50, // px de arte por unidade do personagem
  SS: 2, // supersampling
  elev: 24, // elevação da câmera (graus)
};

const DEG = Math.PI / 180;
const ce = Math.cos(CFG.elev * DEG);
const se = Math.sin(CFG.elev * DEG);
// câmera no mundo: olha para baixo e para -z
const F_W = [0, -se, -ce];
const U_W = [0, ce, -se];
const R_W = [1, 0, 0];
const L_W = (() => {
  const l = [-0.55, 0.72, 0.5];
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();

/** Rotação em torno de y (mesma convenção de eulerBasis: +z → (sinψ,0,cosψ)). */
function rotY(v, psi) {
  const c = Math.cos(psi), s = Math.sin(psi);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Renderiza uma camada. `prims` = primitivas da camada; `under` = profundidade
 * (por amostra SS) das camadas abaixo — a camada só aparece onde está à frente.
 */
export function renderLayer(prims, yawDeg, under = null, opts = {}) {
  const { W, H, FX, FY, S, SS } = CFG;
  const SW = W * SS, SH = H * SS, SF = S * SS;
  const psi = yawDeg * DEG;
  const f = rotY(F_W, -psi);
  const r = rotY(R_W, -psi);
  const u = rotY(U_W, -psi);
  const L = rotY(L_W, -psi);
  const V = [-f[0], -f[1], -f[2]];
  const Hh = (() => {
    const h = [L[0] + V[0], L[1] + V[1], L[2] + V[2]];
    const n = Math.hypot(...h);
    return h.map((x) => x / n);
  })();

  const n = SW * SH;
  const depth = new Float32Array(n).fill(Infinity);
  const matA = new Int16Array(n).fill(-1);
  const shadeA = new Int8Array(n);

  // bounding box em tela (amostras SS)
  let x0 = SW, y0 = SH, x1 = 0, y1 = 0;
  for (const p of prims) {
    const c = p.bc;
    const sx = FX * SS + (c[0] * r[0] + c[1] * r[1] + c[2] * r[2]) * SF;
    const sy = FY * SS - (c[0] * u[0] + c[1] * u[1] + c[2] * u[2]) * SF;
    const rr = p.br * SF + 2;
    x0 = Math.min(x0, sx - rr);
    y0 = Math.min(y0, sy - rr);
    x1 = Math.max(x1, sx + rr);
    y1 = Math.max(y1, sy + rr);
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(SW - 1, Math.ceil(x1));
  y1 = Math.min(SH - 1, Math.ceil(y1));

  const P = prims.length;
  const cand = new Int32Array(P);
  const ks = prims.map((p) => p.k ?? 0);
  const matOf = prims.map((p) => MAT_INDEX[p.mat]);

  const sceneD = (x, y, z, nc) => {
    let d = 1e9;
    for (let i = 0; i < nc; i++) {
      const j = cand[i];
      d = smin(d, prims[j].d(x, y, z), ks[j]);
    }
    return d;
  };

  for (let sy = y0; sy <= y1; sy++) {
    for (let sx = x0; sx <= x1; sx++) {
      // ponto no plano da imagem (espaço do personagem)
      const a = (sx + 0.5 - FX * SS) / SF;
      const b = (FY * SS - (sy + 0.5)) / SF;
      const ox = r[0] * a + u[0] * b - f[0] * 4;
      const oy = r[1] * a + u[1] * b - f[1] * 4;
      const oz = r[2] * a + u[2] * b - f[2] * 4;
      // candidatas pelas esferas envolventes
      let nc = 0;
      let tmin = 1e9, tmax = -1e9;
      for (let i = 0; i < P; i++) {
        const c = prims[i].bc;
        const ocx = c[0] - ox, ocy = c[1] - oy, ocz = c[2] - oz;
        const tca = ocx * f[0] + ocy * f[1] + ocz * f[2];
        const d2 = ocx * ocx + ocy * ocy + ocz * ocz - tca * tca;
        const br = prims[i].br;
        if (d2 > br * br) continue;
        const thc = Math.sqrt(br * br - d2);
        cand[nc++] = i;
        tmin = Math.min(tmin, tca - thc);
        tmax = Math.max(tmax, tca + thc);
      }
      if (!nc) continue;
      const idx = sy * SW + sx;
      const limit = under ? Math.min(tmax, under[idx]) : tmax;
      let t = Math.max(0, tmin);
      let hit = false;
      for (let step = 0; step < 96 && t < limit; step++) {
        const px = ox + f[0] * t, py = oy + f[1] * t, pz = oz + f[2] * t;
        const d = sceneD(px, py, pz, nc);
        if (d < 0.0006) {
          hit = true;
          break;
        }
        t += Math.max(d * 0.85, 0.0004);
      }
      if (!hit || t >= limit) continue;
      const px = ox + f[0] * t, py = oy + f[1] * t, pz = oz + f[2] * t;
      // primitiva mais próxima define o material
      let best = 0, bd = 1e9;
      for (let i = 0; i < nc; i++) {
        const dd = prims[cand[i]].d(px, py, pz);
        if (dd < bd) {
          bd = dd;
          best = cand[i];
        }
      }
      // normal por diferenças centrais
      const e = 0.0015;
      let nx = sceneD(px + e, py, pz, nc) - sceneD(px - e, py, pz, nc);
      let ny = sceneD(px, py + e, pz, nc) - sceneD(px, py - e, pz, nc);
      let nz = sceneD(px, py, pz + e, nc) - sceneD(px, py, pz - e, nc);
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const prim = prims[best];
      let mat = matOf[best];
      let off = 0;
      let flat = -1;
      if (prim.detail) {
        const res = prim.detail(prim.local(px, py, pz), [px, py, pz], [nx, ny, nz]);
        if (res) {
          if (res.mat) mat = MAT_INDEX[res.mat];
          if (res.off) off = res.off;
          if (res.flat !== undefined) flat = res.flat;
        }
      }
      let shade;
      if (flat >= 0) shade = flat;
      else if (EMISSIVE[mat]) shade = Math.min(4, 2 + Math.round((nx * V[0] + ny * V[1] + nz * V[2]) * 2)) + off;
      else {
        const nd = nx * L[0] + ny * L[1] + nz * L[2];
        // pele: luz "half-lambert" (sombras suaves, rosto legível)
        const lam = SOFT[mat] ? 0.35 + 0.65 * (0.5 + 0.5 * nd) : Math.max(0, nd);
        // oclusão ambiente barata (2 amostras ao longo da normal)
        const d1 = sceneD(px + nx * 0.02, py + ny * 0.02, pz + nz * 0.02, nc);
        const d2 = sceneD(px + nx * 0.05, py + ny * 0.05, pz + nz * 0.05, nc);
        const ao = Math.min(1, Math.max(0, (d1 / 0.02) * 0.5 + (d2 / 0.05) * 0.5));
        const nv = Math.max(0, nx * V[0] + ny * V[1] + nz * V[2]);
        const rim = Math.pow(1 - nv, 3) * 0.22;
        let v = (0.14 + 0.86 * lam) * (0.6 + 0.4 * ao) + rim * (0.4 + lam);
        v += opts.bright ?? 0;
        shade = v < 0.2 ? 0 : v < 0.38 ? 1 : v < 0.58 ? 2 : v < 0.8 ? 3 : 4;
        shade = Math.max(0, Math.min(4, shade + off));
        if (THIN[mat] && !EMISSIVE[mat]) {
          const sp = Math.pow(Math.max(0, nx * Hh[0] + ny * Hh[1] + nz * Hh[2]), 28);
          if (sp > 0.5) shade = 5;
        }
      }
      depth[idx] = t;
      matA[idx] = mat;
      shadeA[idx] = shade;
    }
  }
  return { depth, mat: matA, shade: shadeA, bbox: [x0, y0, x1, y1] };
}

/** Reduz 2×2 → 1 com voto de material; devolve buffers finais. */
export function downsample(ss) {
  const { W, H, SS } = CFG;
  const SW = W * SS;
  const n = W * H;
  const mat = new Int16Array(n).fill(-1);
  const shade = new Int8Array(n);
  const depth = new Float32Array(n).fill(Infinity);
  const cnt = new Map();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      cnt.clear();
      let hits = 0, dmin = Infinity, anyThin = false;
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++) {
          const k = (y * SS + j) * SW + x * SS + i;
          const m = ss.mat[k];
          if (m < 0) continue;
          hits++;
          if (THIN[m]) anyThin = true;
          dmin = Math.min(dmin, ss.depth[k]);
          const e = cnt.get(m) ?? { c: 0, s: 0, spec: false, d: Infinity };
          e.c++;
          e.s += ss.shade[k] === 5 ? 4 : ss.shade[k];
          if (ss.shade[k] === 5) e.spec = true;
          e.d = Math.min(e.d, ss.depth[k]);
          cnt.set(m, e);
        }
      if (hits < 2 && !(hits >= 1 && anyThin)) continue;
      let bm = -1, be = null;
      for (const [m, e] of cnt) {
        // prioridade: mais amostras; metais finos ganham empate; depois o mais próximo
        if (!be || e.c > be.c || (e.c === be.c && (THIN[m] || e.d < be.d))) {
          bm = m;
          be = e;
        }
      }
      const i = y * W + x;
      mat[i] = bm;
      shade[i] = be.spec && be.c >= 1 ? 5 : Math.round(be.s / be.c);
      depth[i] = dmin;
    }
  return { mat, shade, depth };
}

/**
 * Converte buffers finais em RGBA com contorno seletivo. `ctxDepth` é a
 * profundidade final das camadas abaixo (null para a base).
 */
export function toRGBA(fin, ctxDepth = null, opts = {}) {
  const { W, H } = CFG;
  const n = W * H;
  const rgba = new Uint8ClampedArray(n * 4);
  const shade = Int8Array.from(fin.shade);
  // linhas de profundidade: pixel atrás de um vizinho bem mais próximo escurece
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (fin.mat[i] < 0) continue;
      const d = fin.depth[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (fin.mat[j] >= 0 && fin.depth[j] < d - 0.05) {
          shade[i] = Math.max(0, Math.min(shade[i], 4) - 1);
          break;
        }
      }
    }
  for (let i = 0; i < n; i++) {
    const m = fin.mat[i];
    if (m < 0) continue;
    const c = COLORS[m][shade[i]];
    rgba[i * 4] = c[0];
    rgba[i * 4 + 1] = c[1];
    rgba[i * 4 + 2] = c[2];
    rgba[i * 4 + 3] = 255;
  }
  if (opts.outline !== false) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (fin.mat[i] >= 0) continue;
        let src = -1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (fin.mat[j] >= 0 && (src < 0 || fin.depth[j] < fin.depth[src])) src = j;
        }
        if (src < 0) continue;
        // não contorna por cima de algo que está à frente (oclusão pela base)
        if (ctxDepth && ctxDepth[i] < fin.depth[src] + 0.03) continue;
        const c = COLORS[fin.mat[src]][6];
        rgba[i * 4] = c[0];
        rgba[i * 4 + 1] = c[1];
        rgba[i * 4 + 2] = c[2];
        rgba[i * 4 + 3] = 255;
      }
  }
  return rgba;
}

/** Combina duas profundidades (mínimo elemento a elemento). */
export function minDepth(a, b) {
  if (!a) return b;
  const o = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = Math.min(a[i], b[i]);
  return o;
}

// ------------------------------------------------------------------ rastro do golpe
function rayTri(ox, oy, oz, dx, dy, dz, a, b, c) {
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
  const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det;
  const tx = ox - a[0], ty = oy - a[1], tz = oz - a[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 0 ? [t, u, v] : null;
}

/**
 * Rastro: superfície varrida pela lâmina entre sub-poses. `segs` = lista de
 * {a, b} (base→ponta) do mais antigo para o mais novo. Devolve RGBA com alpha
 * parcial (mais forte na ponta e no trecho mais recente).
 */
export function renderSmear(segs, yawDeg, under) {
  const { W, H, FX, FY, S, SS } = CFG;
  const SW = W * SS, SH = H * SS, SF = S * SS;
  const psi = yawDeg * DEG;
  const f = rotY(F_W, -psi), r = rotY(R_W, -psi), u = rotY(U_W, -psi);
  const cov = new Float32Array(SW * SH);
  const tip = new Float32Array(SW * SH);
  const tris = [];
  const n = segs.length;
  for (let k = 0; k < n - 1; k++) {
    const A = segs[k], B = segs[k + 1];
    const age0 = k / (n - 1), age1 = (k + 1) / (n - 1);
    tris.push({ p: [A.a, A.b, B.b], w: [[0, age0], [1, age0], [1, age1]] });
    tris.push({ p: [A.a, B.b, B.a], w: [[0, age0], [1, age1], [0, age1]] });
  }
  let x0 = SW, y0 = SH, x1 = 0, y1 = 0;
  const proj = (p) => [FX * SS + (p[0] * r[0] + p[1] * r[1] + p[2] * r[2]) * SF, FY * SS - (p[0] * u[0] + p[1] * u[1] + p[2] * u[2]) * SF];
  for (const s of segs)
    for (const p of [s.a, s.b]) {
      const [sx, sy] = proj(p);
      x0 = Math.min(x0, sx);
      y0 = Math.min(y0, sy);
      x1 = Math.max(x1, sx);
      y1 = Math.max(y1, sy);
    }
  x0 = Math.max(0, Math.floor(x0) - 1);
  y0 = Math.max(0, Math.floor(y0) - 1);
  x1 = Math.min(SW - 1, Math.ceil(x1) + 1);
  y1 = Math.min(SH - 1, Math.ceil(y1) + 1);
  for (let sy = y0; sy <= y1; sy++)
    for (let sx = x0; sx <= x1; sx++) {
      const a = (sx + 0.5 - FX * SS) / SF;
      const b = (FY * SS - (sy + 0.5)) / SF;
      const ox = r[0] * a + u[0] * b - f[0] * 4;
      const oy = r[1] * a + u[1] * b - f[1] * 4;
      const oz = r[2] * a + u[2] * b - f[2] * 4;
      let best = null;
      for (const tr of tris) {
        const h = rayTri(ox, oy, oz, f[0], f[1], f[2], ...tr.p);
        if (!h || (best && h[0] >= best.t)) continue;
        const [t, uu, vv] = h;
        const ww = 1 - uu - vv;
        const along = tr.w[0][0] * ww + tr.w[1][0] * uu + tr.w[2][0] * vv;
        const age = tr.w[0][1] * ww + tr.w[1][1] * uu + tr.w[2][1] * vv;
        best = { t, along, age };
      }
      if (!best) continue;
      const i = sy * SW + sx;
      if (under && under[i] < best.t - 0.02) continue;
      cov[i] = Math.pow(best.age, 1.4) * (0.35 + 0.65 * best.along);
      tip[i] = best.along;
    }
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0, t = 0;
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++) {
          const k = (y * SS + j) * SW + x * SS + i;
          a += cov[k];
          t = Math.max(t, tip[k]);
        }
      a /= SS * SS;
      if (a < 0.08) continue;
      // tons: núcleo branco, borda azul-gelo; alpha em degraus (visual pixelado)
      const q = a > 0.55 ? 0.95 : a > 0.32 ? 0.7 : a > 0.16 ? 0.45 : 0.25;
      const c = q > 0.9 ? [255, 255, 255] : q > 0.6 ? [216, 240, 255] : [160, 206, 255];
      const o = (y * W + x) * 4;
      rgba[o] = c[0];
      rgba[o + 1] = c[1];
      rgba[o + 2] = c[2];
      rgba[o + 3] = Math.round(q * 255);
    }
  return rgba;
}

/** Projeta um ponto do espaço do personagem: px finais (x, y) e profundidade t. */
export function project(p, yawDeg) {
  const psi = yawDeg * DEG;
  const f = rotY(F_W, -psi), r = rotY(R_W, -psi), u = rotY(U_W, -psi);
  const { FX, FY, S } = CFG;
  return {
    x: FX + (p[0] * r[0] + p[1] * r[1] + p[2] * r[2]) * S,
    y: FY - (p[0] * u[0] + p[1] * u[1] + p[2] * u[2]) * S,
    t: p[0] * f[0] + p[1] * f[1] + p[2] * f[2] + 4,
  };
}
