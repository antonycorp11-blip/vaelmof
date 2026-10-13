// Peças do herói, organizadas por SLOT. Cada peça é uma função que recebe as
// juntas resolvidas (rig.mjs) e devolve primitivas SDF. Cada slot vira uma
// camada de sprite separada, renderizada com o mesmo esqueleto — então trocar
// uma armadura ou arma é trocar a textura daquela camada no jogo.
//
// Visual: conceito "aventureiro do Serro" (JRPG, ~3 cabeças de altura):
// cabelo castanho espetado, olhos grandes, cachecol vermelho, capa azul com
// barra e emblema dourados e forro vermelho, camisa creme bordada, cintos de
// couro com fivelas douradas, luvas, calça verde e botas altas com dobra.
import { custom, ellipsoid, roundBox, roundCone, v3 } from './sdf.mjs';

/** Ordem de empilhamento (de baixo para cima). */
export const SLOTS = ['body', 'legs', 'torso', 'cape', 'weapon'];

const FLESH = 0.014; // suavização entre partes do corpo
const lerp = v3.lerp;
const HEAD_R = [0.16, 0.165, 0.15];

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const a = x / rx, b = y / ry, c = z / rz;
  const k0 = Math.sqrt(a * a + b * b + c * c);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2) || 1e-8;
  return (k0 * (k0 - 1)) / k1;
}

/** Converte um ponto do mundo para o espaço local de (origem, base). */
function toLocal(o, B, p) {
  const x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
  return [x * B[0][0] + y * B[0][1] + z * B[0][2], x * B[1][0] + y * B[1][1] + z * B[1][2], x * B[2][0] + y * B[2][1] + z * B[2][2]];
}

// ------------------------------------------------------------------ rosto (textura pixelada projetada na frente da cabeça)
// Colunas = esquerda→direita da tela com o herói de frente; linhas de cima para baixo.
const FACE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '..bbb......bbb..',
  '................',
  '..LLLL....LLLL..',
  '...sII....sII...',
  '...III....III...',
  '...iii....iii...',
  '...iii....iii...',
  '..k..........k..',
  '........n.......',
  '.......mm.......',
  '................',
];
const FACE_MAT = {
  L: { mat: 'lash', flat: 0 },
  I: { mat: 'iris', flat: 1 },
  i: { mat: 'iris', flat: 3 },
  s: { mat: 'shine', flat: 4 },
  b: { mat: 'hair', flat: 1 },
  m: { mat: 'lips', flat: 1 },
  k: { mat: 'blush', flat: 2 },
  n: { off: -1 },
};
function faceDetailFor(J) {
  return (_l, p) => {
    const [x, y, z] = toLocal(J.head, J.headB, p);
    if (z < 0.05) return null;
    const col = Math.floor(((x + HEAD_R[0]) / (2 * HEAD_R[0])) * 16);
    const row = Math.floor(((HEAD_R[1] - y) / (2 * HEAD_R[1])) * 16);
    if (col < 0 || col > 15 || row < 0 || row > 15) return null;
    return FACE_MAT[FACE[row][col]] ?? null;
  };
}

function hairDetail(l) {
  const s = Math.sin(l[0] * 90 + l[1] * 30);
  return s > 0.85 ? { off: 1 } : null;
}

