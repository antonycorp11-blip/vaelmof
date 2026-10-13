// Peças do herói, organizadas por SLOT. Cada peça é uma função que recebe as
// juntas resolvidas (rig.mjs) e devolve primitivas SDF. Cada slot vira uma
// camada de sprite separada, renderizada com o mesmo esqueleto — então trocar
// uma armadura ou arma é trocar a textura daquela camada no jogo.
//
// Para criar uma peça nova: adicione uma função em ITEMS[slot], rode
// `npm run hero -- --only <slot>:<nome>` e aponte o loadout para ela.
import { custom, ellipsoid, roundBox, roundCone, v3 } from './sdf.mjs';

/** Ordem de empilhamento (de baixo para cima). */
export const SLOTS = ['body', 'legs', 'torso', 'cape', 'weapon'];

const FLESH = 0.018; // suavização entre partes do corpo

const lerp = v3.lerp;

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const a = x / rx, b = y / ry, c = z / rz;
  const k0 = Math.sqrt(a * a + b * b + c * c);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2) || 1e-8;
  return (k0 * (k0 - 1)) / k1;
}

// ------------------------------------------------------------------ corpo
/** Escala da cabeça (levemente heroica: ~7 cabeças de altura). */
const HS = 1.1;

function faceDetail(l) {
  const x = l[0] / HS, y = l[1] / HS, z = l[2] / HS;
  const ax = Math.abs(x);
  if (z > 0.05) {
    if (y > -0.008 && y < 0.016 && ax > 0.026 && ax < 0.052) return { mat: ax > 0.044 ? 'sclera' : 'eye' };
    if (y >= 0.026 && y < 0.04 && ax > 0.018 && ax < 0.058) return { mat: 'hair' };
    if (y > -0.066 && y < -0.052 && ax < 0.022) return { mat: 'lips' };
  }
  return null;
}

function hairDetail(l) {
  const [x, y] = l;
  const s = Math.sin(x * 170 + y * 35) + Math.sin(x * 61 - y * 90) * 0.5;
  return s > 0.9 ? { off: -1 } : s < -1.2 ? { off: 1 } : null;
}

