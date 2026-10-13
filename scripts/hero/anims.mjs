// Coreografia do herói. Cada animação tem quadros-chave de pose (alvos de
// mãos/pés, direção da lâmina, rotações do tronco); os quadros intermediários
// usam interpolação Catmull-Rom, então mãos e lâmina descrevem arcos suaves.
//
// Convenções (espaço do personagem): o herói olha para +z; +x é a ESQUERDA
// dele; a espada fica na mão direita (lado -x). Distâncias em metros.

const TAU = Math.PI * 2;
const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

// ------------------------------------------------------------------ interpolação
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function interp(a, b, c, d, t) {
  if (typeof b === 'number') return cr(a ?? b, b, c ?? b, d ?? c ?? b, t);
  if (Array.isArray(b)) return b.map((_, i) => interp(a?.[i], b[i], c?.[i], d?.[i], t));
  if (b && typeof b === 'object') {
    const o = {};
    for (const k of Object.keys(b)) o[k] = interp(a?.[k], b[k], c?.[k], d?.[k], t);
    return o;
  }
  return t < 0.5 ? b : c;
}
/** Pose no índice fracionário u dos quadros-chave. */
function sampleKeys(keys, u, loop) {
  const n = keys.length;
  const get = (i) => (loop ? keys[((i % n) + n) % n] : keys[Math.max(0, Math.min(n - 1, i))]);
  const i = Math.floor(u);
  const t = u - i;
  return interp(get(i - 1), get(i), get(i + 1), get(i + 2), t);
}

// ------------------------------------------------------------------ poses base
// Proporções chibi (rig.mjs): quadril 0,545, ombros ~0,77, cabeça ~1,0.
const STANCE = {
  hips: [0, 0.535, 0],
  footL: [0.085, 0.05, 0.07],
  footR: [-0.085, 0.05, -0.06],
  footPitchL: 0,
  footPitchR: 0,
  hipsYaw: 0,
  hipsPitch: 0,
  chestYaw: -8,
  chestPitch: 4,
  chestRoll: 0,
  headYaw: 6,
  headPitch: -2,
  handR: [-0.14, 0.56, 0.14],
  handL: [0.15, 0.52, 0.07],
  blade: [-0.12, 0.62, 0.78],
  bladeFlat: [1, 0, 0],
  elbowPoleR: [-0.7, -0.3, -0.6],
  elbowPoleL: [0.7, -0.3, -0.6],
  cape: { lift: 8, sway: 0 },
};
const P = (o) => ({ ...STANCE, ...o, cape: { ...STANCE.cape, ...(o.cape || {}) } });

// ------------------------------------------------------------------ animações
/** Parado: respiração, peso levemente deslocado, capa ondulando. */
function idle() {
  const N = 8;
  const keys = [];
  for (let i = 0; i < N; i++) {
    const b = Math.sin((i / N) * TAU);
    keys.push({
      hips: [0.004 * b, 0.545 - 0.003 * (1 + b), 0],
      hipsYaw: 0,
      hipsPitch: 0,
      footL: [0.075, 0.05, 0.02],
      footR: [-0.08, 0.05, -0.02],
      footPitchL: 0,
      footPitchR: 0,
      chestYaw: -3,
      chestPitch: 2 + 1.5 * b,
      chestRoll: -1 * b,
      headYaw: 0,
      headPitch: -1.5 * b,
      breath: (1 + b) / 2,
      handR: [-0.155, 0.45 + 0.006 * b, 0.06],
      handL: [0.155, 0.455 + 0.006 * b, 0.02],
      blade: [-0.1, -0.5, 0.86],
      bladeFlat: [0.5, 0, 0.85],
      elbowPoleR: [-0.6, -0.2, -1],
      elbowPoleL: [0.6, -0.2, -1],
      cape: { lift: 5 + 2 * b, sway: 2 * Math.sin((i / N) * TAU + 1) },
    });
  }
  return { name: 'idle', loop: true, keys, durations: Array(N).fill(150) };
}