// ------------------------------------------------------------------ corpo
function base(J) {
  const p = [];
  const S = { slot: 'body', k: FLESH };
  const H = (x, y, z) => v3.inBasis(J.head, J.headB, x, y, z);
  const face = faceDetailFor(J);
  // cabeça grande + bochechas/queixo
  p.push(ellipsoid(J.head, HEAD_R, J.headB, 'skin', { ...S, detail: face }));
  p.push(ellipsoid(H(0, -0.065, 0.02), [0.13, 0.095, 0.12], J.headB, 'skin', { ...S, detail: face }));
  for (const s of [1, -1]) p.push(ellipsoid(H(s * 0.158, -0.015, -0.01), [0.022, 0.034, 0.022], J.headB, 'skin', S));
  // cabelo: calota + mechas espetadas
  const capC = [0, 0.028, -0.018];
  p.push(
    custom(
      J.head,
      J.headB,
      (x, y, z) => {
        const e = sdEllipsoid(x - capC[0], y - capC[1], z - capC[2], 0.168, 0.17, 0.165);
        const cut = (z - 0.02 - (y - 0.105) * 1.1) / 1.5;
        return Math.max(e, cut);
      },
      0.2,
      capC,
      'hair',
      { slot: 'body', k: 0.012, detail: hairDetail },
    ),
  );
  const spikes = [
    // topo: tufos grossos para cima e para trás
    [[0, 0.1, -0.01], [0.01, 0.255, -0.04], 0.07],
    [[0.06, 0.1, 0.01], [0.135, 0.22, 0.0], 0.06],
    [[-0.06, 0.1, 0.01], [-0.125, 0.23, 0.02], 0.06],
    [[0.0, 0.08, -0.07], [0.02, 0.2, -0.17], 0.065],
    // laterais
    [[0.1, 0.05, -0.02], [0.205, 0.09, -0.04], 0.055],
    [[-0.1, 0.05, -0.02], [-0.205, 0.1, -0.03], 0.055],
    [[0.11, -0.02, -0.05], [0.18, -0.07, -0.08], 0.045],
    [[-0.11, -0.02, -0.05], [-0.18, -0.06, -0.09], 0.045],
    // nuca
    [[0, 0.02, -0.1], [0.0, 0.03, -0.22], 0.065],
    [[0.07, 0.03, -0.09], [0.13, 0.05, -0.19], 0.055],
    [[-0.07, 0.03, -0.09], [-0.13, 0.04, -0.19], 0.055],
    [[0, -0.06, -0.1], [0.01, -0.12, -0.18], 0.05],
    // franja jogada de lado, terminando acima das sobrancelhas
    [[-0.09, 0.12, 0.06], [-0.13, 0.06, 0.12], 0.045],
    [[-0.035, 0.135, 0.075], [-0.075, 0.065, 0.15], 0.045],
    [[0.02, 0.135, 0.08], [-0.01, 0.07, 0.158], 0.042],
    [[0.07, 0.125, 0.07], [0.07, 0.08, 0.15], 0.04],
    [[0.11, 0.11, 0.05], [0.14, 0.06, 0.115], 0.038],
  ];
  for (const [a, b, r] of spikes) p.push(roundCone(H(...a), H(...v3.lerp(a, b, 0.82)), r, 0.018, 'hair', { slot: 'body', k: 0.016, detail: hairDetail }));
  // pescoço, tronco (camisa de linho por baixo), braços, mãos, pernas, pés
  p.push(roundCone(v3.inBasis(J.neck, J.chestB, 0, -0.03, 0), H(0, -0.11, -0.01), 0.036, 0.034, 'skin', S));
  p.push(ellipsoid(v3.inBasis(J.chest, J.chestB, 0, -0.005, 0), [0.115, 0.085, 0.078], J.chestB, 'linen', S));
  p.push(ellipsoid(lerp(J.hips, J.chest, 0.45), [0.098, 0.085, 0.07], J.chestB, 'linen', S));
  p.push(ellipsoid(J.hips, [0.105, 0.07, 0.075], J.pelvisB, 'linen', S));
  for (const sd of ['L', 'R']) {
    p.push(ellipsoid(J[`shoulder${sd}`], [0.042, 0.04, 0.04], J.chestB, 'linen', S));
    p.push(roundCone(J[`shoulder${sd}`], J[`elbow${sd}`], 0.034, 0.029, 'skin', S));
    p.push(roundCone(J[`elbow${sd}`], J[`wrist${sd}`], 0.029, 0.024, 'skin', S));
    p.push(ellipsoid(J[`hand${sd}`], [0.03, 0.034, 0.028], sd === 'L' ? J.handBL : J.handBR, 'skin', S));
    p.push(roundCone(J[`hip${sd}`], J[`knee${sd}`], 0.05, 0.04, 'skin', S));
    p.push(roundCone(J[`knee${sd}`], J[`ankle${sd}`], 0.038, 0.03, 'skin', S));
    p.push(ellipsoid(v3.inBasis(J[`ankle${sd}`], J[`footB${sd}`], 0, -0.022, 0.03), [0.036, 0.026, 0.06], J[`footB${sd}`], 'skin', S));
  }
  return p;
}