function base(J) {
  const p = [];
  const S = { slot: 'body', k: FLESH };
  // cabeça (medidas em "cabeça unitária" × HS)
  const H = (x, y, z) => v3.inBasis(J.head, J.headB, x * HS, y * HS, z * HS);
  const R = (rx, ry, rz) => [rx * HS, ry * HS, rz * HS];
  p.push(ellipsoid(J.head, R(0.086, 0.108, 0.096), J.headB, 'skin', { ...S, detail: faceDetail }));
  p.push(ellipsoid(H(0, -0.008, 0.094), R(0.014, 0.022, 0.018), J.headB, 'skin', S));
  for (const s of [1, -1]) p.push(ellipsoid(H(s * 0.086, 0.0, -0.008), R(0.016, 0.028, 0.018), J.headB, 'skin', S));
  // cabelo: calota cortada na frente (rosto livre) + franja + nuca
  const hairC = [0, 0.026 * HS, -0.014 * HS];
  p.push(
    custom(
      J.head,
      J.headB,
      (x, y, z) => {
        const e = sdEllipsoid(x - hairC[0], y - hairC[1], z - hairC[2], 0.1 * HS, 0.104 * HS, 0.108 * HS);
        const cut = (z / HS - 0.03 - (y / HS - 0.03) * 1.5) / 1.8;
        return Math.max(e, cut * HS);
      },
      0.13 * HS,
      hairC,
      'hair',
      { slot: 'body', k: 0.01, detail: hairDetail },
    ),
  );
  for (const [x, y, z, rx, ry, rz] of [
    [-0.045, 0.072, 0.066, 0.042, 0.03, 0.032],
    [0.01, 0.084, 0.07, 0.046, 0.03, 0.03],
    [0.055, 0.066, 0.06, 0.036, 0.03, 0.03],
    [0.088, 0.02, 0.012, 0.018, 0.04, 0.022],
    [-0.088, 0.02, 0.012, 0.018, 0.04, 0.022],
    [0, -0.045, -0.062, 0.09, 0.075, 0.066],
  ])
    p.push(ellipsoid(H(x, y, z), R(rx, ry, rz), J.headB, 'hair', { slot: 'body', k: 0.012, detail: hairDetail }));
  // pescoço e tronco (camisa de linho por baixo de tudo)
  p.push(roundCone(v3.inBasis(J.neck, J.chestB, 0, -0.03, 0), v3.inBasis(J.head, J.headB, 0, -0.066, -0.01), 0.048, 0.042, 'skin', S));
  p.push(ellipsoid(v3.inBasis(J.chest, J.chestB, 0, -0.005, 0), [0.162, 0.118, 0.1], J.chestB, 'linen', S));
  p.push(ellipsoid(lerp(J.hips, J.chest, 0.45), [0.128, 0.14, 0.092], J.chestB, 'linen', S));
  p.push(ellipsoid(J.hips, [0.15, 0.1, 0.1], J.pelvisB, 'linen', S));
  for (const sd of ['L', 'R']) {
    p.push(ellipsoid(J[`shoulder${sd}`], [0.06, 0.058, 0.058], J.chestB, 'linen', S));
    p.push(roundCone(J[`shoulder${sd}`], J[`elbow${sd}`], 0.05, 0.042, 'skin', S));
    p.push(roundCone(J[`elbow${sd}`], J[`wrist${sd}`], 0.042, 0.032, 'skin', S));
    p.push(ellipsoid(J[`hand${sd}`], [0.03, 0.046, 0.028], sd === 'L' ? J.handBL : J.handBR, 'skin', S));
    p.push(roundCone(J[`hip${sd}`], J[`knee${sd}`], 0.078, 0.056, 'skin', S));
    p.push(roundCone(J[`knee${sd}`], J[`ankle${sd}`], 0.054, 0.037, 'skin', S));
    p.push(ellipsoid(v3.inBasis(J[`ankle${sd}`], J[`footB${sd}`], 0, -0.035, 0.05), [0.044, 0.034, 0.1], J[`footB${sd}`], 'skin', S));
  }
  return p;
}

// ------------------------------------------------------------------ viajante (roupa padrão)
function legsViajante(J) {
  const p = [];
  const S = { slot: 'legs', k: 0.012 };
  for (const sd of ['L', 'R']) {
    const hip = J[`hip${sd}`], knee = J[`knee${sd}`], ankle = J[`ankle${sd}`];
    p.push(roundCone(hip, knee, 0.086, 0.064, 'pants', { ...S, detail: (l) => (Math.sin(l[0] * 38) > 0.85 ? { off: -1 } : null) }));
    p.push(roundCone(knee, lerp(knee, ankle, 0.3), 0.064, 0.058, 'pants', S));
    // bota de cano alto com dobra
    const top = lerp(knee, ankle, 0.24);
    p.push(roundCone(top, ankle, 0.064, 0.05, 'leather', { ...S, detail: (l) => (l[0] < 0.13 ? { mat: 'leatherDark', off: 1 } : null) }));
    const fb = J[`footB${sd}`];
    p.push(ellipsoid(v3.inBasis(ankle, fb, 0, -0.03, 0.055), [0.052, 0.044, 0.114], fb, 'leather', S));
    p.push(roundBox(v3.inBasis(ankle, fb, 0, -0.068, 0.05), [0.05, 0.008, 0.108], 0.006, fb, 'leatherDark', S));
  }
  return p;
}

