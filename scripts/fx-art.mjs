// Efeitos das habilidades das montarias: anéis de choque, rachaduras, pedras,
// fogo, fumaça, cristais de gelo, círculo de luz, raio do céu, vento, garras…
// Tudo em pixel art com faixas de brilho (sem degradê borrado). As peças
// brancas são tingidas no jogo com a cor de cada montaria; pedras, gelo e
// rachaduras já vêm com as cores certas.

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** Alfa em faixas: dá o aspecto de pixel art às luzes. */
const band = (a, n = 6) => Math.round(clamp(a) * n) / n;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Preenche (ox, oy, w, h) com fn(x, y) → [r, g, b, a] (0..255, a 0..1). */
function field(img, ox, oy, w, h, fn) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = fn(x + 0.5, y + 0.5);
      if (!p || p[3] <= 0.01) continue;
      img.put(ox + x, oy + y, Math.round(p[0]), Math.round(p[1]), Math.round(p[2]), Math.round(clamp(p[3]) * 255));
    }
}

const lerp = (a, b, k) => a + (b - a) * k;
const mix = (c1, c2, k) => [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)];
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ------------------------------------------------------------------ peças

/** Anel de choque: borda de fora nítida e brilho que some para dentro. */
function ring(Img) {
  const S = 96;
  const t = new Img(S, S);
  field(t, 0, 0, S, S, (x, y) => {
    const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    if (d > 1) return null;
    const edge = d > 0.9 ? 1 - (d - 0.9) / 0.1 : 1;
    const inner = Math.pow(clamp((d - 0.45) / 0.45), 2.2);
    const a = band(Math.min(edge, inner) * 1.05);
    // perto da borda, quase branco; para dentro, mais transparente
    return [255, 255, 255, a];
  });
  return t;
}

/** Faísca em estrela de 4 pontas. */
function spark(Img) {
  const t = new Img(9, 9);
  for (let i = 0; i < 9; i++) {
    const k = 1 - Math.abs(i - 4) / 4.5;
    t.put(i, 4, 255, 255, 255, Math.round(band(k) * 255));
    t.put(4, i, 255, 255, 255, Math.round(band(k) * 255));
  }
  for (const [x, y] of [[3, 3], [5, 3], [3, 5], [5, 5]]) t.put(x, y, 255, 255, 255, 150);
  return t;
}

/** Bolha de luz/fogo 16×16: núcleo cheio, borda em faixas. */
function blob(Img) {
  const t = new Img(16, 16);
  field(t, 0, 0, 16, 16, (x, y) => {
    const d = Math.hypot(x - 8, y - 8) / 8;
    if (d > 1) return null;
    return [255, 255, 255, band(Math.pow(1 - d, 0.8), 5)];
  });
  return t;
}

/** Labaredas 12×12 (3): borda dura e núcleo cheio, em 3 faixas. */
function flame(Img) {
  const t = new Img(36, 12);
  for (let f = 0; f < 3; f++) {
    const r = rng(51 + f * 13);
    const lobes = Array.from({ length: 4 }, () => [4 + r() * 4, 4 + r() * 4, 2.2 + r() * 2]);
    field(t, f * 12, 0, 12, 12, (x, y) => {
      let v = 0;
      for (const [cx, cy, rr] of lobes) v = Math.max(v, 1 - Math.hypot(x - cx, y - cy) / rr);
      if (v <= 0) return null;
      return [255, 255, 255, v > 0.55 ? 1 : v > 0.25 ? 0.75 : 0.4];
    });
  }
  return t;
}

/** Nuvem de fumaça/poeira com volume (luz em cima à esquerda): 3 variações 24×24. */
function puff(Img) {
  const t = new Img(72, 24);
  for (let f = 0; f < 3; f++) {
    const r = rng(31 + f * 7);
    const lobes = Array.from({ length: 5 }, () => [6 + r() * 12, 7 + r() * 10, 4 + r() * 4]);
    field(t, f * 24, 0, 24, 24, (x, y) => {
      let v = 0;
      for (const [cx, cy, rr] of lobes) v = Math.max(v, 1 - Math.hypot(x - cx, y - cy) / rr);
      if (v <= 0) return null;
      // sombreado: mais claro em cima à esquerda
      const lx = clamp(0.55 + (12 - x) * 0.02 + (12 - y) * 0.03);
      const c = mix([150, 150, 160], [255, 255, 255], band(lx, 3));
      return [...c, band(Math.min(1, v * 2.2), 4) * 0.95];
    });
  }
  return t;
}

