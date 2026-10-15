// Montarias em pixel art, geradas por código com um pequeno "pintor":
// cada parte (corpo, pescoço, cabeça, pernas, cauda, asas…) é uma máscara
// desenhada com formas curvas (elipses, cápsulas afinadas, polígonos) e depois
// sombreada como volume (5 tons por material, luz de cima à esquerda, com
// pontilhado nas transições), com contorno colorido e linhas entre as partes.
// As pernas têm esqueleto (quadril, joelho, casco) e um ciclo de galope.
//
// Folha: 21 montarias × (4 direções × 6 quadros), 96×80 px de arte, exibidas a
// 0,5 (48×40 px do mundo — a mesma densidade de detalhe do herói).

export const FW = 112;
export const FH = 80;
const GROUND = 76;
const NF = 6;
const W = FW;
const H = FH;
/** Deslocamento horizontal das vistas de lado (o bicho é desenhado em 0–96 e centrado no quadro de 112). */
let TX = 0;

// ------------------------------------------------------------------ cores
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function rgb2hsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/**
 * Rampa de 6 tons a partir da cor base: contorno, sombra funda, sombra, base,
 * luz, brilho — as sombras puxam para o azul/roxo e as luzes para o amarelo.
 */
function ramp(base) {
  const [h, s, l] = rgb2hsl(hex(base));
  const shift = (dh, ds, dl) => {
    // hue shift na direção do azul (sombra) ou do amarelo (luz)
    const target = dl < 0 ? 250 : 55;
    let nh = h + Math.sign(((target - h + 540) % 360) - 180) * Math.min(Math.abs(dh), Math.abs(((target - h + 540) % 360) - 180));
    return toHex(...hsl2rgb([nh, Math.max(0, Math.min(1, s + ds)), Math.max(0, Math.min(1, l + dl))]));
  };
  return [shift(24, 0.05, -l * 0.72), shift(16, 0.04, -l * 0.42), shift(8, 0.02, -l * 0.2), base, shift(8, -0.02, (1 - l) * 0.28), shift(14, -0.06, (1 - l) * 0.55)];
}

// ------------------------------------------------------------------ máscaras
class Mask {
  constructor() {
    this.m = new Uint8Array(W * H);
  }
  set(x, y) {
    x = Math.round(x + TX);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) this.m[y * W + x] = 1;
  }
  has(x, y) {
    return x >= 0 && y >= 0 && x < W && y < H && this.m[y * W + x] === 1;
  }
  ellipse(cx, cy, rx, ry, rot = 0) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const R = Math.max(rx, ry) + 1;
    for (let y = Math.floor(cy - R); y <= cy + R; y++)
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const u = (dx * c + dy * s) / rx;
        const v = (-dx * s + dy * c) / ry;
        if (u * u + v * v <= 1) this.set(x, y);
      }
    return this;
  }
  /** Cápsula afinada de (x0,y0,r0) a (x1,y1,r1). */
  capsule(x0, y0, x1, y1, r0, r1 = r0) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    const R = Math.max(r0, r1) + 1;
    for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.max(y0, y1) + R; y++)
      for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.max(x0, x1) + R; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let t = ((px - x0) * dx + (py - y0) * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        const qx = x0 + dx * t;
        const qy = y0 + dy * t;
        const r = r0 + (r1 - r0) * t;
        if ((px - qx) ** 2 + (py - qy) ** 2 <= r * r) this.set(x, y);
      }
    return this;
  }
  poly(pts) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs = [];
      const yy = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) xs.push(ax + ((yy - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y);
    }
    return this;
  }
  /** Curva grossa (vários segmentos de cápsula). */
  path(pts, r0, r1 = r0) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = r0 + ((r1 - r0) * i) / (pts.length - 1);
      const b = r0 + ((r1 - r0) * (i + 1)) / (pts.length - 1);
      this.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], a, b);
    }
    return this;
  }
  /** Tira os pixels de outra máscara (recortes). */
  cut(o) {
    for (let i = 0; i < this.m.length; i++) if (o.m[i]) this.m[i] = 0;
    return this;
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

// ------------------------------------------------------------------ pintor
class Painter {
  constructor(tx = 0) {
    this.tx = tx;
    this.c = new Uint8ClampedArray(W * H * 4);
    this.part = new Int16Array(W * H).fill(-1);
    this.n = 0;
  }
  put(x, y, col) {
    this.putRaw(x + this.tx, y, col);
  }
  putRaw(x, y, col) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b] = hex(col);
    const i = (y * W + x) * 4;
    this.c[i] = r;
    this.c[i + 1] = g;
    this.c[i + 2] = b;
    this.c[i + 3] = 255;
  }
  /**
   * Pinta a máscara como um volume: tom pela posição na coluna (em cima
   * claro, embaixo escuro) e um pouco pela linha (esquerda mais clara),
   * pontilhado nas transições; borda com quem já estava embaixo vira linha.
   */
  shade(mask, rampC, opts = {}) {
    const id = this.n++;
    const light = opts.light ?? 1;
    const flat = opts.flat ?? 0;
    const top = new Int16Array(W).fill(-1);
    const bot = new Int16Array(W).fill(-1);
    const left = new Int16Array(H).fill(-1);
    const right = new Int16Array(H).fill(-1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (mask.m[y * W + x]) {
          if (top[x] < 0) top[x] = y;
          bot[x] = y;
          if (left[y] < 0) left[y] = x;
          right[y] = x;
        }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!mask.m[y * W + x]) continue;
        // posição dentro do trecho vertical contínuo (não da coluna toda)
        let y0 = y;
        while (y0 > 0 && mask.m[(y0 - 1) * W + x]) y0--;
        let y1 = y;
        while (y1 < H - 1 && mask.m[(y1 + 1) * W + x]) y1++;
        let x0 = x;
        while (x0 > 0 && mask.m[y * W + x0 - 1]) x0--;
        let x1 = x;
        while (x1 < W - 1 && mask.m[y * W + x1 + 1]) x1++;
        const t = y1 > y0 ? (y - y0) / (y1 - y0) : 0.5;
        const s = x1 > x0 ? (x - x0) / (x1 - x0) : 0.5;
        // brilho: cilindro iluminado de cima à esquerda
        let v = 1 - (t * 0.85 + s * 0.3) + 0.08;
        v = flat ? 0.55 + (v - 0.55) * (1 - flat) : v;
        v = 0.5 + (v - 0.5) * light;
        const d = BAYER[(y & 3) * 4 + (x & 3)] * 0.16;
        const k = Math.max(1, Math.min(5, Math.round(1 + (v + d) * 4.2)));
        let col = rampC[k];
        // separação: borda desta parte sobre outra parte já pintada
        const edge = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ].some(([nx, ny]) => !mask.has(nx, ny) && nx >= 0 && ny >= 0 && nx < W && ny < H && this.part[ny * W + nx] >= 0);
        if (edge) col = rampC[1];
        this.putRaw(x, y, col);
        this.part[y * W + x] = id;
      }
  }
  /** Contorno de 1 px por fora, na cor escura do vizinho (contorno colorido). */
  outline(dark) {
    const add = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (this.c[i + 3]) continue;
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = (ny * W + nx) * 4;
          if (this.c[j + 3]) {
            add.push([x, y, this.c[j], this.c[j + 1], this.c[j + 2]]);
            break;
          }
        }
      }
    const [dr, dg, db] = hex(dark);
    for (const [x, y, r, g, b] of add) {
      const i = (y * W + x) * 4;
      this.c[i] = r * 0.35 + dr * 0.65;
      this.c[i + 1] = g * 0.35 + dg * 0.65;
      this.c[i + 2] = b * 0.35 + db * 0.65;
      this.c[i + 3] = 255;
    }
  }
  dot(x, y, col, w = 1, h = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(Math.round(x) + i, Math.round(y) + j, col);
  }
  line(x0, y0, x1, y1, col) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.put(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), col);
  }
}

