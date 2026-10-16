import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ramp, sculptor, shade } from './sdf.mjs';

// Chefes de mundo gigantes, esculpidos por código com o mesmo motor das
// montarias (scripts/sdf.mjs): vista de lado (virados para a direita; o jogo
// espelha), quadros de 320×240 px de arte exibidos a 0,5 (160×120 px do mundo,
// ~4× a altura do herói). Cada um tem 16 quadros: andar (0–5), ataque (6–11:
// preparo 6–9, golpe 10, 11 volta) e especial (12–15: preparo 12–13, solta
// 14–15).

export const BW = 320;
export const BH = 240;
const W = BW;
const H = BH;
const GROUND = 232;
const { Canvas, ik, stepCycle } = sculptor(W, H, GROUND);

export const BOSS_ANIMS = { walk: [0, 6], atk: [6, 6], cast: [12, 4] };
const NFR = 16;
/** Golpe do ataque e momento em que o especial é solto (quadro). */
export const BOSS_HIT = { atk: 10, cast: 14 };

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
/** Quadros-chave: [[t, valor], …] com valores número ou lista. */
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) {
      const u = ease((t - t0) / (t1 - t0 || 1));
      return Array.isArray(v0) ? v0.map((v, k) => lerp(v, v1[k], u)) : lerp(v0, v1, u);
    }
  }
  return keys[keys.length - 1][1];
}
/** Pose do quadro: animação e progresso 0..1. */
function poseOf(f) {
  if (f < 6) return { anim: 'walk', t: f / 6 };
  if (f < 12) return { anim: 'atk', t: (f - 6) / 5 };
  return { anim: 'cast', t: (f - 12) / 3 };
}

/** Membro de dois ossos (quadril → joelho → pé) por cinemática inversa. */
function limb(C, hx, hy, fx, fy, a, b, bend, r, k = 3) {
  const [kx, ky] = ik(hx, hy, fx, fy, a, b, bend);
  const s = C.shape(k).chain([
    [hx, hy, r[0]],
    [lerp(hx, kx, 0.5), lerp(hy, ky, 0.5), (r[0] + r[1]) / 2 + 1],
    [kx, ky, r[1]],
    [fx, fy, r[2]],
  ]);
  return { s, kx, ky };
}

/** Linhas de rachadura/facetas: escurece um tom ao longo de segmentos. */
function cracks(C, mask, segs, col) {
  for (const [x0, y0, x1, y1] of segs) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      const j = y * W + x;
      if (x < 0 || y < 0 || x >= W || y >= H || !mask[j]) continue;
      if (col) C.px(x, y, col);
      else C.idx[j] = Math.max(1, C.idx[j] - 2);
    }
  }
}