function torsoViajante(J) {
  const p = [];
  const S = { slot: 'torso', k: 0.014 };
  const B = J.chestB;
  p.push(ellipsoid(v3.inBasis(J.chest, B, 0, -0.004, 0.002), [0.175, 0.128, 0.112], B, 'tunic', {
    ...S,
    // decote em V com debrum dourado
    detail: (l) => {
      const v = Math.abs(l[0]) - (l[1] - 0.02) * 0.55;
      if (l[2] > 0.05 && l[1] > 0.0 && v < 0.012) return v < 0 ? { mat: 'linen' } : { mat: 'tunicTrim' };
      return null;
    },
  }));
  p.push(ellipsoid(lerp(J.hips, J.chest, 0.45), [0.14, 0.15, 0.104], B, 'tunic', S));
  // saia da túnica (folgada sobre as coxas), pregas e barra bordada
  const PB = J.pelvisB;
  p.push(
    custom(
      J.hips,
      PB,
      (x, y, z) => {
        const t = Math.max(0, Math.min(1, (0.05 - y) / 0.34));
        const rx = 0.158 + t * 0.07, rz = 0.112 + t * 0.06;
        const e = (Math.hypot(x / rx, z / rz) - 1) * Math.min(rx, rz);
        return Math.max(e, y - 0.05, -0.29 - y);
      },
      0.33,
      [0, -0.12, 0],
      'tunic',
      {
        ...S,
        detail: (l) => {
          if (l[1] < -0.262) return { mat: 'tunicTrim' };
          const a = Math.atan2(l[0], l[2]);
          return Math.cos(a * 9) > 0.6 ? { off: -1 } : null;
        },
      },
    ),
  );
  // mangas curtas com barra
  for (const sd of ['L', 'R']) {
    const sh = J[`shoulder${sd}`], el = J[`elbow${sd}`];
    p.push(ellipsoid(sh, [0.068, 0.064, 0.066], B, 'tunic', S));
    p.push(roundCone(sh, lerp(sh, el, 0.62), 0.062, 0.054, 'tunic', { ...S, detail: (l) => (l[0] > 0.86 ? { mat: 'tunicTrim' } : null) }));
    // braçadeira de couro no antebraço
    const wr = J[`wrist${sd}`];
    p.push(roundCone(lerp(el, wr, 0.3), wr, 0.047, 0.038, 'leather', { ...S, detail: (l) => (Math.sin(l[0] * 40) > 0.7 ? { mat: 'leatherDark' } : null) }));
  }
  // cinto, fivela e bolsa
  p.push(
    custom(
      J.hips,
      PB,
      (x, y, z) => {
        const e = (Math.hypot(x / 0.166, z / 0.12) - 1) * 0.12;
        return Math.max(Math.abs(e) - 0.016, Math.abs(y - 0.035) - 0.024);
      },
      0.2,
      [0, 0.035, 0],
      'leather',
      S,
    ),
  );
  p.push(roundBox(v3.inBasis(J.hips, PB, 0, 0.035, 0.126), [0.024, 0.022, 0.006], 0.004, PB, 'gold', { slot: 'torso' }));
  p.push(roundBox(v3.inBasis(J.hips, PB, 0.13, -0.025, 0.07), [0.03, 0.04, 0.022], 0.01, PB, 'leatherDark', { slot: 'torso' }));
  return p;
}

function capeViajante(J) {
  const p = [];
  const Lc = 0.82;
  p.push(
    custom(
      J.capeAnchor,
      J.capeB,
      (x, y, z) => {
        // y vai de 0 (ombros) a -Lc; a capa se curva em torno das costas
        const t = Math.max(0, Math.min(1, -y / Lc));
        const w = 0.16 + t * 0.15;
        const zc = x * x * 1.5 * (0.4 + t) - 0.02 - t * 0.04;
        const hem = 0.018 * Math.sin(x * 38 + 1) + 0.012 * Math.sin(x * 91);
        const shell = Math.abs(z - zc) - 0.011;
        return Math.max(shell * 0.8, Math.abs(x) - w, y, -Lc + hem - y);
      },
      Lc * 0.62,
      [0, -Lc / 2, -0.02],
      'cape',
      {
        slot: 'cape',
        detail: (l, _w, n) => {
          if (l[1] < -Lc + 0.05) return { mat: 'tunicTrim' };
          const fold = Math.sin(l[0] * 26 + l[1] * 3);
          return fold > 0.75 ? { off: -1 } : fold < -0.85 ? { off: 1 } : null;
        },
      },
    ),
  );
  // fechos dourados nos ombros
  for (const s of [1, -1])
    p.push(ellipsoid(v3.inBasis(J.chest, J.chestB, s * 0.11, 0.11, 0.07), [0.022, 0.022, 0.014], J.chestB, 'gold', { slot: 'cape' }));
  return p;
}