// ------------------------------------------------------------------ esqueleto das pernas
/** Joelho por cinemática inversa de 2 ossos; `bend` = +1 dobra para a frente, −1 para trás. */
function ik(hx, hy, fx, fy, a, b, bend) {
  let dx = fx - hx;
  let dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = a + b - 0.01;
  if (d > max) {
    fx = hx + (dx / d) * max;
    fy = hy + (dy / d) * max;
    dx = fx - hx;
    dy = fy - hy;
    d = max;
  }
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const ang = Math.atan2(dy, dx) - bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  return [hx + Math.cos(ang) * a, hy + Math.sin(ang) * a, fx, fy];
}

/** Pé no ciclo de galope: φ em [0,1). Apoio (pé no chão, indo para trás) e voo (pé erguido, indo para a frente). */
function foot(hx, phi, stride, lift) {
  const p = ((phi % 1) + 1) % 1;
  if (p < 0.55) {
    const t = p / 0.55;
    return [hx + stride * (0.5 - t), GROUND - 1];
  }
  const t = (p - 0.55) / 0.45;
  return [hx + stride * (t - 0.5), GROUND - 1 - Math.sin(t * Math.PI) * lift];
}

// ------------------------------------------------------------------ espécies
// medidas em px de arte (96×80), animal virado para a direita
const SPECIES = {
  horse: { body: [29, 40, 61, 38], bodyR: 11, chest: 11.5, rump: 12, legTop: 4.6, legLow: 2.2, neck: [[63, 33], [71, 21], [76, 13]], neckR: [7.5, 5], head: [[76, 11], [88, 21]], headR: [5.2, 3.6], ears: true, hoof: true, tail: 'hair', mane: true, stride: 18, lift: 9, bob: 2 },
  stag: { body: [31, 40, 61, 38], bodyR: 9.5, chest: 10, rump: 10, legTop: 3.8, legLow: 1.8, neck: [[63, 33], [70, 22], [74, 14]], neckR: [6.5, 4.2], head: [[74, 12], [85, 19]], headR: [4.8, 3], ears: true, hoof: true, tail: 'stub', stride: 19, lift: 11, bob: 2 },
  bear: { body: [28, 46, 62, 45], bodyR: 14.5, chest: 14, rump: 15.5, legTop: 6.5, legLow: 4.6, neck: [[63, 41], [71, 38]], neckR: [10, 8.5], head: [[73, 37], [85, 42]], headR: [8.5, 4.8], ears: 'round', paw: true, tail: 'stub', stride: 13, lift: 6, bob: 2 },
  wolf: { body: [30, 45, 61, 43], bodyR: 10, chest: 11, rump: 10, legTop: 4.2, legLow: 2.3, neck: [[62, 39], [71, 31]], neckR: [8, 6.5], head: [[71, 29], [87, 35]], headR: [6.6, 3], ears: 'point', paw: true, tail: 'brush', stride: 19, lift: 9, bob: 2 },
  rhino: { body: [26, 47, 64, 47], bodyR: 15.5, chest: 15, rump: 16, legTop: 7, legLow: 5.6, neck: [[64, 45], [72, 43]], neckR: [11, 9.5], head: [[72, 42], [89, 50]], headR: [9.5, 5.2], ears: 'point', hoof: true, tail: 'thin', stride: 11, lift: 5, bob: 1 },
  boar: { body: [30, 52, 60, 50], bodyR: 11, chest: 12, rump: 10.5, legTop: 4.2, legLow: 2.8, neck: [[60, 48], [67, 48]], neckR: [9.5, 7.5], head: [[66, 47], [83, 53]], headR: [7.5, 3.8], ears: 'point', hoof: true, tail: 'thin', stride: 11, lift: 5, bob: 2 },
  cat: { body: [28, 46, 63, 44], bodyR: 9.5, chest: 10.5, rump: 10, legTop: 4.6, legLow: 2.7, neck: [[63, 40], [71, 34]], neckR: [7.5, 6.5], head: [[71, 33], [83, 37]], headR: [7, 4.2], ears: 'round', paw: true, tail: 'long', stride: 21, lift: 9, bob: 1 },
  raptor: { biped: true, body: [38, 36, 58, 32], bodyR: 9, chest: 9, rump: 10, legTop: 5.5, legLow: 2.3, neck: [[58, 30], [65, 20], [69, 14]], neckR: [5.5, 3.8], head: [[67, 12], [85, 16]], headR: [5.6, 3.3], tail: 'lizard', stride: 22, lift: 10, bob: 3 },
  lizard: { body: [26, 62, 64, 62], bodyR: 7, chest: 7.5, rump: 7.5, legTop: 3.8, legLow: 2.4, splay: true, neck: [[62, 61], [70, 59]], neckR: [6, 5.5], head: [[70, 58], [86, 61]], headR: [6, 3.3], tail: 'lizard', stride: 12, lift: 5, bob: 1 },
  griffin: { body: [30, 43, 61, 41], bodyR: 10, chest: 11.5, rump: 10.5, legTop: 4.6, legLow: 2.8, neck: [[62, 37], [69, 26], [73, 19]], neckR: [7.5, 5.5], head: [[71, 18], [83, 20]], headR: [6.2, 2.8], beak: true, paw: true, tail: 'long', wings: 'feather', stride: 19, lift: 9, bob: 2 },
  dragon: { body: [28, 44, 61, 42], bodyR: 11.5, chest: 12.5, rump: 12, legTop: 5.6, legLow: 3.4, neck: [[63, 38], [71, 27], [77, 18], [81, 12]], neckR: [7.5, 4.2], head: [[81, 10], [93, 15]], headR: [5.6, 3.3], horns: true, paw: true, tail: 'lizard', wings: 'bat', spikes: true, stride: 17, lift: 8, bob: 2 },
};
// comprimento das pernas: do quadril (um pouco abaixo do meio do corpo) ao chão, quase esticadas
for (const S of Object.values(SPECIES)) {
  const hip = S.body[1] + S.bodyR * 0.35 + 2;
  const L = GROUND - 1 - hip;
  S.thigh = L * (S.biped ? 0.52 : 0.5);
  S.shin = L * (S.biped ? 0.62 : 0.57);
}

// ------------------------------------------------------------------ montarias
const PAL = {
  bay: '#8a5530',
  black: '#33303a',
  white: '#e6e1d6',
  pinto: '#ece4d4',
  brownBear: '#6e4a2e',
  polar: '#e8eef4',
  gray: '#7c7c86',
  frost: '#b4d6ee',
  rhino: '#8c867a',
  boar: '#5e4434',
  stag: '#8ee4ff',
  tiger: '#de8a2c',
  panther: '#2e2638',
  sand: '#d6ae6e',
  lava: '#c43e1c',
  griffin: '#c89c4e',
  emerald: '#3c9a5a',
  ruby: '#b8302a',
};