// ================================================================== Colosso de Pedra
function colossus(C, f) {
  const { anim, t } = poseOf(f);
  const rock = '#8c8579';
  const R = ramp(rock);
  const Rd = ramp(shade(rock, -0.14));
  const Rl = ramp(shade(rock, 0.06));
  const moss = ramp('#628c3a');
  const cry = ramp('#45c4e6');
  const glow = '#7af4ff';
  const glow2 = '#e0ffff';
  let bob = 0;
  let lean = 0;
  let feet = [
    [140, 0],
    [180, 0],
  ];
  let fistN = [228, 198];
  let fistF = [150, 192];
  let rockInHand = false;
  if (anim === 'walk') {
    const a = stepCycle(t, 36, 16);
    const b = stepCycle(t + 0.5, 36, 16);
    feet = [
      [148 + b.x, b.lift],
      [172 + a.x, a.lift],
    ];
    bob = Math.round(Math.abs(Math.cos(t * Math.PI * 2)) * 4) - 2;
    fistN = [228 - a.x * 0.5, 198 - Math.max(0, Math.sin(t * Math.PI * 2)) * 8];
    fistF = [150 - b.x * 0.5, 192 - Math.max(0, -Math.sin(t * Math.PI * 2)) * 8];
  } else if (anim === 'atk') {
    fistN = kf(t, [[0, [228, 198]], [0.4, [206, 40]], [0.6, [200, 32]], [0.8, [262, 212]], [1, [244, 204]]]);
    fistF = kf(t, [[0, [150, 192]], [0.4, [176, 44]], [0.6, [172, 36]], [0.8, [244, 210]], [1, [168, 196]]]);
    lean = kf(t, [[0, 0], [0.5, -8], [0.8, 14], [1, 4]]);
    bob = kf(t, [[0, 0], [0.5, -4], [0.8, 6], [1, 0]]);
  } else {
    rockInHand = t < 0.7;
    fistN = kf(t, [[0, [232, 214]], [0.34, [128, 62]], [0.67, [156, 44]], [1, [272, 118]]]);
    fistF = kf(t, [[0, [150, 192]], [0.67, [206, 150]], [1, [168, 196]]]);
    lean = kf(t, [[0, 6], [0.34, -10], [0.67, -6], [1, 12]]);
    bob = kf(t, [[0, 4], [0.5, -2], [1, 2]]);
  }
  const sh = (x, y) => [x + lean * ((GROUND - y) / 140), y + bob];
  const hipN = sh(172, 156);
  const hipF = sh(150, 154);
  const [shNx, shNy] = sh(190, 82);
  const [shFx, shFy] = sh(150, 80);

  /** Braço de rocha: ombro → cotovelo → punho, antebraço grosso (de gorila). */
  const arm = (sx, sy, fx, fy, far) => {
    const bend = anim === 'walk' ? 1 : -1;
    const [ex, ey] = ik(sx, sy, fx, fy, 56, 56, bend);
    const ramp0 = far ? Rd : R;
    const br = far ? -0.08 : 0;
    const up = C.shape(4).chain([[sx, sy, 17], [lerp(sx, ex, 0.5), lerp(sy, ey, 0.5), 15], [ex, ey, 14]]);
    const um = C.sculpt(up, ramp0, { R: 15, dither: 0.4, bright: br });
    const fo = C.shape(4).chain([[ex, ey, 15], [lerp(ex, fx, 0.55), lerp(ey, fy, 0.55), 19], [fx, fy, 17]]);
    const fm = C.sculpt(fo, ramp0, { R: 18, dither: 0.4, bright: br });
    const fist = C.shape(3).circle(fx, fy + 4, 21).ellipse(fx + 7, fy + 9, 17, 13);
    const km = C.sculpt(fist, ramp0, { R: 16, dither: 0.4, bright: br });
    if (!far) {
      cracks(C, fm, [[lerp(ex, fx, 0.3) - 10, lerp(ey, fy, 0.3), lerp(ex, fx, 0.3) + 8, lerp(ey, fy, 0.3) + 6]]);
      cracks(C, km, [[fx - 6, fy - 4, fx + 12, fy + 2], [fx + 2, fy + 10, fx + 18, fy + 12]]);
      cracks(C, um, [[sx - 8, sy + 14, sx + 8, sy + 20]]);
      // runas acesas no antebraço
      const rx = lerp(ex, fx, 0.45);
      const ry = lerp(ey, fy, 0.45);
      for (let i = -2; i <= 2; i++) C.px(rx + i * 2 - 2, ry + Math.abs(i) * 2 - 2, (i + f) % 3 ? glow : glow2);
    }
  };
  const leg = (hx, hy, fx, lift, far) => {
    const fy = GROUND - 16 - lift;
    const [kx, ky] = ik(hx, hy, fx, fy, 34, 34, 1);
    const r0 = far ? Rd : R;
    const br = far ? -0.08 : 0;
    const th = C.shape(4).chain([[hx, hy, 25], [kx, ky, 20]]);
    C.sculpt(th, r0, { R: 20, dither: 0.4, bright: br });
    const sn = C.shape(4).chain([[kx, ky, 19], [fx, fy, 18]]);
    const sm = C.sculpt(sn, r0, { R: 18, dither: 0.4, bright: br });
    if (!far) cracks(C, sm, [[kx - 10, ky + 12, kx + 6, ky + 18]]);
    // pé de laje com dedos de pedra
    const ft = C.shape(3).poly([[fx - 24, fy + 2], [fx - 16, fy - 10], [fx + 18, fy - 8], [fx + 32, fy + 6], [fx + 30, fy + 14], [fx - 24, fy + 14]], 5);
    C.sculpt(ft, r0, { R: 10, dither: 0.4, bright: br });
  };

  // ---- de lá
  arm(shFx, shFy, fistF[0], fistF[1], true);
  leg(hipF[0], hipF[1], feet[0][0], feet[0][1], true);
  // cristais crescendo das costas (atrás do tronco, saindo pela silhueta)
  const cryst = (x, y, ang, len, w) => {
    const [bx, by] = sh(x, y);
    const tx = bx + Math.cos(ang) * len;
    const ty = by + Math.sin(ang) * len;
    const nx = -Math.sin(ang) * w;
    const ny = Math.cos(ang) * w;
    const sh0 = C.shape(0.6).poly([[bx - nx, by - ny], [bx + nx, by + ny], [tx + nx * 0.4, ty + ny * 0.4], [tx + Math.cos(ang) * 6, ty + Math.sin(ang) * 6], [tx - nx * 0.4, ty - ny * 0.4]]);
    C.sculpt(sh0, cry, { R: w, bright: 0.12, round: 0.6, dither: 0.1 });
    C.line(bx, by, tx, ty, (f + x) % 4 < 2 ? glow2 : glow);
  };
  cryst(128, 66, -2.2, 46, 9);
  cryst(146, 54, -1.75, 52, 10);
  cryst(118, 90, -2.7, 34, 7);
  cryst(164, 56, -1.35, 30, 7);

  // ---- tronco: peito largo, corcunda, cintura mais fina
  const body = C.shape(8);
  body.ellipse(...sh(164, 108), 52, 46, -0.15);
  body.circle(...sh(140, 80), 34).circle(...sh(172, 76), 32);
  body.ellipse(...sh(164, 150), 32, 24);
  body.poly([sh(116, 98), sh(132, 58), sh(176, 46), sh(208, 70), sh(212, 118), sh(190, 150), sh(140, 156), sh(114, 128)], 10);
  const mossTop = C.shape(6).ellipse(...sh(150, 52), 42, 13).ellipse(...sh(186, 60), 20, 9);
  const plate = C.shape(5).poly([sh(176, 92), sh(208, 86), sh(214, 126), sh(196, 146), sh(172, 128)]);
  const bodyMask = C.sculpt(body, R, { R: 34, dither: 0.45, round: 1.1, regions: [[mossTop, moss, 0.25], [plate, Rl, 0.1]] });
  const seg = (a, b, c, d) => [...sh(a, b), ...sh(c, d)];
  cracks(C, bodyMask, [seg(122, 112, 150, 104), seg(150, 104, 160, 130), seg(160, 130, 186, 148), seg(134, 142, 158, 152), seg(146, 74, 168, 90), seg(168, 90, 176, 92), seg(120, 92, 130, 70), seg(176, 92, 172, 128), seg(172, 128, 196, 146)]);
  // núcleo de cristal no peito, entre as placas
  const pulse = f % 4 < 2;
  const [cx, cy] = sh(200, 108);
  C.sculpt(C.shape(1).poly([[cx - 9, cy + 9], [cx - 3, cy - 15], [cx + 6, cy - 5], [cx + 4, cy + 11]]), cry, { R: 6, bright: pulse ? 0.35 : 0.2 });
  C.line(cx - 3, cy - 10, cx + 1, cy + 7, glow2);
  C.px(cx - 5, cy - 1, pulse ? glow2 : glow, 2, 2);
  for (const [x0, y0, x1, y1] of [[cx - 9, cy + 4, cx - 34, cy + 22], [cx - 7, cy - 6, cx - 28, cy - 30], [cx + 2, cy + 11, cx - 2, cy + 36]]) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n + Math.sin(i * 0.7) * 1.5);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      if (bodyMask[y * W + x] && (i + f) % 6) C.px(x, y, i % 3 ? glow : '#4ab8d8');
    }
  }
  // musgo pendurado
  for (let i = 0; i < 8; i++) {
    const [mx, my] = sh(122 + i * 9, 52 + (i % 3) * 3);
    for (let k = 0; k < 3 + ((i * 5) % 5); k++) C.px(mx, my + k, k % 2 ? '#3f6a2a' : '#78a248');
  }

  // ---- cabeça: bloco com testa saliente, afundada à frente dos ombros
  const hx0 = 218;
  const hy0 = 86 + (anim === 'cast' ? kf(t, [[0, 0], [0.34, -6], [1, 4]]) : 0);
  const [hx, hy] = sh(hx0, hy0);
  const head = C.shape(4).poly([[hx - 24, hy - 10], [hx - 10, hy - 25], [hx + 17, hy - 20], [hx + 27, hy - 2], [hx + 25, hy + 19], [hx - 5, hy + 24], [hx - 22, hy + 12]], 6);
  const hm = C.sculpt(head, R, { R: 16, dither: 0.4, regions: [[C.shape(3).ellipse(hx - 4, hy - 18, 18, 6), moss, 0.25]] });
  // testa (sombra sobre os olhos) e mandíbula
  cracks(C, hm, [[hx - 10, hy - 2, hx + 22, hy - 4], [hx + 2, hy + 10, hx + 20, hy + 8]]);
  C.px(hx + 6, hy + 1, glow2, 5, 3);
  C.px(hx + 7, hy + 2, '#ffffff', 2, 1);
  C.px(hx - 4, hy + 1, glow, 3, 3);
  if (anim === 'cast' && t > 0.2) C.px(hx + 8, hy + 10, '#1a2a30', 10, 3);
  // ---- de cá
  leg(hipN[0], hipN[1], feet[1][0], feet[1][1], false);
  // ombreira de rocha com cristal
  const [px0, py0] = sh(190, 72);
  const pauld = C.shape(5).poly([[px0 - 30, py0 + 6], [px0 - 22, py0 - 18], [px0 + 4, py0 - 26], [px0 + 26, py0 - 10], [px0 + 24, py0 + 18], [px0 - 8, py0 + 26]], 8);
  const pm = C.sculpt(pauld, R, { R: 22, dither: 0.45, regions: [[C.shape(4).ellipse(px0 - 4, py0 - 22, 24, 8), moss, 0.25]] });
  cracks(C, pm, [[px0 - 18, py0 - 4, px0 + 10, py0 + 2], [px0 + 10, py0 + 2, px0 + 16, py0 + 18]]);
  cryst(186, 50, -1.2, 26, 6);
  arm(shNx, shNy, fistN[0], fistN[1], false);
  if (rockInHand) {
    const [qx, qy] = [fistN[0] + 6, fistN[1] - 24];
    const rk = C.shape(4).poly([[qx - 22, qy + 10], [qx - 14, qy - 18], [qx + 14, qy - 20], [qx + 24, qy + 4], [qx + 6, qy + 20]]);
    const rm = C.sculpt(rk, ramp('#6e675c'), { R: 16, dither: 0.45 });
    cracks(C, rm, [[qx - 12, qy - 4, qx + 10, qy + 2]]);
  }
}