// ------------------------------------------------------------------ aventureiro: calça verde e botas altas
function legsAventureiro(J) {
  const p = [];
  const S = { slot: 'legs', k: 0.012 };
  for (const sd of ['L', 'R']) {
    const hip = J[`hip${sd}`], knee = J[`knee${sd}`], ankle = J[`ankle${sd}`];
    p.push(roundCone(hip, knee, 0.058, 0.047, 'moss', { ...S, detail: (l) => (l[0] > 0.45 && l[0] < 0.55 ? { off: -1 } : null) }));
    p.push(roundCone(knee, lerp(knee, ankle, 0.4), 0.047, 0.043, 'moss', S));
    // bota de cano alto com dobra larga no topo e tira com fivela
    const top = lerp(knee, ankle, 0.3);
    p.push(roundCone(top, ankle, 0.048, 0.04, 'boot', { ...S, detail: (l) => (l[0] > 0.5 && l[0] < 0.6 ? { mat: 'glove', off: -1 } : null) }));
    p.push(roundCone(lerp(knee, ankle, 0.24), lerp(knee, ankle, 0.42), 0.058, 0.054, 'boot', { ...S, detail: () => ({ off: 1 }) }));
    const fb = J[`footB${sd}`];
    p.push(ellipsoid(v3.inBasis(ankle, fb, 0, -0.018, 0.032), [0.045, 0.036, 0.075], fb, 'boot', S));
    p.push(roundBox(v3.inBasis(ankle, fb, 0, -0.048, 0.03), [0.043, 0.006, 0.072], 0.006, fb, 'leatherDark', S));
    // fivela da tira
    const mid = lerp(knee, ankle, 0.68);
    p.push(roundBox(v3.add(mid, v3.mul(J.pelvisB[2], 0.042)), [0.012, 0.01, 0.004], 0.003, J.pelvisB, 'gold', { slot: 'legs' }));
  }
  return p;
}

// ------------------------------------------------------------------ aventureiro: camisa creme, cintos, luvas
function torsoAventureiro(J) {
  const p = [];
  const S = { slot: 'torso', k: 0.012 };
  const B = J.chestB;
  const PB = J.pelvisB;
  p.push(
    ellipsoid(v3.inBasis(J.chest, B, 0, -0.004, 0.002), [0.125, 0.094, 0.088], B, 'cream', {
      ...S,
      // decote com cordão
      detail: (l) => {
        if (l[2] > 0.05 && l[1] > -0.01 && Math.abs(l[0]) < 0.018 + (l[1] + 0.01) * 0.25) return Math.abs(l[0]) < 0.006 ? { mat: 'leather' } : { mat: 'linen', off: -1 };
        return null;
      },
    }),
  );
  p.push(ellipsoid(lerp(J.hips, J.chest, 0.45), [0.106, 0.092, 0.08], B, 'cream', S));
  // barra da camisa até o meio da coxa, com bordado
  p.push(
    custom(
      J.hips,
      PB,
      (x, y, z) => {
        const t = Math.max(0, Math.min(1, (0.03 - y) / 0.16));
        const rx = 0.112 + t * 0.03, rz = 0.084 + t * 0.03;
        const e = (Math.hypot(x / rx, z / rz) - 1) * Math.min(rx, rz);
        return Math.max(e, y - 0.03, -0.105 - y);
      },
      0.2,
      [0, -0.05, 0],
      'cream',
      {
        ...S,
        detail: (l) => {
          if (l[1] < -0.077) {
            const a = Math.atan2(l[0], l[2]);
            return Math.sin(a * 14) > 0.2 ? { mat: 'embroidery' } : { mat: 'embroidery', off: -1 };
          }
          if (l[1] < -0.068) return { mat: 'embroidery', off: 1 };
          return null;
        },
      },
    ),
  );
  for (const sd of ['L', 'R']) {
    const sh = J[`shoulder${sd}`], el = J[`elbow${sd}`], wr = J[`wrist${sd}`];
    // manga bufante até o cotovelo
    p.push(ellipsoid(sh, [0.05, 0.048, 0.048], B, 'cream', S));
    p.push(roundCone(sh, lerp(sh, el, 0.95), 0.046, 0.04, 'cream', { ...S, detail: (l) => (l[0] > 0.85 ? { off: -1 } : null) }));
    // luva de couro com punho largo
    p.push(roundCone(lerp(el, wr, 0.25), wr, 0.04, 0.034, 'glove', { ...S, detail: (l) => (l[0] < 0.18 ? { off: 1 } : null) }));
    p.push(ellipsoid(J[`hand${sd}`], [0.04, 0.042, 0.037], sd === 'L' ? J.handBL : J.handBR, 'glove', S));
  }
  // cinto principal com fivela grande
  p.push(
    custom(
      J.hips,
      PB,
      (x, y, z) => {
        const e = (Math.hypot(x / 0.112, z / 0.088) - 1) * 0.085;
        return Math.max(Math.abs(e) - 0.012, Math.abs(y - 0.03) - 0.018);
      },
      0.14,
      [0, 0.03, 0],
      'leather',
      S,
    ),
  );
  p.push(
    roundBox(v3.inBasis(J.hips, PB, 0, 0.03, 0.096), [0.024, 0.02, 0.006], 0.004, PB, 'gold', {
      slot: 'torso',
      detail: (l) => (Math.abs(l[0]) < 0.012 && Math.abs(l[1]) < 0.01 ? { mat: 'leather' } : null),
    }),
  );
  // bolsa na frente, do lado esquerdo do herói
  p.push(
    roundBox(v3.inBasis(J.hips, PB, 0.075, -0.035, 0.082), [0.034, 0.034, 0.02], 0.01, PB, 'leather', {
      slot: 'torso',
      detail: (l) => (l[1] > 0.012 ? { mat: 'glove', off: 1 } : null),
    }),
  );
  p.push(ellipsoid(v3.inBasis(J.hips, PB, 0.075, -0.02, 0.104), [0.008, 0.008, 0.004], PB, 'gold', { slot: 'torso' }));
  // alça transversal (ombro esquerdo → quadril direito), com fivela no peito
  const front = [
    [0.09, 0.075, 0.03],
    [0.05, 0.05, 0.088],
    [-0.02, -0.01, 0.094],
    [-0.08, -0.07, 0.08],
    [-0.1, -0.14, 0.07],
  ];
  const back = front.map(([x, y, z]) => [x, y, -Math.abs(z) - 0.005]);
  for (const path of [front, back]) {
    const pts = path.map((q) => v3.inBasis(J.chest, B, ...q));
    for (let i = 0; i < pts.length - 1; i++) p.push(roundCone(pts[i], pts[i + 1], 0.013, 0.013, 'leather', { slot: 'torso' }));
  }
  p.push(roundBox(v3.inBasis(J.chest, B, 0.02, 0.022, 0.095), [0.012, 0.011, 0.005], 0.003, B, 'gold', { slot: 'torso' }));
  return p;
}