/** id, nome, espécie, cor, opções. */
export const MOUNT_DEFS = [
  ['bay', 'Cavalo Baio', 'horse', PAL.bay, { mane: '#2c1a10', socks: '#1e140e' }],
  ['black', 'Corcel Negro', 'horse', PAL.black, { mane: '#141218', blaze: '#e8e4dc' }],
  ['white', 'Égua Branca do Vale', 'horse', PAL.white, { mane: '#cfc6b6' }],
  ['pinto', 'Cavalo Malhado', 'horse', PAL.pinto, { mane: '#3a2414', spots: '#6a4428' }],
  ['war', 'Corcel de Guerra', 'horse', '#6e4a2c', { mane: '#1e140e', barding: '#8c96a8', cloth: '#3456a8', trim: '#e8c04a' }],
  ['unicorn', 'Unicórnio Lunar', 'horse', '#f0eef8', { mane: '#b49cff', mane2: '#8ee0ff', horn: '#ffe08a', glow: 0xbfa8ff }],
  ['nightmare', 'Pesadelo Flamejante', 'horse', '#2a2430', { fire: '#ff8a2a', fire2: '#ffe060', eyes: '#ff4a1a', hoofFire: true, glow: 0xff6a1a }],
  ['bear', 'Urso Pardo de Batalha', 'bear', PAL.brownBear, { barding: '#8c96a8', cloth: '#a83a2a', trim: '#e8c04a' }],
  ['polar', 'Urso Polar Rúnico', 'bear', PAL.polar, { runes: '#4ab0ff', glow: 0x7ac8ff }],
  ['wolf', 'Lobo Gigante', 'wolf', PAL.gray, { belly: '#c8c8cc' }],
  ['frostwolf', 'Lobo da Geada', 'wolf', PAL.frost, { belly: '#f0faff', runes: '#ffffff', glow: 0x9fe8ff }],
  ['rhino', 'Rinoceronte Couraçado', 'rhino', PAL.rhino, { barding: '#8c96a8', cloth: '#6a4a2a', trim: '#c8a050' }],
  ['boar', 'Javali de Presas', 'boar', PAL.boar, { mane: '#2a1a12', tusk: '#f2ead6' }],
  ['stag', 'Cervo Espiritual', 'stag', PAL.stag, { antler: '#f0fcff', glow: 0x7ae8ff, ghost: true }],
  ['sabre', 'Tigre-Dente-de-Sabre', 'cat', PAL.tiger, { stripes: '#2a1a0e', belly: '#f4e6c8', fangs: '#f6f0e0' }],
  ['panther', 'Pantera das Sombras', 'cat', PAL.panther, { eyes: '#d080ff', runes: '#9a5aff', glow: 0x9a4aff }],
  ['raptor', 'Raptor do Deserto', 'raptor', PAL.sand, { stripes: '#8a5a2a', belly: '#f0dcb0', crest: '#c84a2a' }],
  ['salamander', 'Salamandra de Lava', 'lizard', PAL.lava, { fire: '#ffb030', fire2: '#ffe880', belly: '#2a1a14', glow: 0xff5a1a }],
  ['griffin', 'Grifo Real', 'griffin', PAL.griffin, { head: '#f6f2ea', wing: '#e8d8b0', beak: '#f0b030' }],
  ['emerald', 'Dragão Esmeralda', 'dragon', PAL.emerald, { wing: '#285a3a', membrane: '#7acc8a', horn: '#ece4c8', belly: '#c8e0a0' }],
  ['ruby', 'Dragão Rubro', 'dragon', PAL.ruby, { wing: '#6a1a18', membrane: '#e8584a', horn: '#ffe08a', belly: '#f0c070', fire: '#ffb030', glow: 0xff4a2a }],
];

// ------------------------------------------------------------------ lado
function drawSide(P, sp, base, o, f) {
  const S = SPECIES[sp];
  const R = ramp(base);
  const Rd = ramp(shade(base, -0.18));
  const phi = f / NF;
  const bob = Math.round(Math.sin(phi * Math.PI * 4) * (S.bob / 2));
  const [bx0, by0, bx1, by1] = S.body;
  const hipY = by0 + bob + 2;
  const shY = by1 + bob + 2;
  // fases das pernas: [x do quadril, fase, frente?, lado de cá?]
  const legs = S.biped
    ? [
        [bx1 - 6, 0, false, false],
        [bx1 - 4, 0.5, false, true],
      ]
    : [
        [bx0 + 2, 0.15, false, false],
        [bx1 - 2, 0.65, true, false],
        [bx0 + 4, 0.0, false, true],
        [bx1, 0.5, true, true],
      ];
  const legMask = (hx, ph, front) => {
    const m = new Mask();
    const hy = front ? shY : hipY;
    const [fx, fy] = foot(hx + (front ? 2 : -2), ph, S.stride, S.lift);
    const [kx, ky, ex, ey] = ik(hx, hy, fx, fy, S.thigh, S.shin, front ? -1 : 1);
    m.capsule(hx, hy, kx, ky, S.legTop, S.legLow + 1);
    m.capsule(kx, ky, ex, ey, S.legLow + 0.6, S.legLow);
    if (S.splay) m.ellipse(ex + 2, ey, 3.5, 1.6);
    return { m, ex, ey };
  };
  const hooves = [];
  // asa de lá
  if (S.wings) drawWing(P, S, o, phi, -1, bob);
  // cauda
  drawTail(P, S, R, o, phi, bx0, by0 + bob);
  // pernas de lá (mais escuras)
  for (const [hx, ph, front, near] of legs)
    if (!near) {
      const { m, ex, ey } = legMask(hx, ph, front);
      P.shade(m, Rd);
      hooves.push([ex, ey, false]);
    }
  // corpo
  const body = new Mask();
  body.capsule(bx0, by0 + bob, bx1, by1 + bob, S.bodyR, S.bodyR);
  body.ellipse(bx1 + 1, by1 + bob, S.chest, S.chest * 0.95);
  body.ellipse(bx0 - 1, by0 + bob - 1, S.rump, S.rump * 0.95);
  if (o.belly) {
    P.shade(body, R);
    const belly = new Mask().ellipse((bx0 + bx1) / 2, by0 + bob + S.bodyR * 0.62, (bx1 - bx0) / 2 + 2, S.bodyR * 0.42);
    for (let i = 0; i < belly.m.length; i++) belly.m[i] &= body.m[i];
    P.shade(belly, ramp(o.belly), { light: 0.6 });
  } else P.shade(body, R);
  // pelagem: listras, manchas, runas
  bodyMarks(P, o, bx0, bx1, by0 + bob, S.bodyR);
  // pescoço e cabeça
  if (S.neck.length) {
    const nk = new Mask().path(
      S.neck.map(([x, y]) => [x, y + bob]),
      S.neckR[0],
      S.neckR[1],
    );
    P.shade(nk, o.head && sp === 'griffin' ? ramp(o.head) : R);
  }
  if (S.mane && !o.fire) drawMane(P, S, o, bob, phi);
  drawHead(P, sp, S, R, o, bob, phi);
  // armadura (barda) e sela
  if (o.barding) barding(P, o, bx0, bx1, by0 + bob, S, body);
  saddleSide(P, (bx0 + bx1) / 2 + 2, by0 + bob - S.bodyR + 1, o);
  // pernas de cá
  for (const [hx, ph, front, near] of legs)
    if (near) {
      const { m, ex, ey } = legMask(hx, ph, front);
      P.shade(m, R);
      hooves.push([ex, ey, true]);
    }
  for (const [ex, ey, near] of hooves) {
    if (S.hoof) {
      const c = o.hoofFire ? (f % 2 ? o.fire2 : o.fire) : near ? '#2a2018' : '#1a140e';
      P.dot(ex - 2, ey - 2, c, 5, 3);
      if (o.socks && near) P.dot(ex - 2, ey - 5, o.socks, 5, 2);
    } else if (S.paw) P.dot(ex - 2, ey - 1, near ? R[1] : Rd[1], 6, 2);
  }
  if (S.wings) drawWing(P, S, o, phi, 1, bob);
  if (sp === 'dragon' || sp === 'lizard') spikesSide(P, S, o, bx0, bx1, by0 + bob);
  if (o.fire && sp === 'horse') fireMane(P, S, o, bob, f);
  if (o.fire && sp === 'lizard') fireBack(P, o, bx0, bx1, by0 + bob, S.bodyR, f);
  P.outline('#120e18');
}