// ================================================================== ajudas comuns
/** Perna de quadrúpede: quadril → joelho → pé no chão (ou erguido), com pata. */
function qleg(C, hx, hy, fx, lift, a, b, bend, r, rp, o = {}) {
  const fy = GROUND - (o.footH ?? 8) - lift;
  const [kx, ky] = ik(hx, hy, fx, fy, a, b, bend);
  const s = C.shape(4).chain([[hx, hy, r[0]], [lerp(hx, kx, 0.5), lerp(hy, ky, 0.5), (r[0] + r[1]) / 2], [kx, ky, r[1]], [fx, fy, r[2]]]);
  const m = C.sculpt(s, rp, { R: o.R ?? 16, bright: o.bright ?? 0, dither: o.dither ?? 0.3 });
  const ft = C.shape(2).ellipse(fx + 3, fy + (o.footH ?? 8) / 2 + 1, r[2] + 4, (o.footH ?? 8) / 2 + 2);
  C.sculpt(ft, o.footR ?? rp, { R: 6, bright: o.bright ?? 0 });
  if (o.claws) for (let i = 0; i < 3; i++) C.px(fx + r[2] + 1 - i * 4, fy + (o.footH ?? 8) + 1, o.claws);
  return { m, kx, ky, fx, fy };
}
/** Pontos de uma curva quadrática (pescoços, caudas). */
function bez(p0, p1, p2, n, r0, r1) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = (1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0];
    const y = (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1];
    out.push([x, y, lerp(r0, r1, u)]);
  }
  return out;
}
/** Escamas: grade em losango (dois feixes de linhas). */
function scales(C, mask, gap = 6) {
  C.streaks(mask, 0.8, gap, 1);
  C.streaks(mask, -0.8, gap, 1, gap / 2);
}

// ================================================================== Hidra
function hydra(C, f) {
  const { anim, t } = poseOf(f);
  const skin = '#3d8a74';
  const R = ramp(skin);
  const Rd = ramp(shade(skin, -0.12));
  const belly = ramp('#d6c47a');
  const frill = ramp('#8a4ab0');
  const eye = '#ffe24a';
  let bob = 0;
  let steps = [0, 0.5, 0.5, 0];
  if (anim === 'walk') bob = Math.round(Math.sin(t * Math.PI * 4) * 2);
  // cabeças: [base, ponto de controle, cabeça, boca aberta 0..1]
  const sway = (k) => (anim === 'walk' ? Math.sin(t * Math.PI * 2 + k * 2.1) * 6 : 0);
  let heads;
  if (anim === 'walk')
    heads = [
      [[146, 138], [150, 40], [204 + sway(0), 40 + sway(2)], 0.1],
      [[162, 148], [232, 40], [244 + sway(1), 84 - sway(0)], 0.15],
      [[174, 160], [270, 160], [270 + sway(2), 124 + sway(1)], 0.2],
    ];
  else if (anim === 'atk') {
    // recuam e dão o bote juntas, em leque
    const op = kf(t, [[0, 0.1], [0.5, 0.9], [0.8, 1], [1, 0.3]]);
    // repouso → recuo → bote (para baixo e à frente) → volta
    const H = (b, c, rest, back, bite) => [b, kf(t, [[0, c], [0.5, [c[0] - 20, c[1] - 10]], [0.8, [c[0] + 20, c[1] + 40]], [1, c]]), kf(t, [[0, rest], [0.4, back], [0.6, back], [0.8, bite], [1, rest]]), op];
    heads = [
      H([146, 138], [150, 40], [204, 40], [176, 30], [228, 170]),
      H([162, 148], [232, 40], [244, 84], [214, 70], [250, 190]),
      H([174, 160], [270, 160], [270, 124], [240, 112], [262, 204]),
    ];
  } else {
    // erguem-se, enchem e cospem veneno
    const up = kf(t, [[0, 0], [0.5, 1], [1, 0.3]]);
    const op = kf(t, [[0, 0.1], [0.4, 0.3], [0.67, 1], [1, 0.8]]);
    heads = [
      [[146, 138], [140, 30], [204 + up * 4, 40 - up * 16], op],
      [[162, 148], [226, 20], [246 + up * 6, 84 - up * 30], op],
      [[174, 160], [272, 150], [272 + up * 6, 124 - up * 36], op],
    ];
  }
  const neck = (h, rp, br) => {
    const [b0, c0, hd] = h;
    const pts = bez([b0[0], b0[1] + bob], [c0[0], c0[1] + bob], [hd[0], hd[1] + bob], 7, 19, 10);
    const m = C.sculpt(C.shape(4).chain(pts), rp, { R: 14, bright: br, regions: [[C.shape(2).chain(pts.map(([x, y, r]) => [x + r * 0.62, y + r * 0.62, r * 0.38])), belly, 0.3]] });
    scales(C, m, 6);
    // barbatana ao longo do pescoço
    for (let i = 1; i < pts.length - 1; i += 2) {
      const [x, y, r] = pts[i];
      C.sculpt(C.shape(0.6).poly([[x - 5, y - r + 2], [x - 1, y - r - 9], [x + 4, y - r + 2]]), frill, { R: 3, bright: br, cast: false });
    }
    return pts;
  };
  const head = (h, pts, rp, br) => {
    const [x, y] = [h[2][0], h[2][1] + bob];
    const [px, py] = pts[pts.length - 3];
    let dx = x - px;
    let dy = y - py;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    // cabeça olha mais para a frente do que o pescoço
    const ax = dx * 0.6 + 0.4;
    const ay = dy * 0.6;
    const al = Math.hypot(ax, ay);
    const ux = ax / al;
    const uy = ay / al;
    const nx = -uy;
    const ny = ux;
    const P = (a, b) => [x + (ux * a + nx * b) * 1.45, y + (uy * a + ny * b) * 1.45];
    const open = h[3];
    // crista atrás da cabeça
    C.sculpt(C.shape(1).poly([P(-6, -8), P(-24, -20), P(-16, -6), P(-26, 2), P(-6, 4)]), frill, { R: 4, bright: br });
    const sk = C.shape(3).ellipse(...P(0, -1), 21, 17, Math.atan2(uy, ux)).cone(...P(4, -2), 14, ...P(26, -1 - open * 3), 8.5);
    const hm = C.sculpt(sk, rp, { R: 10, bright: br });
    scales(C, hm, 5);
    // mandíbula
    const jaw = C.shape(2).cone(...P(2, 8), 7, ...P(23, 7 + open * 12), 3.5);
    C.sculpt(jaw, rp, { R: 6, bright: br - 0.04, regions: [[C.shape(1).cone(...P(2, 11), 5, ...P(23, 9 + open * 12), 2), belly, 0.3]] });
    if (open > 0.4) {
      const [mx, my] = P(18, 3 + open * 5);
      C.px(mx, my, '#3a0a1a', 6, 3);
      for (let i = 0; i < 4; i++) {
        const [tx, ty] = P(8 + i * 5, 3);
        C.px(tx, ty, '#f4f0e0');
        const [bx, by] = P(8 + i * 5, 4 + open * 10);
        C.px(bx, by - 1, '#f4f0e0');
      }
      if (anim === 'cast') {
        const [vx, vy] = P(30, 4 + open * 6);
        C.px(vx, vy, '#9aff4a', 3, 3);
        C.px(vx + 3, vy + 2, '#d8ff8a', 2, 2);
      }
    }
    const [ex, ey] = P(6, -6);
    C.px(ex, ey, eye, 3, 2);
    C.px(ex + 1, ey, '#1a0a10', 1, 2);
    // chifres
    C.sculpt(C.shape(1).cone(...P(-2, -10), 3, ...P(-14, -22), 1), ramp('#e8dcc0'), { R: 2, bright: br });
  };

  // cauda e pernas de lá
  const tail = bez([82, 178 + bob], [36, 186 + bob], [10, 218], 6, 24, 7);
  const tm = C.sculpt(C.shape(4).chain(tail), Rd, { R: 14 });
  scales(C, tm, 6);
  const wk = (k) => (anim === 'walk' ? stepCycle(t + steps[k], 18, 8) : { x: 0, lift: 0 });
  qleg(C, 112, 186 + bob, 110 + wk(0).x, wk(0).lift, 22, 22, -1, [16, 12, 10], Rd, { bright: -0.08, claws: '#e8dcc0' });
  qleg(C, 184, 184 + bob, 192 + wk(1).x, wk(1).lift, 22, 22, 1, [15, 11, 10], Rd, { bright: -0.08, claws: '#e8dcc0' });
  // pescoço e cabeça de trás
  const p0 = neck(heads[0], Rd, -0.08);
  head(heads[0], p0, Rd, -0.08);
  // corpo
  const body = C.shape(8).ellipse(140, 172 + bob, 74, 42).circle(118, 150 + bob, 36).circle(176, 160 + bob, 32);
  const bm = C.sculpt(body, R, { R: 30, regions: [[C.shape(4).ellipse(146, 206 + bob, 66, 16), belly, 0.3]] });
  scales(C, bm, 7);
  // espinhos do dorso
  for (let i = 0; i < 7; i++) {
    const x = 70 + i * 16;
    const y = 146 + bob - Math.sin((i / 6) * Math.PI) * 26;
    C.sculpt(C.shape(0.6).poly([[x - 7, y + 6], [x + 2, y - 14], [x + 7, y + 6]]), frill, { R: 4, cast: false });
  }
  // manchas
  for (const [x, y, r] of [[100, 160, 6], [130, 150, 7], [160, 168, 5], [116, 182, 5]]) C.nudge(C.shape(2).circle(x, y + bob, r), -1);
  // pescoço do meio e cabeça
  const p1 = neck(heads[1], R, 0);
  head(heads[1], p1, R, 0);
  // pernas de cá
  qleg(C, 124, 196 + bob, 120 + wk(2).x, wk(2).lift, 22, 22, -1, [18, 13, 11], R, { claws: '#f4ecd8' });
  qleg(C, 194, 194 + bob, 204 + wk(3).x, wk(3).lift, 22, 22, 1, [17, 12, 11], R, { claws: '#f4ecd8' });
  // pescoço da frente
  const p2 = neck(heads[2], R, 0.04);
  head(heads[2], p2, R, 0.04);
}