/** Corrida: 8 quadros, passada curta e saltitante, braços opostos às pernas. */
function run() {
  const N = 8;
  const keys = [];
  for (let i = 0; i < N; i++) {
    const ph = (i / N) * TAU;
    const s = Math.sin(ph);
    const foot = (p) => {
      const lift = Math.max(0, Math.cos(p + 0.6));
      return { pos: [0, 0.05 + 0.11 * lift, 0.17 * Math.sin(p)], pitch: 22 * lift };
    };
    const fr = foot(ph);
    const fl = foot(ph + Math.PI);
    keys.push({
      hips: [0, 0.54 + 0.02 * Math.cos(2 * ph), 0.02],
      hipsYaw: 8 * s,
      hipsPitch: 3,
      footR: [-0.065, fr.pos[1], fr.pos[2]],
      footL: [0.065, fl.pos[1], fl.pos[2]],
      footPitchR: fr.pitch,
      footPitchL: fl.pitch,
      chestYaw: -12 * s,
      chestPitch: 8,
      chestRoll: 0,
      headYaw: 5 * s,
      headPitch: -6,
      handR: [-0.14, 0.56 - 0.03 * s, 0.03 - 0.15 * s],
      handL: [0.14, 0.56 + 0.03 * s, 0.03 + 0.15 * s],
      blade: norm([-0.2, -0.38 + 0.2 * s, -0.9]),
      bladeFlat: [1, 0, 0],
      elbowPoleR: [-0.4, -0.3, -1],
      elbowPoleL: [0.4, -0.3, -1],
      cape: { lift: 34 + 6 * Math.sin(2 * ph), sway: 5 * s },
    });
  }
  return { name: 'run', loop: true, keys, durations: Array(N).fill(85) };
}

/** Golpe 1: diagonal descendente (direita alta → esquerda baixa). */
function atk1() {
  const flat = norm([0.5, 0.83, 0.24]);
  const keys = [
    P({ bladeFlat: flat }),
    P({ chestYaw: -42, chestPitch: -3, hipsYaw: -10, headYaw: 18, handR: [-0.2, 0.86, -0.04], blade: [-0.35, 0.45, -0.82], bladeFlat: flat, cape: { lift: 12, sway: -6 } }),
    P({ chestYaw: -24, chestPitch: 2, hipsYaw: -6, handR: [-0.15, 0.82, 0.2], blade: [0.0, 0.55, 0.83], bladeFlat: flat }),
    P({ chestYaw: 18, chestPitch: 10, hipsYaw: 8, hips: [0, 0.525, 0.04], headYaw: 0, handR: [0.0, 0.66, 0.33], blade: [0.62, -0.3, 0.72], bladeFlat: flat, cape: { lift: 22, sway: 8 } }),
    P({ chestYaw: 38, chestPitch: 9, hipsYaw: 12, hips: [0, 0.525, 0.045], headYaw: -8, handR: [0.17, 0.52, 0.2], blade: [0.85, -0.45, -0.28], bladeFlat: flat, cape: { lift: 20, sway: 10 } }),
    P({ chestYaw: 28, chestPitch: 7, hipsYaw: 8, hips: [0, 0.53, 0.03], handR: [0.14, 0.55, 0.2], blade: [0.62, -0.25, 0.74], bladeFlat: flat, cape: { lift: 14, sway: 4 } }),
    P({ bladeFlat: [1, 0, 0] }),
  ];
  return { name: 'atk1', loop: false, keys, durations: [60, 55, 45, 55, 65, 70, 70], hit: 3, smear: [2, 3, 4] };
}