const shade = (c, k) => {
  const [h, s, l] = rgb2hsl(hex(c));
  return toHex(...hsl2rgb([h, s, Math.max(0, Math.min(1, l + k))]));
};

function bodyMarks(P, o, x0, x1, y, r) {
  if (o.spots)
    for (const [dx, dy, rx, ry] of [
      [-8, -2, 7, 5],
      [6, 2, 6, 4],
      [16, -4, 4, 3],
      [-16, 4, 4, 3],
    ]) {
      const m = new Mask().ellipse((x0 + x1) / 2 + dx, y + dy, rx, ry);
      P.shade(m, ramp(o.spots), { light: 0.5 });
    }
  if (o.stripes) for (let x = x0 - 4; x <= x1 + 2; x += 5) for (let k = 0; k < r * 1.3; k++) P.dot(x + Math.round(Math.sin(k * 0.6) * 1.2), y - r + 2 + k, o.stripes);
  if (o.runes)
    for (const [dx, dy] of [
      [-10, -2],
      [0, -4],
      [10, -1],
    ]) {
      const cx = (x0 + x1) / 2 + dx;
      P.dot(cx, y + dy, o.runes, 1, 4);
      P.dot(cx - 1, y + dy + 1, o.runes, 3, 1);
    }
}

function drawTail(P, S, R, o, phi, x, y) {
  const sway = Math.sin(phi * Math.PI * 2) * 2.5;
  const m = new Mask();
  if (S.tail === 'hair') {
    // mechas de crina que caem e balançam
    for (let k = 0; k < 4; k++) m.path([[x - 10, y - 8], [x - 16 - k, y - 2 + k * 2], [x - 16 - k * 1.5 + sway, y + 12 + k * 3]], 2.4, 1);
    P.shade(m, ramp(o.mane ?? R[1]));
  } else if (S.tail === 'brush') {
    m.path([[x - 10, y - 6], [x - 18, y - 8 + sway], [x - 24, y - 4 + sway]], 3.5, 2.5);
    P.shade(m, R);
    P.dot(x - 26, y - 5 + Math.round(sway), o.belly ?? R[5], 3, 2);
  } else if (S.tail === 'long') {
    m.path([[x - 10, y - 6], [x - 18, y - 12 + sway], [x - 24, y - 18 + sway], [x - 26, y - 14 + sway]], 2.4, 1.8);
    P.shade(m, R);
  } else if (S.tail === 'lizard') {
    m.path([[x - 6, y - 2], [x - 16, y + 2 + sway], [x - 24, y + 6 + sway * 1.5], [x - 29, y + 4 + sway * 2]], S.bodyR * 0.75, 1);
    P.shade(m, R);
  } else if (S.tail === 'thin') {
    m.path([[x - 12, y - 6], [x - 15, y + 2 + sway]], 1.2, 0.8);
    P.shade(m, R);
  } else {
    m.ellipse(x - 12, y - 6, 3, 2.5);
    P.shade(m, ramp(o.belly ?? R[4]));
  }
}

function drawMane(P, S, o, bob, phi) {
  const m = new Mask();
  const pts = S.neck.map(([x, y]) => [x, y + bob]);
  for (let i = 0; i + 1 < pts.length; i++)
    for (let t = 0; t < 1; t += 0.25) {
      const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
      const y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
      const flow = Math.sin(phi * Math.PI * 2 + x * 0.3) * 1.5;
      m.capsule(x - 2, y - 6, x - 6 + flow, y + 1, 2.2, 1);
    }
  m.capsule(S.head[0][0] - 2, S.head[0][1] + bob - 3, S.head[0][0] + 3, S.head[0][1] + bob + 3, 2.4, 1.5);
  P.shade(m, ramp(o.mane), { light: 1.2 });
  if (o.mane2) for (let k = 0; k < 6; k++) P.dot(pts[0][0] - 4 + k * 2, pts[0][1] - 10 - k * 3, o.mane2, 1, 2);
}

function fireMane(P, S, o, bob, f) {
  const pts = S.neck.map(([x, y]) => [x, y + bob]);
  for (let i = 0; i + 1 < pts.length; i++)
    for (let t = 0; t < 1; t += 0.2) {
      const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
      const y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
      const h = 4 + ((Math.round(x) + f) % 3) * 2;
      for (let k = 0; k < h; k++) P.dot(x - 3 - k * 0.7, y - 5 - k, k < h / 2 ? o.fire : o.fire2, 2, 1);
    }
  const [hx, hy] = [SPECIES.horse.body[0], SPECIES.horse.body[1] + bob];
  for (let k = 0; k < 10; k++) P.dot(hx - 12 - k, hy - 6 + k + ((k + f) % 2), k % 3 ? o.fire : o.fire2, 2, 2);
}

function fireBack(P, o, x0, x1, y, r, f) {
  for (let x = x0 - 4; x <= x1; x += 4) {
    const h = 3 + ((x + f) % 3);
    for (let k = 0; k < h; k++) P.dot(x, y - r - k, k < 2 ? o.fire : o.fire2, 2, 1);
  }
}

function spikesSide(P, S, o, x0, x1, y) {
  for (let x = x0 - 6; x <= x1 + 2; x += 5) {
    P.dot(x, y - S.bodyR - 1, o.horn ?? '#e8e0c8', 2, 2);
    P.dot(x + 1, y - S.bodyR - 3, o.horn ?? '#e8e0c8', 1, 2);
  }
}