// ------------------------------------------------------------------ capa azul do Serro + cachecol + broche
const EMBLEM = [
  '....g....',
  '...ggg...',
  '..g.g.g..',
  '.ggggggg.',
  'ggggrgggg',
  '.ggggggg.',
  '..g.g.g..',
  '...ggg...',
  '....g....',
];
function capeSerro(J) {
  const p = [];
  const Lc = 0.5;
  const CB = J.capeB;
  const half = (t) => 0.13 + t * 0.07;
  const zcOf = (x, t) => x * x * (5.5 - 4 * t) - 0.01 - t * 0.03;
  const hemOf = (x) => -Lc + Math.abs(x) * 0.55 + 0.01 * Math.sin(x * 50);
  p.push(
    custom(
      J.capeAnchor,
      CB,
      (x, y, z) => {
        const t = Math.max(0, Math.min(1, -y / Lc));
        const shell = Math.abs(z - zcOf(x, t)) - 0.009;
        return Math.max(shell * 0.75, Math.abs(x) - half(t), y - 0.035, hemOf(x) - y);
      },
      Lc * 0.65,
      [0, -Lc / 2, 0.02],
      'navy',
      {
        slot: 'cape',
        detail: (l, _p, n) => {
          const t = Math.max(0, Math.min(1, -l[1] / Lc));
          // forro vermelho do lado de dentro
          const inward = n[0] * CB[2][0] + n[1] * CB[2][1] + n[2] * CB[2][2];
          if (inward > 0.25) return { mat: 'scarf', off: -1 };
          if (l[1] < hemOf(l[0]) + 0.028 || Math.abs(l[0]) > half(t) - 0.016) return { mat: 'gold', off: -1 };
          // emblema dourado nas costas
          const ex = Math.floor(((l[0] + 0.06) / 0.12) * 9);
          const ey = Math.floor(((-0.17 - l[1]) / 0.13) * 9);
          if (ex >= 0 && ex < 9 && ey >= 0 && ey < 9) {
            const c = EMBLEM[ey][ex];
            if (c === 'g') return { mat: 'gold', off: -1 };
            if (c === 'r') return { mat: 'gem' };
          }
          return Math.sin(l[0] * 34) > 0.8 ? { off: -1 } : null;
        },
      },
    ),
  );
  // manto curto sobre os ombros, aberto na frente
  p.push(
    custom(
      J.chest,
      J.chestB,
      (x, y, z) => {
        const e = sdEllipsoid(x, y - 0.045, z + 0.005, 0.15, 0.075, 0.115);
        const wedge = Math.max(Math.abs(x) - 0.04 - Math.max(0, 0.09 - y) * 0.3, 0.03 - z);
        return Math.max(e, -wedge, -y);
      },
      0.18,
      [0, 0.04, 0],
      'navy',
      { slot: 'cape', k: 0.01, detail: (l) => (l[1] < 0.012 ? { mat: 'gold', off: -1 } : null) },
    ),
  );
  // cachecol vermelho volumoso
  const nb = v3.inBasis(J.neck, J.chestB, 0, -0.018, 0);
  p.push(
    custom(
      nb,
      J.chestB,
      (x, y, z) => {
        const e = (Math.hypot(x / 0.075, (z - 0.004) / 0.07) - 1) * 0.07;
        return Math.max(Math.abs(e) - 0.026, Math.abs(y) - 0.03) - 0.004;
      },
      0.12,
      [0, 0, 0],
      'scarf',
      { slot: 'cape', k: 0.012, detail: (l) => (Math.sin(Math.atan2(l[0], l[2]) * 7 + l[1] * 60) > 0.7 ? { off: -1 } : null) },
    ),
  );
  p.push(ellipsoid(v3.inBasis(nb, J.chestB, 0.01, -0.025, 0.07), [0.05, 0.035, 0.03], J.chestB, 'scarf', { slot: 'cape', k: 0.012 }));
  // broche dourado no ombro direito
  p.push(
    ellipsoid(v3.inBasis(J.chest, J.chestB, -0.085, 0.055, 0.085), [0.025, 0.025, 0.012], J.chestB, 'gold', {
      slot: 'cape',
      detail: (l) => (Math.hypot(l[0], l[1]) < 0.01 ? { off: 1 } : null),
    }),
  );
  return p;
}