// ================================================================== Dragão Ancestral
function dragon(C, f) {
  const { anim, t } = poseOf(f);
  const hide = '#6e2a2c';
  const R = ramp(hide);
  const Rd = ramp(shade(hide, -0.1));
  const belly = ramp('#d89a4a');
  const memb = ramp('#8e3a30');
  const membD = ramp('#6a2a26');
  const horn = ramp('#e6d8b8');
  const ember = '#ffb040';
  const ember2 = '#fff0a0';
  let bob = 0;
  let lift = 0; // ergue a frente (bote / sopro)
  let headP = [262, 92];
  let neckC = [244, 70];
  let open = 0.1;
  let wingA = 0; // 0 meio-aberta, 1 aberta pra cima
  let clawUp = 0;
  if (anim === 'walk') {
    bob = Math.round(Math.sin(t * Math.PI * 4) * 2);
    wingA = 0.15 + Math.sin(t * Math.PI * 2) * 0.1;
  } else if (anim === 'atk') {
    // empina e desce as garras e a mordida
    lift = kf(t, [[0, 0], [0.4, 22], [0.6, 24], [0.8, -4], [1, 0]]);
    clawUp = kf(t, [[0, 0], [0.4, 1], [0.6, 1], [0.8, -0.3], [1, 0]]);
    headP = kf(t, [[0, [262, 92]], [0.4, [244, 56]], [0.6, [242, 52]], [0.8, [268, 166]], [1, [262, 108]]]);
    neckC = kf(t, [[0, [244, 70]], [0.5, [232, 40]], [0.8, [270, 100]], [1, [248, 80]]]);
    open = kf(t, [[0, 0.1], [0.5, 0.5], [0.8, 1], [1, 0.3]]);
    wingA = kf(t, [[0, 0.2], [0.5, 1], [0.8, 0.6], [1, 0.3]]);
  } else {
    // puxa o ar (peito acende) e solta o fogo
    headP = kf(t, [[0, [262, 92]], [0.34, [236, 60]], [0.67, [266, 102]], [1, [268, 106]]]);
    neckC = kf(t, [[0, [244, 70]], [0.34, [222, 50]], [0.67, [262, 72]], [1, [266, 76]]]);
    open = kf(t, [[0, 0.1], [0.34, 0.2], [0.67, 1], [1, 1]]);
    wingA = kf(t, [[0, 0.2], [0.34, 0.9], [1, 0.7]]);
    lift = kf(t, [[0, 0], [0.34, 8], [1, 2]]);
  }
  // inclinação: a frente sobe `lift` (pivô nas patas de trás)
  const sh = (x, y) => [x, y + bob - lift * Math.max(0, (x - 100) / 140)];
  const glow = anim === 'cast' && t > 0.2;

  // asa de lá
  const wing = (far) => {
    const [sx, sy] = sh(far ? 150 : 164, far ? 116 : 122);
    const up = wingA;
    const k = far ? 0.92 : 1;
    const wx = sx - 18 * k;
    const wy = sy - lerp(84, 104, up) * k;
    // dedos em leque para trás; a membrana tem a borda de fuga recortada
    const tips = [
      [sx - lerp(84, 70, up) * k, wy - lerp(6, 22, up) * k],
      [sx - lerp(122, 112, up) * k, sy - lerp(56, 78, up) * k],
      [sx - lerp(126, 124, up) * k, sy - lerp(14, 34, up) * k],
    ];
    const back = [sx - 64 * k, sy + 4];
    const ms = C.shape(1).poly([[sx, sy], [wx, wy], ...tips, back]);
    const edge = [...tips, back];
    for (let i = 0; i < edge.length - 1; i++) {
      const mx = (edge[i][0] + edge[i + 1][0]) / 2;
      const my = (edge[i][1] + edge[i + 1][1]) / 2;
      const dx = mx - wx;
      const dy = my - wy;
      const dl = Math.hypot(dx, dy) || 1;
      ms.sub(C.shape().circle(mx + (dx / dl) * 10, my + (dy / dl) * 10, 16).ops[0].p, 2);
    }
    C.sculpt(ms, far ? membD : memb, { R: 8, flat: 0.55, bright: far ? -0.1 : 0 });
    // nervuras da membrana
    if (!far) for (const [tx, ty] of tips) C.line(lerp(wx, tx, 0.15), lerp(wy, ty, 0.15), lerp(wx, tx, 0.9), lerp(wy, ty, 0.9) + 6, '#5a1e1a');
    // ossos (braço e dedos)
    const bone = C.shape(2).cone(sx, sy, 9, wx, wy, 6);
    for (const [tx, ty] of tips) bone.cone(wx, wy, 4.5, tx, ty, 1.5);
    C.sculpt(bone, far ? Rd : R, { R: 6, bright: far ? -0.1 : 0 });
    C.sculpt(C.shape(1).cone(wx, wy, 3.5, wx + 8, wy - 14, 0.8), horn, { R: 2 });
  };
  wing(true);
  // cauda com ponta de lança
  const [t0x, t0y] = sh(90, 158);
  const sw = anim === 'walk' ? Math.sin(t * Math.PI * 2) * 8 : 0;
  const tail = bez([t0x, t0y], [36, 160 + bob + sw], [8, 214], 8, 24, 6);
  const tm = C.sculpt(C.shape(4).chain(tail), R, { R: 14, regions: [[C.shape(2).chain(tail.map(([x, y, r]) => [x, y + r * 0.6, r * 0.5])), belly, 0.3]] });
  scales(C, tm, 6);
  C.sculpt(C.shape(1).poly([[4, 206], [-2, 226], [18, 218], [14, 206]]), horn, { R: 4 });
  // pernas de lá
  const wk = (k) => (anim === 'walk' ? stepCycle(t + [0.1, 0.5, 0.6, 0][k], 26, 10) : { x: 0, lift: 0 });
  const hipF = sh(108, 160);
  qleg(C, hipF[0], hipF[1], 102 + wk(0).x, wk(0).lift, 30, 32, -1, [24, 15, 12], Rd, { bright: -0.08, claws: '#e6d8b8' });
  const shF = sh(194, 158);
  qleg(C, shF[0], shF[1], 206 + wk(1).x - clawUp * 4, wk(1).lift + clawUp * 30, 30, 30, 1, [19, 14, 12], Rd, { bright: -0.08, claws: '#e6d8b8' });
  // corpo e pescoço
  const body = C.shape(8).ellipse(...sh(150, 150), 70, 38).circle(...sh(106, 146), 34).circle(...sh(198, 146), 32);
  const n0 = sh(206, 132);
  const neck = bez(n0, [neckC[0], neckC[1] + bob], [headP[0] - 6, headP[1] + bob - 4], 7, 24, 13);
  body.chain(neck, 6);
  const bellyS = C.shape(4).ellipse(...sh(152, 186), 60, 12).chain(neck.map(([x, y, r]) => [x + r * 0.6, y + r * 0.62, r * 0.4]), 3);
  const bm = C.sculpt(body, R, { R: 30, regions: [[bellyS, belly, 0.35]] });
  scales(C, bm, 7);
  // placas do peito (faixas na barriga)
  for (let i = 0; i < 9; i++) C.nudge(C.shape(0.5).ellipse(...sh(108 + i * 12, 186 - Math.sin((i / 8) * Math.PI) * 4), 1, 10), -1);
  // brasas nas rachaduras do couro (o peito acende ao puxar o fogo)
  const hot = glow ? ember2 : ember;
  for (const [x0, y0, x1, y1] of [[132, 140, 150, 152], [150, 152, 168, 146], [178, 156, 196, 168], [116, 160, 128, 172], [200, 140, 214, 128]]) {
    const [a, b] = sh(x0, y0);
    const [c, d] = sh(x1, y1);
    C.line(a, b, c, d, (x0 + f) % 3 ? hot : '#e06a20');
  }
  if (glow) for (let i = 0; i < 6; i++) C.px(...sh(190 + (i % 3) * 6, 160 + Math.floor(i / 3) * 6), ember2, 2, 2);
  // espinhos das costas e do pescoço
  for (let i = 0; i < 6; i++) {
    const [x, y] = sh(96 + i * 18, 114 - Math.sin((i / 5) * Math.PI) * 6);
    C.sculpt(C.shape(0.6).poly([[x - 6, y + 6], [x + 3, y - 12], [x + 6, y + 6]]), horn, { R: 3, cast: false });
  }
  for (let i = 1; i < neck.length - 1; i += 2) {
    const [x, y, r] = neck[i];
    C.sculpt(C.shape(0.6).poly([[x - 5, y - r + 3], [x - 2, y - r - 8], [x + 4, y - r + 3]]), horn, { R: 3, cast: false });
  }
  // cabeça
  const [hx, hy] = [headP[0], headP[1] + bob];
  const [lx, ly] = neck[neck.length - 2];
  let ux = hx - lx;
  let uy = hy - ly;
  const ul = Math.hypot(ux, uy) || 1;
  ux = (ux / ul) * 0.5 + 0.5;
  uy = (uy / ul) * 0.5;
  const l2 = Math.hypot(ux, uy);
  ux /= l2;
  uy /= l2;
  const nx = -uy;
  const ny = ux;
  const P = (a, b) => [hx + (ux * a + nx * b) * 1.3, hy + (uy * a + ny * b) * 1.3];
  C.sculpt(C.shape(1).chain([[...P(-6, -10), 5], [...P(-24, -22), 3.5], [...P(-36, -18), 1.5]]), horn, { R: 4 });
  const sk = C.shape(3).ellipse(...P(0, 0), 23, 17, Math.atan2(uy, ux)).cone(...P(6, -2), 15, ...P(34, 2 - open * 2), 9);
  const hm = C.sculpt(sk, R, { R: 12 });
  scales(C, hm, 5);
  // sobrancelha óssea e narina
  C.sculpt(C.shape(1).cone(...P(-2, -11), 4, ...P(16, -9), 2.5), horn, { R: 3 });
  C.px(...P(32, -2), '#2a0a0a', 2, 1);
  const jaw = C.shape(2).cone(...P(-4, 9), 10, ...P(30, 8 + open * 16), 4.5);
  C.sculpt(jaw, R, { R: 8, bright: -0.04, regions: [[C.shape(1).cone(...P(-4, 13), 7, ...P(30, 11 + open * 16), 2), belly, 0.3]] });
  if (open > 0.3) {
    C.px(...P(18, 6 + open * 6), anim === 'cast' && t > 0.5 ? ember2 : '#4a0a10', 10, Math.round(3 + open * 4));
    for (let i = 0; i < 5; i++) {
      C.px(...P(10 + i * 5, 5), '#f4f0e0');
      C.px(...P(10 + i * 5, 6 + open * 13), '#f4f0e0');
    }
    if (anim === 'cast' && t > 0.5) for (let i = 0; i < 6; i++) C.px(...P(34 + i * 4, 6 + open * 6 + ((i * 3 + f) % 5) - 2), i % 2 ? ember : ember2, 3, 3);
  }
  const [ex, ey] = P(8, -6);
  C.px(ex, ey, glow ? ember2 : '#ffd040', 4, 2);
  C.px(ex + 2, ey, '#1a0a0a', 1, 2);
  // pernas de cá
  const hipN = sh(116, 168);
  qleg(C, hipN[0], hipN[1], 112 + wk(2).x, wk(2).lift, 30, 32, -1, [28, 17, 14], R, { claws: '#f0e6cc' });
  const shN = sh(204, 166);
  qleg(C, shN[0], shN[1], 218 + wk(3).x + clawUp * 10, wk(3).lift + clawUp * 46, 30, 30, 1, [21, 15, 13], R, { claws: '#f0e6cc' });
  wing(false);
}