/** Golpe 2: revés horizontal (esquerda → direita). */
function atk2() {
  const flat = norm([0.1, 0.95, -0.3]);
  const keys = [
    P({ chestYaw: 30, chestPitch: 7, handR: [0.14, 0.57, 0.18], blade: [0.8, -0.2, 0.55], bladeFlat: flat }),
    P({ chestYaw: 44, chestPitch: 2, hipsYaw: 10, headYaw: -14, handR: [0.2, 0.74, 0.03], blade: [0.75, 0.45, -0.48], bladeFlat: flat, cape: { lift: 12, sway: 6 } }),
    P({ chestYaw: 22, chestPitch: 5, handR: [0.12, 0.75, 0.27], blade: [0.4, 0.25, 0.88], bladeFlat: flat }),
    P({ chestYaw: -18, chestPitch: 9, hipsYaw: -8, hips: [0, 0.525, 0.04], handR: [-0.1, 0.7, 0.33], blade: [-0.72, 0.1, 0.68], bladeFlat: flat, cape: { lift: 22, sway: -9 } }),
    P({ chestYaw: -38, chestPitch: 7, hipsYaw: -12, hips: [0, 0.525, 0.04], headYaw: 10, handR: [-0.23, 0.72, 0.08], blade: [-0.82, 0.38, -0.42], bladeFlat: flat, cape: { lift: 20, sway: -10 } }),
    P({ chestYaw: -22, chestPitch: 6, handR: [-0.18, 0.66, 0.12], blade: [-0.3, 0.6, 0.74], bladeFlat: flat, cape: { lift: 13, sway: -4 } }),
    P({}),
  ];
  return { name: 'atk2', loop: false, keys, durations: [55, 60, 45, 55, 65, 70, 70], hit: 3, smear: [2, 3, 4] };
}

/** Golpe 3: estocada com avanço (finalizador). */
function atk3() {
  const F = [1, 0, 0];
  const keys = [
    P({}),
    P({ hips: [0, 0.525, -0.04], chestYaw: -36, chestPitch: -2, hipsYaw: -12, headYaw: 28, handR: [-0.13, 0.68, -0.14], blade: [0, 0.08, 1], bladeFlat: F, handL: [0.1, 0.67, 0.15], cape: { lift: 10 } }),
    P({ hips: [0, 0.52, -0.05], chestYaw: -44, chestPitch: -3, hipsYaw: -14, headYaw: 34, handR: [-0.12, 0.69, -0.18], blade: [0, 0.1, 1], bladeFlat: F, handL: [0.1, 0.68, 0.16], cape: { lift: 9 } }),
    P({ hips: [0, 0.515, 0.07], footL: [0.085, 0.05, 0.26], chestYaw: -6, chestPitch: 11, hipsYaw: -4, headYaw: 6, handR: [-0.04, 0.67, 0.29], blade: [0.02, -0.02, 1], bladeFlat: F, handL: [0.17, 0.62, 0.03], cape: { lift: 26 } }),
    P({ hips: [0, 0.505, 0.12], footL: [0.085, 0.05, 0.33], footR: [-0.085, 0.05, -0.12], footPitchR: 16, chestYaw: 12, chestPitch: 15, hipsYaw: 6, headYaw: -10, handR: [0.0, 0.66, 0.5], blade: [0.02, -0.06, 1], bladeFlat: F, handL: [0.2, 0.6, -0.08], cape: { lift: 34, sway: 4 } }),
    P({ hips: [0, 0.505, 0.12], footL: [0.085, 0.05, 0.33], footR: [-0.085, 0.05, -0.12], footPitchR: 16, chestYaw: 10, chestPitch: 14, hipsYaw: 6, headYaw: -10, handR: [0.0, 0.655, 0.48], blade: [0.02, -0.1, 1], bladeFlat: F, handL: [0.2, 0.6, -0.07], cape: { lift: 26, sway: 2 } }),
    P({ hips: [0, 0.53, 0.05], footL: [0.085, 0.05, 0.2], chestYaw: 0, chestPitch: 8, handR: [-0.06, 0.63, 0.24], blade: [-0.05, 0.3, 0.95], bladeFlat: F, cape: { lift: 16 } }),
    P({}),
  ];
  return { name: 'atk3', loop: false, keys, durations: [70, 60, 45, 40, 70, 75, 80, 80], hit: 4, smear: [3, 4], smearMode: 'thrust' };
}

