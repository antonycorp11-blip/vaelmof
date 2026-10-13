// Esqueleto do herói: transforma uma pose (alvos de mãos/pés + rotações do
// tronco) em posições de juntas e bases ortonormais. Braços e pernas usam
// IK de dois ossos, então a coreografia é descrita por onde a mão e a lâmina
// estão — não por ângulos de cada articulação.
import { basis, eulerBasis, v3 } from './sdf.mjs';

/**
 * Proporções "chibi" de JRPG (~3 cabeças de altura): cabeça grande, tronco e
 * pernas curtos. Unidades: "metros de personagem" (altura total ≈ 1,2).
 */
export const BONES = {
  hipW: 0.066, // meia-distância entre as articulações do quadril
  hipDrop: 0.03,
  thigh: 0.245,
  shin: 0.235,
  spine: 0.17, // quadril → centro do peito
  neck: 0.1, // centro do peito → base do pescoço
  head: 0.165, // base do pescoço → centro da cabeça
  shoulderW: 0.118,
  shoulderY: 0.055,
  upperArm: 0.155,
  foreArm: 0.145,
  hand: 0.05,
};

export const DEFAULT_POSE = {
  hips: [0, 0.545, 0],
  hipsYaw: 0,
  hipsPitch: 0,
  hipsRoll: 0,
  chestYaw: 0,
  chestPitch: 2,
  chestRoll: 0,
  headYaw: 0,
  headPitch: 0,
  footL: [0.075, 0.05, 0.01],
  footR: [-0.075, 0.05, -0.01],
  footPitchL: 0,
  footPitchR: 0,
  handL: [0.16, 0.44, 0.02],
  handR: [-0.16, 0.44, 0.04],
  elbowPoleL: [0.6, -0.2, -1],
  elbowPoleR: [-0.6, -0.2, -1],
  // espada: direção da lâmina e normal da face (eixo da espessura)
  blade: [0.05, -0.45, 0.9],
  bladeFlat: [0.5, 0, 0.85],
  cape: { lift: 6, sway: 0 },
  breath: 0,
  roll: 0, // rotação global (cambalhota), graus em torno de x
  rollPivot: [0, 0.3, 0],
};

function ik(root, target, l1, l2, pole) {
  let d = v3.sub(target, root);
  let dist = v3.len(d);
  const max = (l1 + l2) * 0.999;
  const min = Math.abs(l1 - l2) * 1.05 + 0.01;
  const u = v3.norm(d);
  if (dist > max) dist = max;
  if (dist < min) dist = min;
  const end = v3.add(root, v3.mul(u, dist));
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let p = v3.sub(pole, v3.mul(u, v3.dot(pole, u)));
  if (v3.len(p) < 1e-5) p = [0, 0, 1];
  p = v3.norm(p);
  const mid = v3.add(v3.add(root, v3.mul(u, a)), v3.mul(p, h));
  return { mid, end };
}

/** Pose → juntas (espaço do personagem). */
export function solve(poseIn) {
  const P = { ...DEFAULT_POSE, ...poseIn, cape: { ...DEFAULT_POSE.cape, ...(poseIn.cape || {}) } };
  const B = BONES;
  const J = { pose: P };
  J.hips = P.hips;
  J.pelvisB = eulerBasis(P.hipsYaw, P.hipsPitch, P.hipsRoll);
  J.chestB = eulerBasis(P.hipsYaw + P.chestYaw, P.hipsPitch + P.chestPitch, P.hipsRoll + P.chestRoll);
  const up = J.chestB[1];
  J.chest = v3.add(J.hips, v3.mul(up, B.spine + P.breath * 0.003));
  J.neck = v3.add(J.chest, v3.mul(up, B.neck));
  J.headB = eulerBasis(P.hipsYaw + P.chestYaw + P.headYaw, P.hipsPitch + P.chestPitch * 0.4 + P.headPitch, 0);
  J.head = v3.add(J.neck, v3.mul(J.headB[1], B.head));
  const sh = (side) => v3.inBasis(J.chest, J.chestB, side * B.shoulderW, B.shoulderY + P.breath * 0.004, -0.005);
  J.shoulderL = sh(1);
  J.shoulderR = sh(-1);
  // braços (IK até o punho; a mão continua na direção do antebraço)
  const arm = (shoulder, hand, pole) => {
    const wristTarget = v3.sub(hand, v3.mul(v3.norm(v3.sub(hand, shoulder)), B.hand * 0.5));
    const { mid, end } = ik(shoulder, wristTarget, B.upperArm, B.foreArm, pole);
    return { elbow: mid, wrist: end, hand: v3.add(end, v3.mul(v3.norm(v3.sub(end, mid)), B.hand * 0.55)) };
  };
  const aL = arm(J.shoulderL, P.handL, P.elbowPoleL);
  const aR = arm(J.shoulderR, P.handR, P.elbowPoleR);
  Object.assign(J, { elbowL: aL.elbow, wristL: aL.wrist, handL: aL.hand, elbowR: aR.elbow, wristR: aR.wrist, handR: aR.hand });
  J.handBL = basis(v3.sub(aL.wrist, aL.elbow), J.chestB[2]);
  // espada: a lâmina define a orientação da mão direita
  const bdir = v3.norm(P.blade);
  J.weaponB = basis(bdir, P.bladeFlat);
  // base com y = lâmina, z = normal da face, x = fio
  J.weaponB = [v3.norm(v3.cross(bdir, P.bladeFlat)), bdir, v3.norm(v3.cross(v3.cross(bdir, P.bladeFlat), bdir))];
  J.grip = aR.hand;
  J.handBR = basis(v3.sub(aR.wrist, aR.elbow), bdir);
  // pernas
  const hipJ = (side) => v3.inBasis(J.hips, J.pelvisB, side * B.hipW, -B.hipDrop, 0);
  J.hipL = hipJ(1);
  J.hipR = hipJ(-1);
  const knPole = v3.add(J.pelvisB[2], [0, 0.1, 0]);
  const lL = ik(J.hipL, P.footL, B.thigh, B.shin, knPole);
  const lR = ik(J.hipR, P.footR, B.thigh, B.shin, knPole);
  Object.assign(J, { kneeL: lL.mid, ankleL: lL.end, kneeR: lR.mid, ankleR: lR.end });
  J.footBL = eulerBasis(P.hipsYaw, P.footPitchL, 0);
  J.footBR = eulerBasis(P.hipsYaw, P.footPitchR, 0);
  // âncora da capa (costas, entre as escápulas)
  J.capeAnchor = v3.inBasis(J.chest, J.chestB, 0, 0.07, -0.1);
  J.capeB = (() => {
    const base = eulerBasis(P.hipsYaw + P.chestYaw * 0.6, P.cape.lift, P.cape.sway);
    return base;
  })();
  if (P.roll) applyRoll(J, P.roll, P.rollPivot);
  return J;
}

/** Gira o esqueleto inteiro em torno do eixo x (cambalhota). */
function applyRoll(J, deg, pivot) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const rp = (p) => {
    const y = p[1] - pivot[1], z = p[2] - pivot[2];
    return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
  };
  const rv = (v) => [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  for (const k of Object.keys(J)) {
    const v = J[k];
    if (k === 'pose') continue;
    if (Array.isArray(v) && typeof v[0] === 'number') J[k] = rp(v);
    else if (Array.isArray(v) && Array.isArray(v[0])) J[k] = v.map(rv);
  }
}