function drawHead(P, sp, S, R, o, bob, phi) {
  const [[hx0, hy0], [hx1, hy1]] = S.head.map(([x, y]) => [x, y + bob]);
  const m = new Mask();
  m.capsule(hx0, hy0, hx1, hy1, S.headR[0], S.headR[1]);
  if (sp === 'bear' || sp === 'wolf' || sp === 'cat' || sp === 'boar' || sp === 'rhino') m.ellipse(hx0 + 2, hy0 + 1, S.headR[0] + 1, S.headR[0]);
  const HR = sp === 'griffin' ? ramp(o.head) : R;
  P.shade(m, HR);
  // focinho mais claro
  const sn = new Mask().ellipse(hx1 - 1, hy1 + 1, S.headR[1] + 1, S.headR[1]);
  for (let i = 0; i < sn.m.length; i++) sn.m[i] &= m.m[i];
  if (sp !== 'griffin' && sp !== 'dragon' && sp !== 'raptor' && sp !== 'lizard') P.shade(sn, ramp(shade(R[3], 0.06)), { light: 0.7 });
  // orelhas
  if (S.ears === true) {
    const e = new Mask().poly([
      [hx0 - 1, hy0 - 3],
      [hx0 + 1, hy0 - 10],
      [hx0 + 3, hy0 - 3],
    ]);
    P.shade(e, R);
  } else if (S.ears === 'point') {
    const e = new Mask().poly([
      [hx0 - 3, hy0 - S.headR[0] + 2],
      [hx0 - 2, hy0 - S.headR[0] - 6],
      [hx0 + 2, hy0 - S.headR[0] + 1],
    ]);
    P.shade(e, R);
  } else if (S.ears === 'round') {
    P.shade(new Mask().ellipse(hx0 - 1, hy0 - S.headR[0] + 1, 2.6, 2.6), R);
  }
  // olho
  const ex = hx0 + (hx1 - hx0) * 0.3;
  const ey = hy0 + (hy1 - hy0) * 0.3 - 1;
  P.dot(ex, ey, o.eyes ?? '#120e18', 2, 2);
  if (!o.eyes) P.dot(ex, ey, '#f0f0f0');
  // narina / boca
  P.dot(hx1 + S.headR[1] - 2, hy1, R[0]);
  if (sp === 'horse' || sp === 'stag') P.line(hx1 - 3, hy1 + S.headR[1] - 1, hx1 + 2, hy1 + S.headR[1] - 1, R[1]);
  if (o.blaze) P.line(hx0 + 2, hy0 - 2, hx1 + 1, hy1 - 2, o.blaze);
  // extras por espécie
  if (o.horn) {
    const h = new Mask().poly([
      [hx0 + 2, hy0 - 4],
      [hx0 + 9, hy0 - 15],
      [hx0 + 5, hy0 - 3],
    ]);
    P.shade(h, ramp(o.horn));
  }
  if (sp === 'stag') antlers(P, hx0 + 1, hy0 - 4, o.antler);
  if (sp === 'rhino') {
    P.shade(new Mask().poly([[hx1 - 6, hy1 - 3], [hx1 - 1, hy1 - 14], [hx1 + 1, hy1 - 2]]), ramp('#ece2c8'));
    P.shade(new Mask().poly([[hx1 - 12, hy1 - 6], [hx1 - 10, hy1 - 12], [hx1 - 8, hy1 - 6]]), ramp('#ece2c8'));
  }
  if (sp === 'boar') {
    P.line(hx1 - 2, hy1 + 2, hx1 + 2, hy1 - 3, o.tusk);
    P.line(hx1 - 1, hy1 + 2, hx1 + 3, hy1 - 3, o.tusk);
    for (let k = 0; k < 9; k++) P.dot(hx0 - 14 + k * 2, hy0 - S.headR[0] - (k % 2), o.mane, 1, 3);
  }
  if (sp === 'cat' && o.fangs) {
    P.dot(hx1, hy1 + 3, o.fangs, 1, 4);
    P.dot(hx1 - 2, hy1 + 3, o.fangs, 1, 3);
  }
  if (sp === 'wolf' || sp === 'cat') P.dot(hx1 + S.headR[1] - 1, hy1 - 1, '#120e18', 2, 2);
  if (S.beak) {
    P.shade(new Mask().poly([[hx1 - 1, hy1 - 3], [hx1 + 8, hy1 + 1], [hx1 + 3, hy1 + 3], [hx1 - 1, hy1 + 3]]), ramp(o.beak));
    for (let k = 0; k < 5; k++) P.dot(hx0 - 6 - k, hy0 - 2 + k * 2, o.head, 2, 1);
  }
  if (S.horns) {
    P.shade(new Mask().path([[hx0, hy0 - 3], [hx0 - 6, hy0 - 9], [hx0 - 11, hy0 - 9]], 2, 0.8), ramp(o.horn));
    P.shade(new Mask().path([[hx0 + 3, hy0 - 4], [hx0 - 1, hy0 - 12], [hx0 - 5, hy0 - 14]], 1.8, 0.6), ramp(o.horn));
    if (o.fire && Math.floor(phi * NF) % 2) {
      P.dot(hx1 + 5, hy1, o.fire, 3, 2);
      P.dot(hx1 + 8, hy1 - 1, o.fire2 ?? '#ffe880', 2, 2);
    }
  }
  if (sp === 'raptor' && o.crest) for (let k = 0; k < 5; k++) P.dot(hx0 - 2 - k * 2, hy0 - 6 + k, o.crest, 2, 2);
  if (sp === 'raptor') P.line(hx0 + 4, hy1 + 2, hx1 + 3, hy1 + 2, R[0]);
}

function antlers(P, x, y, c) {
  const tines = [
    [[x, y], [x - 4, y - 8], [x - 10, y - 14], [x - 16, y - 16]],
    [[x - 4, y - 8], [x - 2, y - 16]],
    [[x - 8, y - 12], [x - 8, y - 20]],
    [[x + 2, y], [x + 4, y - 9], [x + 2, y - 18]],
    [[x + 4, y - 9], [x + 9, y - 13]],
  ];
  const m = new Mask();
  for (const t of tines) m.path(t, 1.4, 0.8);
  P.shade(m, ramp(c), { light: 0.5 });
}

function barding(P, o, x0, x1, y, S, body) {
  const m = new Mask().capsule(x0 + 2, y - 2, x1 - 2, y - 2, S.bodyR * 0.85);
  m.ellipse(x1 + 2, y, S.chest * 0.85, S.chest * 0.8);
  for (let i = 0; i < m.m.length; i++) m.m[i] &= body.m[i];
  P.shade(m, ramp(o.barding), { light: 1.3 });
  const c = new Mask().capsule(x0 + 2, y + S.bodyR * 0.55, x1 - 2, y + S.bodyR * 0.55, 2.4);
  P.shade(c, ramp(o.cloth));
  // placas: juntas e rebites
  const dk = ramp(o.barding)[1];
  for (let x = x0 + 4; x < x1 + 2; x += 7)
    for (let yy = y - S.bodyR * 0.75; yy < y + S.bodyR * 0.45; yy++) if (m.has(x + TX, Math.round(yy))) P.dot(x, yy, dk);
  for (let x = x0 + 2; x < x1; x += 4) P.dot(x, y - S.bodyR * 0.2, o.trim);
}

function saddleSide(P, x, y, o) {
  const m = new Mask().poly([
    [x - 9, y + 1],
    [x - 7, y - 3],
    [x + 4, y - 2],
    [x + 8, y - 5],
    [x + 9, y + 1],
  ]);
  const blanket = new Mask().poly([
    [x - 11, y],
    [x + 10, y],
    [x + 9, y + 9],
    [x - 10, y + 9],
  ]);
  P.shade(blanket, ramp(o.cloth ?? '#8a2a1e'), { flat: 0.4 });
  for (let k = -10; k <= 9; k += 2) P.dot(x + k, y + 8, o.trim ?? '#e8c04a');
  P.shade(m, ramp('#6a3a1e'));
  P.dot(x - 1, y + 1, '#c8a050', 2, 6);
}