/** Lascas de pedra 8×8 (4), com contorno e luz. */
function rocks(Img) {
  const t = new Img(32, 8);
  const tones = ['#5a5048', '#7a6e62', '#9a8e7e', '#c0b4a0'];
  for (let f = 0; f < 4; f++) {
    const r = rng(77 + f);
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + r() * 0.5;
      const rr = 2 + r() * 1.6;
      return [4 + Math.cos(a) * rr, 4 + Math.sin(a) * rr];
    });
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        if (!inside(x + 0.5, y + 0.5)) continue;
        const l = clamp(0.5 + (4 - x) * 0.12 + (4 - y) * 0.16);
        t.set(f * 8 + x, y, tones[Math.min(3, Math.floor(l * 4))]);
      }
    t.outline(f * 8, 0, 8, 8, '#1e1a20');
  }
  return t;
}

/** Rachadura no chão 96×56 (perspectiva achatada): fendas escuras com borda clara. */
function crack(Img) {
  const W = 96;
  const H = 56;
  const t = new Img(W, H);
  const r = rng(5);
  const segs = [];
  for (let k = 0; k < 9; k++) {
    let a = (k / 9) * Math.PI * 2 + r() * 0.5;
    let x = W / 2;
    let y = H / 2;
    let w = 2.4;
    const n = 4 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const l = 4 + r() * 5;
      const nx = x + Math.cos(a) * l;
      const ny = y + Math.sin(a) * l * 0.55;
      segs.push([x, y, nx, ny, w]);
      // galhos
      if (r() < 0.35 && j > 0) {
        const b = a + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.5);
        segs.push([nx, ny, nx + Math.cos(b) * 5, ny + Math.sin(b) * 3, w * 0.5]);
      }
      x = nx;
      y = ny;
      a += (r() - 0.5) * 0.7;
      w *= 0.78;
    }
  }
  const distSeg = (px, py, [x0, y0, x1, y1]) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const k = clamp(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1));
    return Math.hypot(px - x0 - dx * k, py - y0 - dy * k);
  };
  field(t, 0, 0, W, H, (x, y) => {
    let best = 99;
    let bw = 1;
    for (const s of segs) {
      const d = distSeg(x, y, s) / Math.max(0.6, s[4] * 0.5);
      if (d < best) {
        best = d;
        bw = s[4];
      }
    }
    // centro: fenda escura; volta: borda levantada clara; cratera no meio
    const c = Math.hypot(x - W / 2, (y - H / 2) * 1.8);
    if (c < 7) return [40, 30, 26, c < 4 ? 0.85 : 0.6];
    if (best < 1) return [26, 18, 16, 0.92];
    if (best < 1.9 && bw > 0.9) return [200, 186, 160, 0.55];
    return null;
  });
  return t;
}

/** Cristais de gelo 14×34 (3): prisma com faceta clara, aresta branca e contorno. */
function shards(Img) {
  const t = new Img(42, 34);
  const C = ['#2a4a7a', '#4a7ab8', '#7ab4e8', '#b8e4ff', '#f2fcff'];
  for (let f = 0; f < 3; f++) {
    const hgt = 30 - f * 5;
    const wid = 5.5 - f * 0.8;
    const lean = (f - 1) * 1.2;
    for (let y = 0; y < 34; y++) {
      const k = (34 - 1 - y) / hgt; // 0 na base, 1 na ponta
      if (k > 1) continue;
      const half = wid * (k < 0.75 ? 1 : (1 - k) / 0.25);
      const cx = 7 + lean * k;
      for (let x = 0; x < 14; x++) {
        const dx = x + 0.5 - cx;
        if (Math.abs(dx) > half) continue;
        // faceta esquerda clara, direita escura, aresta no meio
        const side = dx / Math.max(0.5, half);
        let i = side < -0.15 ? 3 : side < 0.2 ? 4 : side < 0.6 ? 2 : 1;
        if (k > 0.85) i = Math.min(4, i + 1);
        t.set(f * 14 + x, y, C[i], 0.95);
      }
    }
    t.outline(f * 14, 0, 14, 34, '#16243e');
  }
  return t;
}