// ================================================================== Escorpião-Rei
function scorpion(C, f) {
  const { anim, t } = poseOf(f);
  const shell = '#b47f3e';
  const R = ramp(shell);
  const Rd = ramp(shade(shell, -0.14));
  const joint = ramp('#5e3e26');
  const sting = ramp('#6a2e7a');
  const venom = '#e080ff';
  let bob = 0;
  let pinch = 0.3; // abertura da pinça
  let claw = [0, 0]; // avanço da pinça
  let tailK = 0; // 0 repouso … 1 recolhida … -1 picada
  if (anim === 'walk') bob = Math.round(Math.sin(t * Math.PI * 4));
  else if (anim === 'atk') {
    claw = kf(t, [[0, [0, 0]], [0.4, [-20, -14]], [0.6, [-22, -16]], [0.8, [4, 16]], [1, [0, 2]]]);
    pinch = kf(t, [[0, 0.3], [0.5, 1], [0.75, 1], [0.85, 0], [1, 0.2]]);
  } else tailK = kf(t, [[0, 0], [0.34, 1], [0.67, -1], [1, -0.8]]);
  // cauda: segmentos de uma curva que recolhe (1) ou pica à frente (-1)
  const tailPts = (() => {
    const rest = [[70, 176], [44, 136], [56, 96], [90, 68], [130, 58], [162, 66], [176, 86]];
    const back = [[70, 176], [36, 140], [30, 96], [52, 56], [88, 34], [124, 32], [146, 46]];
    const stab = [[70, 176], [56, 130], [84, 96], [130, 80], [184, 90], [230, 120], [262, 166]];
    const tgt = tailK >= 0 ? back : stab;
    const k = Math.abs(tailK);
    return rest.map((p, i) => [lerp(p[0], tgt[i][0], k), lerp(p[1], tgt[i][1], k) + bob]);
  })();
  // pernas (4 de cada lado), finas e com junta alta
  const legs = (far) => {
    const spread = [52, 26, -10, -40];
    for (let i = 0; i < 4; i++) {
      const hx = 214 - i * 20 + (far ? -6 : 0);
      const hy = 204 + bob + (far ? -8 : 0);
      const ph = (i % 2 ? 0.5 : 0) + (far ? 0.25 : 0);
      const st = anim === 'walk' ? stepCycle(t + ph, 16, 8) : { x: 0, lift: 0 };
      const fx = hx + spread[i] * (far ? 0.8 : 1) + st.x;
      const fy = GROUND - 2 - st.lift;
      const kx = hx + spread[i] * 0.45;
      const ky = hy - 18 + (far ? 2 : 0);
      const s = C.shape(1.5).chain([[hx, hy, 8], [kx, ky, 6], [lerp(kx, fx, 0.55), lerp(ky, fy, 0.5), 4.5], [fx, fy, 2]]);
      C.sculpt(s, far ? Rd : R, { R: 6, bright: far ? -0.12 : 0 });
      C.sculpt(C.shape(1).circle(kx, ky, 5.5), joint, { R: 4, bright: far ? -0.1 : 0 });
    }
  };
  // pinça: braço + garra com dedo móvel
  const pincer = (far) => {
    const bx = far ? 214 : 222;
    const by = (far ? 180 : 192) + bob;
    const cx = (far ? 268 : 280) + claw[0];
    const cy = (far ? 150 : 170) + bob + claw[1];
    const el = [lerp(bx, cx, 0.5) + 6, by - 20];
    const rp = far ? Rd : R;
    const br = far ? -0.1 : 0;
    C.sculpt(C.shape(2).chain([[bx, by, 9], [el[0], el[1], 8]]), rp, { R: 8, bright: br });
    C.sculpt(C.shape(2).chain([[el[0], el[1], 8], [cx - 12, cy, 10]]), rp, { R: 8, bright: br });
    const hand = C.shape(3).ellipse(cx, cy, 28, 18, -0.15);
    C.sculpt(hand, rp, { R: 12, bright: br });
    // dedo fixo (de cima) e móvel (de baixo)
    const op = pinch * 0.6;
    C.sculpt(C.shape(1.5).chain([[cx + 18, cy - 9, 10], [cx + 34, cy - 12 - op * 6, 6], [cx + 46, cy - 4 - op * 10, 1.5]]), rp, { R: 7, bright: br });
    C.sculpt(C.shape(1.5).chain([[cx + 18, cy + 7, 8.5], [cx + 32, cy + 9 + op * 14, 5], [cx + 42, cy + 2 + op * 18, 1.5]]), rp, { R: 6, bright: br + 0.04 });
    if (!far) for (let i = 0; i < 4; i++) C.px(cx + 20 + i * 5, cy - 4 - op * 6, '#f0e8d0');
  };
  legs(true);
  pincer(true);
  // abdômen em gomos (de trás para a frente)
  for (const [x, y, r] of [[78, 184, 21], [102, 186, 25], [130, 188, 28], [160, 190, 30]]) {
    const m = C.sculpt(C.shape(3).ellipse(x, y + bob, r * 1.05, r * 0.8), R, { R: 16, round: 1.4 });
    C.nudge(C.shape(1).ellipse(x - 4, y + bob - r * 0.45, r * 0.6, 2.5), 1);
    C.nudge(C.shape(2).ellipse(x, y + bob + r * 0.55, r, r * 0.3), -1);
    void m;
  }
  // cefalotórax com olhos
  const ceph = C.shape(4).ellipse(198, 190 + bob, 44, 26).circle(224, 192 + bob, 18);
  const cm = C.sculpt(ceph, R, { R: 18, round: 1.4 });
  C.nudge(C.shape(1).ellipse(196, 178 + bob, 26, 3), 1);
  for (const [x, y] of [[226, 182], [232, 184], [220, 180]]) C.px(x, y + bob, '#140a14', 3, 3);
  C.px(227, 182 + bob, '#ffffff');
  void cm;
  // cauda (gomos separados), ferrão
  const tp = tailPts;
  for (let i = 0; i < tp.length - 1; i++) {
    const r = lerp(17, 11, i / (tp.length - 2));
    const [x0, y0] = tp[i];
    const [x1, y1] = tp[i + 1];
    const sg = C.sculpt(C.shape(3).cone(x0, y0, r, x1, y1, r * 0.88), R, { R: 12, round: 1.4 });
    C.nudge(C.shape(1).circle(lerp(x0, x1, 0.4) - 2, lerp(y0, y1, 0.4) - r * 0.5, r * 0.35), 1);
    void sg;
  }
  const [sx, sy] = tp[tp.length - 1];
  const [qx, qy] = tp[tp.length - 2];
  let ux = sx - qx;
  let uy = sy - qy;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  C.sculpt(C.shape(3).circle(sx, sy, 13), sting, { R: 10, bright: 0.05 });
  C.sculpt(C.shape(1).cone(sx + ux * 8, sy + uy * 8, 5, sx + ux * 30 + uy * 6, sy + uy * 30 - ux * 6, 0.6), joint, { R: 4 });
  C.px(sx - 3, sy - 4, venom, 3, 2);
  if (anim === 'cast' && t > 0.5) C.px(sx + ux * 30, sy + uy * 30, venom, 3, 3);
  legs(false);
  pincer(false);
}