// ------------------------------------------------------------------ espada do Serro
/** Lâmina com fio vivo e sulco, guarda dourada com gema azul, cabo azul com anéis dourados e pomo dourado. */
function espadaSerro(J) {
  const p = [];
  const W = J.weaponB; // x = fio, y = lâmina, z = face
  const g = J.grip;
  const at = (x, y, z) => v3.inBasis(g, W, x, y, z);
  const S = { slot: 'weapon' };
  const y0 = 0.05, y1 = 0.56;
  p.push(
    custom(
      g,
      W,
      (x, y, z) => {
        const t = (y - y0) / (y1 - y0);
        let w = 0.03 - t * 0.006;
        if (t > 0.84) w *= Math.max(0, (1 - t) / 0.16);
        const ax = Math.abs(x);
        const th = 0.008 * (1 - 0.6 * Math.min(1, ax / Math.max(w, 1e-4)));
        return Math.max(ax - w, Math.abs(z) - th, y0 - y, y - y1) * 0.7;
      },
      (y1 - y0) / 2 + 0.03,
      [0, (y0 + y1) / 2, 0],
      'steel',
      {
        ...S,
        detail: (l) => {
          const t = (l[1] - y0) / (y1 - y0);
          const w = 0.03 - t * 0.006;
          const ax = Math.abs(l[0]) / w;
          if (t < 0.7 && ax < 0.24) return { off: -1 };
          if (ax > 0.7) return { off: 1 };
          return null;
        },
      },
    ),
  );
  p.push(roundBox(at(0, 0.038, 0), [0.07, 0.01, 0.013], 0.006, W, 'gold', S));
  for (const s of [1, -1]) p.push(roundCone(at(s * 0.065, 0.038, 0), at(s * 0.09, 0.058, 0), 0.013, 0.01, 'gold', S));
  for (const s of [1, -1]) p.push(ellipsoid(at(0, 0.038, s * 0.013), [0.01, 0.01, 0.007], W, 'gripBlue', S));
  p.push(
    roundCone(at(0, -0.072, 0), at(0, 0.028, 0), 0.016, 0.015, 'gripBlue', {
      ...S,
      detail: (l) => (l[0] < 0.1 || l[0] > 0.9 || (l[0] > 0.48 && l[0] < 0.56) ? { mat: 'gold' } : null),
    }),
  );
  p.push(ellipsoid(at(0, -0.086, 0), [0.022, 0.02, 0.022], W, 'gold', S));
  return p;
}

export const ITEMS = {
  body: { base },
  legs: { aventureiro: legsAventureiro },
  torso: { aventureiro: torsoAventureiro },
  cape: { serro: capeSerro },
  weapon: { 'espada-serro': espadaSerro },
};

export const DEFAULT_LOADOUT = { body: 'base', legs: 'aventureiro', torso: 'aventureiro', cape: 'serro', weapon: 'espada-serro' };

/** Linha simplificada da lâmina (para o rastro do golpe). */
export function bladeSegment(J) {
  const W = J.weaponB;
  return { a: v3.inBasis(J.grip, W, 0, 0.09, 0), b: v3.inBasis(J.grip, W, 0, 0.56, 0), w: 0.028 };
}