/** Meia-lua de vento 40×16, simétrica (mais forte no meio, some nas pontas). */
function wind(Img) {
  const t = new Img(40, 16);
  field(t, 0, 0, 40, 16, (x, y) => {
    const u = x / 40;
    const cy = 13 - 10 * (1 - Math.pow((u - 0.5) * 2, 2));
    const th = 0.9 + 2.4 * Math.sin(u * Math.PI);
    const d = Math.abs(y - cy);
    if (d > th) return null;
    const a = Math.pow(Math.sin(u * Math.PI), 0.7) * (1 - (d / th) * 0.6);
    return [255, 255, 255, band(a * 1.2, 4)];
  });
  return t;
}

/** Três garras em diagonal 32×32. */
function claw(Img) {
  const t = new Img(32, 32);
  field(t, 0, 0, 32, 32, (x, y) => {
    let a = 0;
    for (let k = -1; k <= 1; k++) {
      // linha y = x + off, comprimento até as pontas
      const off = k * 7;
      const d = Math.abs(y - x - off) / Math.SQRT2;
      const along = (x + y - off) / 64;
      if (along < 0.08 || along > 0.92) continue;
      const th = 2.2 * Math.sin(along * Math.PI);
      if (d < th) a = Math.max(a, 1 - d / (th + 0.5));
    }
    return a > 0 ? [255, 255, 255, band(a * 1.4, 3)] : null;
  });
  return t;
}

/** Círculo mágico 64×64 em 6 quadros girando (a estrela repete a cada 60°). */
function rune(Img) {
  const S = 64;
  const t = new Img(S * 6, S);
  for (let f = 0; f < 6; f++) {
    const c = S / 2;
    const ox = f * S;
    const rot = (f / 6) * (Math.PI / 3);
    const plot = (x, y, a) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= S || y >= S) return;
      const o = t.alpha(ox + x, y) / 255;
      if (a > o) t.put(ox + x, y, 255, 255, 255, Math.round(a * 255));
    };
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      plot(c + Math.cos(a) * 30.5, c + Math.sin(a) * 30.5, 1);
      plot(c + Math.cos(a) * 29.5, c + Math.sin(a) * 29.5, 0.55);
      plot(c + Math.cos(a) * 24, c + Math.sin(a) * 24, 0.9);
    }
    // marcas entre os anéis (runas), giram junto
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + rot;
      const len = k % 2 === 0 ? 4 : 2;
      for (let j = 0; j <= len; j++) plot(c + Math.cos(a) * (25.5 + j), c + Math.sin(a) * (25.5 + j), 0.8);
    }
    const tri = (r0) => {
      const p = [0, 1, 2].map((i) => [c + Math.cos(r0 + (i * Math.PI * 2) / 3) * 22, c + Math.sin(r0 + (i * Math.PI * 2) / 3) * 22]);
      for (let i = 0; i < 3; i++) {
        const [x0, y0] = p[i];
        const [x1, y1] = p[(i + 1) % 3];
        for (let q = 0; q <= 1; q += 0.01) plot(lerp(x0, x1, q), lerp(y0, y1, q), 0.75);
      }
    };
    tri(-Math.PI / 2 + rot);
    tri(Math.PI / 2 + rot);
    for (let a = 0; a < Math.PI * 2; a += 0.02) plot(c + Math.cos(a) * 9, c + Math.sin(a) * 9, 0.7);
  }
  return t;
}

/** Coluna de luz do céu 24×96: forte no meio, some nas pontas. */
function beam(Img) {
  const t = new Img(24, 96);
  field(t, 0, 0, 24, 96, (x, y) => {
    const h = Math.abs(x - 12) / 12;
    const v = y / 96;
    const top = clamp(v / 0.35);
    const bot = clamp((1 - v) / 0.06);
    const a = Math.pow(1 - h, 1.6) * top * bot;
    return a > 0 ? [255, 255, 255, band(a, 5)] : null;
  });
  return t;
}

/** Floco de neve 7×7. */
function snow(Img) {
  const t = new Img(7, 7);
  for (const [x, y] of [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [1, 1], [5, 1], [1, 5], [5, 5], [2, 2], [4, 2], [2, 4], [4, 4]]) t.put(x, y, 255, 255, 255, x === 3 && y === 3 ? 255 : 210);
  return t;
}