// ================================================================== Mamute Ancestral
function mammoth(C, f) {
  const { anim, t } = poseOf(f);
  const fur = '#7c4a2c';
  const R = ramp(fur);
  const Rd = ramp(shade(fur, -0.12));
  const frost = ramp('#dfe9f4');
  const tusk = ramp('#f0e4c4');
  const skin = ramp('#4a3a3a');
  let bob = 0;
  let rear = 0; // ergue a frente (pisão)
  let trunkUp = 0;
  if (anim === 'walk') bob = Math.round(Math.sin(t * Math.PI * 4) * 2);
  else if (anim === 'atk') rear = kf(t, [[0, 0], [0.4, 1], [0.6, 1.05], [0.8, -0.1], [1, 0]]);
  else {
    trunkUp = kf(t, [[0, 0], [0.34, 1], [0.67, 1], [1, 0.6]]);
    rear = kf(t, [[0, 0], [0.34, 0.35], [0.67, 0.2], [1, 0]]);
  }
  // pivô nas patas de trás
  const a = -rear * 0.32;
  const piv = [96, 214];
  const sh = (x, y) => {
    const dx = x - piv[0];
    const dy = y - piv[1];
    return [piv[0] + dx * Math.cos(a) - dy * Math.sin(a), piv[1] + dx * Math.sin(a) + dy * Math.cos(a) + bob];
  };
  const wk = (k) => (anim === 'walk' ? stepCycle(t + [0.1, 0.6, 0.5, 0][k], 26, 12) : { x: 0, lift: 0 });
  const pillar = (hx, hy, fx, lift, far, front) => {
    const [px, py] = sh(hx, hy);
    const fy0 = front ? Math.min(GROUND - 10 - lift, py + 62) : GROUND - 10 - lift;
    const fxx = front ? fx + (px - sh(hx, hy - 0)[0]) + rear * 24 : fx;
    const s = C.shape(4).chain([[px, py, 22], [lerp(px, fxx, 0.5), lerp(py, fy0, 0.5), 18], [fxx, fy0, 17]]);
    const m = C.sculpt(s, far ? Rd : R, { R: 18, bright: far ? -0.1 : 0 });
    C.streaks(m, 1.5, 4, 1, hx);
    // pé redondo de unhas claras
    C.sculpt(C.shape(2).ellipse(fxx + 2, fy0 + 5, 19, 7), skin, { R: 6, bright: far ? -0.1 : 0 });
    for (let i = 0; i < 3; i++) C.px(fxx - 8 + i * 8, fy0 + 9, '#e8dcc0', 4, 2);
  };
  // pernas de lá
  pillar(104, 162, 100 + wk(0).x, wk(0).lift, true, false);
  pillar(186, 160, 194 + wk(1).x, wk(1).lift + rear * 40, true, true);
  // cauda curta
  const [tx0, ty0] = sh(52, 118);
  C.sculpt(C.shape(2).chain([[tx0, ty0, 6], [tx0 - 8, ty0 + 30, 4], [tx0 - 6, ty0 + 42, 5]]), Rd, { R: 5 });
  // corpo peludo: corcunda alta, garupa caída, franja de pelo embaixo
  const body = C.shape(10);
  body.ellipse(...sh(140, 128), 76, 56).circle(...sh(184, 86), 42).circle(...sh(92, 122), 44);
  const hem = [];
  for (let i = 0; i <= 14; i++) {
    const x = 62 + i * 12;
    hem.push(sh(x, 176 + (i % 2 ? 14 : 0) - Math.abs(i - 7) * 1.2));
  }
  body.poly([sh(60, 140), sh(216, 140), ...hem.reverse()], 4);
  const frostTop = C.shape(8).ellipse(...sh(150, 78), 64, 16).circle(...sh(184, 56), 22);
  const bm = C.sculpt(body, R, { R: 40, regions: [[frostTop, frost, 0.25]] });
  C.streaks(bm, 1.45, 5, 1, 0);
  C.streaks(bm, 1.7, 9, 1, 2);
  // pingentes de gelo na franja
  for (let i = 0; i < 6; i++) {
    const [x, y] = sh(80 + i * 22, 182 + (i % 2) * 10);
    C.px(x, y, '#e8f8ff', 2, 4 + (i % 3) * 2);
    C.px(x, y + 4 + (i % 3) * 2, '#a8d8f0', 1, 2);
  }
  // cabeça em domo
  const [hx, hy] = sh(232, 96);
  const head = C.shape(6).circle(hx, hy, 32).ellipse(hx + 12, hy + 24, 22, 20);
  const hm = C.sculpt(head, R, { R: 24, regions: [[C.shape(5).ellipse(hx - 4, hy - 26, 24, 9), frost, 0.25]] });
  C.streaks(hm, 1.3, 4, 1, 1);
  // orelha pequena peluda
  C.sculpt(C.shape(2).ellipse(hx - 22, hy + 6, 9, 14, 0.2), Rd, { R: 6 });
  // olho
  C.px(hx + 10, hy + 6, '#140a0a', 4, 3);
  C.px(hx + 11, hy + 6, '#ffffff');
  C.line(hx + 4, hy + 2, hx + 16, hy + 1, '#3a2418');
  // tromba: pende (repouso) ou ergue enrolada (trombeta)
  const b0 = [hx + 22, hy + 36];
  const trunk = trunkUp
    ? bez(b0, [hx + 64, hy + 24 - trunkUp * 40], [hx + 50 - trunkUp * 6, hy - 6 - trunkUp * 66], 8, 14, 7)
    : bez(b0, [hx + 40, hy + 70], [hx + 32 + (anim === 'walk' ? Math.sin(t * Math.PI * 2) * 6 : 0) + rear * 20, hy + 116 - rear * 30], 8, 14, 7);
  const trm = C.sculpt(C.shape(3).chain(trunk), R, { R: 12 });
  for (let i = 1; i < trunk.length; i++) C.nudge(C.shape(0.5).circle(trunk[i][0], trunk[i][1], trunk[i][2] * 0.2), -1);
  C.streaks(trm, 0.2, 4, 1);
  const tip = trunk[trunk.length - 1];
  C.sculpt(C.shape(2).circle(tip[0], tip[1], 7), skin, { R: 5 });
  // presas enormes curvas
  const tusks = (far) => {
    const [x0, y0] = [hx + (far ? 14 : 20), hy + (far ? 34 : 40)];
    const pts = bez([x0, y0], [x0 + 46, y0 + 56 - rear * 20], [x0 + 82, y0 + 4 - rear * 30], 9, far ? 7 : 8.5, 2);
    C.sculpt(C.shape(2).chain(pts), tusk, { R: 7, bright: far ? -0.12 : 0.04 });
  };
  tusks(true);
  // pernas de cá
  pillar(116, 172, 112 + wk(2).x, wk(2).lift, false, false);
  pillar(196, 170, 206 + wk(3).x, wk(3).lift + rear * 50, false, true);
  tusks(false);
  // geada no ar quando ruge
  if (anim === 'cast' && t > 0.4) for (let i = 0; i < 8; i++) C.px(tip[0] + ((i * 7 + f * 5) % 28) - 14, tip[1] - 8 - ((i * 11) % 22), i % 2 ? '#e8f8ff' : '#9ad8ff', 2, 2);
}

