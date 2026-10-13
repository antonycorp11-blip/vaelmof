// Gera os sprites do herói: renderiza todas as animações × 8 direções ×
// camadas (slots do equipamento + rastro), recorta cada quadro e empacota um
// atlas por camada (PNG + JSON no formato "hash" do Phaser).
//
//   npm run hero
//
// Saída em public/assets/hero/. Leva ~1 min (usa todos os núcleos).
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { encodePng } from '../lib/png.mjs';
import { ANIMS, poseAt } from './anims.mjs';
import { DEFAULT_LOADOUT, SLOTS } from './equipment.mjs';
import { renderAll, renderFx } from './frame.mjs';
import { CFG } from './render.mjs';
import { solve } from './rig.mjs';

/** Direções do jogo: 0 S, 1 SO, 2 O, 3 NO, 4 N, 5 NE, 6 L, 7 SE → yaw do modelo. */
export const DIR_YAW = [0, -45, -90, -135, 180, 135, 90, 45];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'assets', 'hero');

/** Recorta o quadro ao retângulo com pixels. */
function trim(rgba) {
  const { W, H } = CFG;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (rgba[(y * W + x) * 4 + 3]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1, data: new Uint8ClampedArray(4) };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(rgba.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4), y * w * 4);
  return { x: x0, y: y0, w, h, data };
}

function workDirs(dirs, loadout) {
  const out = [];
  for (const d of dirs) {
    const yaw = DIR_YAW[d];
    for (const anim of ANIMS)
      for (let i = 0; i < anim.keys.length; i++) {
        const J = solve(poseAt(anim, i));
        const { layers, underSS } = renderAll(J, yaw, loadout);
        const name = `${anim.name}_${d}_${i}`;
        for (const [slot, rgba] of Object.entries(layers)) out.push({ layer: slot, name, ...trim(rgba) });
        const fx = renderFx(anim, i, J, yaw, underSS);
        out.push({ layer: 'fx', name, ...trim(fx ?? new Uint8ClampedArray(CFG.W * CFG.H * 4)) });
      }
  }
  return out;
}

/** Empacotamento em prateleiras (shelf), largura fixa, 1px de folga. */
function pack(frames, width = 2048) {
  const sorted = [...frames].sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0, y = 0, rowH = 0;
  for (const f of sorted) {
    if (x + f.w + 1 > width) {
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    f.ax = x;
    f.ay = y;
    x += f.w + 1;
    rowH = Math.max(rowH, f.h);
  }
  let h = y + rowH;
  let w = width;
  // reduz a largura se sobrou (atlas pequenos)
  const used = Math.max(...sorted.map((f) => f.ax + f.w));
  w = used;
  const img = new Uint8ClampedArray(w * h * 4);
  for (const f of sorted)
    for (let r = 0; r < f.h; r++) img.set(f.data.subarray(r * f.w * 4, (r + 1) * f.w * 4), ((f.ay + r) * w + f.ax) * 4);
  return { w, h, img };
}

function writeAtlas(key, frames) {
  const { w, h, img } = pack(frames);
  const json = {
    frames: Object.fromEntries(
      frames.map((f) => [
        f.name,
        {
          frame: { x: f.ax, y: f.ay, w: f.w, h: f.h },
          rotated: false,
          trimmed: true,
          spriteSourceSize: { x: f.x, y: f.y, w: f.w, h: f.h },
          sourceSize: { w: CFG.W, h: CFG.H },
        },
      ]),
    ),
    meta: { app: 'vaelmor-hero', image: `${key}.png`, format: 'RGBA8888', size: { w, h }, scale: '1' },
  };
  writeFileSync(join(OUT, `${key}.png`), encodePng(w, h, img));
  writeFileSync(join(OUT, `${key}.json`), JSON.stringify(json));
  return `${key} ${w}×${h} (${frames.length} quadros)`;
}

if (!isMainThread) {
  parentPort.postMessage(workDirs(workerData.dirs, workerData.loadout));
} else {
  const t0 = Date.now();
  const loadout = { ...DEFAULT_LOADOUT };
  const nW = Math.min(cpus().length, 8);
  const groups = Array.from({ length: nW }, () => []);
  DIR_YAW.forEach((_, d) => groups[d % nW].push(d));
  const results = await Promise.all(
    groups
      .filter((g) => g.length)
      .map(
        (dirs) =>
          new Promise((res, rej) => {
            const w = new Worker(fileURLToPath(import.meta.url), { workerData: { dirs, loadout } });
            w.once('message', res);
            w.once('error', rej);
          }),
      ),
  );
  const all = results.flat();
  mkdirSync(OUT, { recursive: true });
  const report = [];
  const layerKey = (layer) => (layer === 'fx' ? `fx-${loadout.weapon}` : `${layer}-${loadout[layer]}`);
  for (const layer of [...SLOTS, 'fx']) {
    const frames = all.filter((f) => f.layer === layer);
    if (frames.length) report.push(writeAtlas(layerKey(layer), frames));
  }
  const meta = {
    frame: { w: CFG.W, h: CFG.H },
    feet: [CFG.FX, CFG.FY],
    /** px de arte por px do mundo (a arte tem o dobro da densidade do mapa). */
    scale: 0.5,
    dirs: DIR_YAW.length,
    layers: [...SLOTS, 'fx'],
    loadout,
    atlases: Object.fromEntries([...SLOTS, 'fx'].map((l) => [l, layerKey(l)])),
    anims: Object.fromEntries(
      ANIMS.map((a) => [a.name, { frames: a.keys.length, durations: a.durations, loop: a.loop, hit: a.hit ?? null, release: a.release ?? null }]),
    ),
  };
  writeFileSync(join(OUT, 'hero.json'), JSON.stringify(meta, null, 2));
  console.log(`Herói gerado em ${((Date.now() - t0) / 1000).toFixed(1)} s:\n  ` + report.join('\n  '));
}