/** Asa: `side` −1 a de lá, +1 a de cá. Membrana de morcego ou penas. */
function drawWing(P, S, o, phi, side, bob) {
  const flap = Math.sin(phi * Math.PI * 2);
  const sx = (S.body[0] + S.body[2]) / 2 + 6 + (side < 0 ? 4 : 0);
  const sy = S.body[1] - S.bodyR + 4 + bob;
  const up = -10 - flap * 9;
  const tips = [
    [sx + 8, sy + up - 6],
    [sx - 6, sy + up - 12],
    [sx - 20, sy + up - 4],
    [sx - 28, sy + up * 0.3 + 6],
  ];
  const back = side < 0 ? 0.75 : 1;
  if (S.wings === 'bat') {
    const mem = new Mask();
    let prev = [sx, sy];
    for (const t of tips) {
      mem.poly([[sx, sy], prev, t]);
      prev = t;
    }
    mem.poly([[sx, sy], prev, [sx - 18, sy + 6]]);
    // recorte em arco entre os dedos
    P.shade(mem, ramp(side < 0 ? shade(o.membrane, -0.15) : o.membrane), { flat: 0.3 });
    for (const t of tips) P.line(sx, sy, t[0], t[1], side < 0 ? shade(o.wing, -0.1) : o.wing);
    const arm = new Mask().path([[sx, sy], [sx + 4, sy + up * 0.6], tips[0]], 2.4 * back, 1.2);
    P.shade(arm, ramp(o.wing));
  } else featherWing(P, sx, sy, up, -1, side < 0 ? shade(o.wing, -0.15) : o.wing);
}

/** Asa de penas: silhueta, penas grandes em escama na borda e coberteiras perto do braço. `dir` −1 abre para trás (lado), ±1 para os lados (frente). */
function featherWing(P, sx, sy, up, dir, col) {
  const k = dir;
  const lead = [
    [sx, sy],
    [sx - k * 6, sy + up - 4],
    [sx + k * 8, sy + up - 10],
    [sx + k * 24, sy + up * 0.6 - 6],
    [sx + k * 34, sy + up * 0.2 + 2],
  ];
  const root = [sx + k * 12, sy + 6];
  const m = new Mask().poly([...lead, [sx + k * 30, sy + up * 0.1 + 8], root]);
  const R = ramp(col);
  P.shade(m, R, { light: 0.7 });
  // penas grandes: escamas ao longo da borda de trás, da ponta à raiz
  const tip = lead[lead.length - 1];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    const x = tip[0] + (root[0] - tip[0]) * t;
    const y = tip[1] + (root[1] - tip[1]) * t + 2;
    const f = new Mask().ellipse(x, y, 3.2, 4.2, k * 0.4);
    P.shade(f, i % 2 ? R : ramp(shade(col, 0.06)), { light: 0.8 });
  }
  // coberteiras: fileira clara perto do braço
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = lead[1][0] + (lead[3][0] - lead[1][0]) * t;
    const y = lead[1][1] + (lead[3][1] - lead[1][1]) * t + 5;
    P.shade(new Mask().ellipse(x, y, 3, 2.4), ramp(shade(col, 0.12)), { light: 0.6 });
  }
}

// ------------------------------------------------------------------ frente e costas
/**
 * De frente (vindo para baixo) e de costas: peito/garupa como volume, as
 * pernas de cá alternando, a cabeça de frente por cima do peito (ou as
 * orelhas/chifres por trás), cauda nas costas e asas abertas para os lados.
 */
/**
 * De frente (back=false) e de costas (back=true), em perspectiva de cima a 3/4:
 * o corpo se estende "para dentro" da tela — a ponta de lá fica mais alta,
 * as pernas de lá aparecem entre as de cá com os pés mais altos, e a cabeça
 * (de frente) fica diante do peito, abaixo do cavaleiro.
 */