// ------------------------------------------------------------------ armas
/** Espada do Serro: lâmina com sulco central e fio vivo, guarda curva dourada com rubi. */
function espadaSerro(J) {
  const p = [];
  const W = J.weaponB; // x = fio, y = lâmina, z = face
  const g = J.grip;
  const at = (x, y, z) => v3.inBasis(g, W, x, y, z);
  const S = { slot: 'weapon' };
  const y0 = 0.062, y1 = 0.86;
  p.push(
    custom(
      g,
      W,
      (x, y, z) => {
        const t = (y - y0) / (y1 - y0);
        let w = 0.036 - t * 0.008;
        if (t > 0.86) w *= Math.max(0, (1 - t) / 0.14);
        const ax = Math.abs(x);
        const th = 0.0095 * (1 - 0.65 * Math.min(1, ax / Math.max(w, 1e-4)));
        return Math.max(ax - w, Math.abs(z) - th, y0 - y, y - y1) * 0.7;
      },
      (y1 - y0) / 2 + 0.04,
      [0, (y0 + y1) / 2, 0],
      'steel',
      {
        ...S,
        detail: (l) => {
          const t = (l[1] - y0) / (y1 - y0);
          const w = 0.036 - t * 0.008;
          const ax = Math.abs(l[0]) / w;
          if (t < 0.72 && ax < 0.26) return { off: -1 }; // sulco
          if (ax > 0.72) return { off: 1 }; // fio
          return null;
        },
      },
    ),
  );
  // guarda com pontas curvas, rubi central
  p.push(roundBox(at(0, 0.046, 0), [0.088, 0.011, 0.015], 0.006, W, 'gold', S));
  for (const s of [1, -1]) p.push(roundCone(at(s * 0.08, 0.046, 0), at(s * 0.112, 0.074, 0), 0.015, 0.011, 'gold', S));
  p.push(ellipsoid(at(0, 0.046, 0.016), [0.011, 0.011, 0.008], W, 'gem', S));
  p.push(ellipsoid(at(0, 0.046, -0.016), [0.011, 0.011, 0.008], W, 'gem', S));
  // empunhadura com tiras de couro e pomo
  p.push(
    roundCone(at(0, -0.088, 0), at(0, 0.034, 0), 0.0185, 0.017, 'leatherDark', {
      ...S,
      detail: (l) => (Math.sin(l[0] * 44) > 0.2 ? { mat: 'leather' } : null),
    }),
  );
  p.push(ellipsoid(at(0, -0.104, 0), [0.026, 0.022, 0.026], W, 'gold', S));
  p.push(ellipsoid(at(0, -0.104, 0.02), [0.01, 0.01, 0.007], W, 'gem', S));
  return p;
}

export const ITEMS = {
  body: { base },
  legs: { viajante: legsViajante },
  torso: { viajante: torsoViajante },
  cape: { viajante: capeViajante },
  weapon: { 'espada-serro': espadaSerro },
};

export const DEFAULT_LOADOUT = { body: 'base', legs: 'viajante', torso: 'viajante', cape: 'viajante', weapon: 'espada-serro' };

/** Linha simplificada da lâmina (para o rastro do golpe). */
export function bladeSegment(J) {
  const W = J.weaponB;
  return { a: v3.inBasis(J.grip, W, 0, 0.12, 0), b: v3.inBasis(J.grip, W, 0, 0.86, 0), w: 0.034 };
}