/** Rolagem: cambalhota completa com o corpo encolhido. */
function roll() {
  const N = 8;
  const curl = (k) => ({
    hips: [0, 0.545 - 0.25 * k, 0.025 * k],
    footL: [0.07, 0.05 + 0.16 * k, 0.03 + 0.12 * k],
    footR: [-0.07, 0.05 + 0.14 * k, 0.0 + 0.1 * k],
    footPitchL: 40 * k,
    footPitchR: 40 * k,
    chestYaw: 0,
    chestPitch: 4 + 60 * k,
    headPitch: 26 * k,
    headYaw: 0,
    handR: [-0.1, 0.45 - 0.04 * k, 0.06 + 0.15 * k],
    handL: [0.1, 0.45 - 0.04 * k, 0.03 + 0.16 * k],
    blade: norm([0, -0.25, -1]),
    bladeFlat: [1, 0, 0],
    elbowPoleR: [-0.6, 0, -1],
    elbowPoleL: [0.6, 0, -1],
    cape: { lift: 18 + 36 * k, sway: 0 },
  });
  const keys = [];
  const curls = [0.55, 0.9, 1, 1, 1, 1, 0.85, 0.45];
  const angles = [10, 60, 110, 165, 215, 265, 315, 352];
  for (let i = 0; i < N; i++) keys.push({ ...curl(curls[i]), roll: angles[i], rollPivot: [0, 0.27, 0.04] });
  return { name: 'roll', loop: false, keys, durations: Array(N).fill(33), noInterp: true };
}

/** Dano: recuo do tronco e cabeça. */
function hurt() {
  const keys = [
    { ...P({}), hips: [0, 0.54, -0.04], chestPitch: -14, headPitch: -16, chestYaw: 6, handR: [-0.2, 0.52, -0.03], handL: [0.22, 0.55, -0.01], blade: norm([-0.3, -0.4, 0.86]), bladeFlat: [1, 0, 0] },
    { ...P({}), hips: [0, 0.535, -0.05], chestPitch: -18, headPitch: -20, chestYaw: 8, handR: [-0.21, 0.51, -0.04], handL: [0.23, 0.54, -0.02], blade: norm([-0.32, -0.42, 0.85]), bladeFlat: [1, 0, 0] },
    { ...P({}), hips: [0, 0.535, -0.02], chestPitch: -4, headPitch: -5 },
  ];
  return { name: 'hurt', loop: false, keys, durations: [80, 90, 90] };
}

/** Conjurar a Chama: mão livre empurra uma bola de fogo para a frente. */
function cast() {
  const keys = [
    P({ chestYaw: 18, handL: [0.18, 0.67, -0.07], elbowPoleL: [1, -0.4, -0.4] }),
    P({ chestYaw: 26, chestPitch: 2, handL: [0.19, 0.71, -0.11], elbowPoleL: [1, -0.4, -0.4], fire: 0.6 }),
    P({ chestYaw: -12, chestPitch: 8, hips: [0, 0.525, 0.03], handL: [0.06, 0.73, 0.34], elbowPoleL: [1, -0.6, 0], fire: 1 }),
    P({ chestYaw: -10, chestPitch: 7, hips: [0, 0.525, 0.03], handL: [0.06, 0.72, 0.32], elbowPoleL: [1, -0.6, 0], fire: 0.4 }),
    P({}),
  ];
  return { name: 'cast', loop: false, keys, durations: [50, 50, 60, 70, 80], release: 2 };
}

export const ANIMS = [idle(), run(), atk1(), atk2(), atk3(), roll(), hurt(), cast()];

/** Pose do quadro i (u fracionário permitido, para o rastro). */
export function poseAt(anim, u) {
  if (anim.noInterp) {
    const i = Math.max(0, Math.min(anim.keys.length - 1, Math.round(u)));
    return anim.keys[i];
  }
  return sampleKeys(anim.keys, u, anim.loop);
}