function drawFront(P, sp, base, o, f, back) {
  const S = SPECIES[sp];
  const R = ramp(base);
  const Rd = ramp(shade(base, -0.2));
  const phi = f / NF;
  const cx = W / 2;
  const bob = Math.round(Math.sin(phi * Math.PI * 4) * (S.bob / 2));
  const sy = S.body[1] - S.bodyR + 2 + bob; // topo da sela (mesma altura da vista de lado)
  const bw = Math.max(S.bodyR * 1.22, (back ? S.rump : S.chest) * 1.08);
  const far = sy + 2;
  const near = sy + S.bodyR * (S.splay ? 0.8 : 1.4);
  const nearR = (back ? S.rump : S.chest) * 1.0;
  const farR = (back ? S.chest : S.rump) * 0.8;
  const longNeck = S.neck.length >= 3;
  const HR = sp === 'griffin' ? ramp(o.head) : R;
  const gait = (ph) => Math.max(0, Math.sin((phi + ph) * Math.PI * 2));
  const leg = (x, top, footY, ph, Rm, haunch = 1) => {
    const l = gait(ph);
    const side = Math.sign(x - cx) || 1;
    const fx = x + (S.splay ? side * 7 : side * 0.5);
    const fy = footY - l * S.lift * 0.7;
    const kx = (x + fx) / 2 + side * (l * 1.5 + (S.splay ? 3 : 0));
    const ky = top + (fy - top) * (S.splay ? 0.3 : 0.5);
    const m = new Mask();
    m.capsule(x, top, kx, ky, S.legTop * haunch, S.legLow + 1);
    m.capsule(kx, ky, fx, fy, S.legLow + 0.6, S.legLow);
    P.shade(m, Rm);
    if (S.hoof) {
      P.dot(fx - 2, fy - 2, o.hoofFire ? (f % 2 ? o.fire2 : o.fire) : Rm === Rd ? '#1a140e' : '#2a2018', 5, 3);
      if (o.socks && Rm === R) P.dot(fx - 2, fy - 5, o.socks, 5, 2);
    } else {
      P.dot(fx - 3, fy - 1, Rm[1], 7, 2);
      P.dot(fx - 2, fy - 1, Rm[0]);
      P.dot(fx + 1, fy - 1, Rm[0]);
    }
  };
  // asas abertas (atrás de tudo)
  if (S.wings)
    for (const s of [-1, 1]) {
      const flap = Math.sin(phi * Math.PI * 2);
      const wx = cx + s * (bw - 4);
      const wy = sy + 4;
      const up = -6 - flap * 8;
      const tips = [
        [wx + s * 6, wy + up - 12],
        [wx + s * 18, wy + up - 10],
        [wx + s * 30, wy + up],
        [wx + s * 35, wy + up * 0.2 + 13],
      ];
      if (S.wings === 'bat') {
        const mem = new Mask();
        let prev = [wx, wy];
        for (const t of tips) {
          mem.poly([[wx, wy], prev, t]);
          prev = t;
        }
        mem.poly([[wx, wy], prev, [wx + s * 16, wy + 12]]);
        P.shade(mem, ramp(o.membrane), { flat: 0.3 });
        for (const t of tips) P.line(wx, wy, t[0], t[1], o.wing);
      } else featherWing(P, wx, wy, up, s, o.wing);
    }
  // de costas: cabeça e pescoço lá na frente (mais alto), atrás do corpo
  if (back) {
    const hy = longNeck ? sy - 12 : far - farR * 0.6;
    if (longNeck) P.shade(new Mask().capsule(cx, far, cx, hy + 3, S.neckR[0] * 0.75, S.neckR[1]), sp === 'griffin' ? HR : R);
    P.shade(new Mask().ellipse(cx, hy, S.headR[0] * 0.95, S.headR[0] * 0.85), HR);
    if (S.mane && !o.fire) P.shade(new Mask().capsule(cx, hy - 1, cx, far + 2, 2.6, 2.2), ramp(o.mane ?? R[1]));
    if (o.fire && sp === 'horse') for (let k = 0; k < 7; k++) P.dot(cx - 1, hy + k * 2 - (f % 2), k % 2 ? o.fire : o.fire2, 2, 2);
    headTop(P, sp, S, o, HR, cx, hy);
  }
  // pernas de lá: entre as de cá, com os pés mais altos (mais longe)
  if (!S.biped) {
    const fx = bw * (S.splay ? 0.5 : 0.3);
    leg(cx - fx, far + 3, GROUND - 6, back ? 0.65 : 0.15, Rd);
    leg(cx + fx, far + 3, GROUND - 6, back ? 0.15 : 0.65, Rd);
  }
  // corpo: da ponta de lá (em cima) à de cá (embaixo)
  const body = new Mask();
  body.ellipse(cx, far, bw * 0.9, farR);
  body.capsule(cx, far, cx, near, bw * 0.95, bw);
  body.ellipse(cx, near, bw, nearR);
  P.shade(body, R);
  if (o.belly && !back && sp !== 'lizard') {
    const b = new Mask().ellipse(cx, near + nearR * 0.35, bw * 0.55, nearR * 0.6);
    for (let i = 0; i < b.m.length; i++) b.m[i] &= body.m[i];
    P.shade(b, ramp(o.belly), { light: 0.6 });
  }
  if (o.stripes)
    for (let y = far - 2; y < near + nearR - 2; y += 4)
      for (const s of [-1, 1]) P.line(cx + s * (bw - 1), y, cx + s * (bw - 5), y + 2, o.stripes);
  if (o.spots)
    for (const [dx, dy, r] of [[-5, 2, 4], [4, 9, 3.5], [-3, 14, 3]]) {
      const m = new Mask().ellipse(cx + dx, sy + dy, r, r * 0.8);
      for (let i = 0; i < m.m.length; i++) m.m[i] &= body.m[i];
      P.shade(m, ramp(o.spots), { light: 0.5 });
    }
  if (o.runes)
    for (const s of [-1, 1]) {
      P.dot(cx + s * (bw - 4) - 1, near - 3, o.runes, 2, 5);
      P.dot(cx + s * (bw - 4) - (s > 0 ? 2 : 0), near - 1, o.runes, 3, 1);
    }
  if (o.barding) {
    const m = new Mask().ellipse(cx, (far + near) / 2 + 1, bw * 1.02, (near - far) / 2 + nearR * 0.7);
    for (let i = 0; i < m.m.length; i++) m.m[i] &= body.m[i];
    P.shade(m, ramp(o.barding), { light: 1.3 });
    for (let y = far + 4; y < near + nearR - 2; y += 5) P.line(cx - bw + 2, y, cx + bw - 2, y, ramp(o.barding)[1]);
    P.shade(new Mask().capsule(cx - bw + 1, near + nearR * 0.5, cx + bw - 1, near + nearR * 0.5, 2.2), ramp(o.cloth));
    if (o.trim) P.line(cx - bw + 2, near + nearR * 0.5 + 2, cx + bw - 2, near + nearR * 0.5 + 2, o.trim);
  }
  if (o.fire && sp === 'lizard')
    for (let y = far - 2, k = 0; y < near + 4; y += 4, k++) {
      const h = 2 + ((k + f) % 3);
      for (const s of [-1, 1]) P.dot(cx + s * 4 - 1, y - h, (k + f) % 2 ? o.fire : o.fire2, 2, h);
    }
  if (sp === 'dragon' && back) for (let y = near + nearR - 4; y > sy + 8; y -= 4) P.shade(new Mask().poly([[cx - 2, y + 2], [cx, y - 3], [cx + 2, y + 2]]), ramp(o.horn));
  // sela: manta pelos flancos, assento e estribos
  const cloth = ramp(o.cloth ?? '#8a2a1e');
  P.shade(new Mask().capsule(cx - bw + 1, sy + 4, cx + bw - 1, sy + 4, 4), cloth, { flat: 0.3 });
  if (o.trim) P.line(cx - bw + 2, sy + 7, cx + bw - 2, sy + 7, o.trim);
  P.shade(new Mask().ellipse(cx, sy + 2, 6.5, 3.5), ramp('#6a3a1e'));
  for (const s of [-1, 1]) {
    P.line(cx + s * (bw - 1), sy + 6, cx + s * (bw + 1), sy + 12, '#3a2414');
    P.dot(cx + s * (bw + 1) - 1, sy + 12, '#c0c0c8', 3, 2);
  }
  // pernas de cá
  if (S.biped) {
    leg(cx - bw * 0.45, near, GROUND - 1, 0, R, 1.2);
    leg(cx + bw * 0.45, near, GROUND - 1, 0.5, R, 1.2);
  } else {
    const lx = bw * (S.splay ? 0.8 : 0.62);
    leg(cx - lx, near + (back ? -1 : 1), GROUND - 1, back ? 0.5 : 0, R, back ? 1.35 : 1);
    leg(cx + lx, near + (back ? -1 : 1), GROUND - 1, back ? 0 : 0.5, R, back ? 1.35 : 1);
  }
  if (back) {
    // cauda caindo sobre a garupa, entre as pernas
    const sway = Math.sin(phi * Math.PI * 2) * 3;
    const ty = near + nearR * 0.3;
    const t = new Mask();
    if (S.tail === 'hair') for (let k = -1; k <= 1; k++) t.path([[cx + k, ty - 4], [cx + k * 2 + sway, ty + 8], [cx + k * 3 + sway * 1.5, ty + 18]], 2.4, 1);
    else if (S.tail === 'lizard') t.path([[cx, ty - 4], [cx + sway, ty + 8], [cx + sway * 2, GROUND - 2]], S.bodyR * 0.55, 1.5);
    else if (S.tail === 'brush') t.path([[cx, ty - 4], [cx + sway, ty + 6], [cx + sway * 1.5, ty + 14]], 3.5, 2.5);
    else if (S.tail === 'long') t.path([[cx, ty - 4], [cx + sway, ty + 8], [cx + sway * 2.5, ty + 16], [cx + sway * 3, ty + 12]], 2.6, 2);
    else if (S.tail === 'thin') t.path([[cx, ty - 4], [cx + sway * 0.5, ty + 6]], 1.4, 1);
    else t.ellipse(cx, ty - 2, 3, 3);
    P.shade(t, S.tail === 'hair' ? ramp(o.mane ?? R[1]) : R);
    if (S.tail === 'brush' && o.belly) P.dot(cx + sway * 1.5 - 1, ty + 13, o.belly, 3, 2);
  } else {
    // pescoço e cabeça diante do peito, olhando para quem joga
    const hy = near - (S.splay ? 2 : 3);
    if (longNeck) P.shade(new Mask().capsule(cx, sy + 2, cx, hy, S.neckR[0] * 0.8, S.neckR[1] + 0.5), sp === 'griffin' ? HR : R);
    if (S.mane && !o.fire) P.shade(new Mask().capsule(cx, sy, cx, hy - S.headR[0] + 1, 2.4, 2), ramp(o.mane));
    const head = new Mask().ellipse(cx, hy, S.headR[0], S.headR[0] * 1.0);
    if (sp === 'horse' || sp === 'stag') head.capsule(cx, hy, cx, hy + 10, S.headR[0] * 0.8, S.headR[1]);
    else head.ellipse(cx, hy + S.headR[0] * 0.5, S.headR[0] * 0.72, S.headR[1] + 0.5);
    P.shade(head, HR);
    // focinho mais claro
    if (sp !== 'griffin' && sp !== 'dragon' && sp !== 'raptor' && sp !== 'lizard') {
      const sn = new Mask().ellipse(cx, sp === 'horse' || sp === 'stag' ? hy + 8 : hy + S.headR[0] * 0.6, S.headR[1] + 0.5, S.headR[1] * 0.8);
      for (let i = 0; i < sn.m.length; i++) sn.m[i] &= head.m[i];
      P.shade(sn, ramp(shade(R[3], 0.06)), { light: 0.7 });
    }
    const ey = hy - 1;
    for (const s of [-1, 1]) {
      const ex = cx + s * S.headR[0] * 0.5 - (s > 0 ? 1 : 0);
      P.dot(ex, ey, o.eyes ?? '#120e18', 2, 2);
      if (!o.eyes) P.dot(ex + (s < 0 ? 0 : 1), ey, '#f0f0f0');
    }
    if (sp === 'horse' || sp === 'stag') {
      P.dot(cx - 2, hy + 9, R[0]);
      P.dot(cx + 1, hy + 9, R[0]);
      if (o.blaze) P.dot(cx - 1, hy - 3, o.blaze, 2, 9);
      if (o.fire) for (let k = 0; k < 4; k++) P.dot(cx - 1, hy - S.headR[0] - k * 2 + (f % 2), k % 2 ? o.fire : o.fire2, 2, 2);
    } else if (!S.beak) P.dot(cx - 1, hy + S.headR[0] * 0.5, '#120e18', 2, 2);
    if (o.fangs) {
      P.dot(cx - 3, hy + S.headR[0] * 0.9, o.fangs, 1, 3);
      P.dot(cx + 2, hy + S.headR[0] * 0.9, o.fangs, 1, 3);
    }
    if (o.tusk) {
      P.line(cx - 4, hy + 3, cx - 6, hy - 1, o.tusk);
      P.line(cx + 4, hy + 3, cx + 6, hy - 1, o.tusk);
    }
    if (S.beak) P.shade(new Mask().poly([[cx - 3, hy + 1], [cx + 3, hy + 1], [cx, hy + 8]]), ramp(o.beak));
    if (sp === 'rhino') {
      P.shade(new Mask().poly([[cx - 2, hy + 4], [cx, hy - 8], [cx + 2, hy + 4]]), ramp('#ece2c8'));
    }
    if (S.horns && o.fire && f % 2) P.dot(cx - 1, hy + 7, o.fire, 3, 2);
    headTop(P, sp, S, o, HR, cx, hy);
  }
  P.outline('#120e18');
}