// ================================================================== folha
const BOSS_DRAW = { colossus, hydra, dragon, scorpion, mammoth };

export const BOSS_DEFS = [
  { id: 'colossus', name: 'Colosso de Pedra' },
  { id: 'hydra', name: 'Hidra das Marés' },
  { id: 'dragon', name: 'Dragão Ancestral' },
  { id: 'scorpion', name: 'Escorpião-Rei' },
  { id: 'mammoth', name: 'Mamute Ancestral' },
];

/** Deslocamento horizontal do desenho (centra o corpo no quadro). */
const BOSS_OX = { scorpion: -18, hydra: -6, dragon: -8, mammoth: -16 };

export function renderBossFrame(id, f) {
  const C = new Canvas(BOSS_OX[id] ?? 0);
  BOSS_DRAW[id](C, f);
  return C.finish();
}

/** Atlas recortado por chefe (carregado só quando ele aparece). */
export function drawBosses({ Img, save }) {
  const dir = fileURLToPath(new URL('../public/assets/sprites/bosses/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const { id, name } of BOSS_DEFS) {
    const cells = [];
    for (let f = 0; f < NFR; f++) {
      const px = renderBossFrame(id, f);
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (px[(y * W + x) * 4 + 3]) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      if (x1 < 0) x0 = y0 = x1 = y1 = 0;
      cells.push({ k: f, px, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    const AW = 1024;
    let x = 0, y = 0, rowh = 0;
    for (const c of [...cells].sort((a, b) => b.h - a.h)) {
      if (x + c.w > AW) {
        x = 0;
        y += rowh + 1;
        rowh = 0;
      }
      c.ax = x;
      c.ay = y;
      x += c.w + 1;
      rowh = Math.max(rowh, c.h);
    }
    const atlas = new Img(AW, y + rowh);
    const frames = {};
    for (const c of cells) {
      for (let yy = 0; yy < c.h; yy++)
        for (let xx = 0; xx < c.w; xx++) {
          const i = ((c.y0 + yy) * W + c.x0 + xx) * 4;
          if (c.px[i + 3]) atlas.put(c.ax + xx, c.ay + yy, c.px[i], c.px[i + 1], c.px[i + 2], c.px[i + 3]);
        }
      frames[String(c.k)] = { frame: { x: c.ax, y: c.ay, w: c.w, h: c.h }, rotated: false, trimmed: true, spriteSourceSize: { x: c.x0, y: c.y0, w: c.w, h: c.h }, sourceSize: { w: W, h: H } };
    }
    save(`assets/sprites/bosses/boss-${id}.png`, atlas);
    writeFileSync(dir + `boss-${id}.json`, JSON.stringify({ frames, meta: { image: `boss-${id}.png`, size: { w: AW, h: y + rowh }, scale: '1' } }));
    // retrato (quadro 0) para o HUD
    const c0 = cells[0];
    out.push({ id, name, w: c0.w, h: c0.h });
  }
  return out;
}

export const BOSS_FRAME = { w: W, h: H, ground: GROUND, frames: NFR, scale: 0.5 };

// ================================================================== ovos de montaria
/** Ovos que os gigantes deixam cair: [montaria, casca, pintas]. */
export const EGGS = [
  ['rhino', '#a8a090', '#6a645a'],
  ['boar', '#b88a5a', '#6a4a2a'],
  ['griffin', '#f0e0b0', '#c89a40'],
  ['salamander', '#ff8a3a', '#7a2a10'],
  ['emerald', '#5ad88a', '#1a6a3a'],
  ['raptor', '#c8b070', '#5a4a2a'],
  ['ruby', '#d83a4a', '#5a0a1a'],
  ['nightmare', '#3a2a3a', '#ff6a2a'],
  ['sabre', '#e8c070', '#3a2a1a'],
  ['panther', '#4a3a6a', '#c070ff'],
  ['polar', '#f0f6ff', '#9ac0e0'],
  ['frostwolf', '#c8e0f0', '#5a8ab0'],
  ['bear', '#8a5a3a', '#4a2a1a'],
];

/** Ícones 16×16 dos ovos (casca com brilho e pintas), na ordem de EGGS. */
export function drawEggIcons({ Img, save }) {
  const img = new Img(16 * EGGS.length, 16);
  EGGS.forEach(([, shell, spot], i) => {
    const R = ramp(shell);
    const ox = i * 16;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        // oval mais largo embaixo
        const u = (x + 0.5 - 8) / (y < 8 ? 5.2 : 6.2);
        const v = (y + 0.5 - 9) / 6.6;
        const d = u * u + v * v;
        if (d > 1) continue;
        const edge = d > 0.78;
        const light = -u * 0.6 - v * 0.8;
        let k = edge ? 0 : light > 0.55 ? 5 : light > 0.15 ? 4 : light > -0.3 ? 3 : 2;
        let col = R[k];
        if (!edge && ((x * 7 + y * 13 + i * 5) % 11 === 0 || (x * 3 + y * 5 + i) % 17 === 0)) col = spot;
        img.set(ox + x, y, col);
      }
    img.set(ox + 6, 5, '#ffffff');
    img.set(ox + 5, 6, R[5]);
  });
  save('assets/sprites/egg-icons.png', img);
  return EGGS.map(([id]) => id);
}
