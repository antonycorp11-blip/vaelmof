// Prévia: grava uma folha com poses × direções, ampliada, sobre grama.
import { writeFileSync } from 'node:fs';
import { encodePng } from '../lib/png.mjs';
import { CFG } from './render.mjs';
import { flatten, renderFrame } from './frame.mjs';

export function previewSheet(file, rows, yaws, scale = 4) {
  const { W, H } = CFG;
  const cols = yaws.length;
  const OW = cols * W * scale, OH = rows.length * H * scale;
  const img = new Uint8ClampedArray(OW * OH * 4);
  for (let i = 0; i < OW * OH; i++) img.set([92, 138, 66, 255], i * 4);
  const t0 = Date.now();
  rows.forEach((pose, r) =>
    yaws.forEach((yaw, c) => {
      const f = flatten(renderFrame(pose, yaw).layers);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const k = (y * W + x) * 4;
          if (!f[k + 3]) continue;
          for (let j = 0; j < scale; j++)
            for (let i = 0; i < scale; i++) img.set(f.subarray(k, k + 4), (((r * H + y) * scale + j) * OW + (c * W + x) * scale + i) * 4);
        }
    }),
  );
  writeFileSync(file, encodePng(OW, OH, img));
  return Date.now() - t0;
}

if (process.argv[2]) {
  const ms = previewSheet(process.argv[2], [{}], [0, -45, -90, -135, 180, 135, 90, 45], 3);
  console.log('ms', ms);
}
