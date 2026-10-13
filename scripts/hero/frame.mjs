// Renderiza um quadro completo do herói: todas as camadas do loadout, com
// oclusão entre camadas (cada uma só aparece onde está à frente das de baixo),
// mais a camada de efeitos (rastro do golpe e fogo da Chama).
import { poseAt } from './anims.mjs';
import { bladeSegment, DEFAULT_LOADOUT, ITEMS, SLOTS } from './equipment.mjs';
import { CFG, downsample, minDepth, renderLayer, renderSmear, toRGBA } from './render.mjs';
import { solve } from './rig.mjs';
import { ellipsoid, v3 } from './sdf.mjs';

export function renderAll(J, yaw, loadout) {
  let underSS = null;
  let underFin = null;
  const layers = {};
  for (const slot of SLOTS) {
    const item = loadout[slot];
    if (!item) continue;
    const ss = renderLayer(ITEMS[slot][item](J), yaw, underSS);
    const fin = downsample(ss);
    layers[slot] = toRGBA(fin, underFin);
    underSS = minDepth(underSS, ss.depth);
    underFin = minDepth(underFin, fin.depth);
  }
  return { layers, underSS };
}

export function renderFx(anim, i, J, yaw, underSS) {
  const n = CFG.W * CFG.H * 4;
  const fx = new Uint8ClampedArray(n);
  let any = false;
  if (anim.smear?.includes(i)) {
    const segs = [];
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      const Js = solve(poseAt(anim, i - 1 + s / steps));
      if (anim.smearMode === 'thrust') {
        // estocada: fita estreita que segue a ponta (a lâmina corre no próprio eixo)
        const seg = bladeSegment(Js);
        const x = Js.weaponB[0];
        segs.push({ a: v3.add(seg.b, v3.mul(x, -0.04)), b: v3.add(seg.b, v3.mul(x, 0.04)) });
      } else segs.push(bladeSegment(Js));
    }
    const sm = renderSmear(segs, yaw, underSS);
    for (let k = 0; k < n; k += 4) if (sm[k + 3]) fx.set(sm.subarray(k, k + 4), k);
    any = true;
  }
  const fire = J.pose.fire ?? 0;
  if (fire > 0.05) {
    const c = v3.add(J.handL, v3.mul(J.chestB[2], 0.055));
    const prims = [
      ellipsoid(c, [0.048 * fire, 0.048 * fire, 0.048 * fire], J.chestB, 'fire', { slot: 'fx' }),
      ellipsoid(v3.add(c, [0, 0.04 * fire, 0]), [0.028 * fire, 0.04 * fire, 0.028 * fire], J.chestB, 'fire', { slot: 'fx' }),
    ];
    const fin = downsample(renderLayer(prims, yaw, underSS));
    const rgba = toRGBA(fin, null, { outline: false });
    for (let k = 0; k < n; k += 4) if (rgba[k + 3]) fx.set(rgba.subarray(k, k + 4), k);
    any = true;
  }
  return any ? fx : null;
}


/** Atalho para prévias: pose → camadas RGBA. */
export function renderFrame(pose, yaw, loadout = DEFAULT_LOADOUT, slots = SLOTS) {
  const J = solve(pose);
  const lo = Object.fromEntries(slots.map((s) => [s, loadout[s]]));
  return { ...renderAll(J, yaw, lo), joints: J };
}

/** Empilha camadas RGBA (alpha parcial do rastro é misturado). */
export function flatten(layers) {
  const n = CFG.W * CFG.H * 4;
  const o = new Uint8ClampedArray(n);
  for (const rgba of Object.values(layers)) {
    if (!rgba) continue;
    for (let i = 0; i < n; i += 4) {
      const a = rgba[i + 3] / 255;
      if (!a) continue;
      for (let c = 0; c < 3; c++) o[i + c] = o[i + c] * (1 - a) + rgba[i + c] * a;
      o[i + 3] = Math.max(o[i + 3], rgba[i + 3]);
    }
  }
  return o;
}