/** Orelhas, chifres, galhada e crista (vale para frente e costas). */
function headTop(P, sp, S, o, HR, cx, hy) {
  const r = S.headR[0];
  if (S.ears === true || S.ears === 'point') for (const s of [-1, 1]) P.shade(new Mask().poly([[cx + s * 2, hy - r + 2], [cx + s * 5, hy - r - 6], [cx + s * 6, hy - r + 2]]), HR);
  if (S.ears === 'round') for (const s of [-1, 1]) P.shade(new Mask().ellipse(cx + s * (r - 1), hy - r + 1, 2.6, 2.6), HR);
  if (o.horn) P.shade(new Mask().poly([[cx - 2, hy - r + 1], [cx, hy - r - 13], [cx + 2, hy - r + 1]]), ramp(o.horn));
  if (S.horns) for (const s of [-1, 1]) P.shade(new Mask().path([[cx + s * 3, hy - 4], [cx + s * 8, hy - 10], [cx + s * 10, hy - 15]], 1.8, 0.6), ramp(o.horn));
  if (sp === 'stag')
    for (const s of [-1, 1]) {
      const m = new Mask();
      m.path([[cx + s * 3, hy - 4], [cx + s * 9, hy - 12], [cx + s * 14, hy - 20]], 1.4, 0.8);
      m.path([[cx + s * 9, hy - 12], [cx + s * 6, hy - 20]], 1.2, 0.7);
      m.path([[cx + s * 12, hy - 17], [cx + s * 18, hy - 19]], 1.2, 0.7);
      P.shade(m, ramp(o.antler), { light: 0.5 });
    }
  if (sp === 'raptor' && o.crest) for (let k = 0; k < 4; k++) P.dot(cx - 1, hy - r - k * 2, o.crest, 2, 2);
  if (sp === 'boar') for (let k = -2; k <= 2; k++) P.dot(cx + k * 2, hy - r - 1 - (k % 2 ? 1 : 0), o.mane, 1, 3);
}

// ------------------------------------------------------------------ folha
const SEAT = Object.fromEntries(Object.entries(SPECIES).map(([k, v]) => [k, v.seat]));

export function drawMounts({ Img, save }) {
  const N = MOUNT_DEFS.length;
  const sheet = new Img(FW * NF * 4, FH * N);
  const blit = (P, ox, oy, mirror = false) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + (mirror ? W - 1 - x : x)) * 4;
        if (P.c[i + 3]) sheet.put(ox + x, oy + y, P.c[i], P.c[i + 1], P.c[i + 2], P.c[i + 3]);
      }
  };
  MOUNT_DEFS.forEach(([, , sp, col, o], m) => {
    for (let f = 0; f < NF; f++) {
      // ordem das direções igual à do herói: baixo, esquerda, direita, cima
      TX = 0;
      const front = new Painter();
      drawFront(front, sp, col, o, f, false);
      blit(front, (0 * NF + f) * FW, m * FH);
      TX = 8;
      const side = new Painter(8);
      drawSide(side, sp, col, o, f);
      TX = 0;
      blit(side, (2 * NF + f) * FW, m * FH);
      blit(side, (1 * NF + f) * FW, m * FH, true);
      TX = 0;
      const back = new Painter();
      drawFront(back, sp, col, o, f, true);
      blit(back, (3 * NF + f) * FW, m * FH);
    }
  });
  save('assets/sprites/mounts.png', sheet);
  // altura da sela em px do mundo (a arte é exibida a 0,5)
  return MOUNT_DEFS.map(([id, name, sp, , o]) => ({ id, name, kind: sp, seat: Math.round((GROUND - (SPECIES[sp].body[1] - SPECIES[sp].bodyR + 2)) / 2), glow: o.glow ?? 0, ghost: !!o.ghost }));
}

export const MOUNT_FRAME = { w: FW, h: FH, ground: GROUND, frames: NF, scale: 0.5 };
void SEAT;