/** Penas 8×8 (2) e folhas 6×6 (3). */
function bits(Img) {
  const t = new Img(34, 8);
  // penas (claras, para tingir)
  for (let f = 0; f < 2; f++) {
    for (let i = 0; i < 7; i++) {
      const x = f * 8 + 1 + i * 0.9;
      const y = 6.5 - i * 0.85 + (f ? 0.5 : 0);
      t.set(x, y, '#ffffff');
      if (i > 0 && i < 6) {
        t.set(x - 1, y - 1, '#e8e0d0', 0.9);
        t.set(x + 1, y + 1, '#c8c0b0', 0.9);
      }
    }
  }
  // folhas
  const L = ['#3e6a2a', '#5f9a3a', '#8ac850'];
  for (let f = 0; f < 3; f++) {
    const ox = 16 + f * 6;
    t.ellipse(ox + 3, 4, 2.4, 1.5, L[f]);
    t.set(ox + 2, 3, L[Math.min(2, f + 1)]);
    t.set(ox + 5, 5, '#2a4a1e');
  }
  return t;
}

/** Marca de queimado 32×20 com brasas. */
function scorch(Img) {
  const t = new Img(32, 20);
  const r = rng(9);
  field(t, 0, 0, 32, 20, (x, y) => {
    const d = Math.hypot((x - 16) / 15, (y - 10) / 8.5);
    if (d > 1) return null;
    const n = 0.85 + r() * 0.3;
    return [24, 16, 14, band((1 - d) * 0.9 * n, 4)];
  });
  for (let k = 0; k < 6; k++) t.put(6 + Math.floor(r() * 20), 5 + Math.floor(r() * 10), 255, 150, 60, 220);
  return t;
}

/** Seta para cima 9×7 e cruz de cura 9×9 (brancas, com contorno escuro). */
function icons(Img) {
  const t = new Img(18, 9);
  for (let y = 0; y < 5; y++) for (let x = 4 - y; x <= 4 + y; x++) if (Math.abs(x - 4) >= y - 1) t.set(x, 1 + y, '#ffffff');
  t.rect(3, 5, 3, 3, '#ffffff');
  t.rect(13, 1, 3, 7, '#ffffff');
  t.rect(11, 3, 7, 3, '#ffffff');
  t.outline(0, 0, 9, 9, '#0b0d14');
  t.outline(9, 0, 9, 9, '#0b0d14');
  return t;
}

/** Folhas de efeito (src/systems/MountFx.ts carrega cada uma). */
export const FX_SHEETS = {
  'fx-ring': { w: 96, h: 96 },
  'fx-spark': { w: 9, h: 9 },
  'fx-blob': { w: 16, h: 16 },
  'fx-flame': { w: 12, h: 12 },
  'fx-puff': { w: 24, h: 24 },
  'fx-rock': { w: 8, h: 8 },
  'fx-crack': { w: 96, h: 56 },
  'fx-shard': { w: 14, h: 34 },
  'fx-wind': { w: 40, h: 16 },
  'fx-claw': { w: 32, h: 32 },
  'fx-rune': { w: 64, h: 64 },
  'fx-beam': { w: 24, h: 96 },
  'fx-snow': { w: 7, h: 7 },
  'fx-bits': { w: 8, h: 8 },
  'fx-scorch': { w: 32, h: 20 },
  'fx-icons': { w: 9, h: 9 },
};

export function drawFx({ Img, save }) {
  const art = {
    'fx-ring': ring,
    'fx-spark': spark,
    'fx-blob': blob,
    'fx-flame': flame,
    'fx-puff': puff,
    'fx-rock': rocks,
    'fx-crack': crack,
    'fx-shard': shards,
    'fx-wind': wind,
    'fx-claw': claw,
    'fx-rune': rune,
    'fx-beam': beam,
    'fx-snow': snow,
    'fx-bits': bits,
    'fx-scorch': scorch,
    'fx-icons': icons,
  };
  for (const [k, fn] of Object.entries(art)) save(`assets/sprites/fx/${k}.png`, fn(Img));
  return FX_SHEETS;
}
