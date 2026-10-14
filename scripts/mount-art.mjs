// Montarias em pixel art, desenhadas por parâmetros: corpo, pernas animadas,
// pescoço, cabeça (cavalo, urso, lobo, rinoceronte, javali, cervo, felino,
// lagarto, águia, dragão), cauda, crina, chifres, asas, armadura e sela.
// Folha: 21 montarias × (4 direções × 4 quadros), 48×40 cada, na escala do mundo.
// Também gera src/data/mountsGen.ts (ids, nomes e altura da sela).

const FW = 48;
const FH = 40;
const GROUND = 38;
const OUT = '#141018';

// [base, sombra, luz]
const C = {
  bay: ['#8a5a32', '#6a4224', '#a8743f'],
  black: ['#2c2830', '#1a181e', '#463f4c'],
  white: ['#e8e4dc', '#c4beb4', '#ffffff'],
  pinto: ['#e8e0d0', '#b8ac98', '#ffffff'],
  steel: ['#8a94a4', '#5a6474', '#b8c4d4'],
  brownBear: ['#6e4a2e', '#52361e', '#8a6040'],
  polar: ['#eef2f6', '#c8d0dc', '#ffffff'],
  gray: ['#7a7a82', '#5a5a62', '#9a9aa2'],
  frost: ['#b8d8ec', '#88aecc', '#e0f2ff'],
  rhino: ['#8a8478', '#6a6458', '#a8a294'],
  boar: ['#5e4434', '#463024', '#7a5a46'],
  stag: ['#9ae8ff', '#5ab8e0', '#e0fbff'],
  tiger: ['#e08a2a', '#b86a1a', '#f8b060'],
  panther: ['#2a2234', '#1a1424', '#463a58'],
  sand: ['#d8b070', '#b08a50', '#ecd09a'],
  lava: ['#c83a1a', '#8a2210', '#ff7a3a'],
  griffin: ['#c8a050', '#a07a30', '#e8c878'],
  emerald: ['#3e9a5a', '#2a6a3e', '#6ad08a'],
  ruby: ['#b8302a', '#82201c', '#e8584a'],
};

/** id, nome, tipo, cor, opções. */
export const MOUNT_DEFS = [
  ['bay', 'Cavalo Baio', 'horse', C.bay, { mane: '#3a2414' }],
  ['black', 'Corcel Negro', 'horse', C.black, { mane: '#0e0c10' }],
  ['white', 'Égua Branca do Vale', 'horse', C.white, { mane: '#d8d0c4' }],
  ['pinto', 'Cavalo Malhado', 'horse', C.pinto, { mane: '#3a2414', spots: '#6a4224' }],
  ['war', 'Corcel de Guerra', 'horse', C.bay, { mane: '#2a1a0e', armor: C.steel, cloth: '#3d5aa8' }],
  ['unicorn', 'Unicórnio Lunar', 'horse', C.white, { mane: '#bfa8ff', horn: '#ffe08a', glow: 0xbfa8ff }],
  ['nightmare', 'Pesadelo Flamejante', 'horse', C.black, { mane: '#ff7a1a', fire: true, eyes: '#ff3a1a', glow: 0xff6a1a }],
  ['bear', 'Urso Pardo de Batalha', 'bear', C.brownBear, { armor: C.steel, cloth: '#a83a2a' }],
  ['polar', 'Urso Polar Rúnico', 'bear', C.polar, { runes: '#5ab8ff', glow: 0x7ac8ff }],
  ['wolf', 'Lobo Gigante', 'wolf', C.gray, {}],
  ['frostwolf', 'Lobo da Geada', 'wolf', C.frost, { runes: '#ffffff', glow: 0x9fe8ff }],
  ['rhino', 'Rinoceronte Couraçado', 'rhino', C.rhino, { armor: C.steel, cloth: '#6a4a2a' }],
  ['boar', 'Javali de Presas', 'boar', C.boar, { mane: '#2a1a12' }],
  ['stag', 'Cervo Espiritual', 'stag', C.stag, { glow: 0x7ae8ff, ghost: true }],
  ['sabre', 'Tigre-Dente-de-Sabre', 'cat', C.tiger, { stripes: '#2a1a0e' }],
  ['panther', 'Pantera das Sombras', 'cat', C.panther, { eyes: '#c070ff', glow: 0x9a4aff }],
  ['raptor', 'Raptor do Deserto', 'raptor', C.sand, { stripes: '#8a5a2a' }],
  ['salamander', 'Salamandra de Lava', 'lizard', C.lava, { fire: true, glow: 0xff5a1a }],
  ['griffin', 'Grifo Real', 'griffin', C.griffin, { wings: '#f0e0b0', head: '#f8f4ec' }],
  ['emerald', 'Dragão Esmeralda', 'dragon', C.emerald, { wings: '#2a6a3e', horn: '#e8e0c8' }],
  ['ruby', 'Dragão Rubro', 'dragon', C.ruby, { wings: '#6a1a18', horn: '#ffe08a', fire: true, glow: 0xff4a2a }],
];

/** Altura da sela (px do mundo acima do chão) por tipo. */
const SEAT = { horse: 15, bear: 12, wolf: 11, rhino: 13, boar: 10, stag: 15, cat: 11, raptor: 15, lizard: 8, griffin: 14, dragon: 16 };
/** Medidas por tipo: comprimento e altura do corpo, perna. */
const SHAPE = {
  horse: { L: 24, H: 11, leg: 13 },
  bear: { L: 24, H: 14, leg: 9 },
  wolf: { L: 22, H: 10, leg: 10 },
  rhino: { L: 26, H: 14, leg: 9 },
  boar: { L: 20, H: 11, leg: 7 },
  stag: { L: 22, H: 10, leg: 14 },
  cat: { L: 24, H: 9, leg: 10 },
  raptor: { L: 18, H: 10, leg: 13 },
  lizard: { L: 26, H: 7, leg: 5 },
  griffin: { L: 22, H: 11, leg: 10 },
  dragon: { L: 26, H: 12, leg: 9 },
};

/** Triângulo cheio (asas). */
function tri(t, a, b, c, col) {
  const ys = [a[1], b[1], c[1]];
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) xs.push(p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
    }
    if (xs.length < 2) continue;
    const [l, r] = [Math.min(...xs), Math.max(...xs)];
    t.rect(Math.round(l), y, Math.max(1, Math.round(r - l)), 1, col);
  }
}

/** Asa (membrana com ossos) a partir do ombro; `dir` = 1 abre para a direita, −1 para a esquerda. */
function wing(t, sx, sy, up, dir, col, bone, feather) {
  const tips = [
    [sx + dir * 2, sy - 12 + up],
    [sx - dir * 6, sy - 13 + up],
    [sx - dir * 13, sy - 8 + up * 0.7],
    [sx - dir * 15, sy - 1 + up * 0.3],
  ];
  const root = [sx - dir * 9, sy + 2];
  for (let k = 0; k < tips.length - 1; k++) tri(t, [sx, sy], tips[k], tips[k + 1], col);
  tri(t, [sx, sy], tips[tips.length - 1], root, col);
  for (const tp of tips) t.line(sx, sy, tp[0], tp[1], bone);
  if (feather) for (const tp of tips) t.rect(Math.round(tp[0]) - 1, Math.round(tp[1]), 2, 2, feather);
}

/** Lado (virado para a direita), quadro f (0–3). */
function drawSide(t, kind, col, o, f) {
  const S = SHAPE[kind];
  const sw = [0, 2, 0, -2][f];
  const bob = f % 2 ? -1 : 0;
  const cx = 22;
  const top = GROUND - S.leg - S.H + bob;
  const cy = top + S.H / 2;
  const rx = S.L / 2;
  const [base, dark, light] = col;
  const legW = kind === 'bear' || kind === 'rhino' ? 4 : 3;
  // asas de trás (grifo e dragão)
  const wingUp = [0, -3, -5, -3][f];
  if (o.wings) wing(t, cx + 3, top + 2, wingUp - 2, 1, dark, OUT, kind === 'griffin' ? o.wings : null);
  // cauda
  const tail = (x0, y0) => {
    if (kind === 'horse' || kind === 'stag') {
      const mc = o.fire ? o.mane : o.mane ?? dark;
      for (let k = 0; k < 9; k++) t.rect(x0 - 2 - (k >> 2), y0 + k, 3, 1, mc);
    } else if (kind === 'dragon' || kind === 'lizard' || kind === 'raptor') {
      for (let k = 0; k < 12; k++) t.rect(x0 - k, Math.round(y0 + k * 0.4 + Math.sin((k + f * 2) * 0.6)), 3 - Math.floor(k / 5), 2, k % 3 ? base : dark);
    } else if (kind === 'cat' || kind === 'wolf' || kind === 'griffin') {
      for (let k = 0; k < 8; k++) t.rect(x0 - k, y0 - (k >> 1) + (kind === 'wolf' ? k >> 1 : 0), 2, 2, kind === 'wolf' ? light : base);
      if (kind === 'griffin') t.rect(x0 - 9, y0 - 5, 3, 3, dark);
    } else if (kind === 'boar') t.rect(x0 - 2, y0, 2, 3, dark);
  };
  tail(cx - rx + 1, cy - 3);
  // pernas de trás (lado de lá, mais escuras)
  const leg = (x, phase, near) => {
    const s = phase * sw;
    const lift = s > 0 ? 1 : 0;
    const c = near ? base : dark;
    t.rect(x + s, cy + 1, legW, S.leg + S.H / 2 - 1 - lift - bob, c);
    t.rect(x + s, GROUND - 2 - lift, legW + (kind === 'horse' || kind === 'stag' ? 0 : 1), 2, near ? dark : OUT);
  };
  if (kind === 'raptor') {
    leg(cx - 1, -1, false);
    leg(cx + 2, 1, true);
  } else {
    leg(cx - rx + 4, 1, false);
    leg(cx + rx - 6, -1, false);
  }
  // corpo
  t.ellipse(cx, cy, rx, S.H / 2, base);
  t.ellipse(cx, cy + 2, rx - 1, S.H / 2 - 2, dark, 0.35);
  t.ellipse(cx, cy - S.H / 4, rx - 3, 2, light, 0.6);
  if (o.spots) for (const [x, y] of [[-6, -1], [2, 1], [7, -2], [-2, 2]]) t.ellipse(cx + x, cy + y, 2.5, 1.8, o.spots);
  if (o.stripes) for (let x = -rx + 4; x < rx - 2; x += 4) t.rect(cx + x, cy - S.H / 2 + 1, 1, S.H - 3, o.stripes);
  if (o.runes) for (const [x, y] of [[-5, 0], [0, -2], [5, 1]]) t.rect(cx + x, cy + y, 2, 2, o.runes);
  if (kind === 'dragon') for (let x = -rx + 3; x < rx - 2; x += 3) t.rect(cx + x, cy - S.H / 2 - 1, 2, 2, o.horn ?? light);
  if (kind === 'lizard' && o.fire) for (let x = -rx + 3; x < rx - 2; x += 4) t.rect(cx + x, cy - S.H / 2 - (f % 2), 2, 2, '#ffb030');
  // armadura (barda) e pano
  if (o.armor) {
    t.rect(cx - rx + 3, cy - S.H / 2 + 1, S.L - 6, S.H - 4, o.armor[0]);
    t.rect(cx - rx + 3, cy - S.H / 2 + 1, S.L - 6, 1, o.armor[2]);
    t.rect(cx - rx + 3, cy + S.H / 2 - 4, S.L - 6, 2, o.cloth);
    for (let x = cx - rx + 5; x < cx + rx - 4; x += 4) t.set(x, cy - 1, o.armor[2]);
  }
  // pernas da frente (lado de cá)
  if (kind !== 'raptor') {
    leg(cx - rx + 6, -1, true);
    leg(cx + rx - 4, 1, true);
  }
  // pescoço e cabeça
  const fx = cx + rx;
  const mane = o.mane ?? dark;
  if (kind === 'horse' || kind === 'stag') {
    for (let k = 0; k < 9; k++) t.rect(fx - 4 + Math.floor(k * 0.6), cy - 2 - k, 5, 2, base);
    if (kind === 'horse') for (let k = 0; k < 9; k++) t.rect(fx - 5 + Math.floor(k * 0.6), cy - 3 - k, 2, 2, o.fire && (k + f) % 2 ? '#ffd34a' : mane);
    const hx = fx + 2;
    const hy = cy - 11;
    t.rect(hx, hy, 6, 4, base);
    t.rect(hx + 5, hy + 1, 3, 3, base);
    t.rect(hx + 7, hy + 2, 1, 1, OUT);
    t.rect(hx + 1, hy - 2, 2, 2, base);
    t.set(hx + 4, hy + 1, o.eyes ?? OUT);
    if (o.horn) for (let k = 0; k < 6; k++) t.set(hx + 5 + Math.floor(k * 0.6), hy - 1 - k, o.horn);
    if (kind === 'stag') {
      const a = o.glow ? '#e0fbff' : '#c8b088';
      t.line(hx + 2, hy - 1, hx - 1, hy - 7, a);
      t.line(hx + 1, hy - 4, hx - 3, hy - 5, a);
      t.line(hx + 3, hy - 1, hx + 5, hy - 7, a);
      t.line(hx + 4, hy - 4, hx + 7, hy - 6, a);
    }
    if (o.armor) t.rect(hx, hy, 4, 2, o.armor[0]);
  } else if (kind === 'raptor') {
    for (let k = 0; k < 6; k++) t.rect(fx - 3 + (k >> 1), cy - 2 - k, 4, 2, base);
    t.rect(fx - 1, cy - 11, 8, 4, base);
    t.rect(fx + 3, cy - 8, 4, 1, light);
    t.set(fx + 2, cy - 10, OUT);
    t.rect(fx - 2, cy + 1, 2, 3, dark);
  } else if (kind === 'griffin' || kind === 'dragon') {
    const long = kind === 'dragon';
    for (let k = 0; k < (long ? 8 : 4); k++) t.rect(fx - 3 + Math.floor(k * 0.7), cy - 2 - k, 4, 2, kind === 'griffin' ? o.head : base);
    const hx = fx + (long ? 3 : 0);
    const hy = cy - (long ? 12 : 8);
    t.rect(hx, hy, 6, 4, kind === 'griffin' ? o.head : base);
    if (kind === 'griffin') {
      t.rect(hx + 6, hy + 1, 2, 2, '#e8a030');
      t.set(hx + 7, hy + 3, '#e8a030');
    } else {
      t.rect(hx + 5, hy + 1, 3, 2, base);
      t.rect(hx + 1, hy - 2, 1, 2, o.horn);
      t.rect(hx + 3, hy - 3, 1, 3, o.horn);
      if (o.fire && f % 2) t.rect(hx + 8, hy + 2, 2, 1, '#ffb030');
    }
    t.set(hx + 3, hy + 1, OUT);
  } else {
    // cabeça baixa à frente do corpo
    const hx = fx - 2;
    const hy = cy - S.H / 2 + (kind === 'boar' || kind === 'rhino' ? 2 : 0);
    const hw = kind === 'bear' ? 7 : kind === 'rhino' ? 8 : 6;
    t.rect(hx, hy, hw, 6, base);
    t.rect(hx + hw - 1, hy + 2, kind === 'wolf' || kind === 'cat' ? 3 : 2, 3, base);
    t.set(hx + hw - 2, hy + 1, o.eyes ?? OUT);
    if (kind === 'bear' || kind === 'wolf' || kind === 'cat') t.rect(hx + 1, hy - 2, 2, 2, kind === 'wolf' ? light : base);
    if (kind === 'wolf') t.rect(hx + 3, hy - 2, 2, 2, light);
    if (kind === 'rhino') {
      for (let k = 0; k < 4; k++) t.rect(hx + hw + 1 - (k >> 1), hy - k, 2, 1, '#e8e0c8');
      if (o.armor) t.rect(hx, hy, 4, 3, o.armor[0]);
    }
    if (kind === 'boar') {
      t.rect(hx + hw, hy + 4, 2, 1, '#f0e8d0');
      t.rect(hx + hw + 1, hy + 3, 1, 1, '#f0e8d0');
      for (let k = 0; k < 6; k++) t.rect(hx - 6 + k * 2, hy - 1, 2, 2, mane);
    }
    if (kind === 'cat' && o.stripes) t.rect(hx + hw, hy + 5, 1, 3, '#f0e8d0');
    if (kind === 'lizard') t.rect(hx + hw, hy + 4, 2, 1, '#ffb030');
  }
  // asa da frente
  if (o.wings) wing(t, cx + 1, top + 3, wingUp, 1, o.wings, dark, kind === 'griffin' ? '#ffffff' : null);
  // sela
  saddle(t, cx, top - 1, o);
}

function saddle(t, x, y, o) {
  t.rect(x - 4, y, 8, 3, '#6a3a1e');
  t.rect(x - 4, y, 8, 1, '#a8743f');
  t.rect(x - 1, y + 3, 2, 3, o.cloth ?? '#8a2a1e');
}

/** Frente (vindo para baixo) e costas (indo para cima). */
function drawFront(t, kind, col, o, f, back) {
  const S = SHAPE[kind];
  const [base, dark, light] = col;
  const cx = 24;
  const bob = f % 2 ? -1 : 0;
  const w = Math.max(7, Math.round(S.H * 0.7));
  const top = GROUND - S.leg - S.H + bob;
  const cy = top + S.H / 2;
  const legW = kind === 'bear' || kind === 'rhino' ? 4 : 3;
  // asas abertas para os lados
  if (o.wings) {
    const up = [0, -3, -5, -3][f];
    // de frente/costas as asas abrem para os dois lados
    for (const s of [-1, 1]) wing(t, cx + s * (w - 2), top + 2, up, -s, o.wings, dark, kind === 'griffin' ? '#ffffff' : null);
  }
  // pernas: as duas de cá alternando
  const lg = (x, ph) => {
    const s = ph * [0, 2, 0, -2][f];
    t.rect(x, cy + 1, legW, S.leg + S.H / 2 - 1 - bob - (s > 0 ? 1 : 0), base);
    t.rect(x, GROUND - 2 - (s > 0 ? 1 : 0), legW, 2, dark);
  };
  if (kind === 'raptor') {
    lg(cx - 4, 1);
    lg(cx + 1, -1);
  } else {
    lg(cx - w + 2, 1);
    lg(cx + w - 2 - legW, -1);
  }
  // corpo
  t.ellipse(cx, cy, w, S.H / 2, base);
  t.ellipse(cx, cy - 2, w - 2, 2, light, 0.5);
  if (o.armor) {
    t.rect(cx - w + 2, cy - 2, w * 2 - 4, S.H / 2 + 1, o.armor[0]);
    t.rect(cx - w + 2, cy + S.H / 2 - 3, w * 2 - 4, 2, o.cloth);
  }
  if (o.stripes) for (let x = -w + 2; x < w - 1; x += 3) t.rect(cx + x, cy - 2, 1, 4, o.stripes);
  if (o.runes) t.rect(cx - 1, cy, 2, 2, o.runes);
  if (back) {
    // costas: cauda no meio, cabeça atrás (só as pontas aparecem)
    const tc = kind === 'horse' || kind === 'stag' ? o.mane ?? dark : base;
    if (kind !== 'bear' && kind !== 'boar' && kind !== 'rhino') for (let k = 0; k < 7; k++) t.rect(cx - 1 + (kind === 'dragon' || kind === 'lizard' ? Math.round(Math.sin((k + f) * 0.8)) : 0), cy + 1 + k, 2, 1, tc);
    else t.rect(cx - 1, cy + 1, 2, 2, dark);
    const hy = kind === 'horse' || kind === 'stag' || kind === 'raptor' || kind === 'dragon' ? top - 9 : top - 3;
    t.rect(cx - 3, hy, 6, 4, kind === 'griffin' ? o.head : base);
    if (o.horn) t.rect(cx - 1, hy - 4, 2, 4, o.horn);
    if (kind === 'stag') {
      t.line(cx - 2, hy, cx - 6, hy - 6, '#e0fbff');
      t.line(cx + 2, hy, cx + 6, hy - 6, '#e0fbff');
    }
  } else {
    // frente: cabeça por cima do peito
    const high = kind === 'horse' || kind === 'stag' || kind === 'raptor' || kind === 'dragon' || kind === 'griffin';
    const hy = high ? top - 8 : top + 1;
    const hw = kind === 'bear' || kind === 'rhino' ? 5 : 4;
    if (high) t.rect(cx - 2, hy + 4, 4, top - hy, kind === 'griffin' ? o.head : base);
    t.rect(cx - hw, hy, hw * 2, 7, kind === 'griffin' ? o.head : base);
    t.rect(cx - hw + 1, hy + 4, hw * 2 - 2, 3, light, 0.6);
    t.set(cx - 2, hy + 2, o.eyes ?? OUT);
    t.set(cx + 1, hy + 2, o.eyes ?? OUT);
    if (kind === 'horse' || kind === 'stag') {
      t.rect(cx - 3, hy - 2, 1, 2, base);
      t.rect(cx + 2, hy - 2, 1, 2, base);
      if (kind === 'horse') t.rect(cx - 1, hy - 1, 2, 4, o.fire ? (f % 2 ? '#ffd34a' : o.mane) : o.mane ?? dark);
    }
    if (o.horn) t.rect(cx - 1, hy - 5, 2, 5, o.horn);
    if (kind === 'stag') {
      t.line(cx - 2, hy, cx - 6, hy - 6, '#e0fbff');
      t.line(cx + 2, hy, cx + 6, hy - 6, '#e0fbff');
    }
    if (kind === 'rhino') t.rect(cx - 1, hy + 4, 2, 4, '#e8e0c8');
    if (kind === 'boar') {
      t.rect(cx - 4, hy + 5, 1, 2, '#f0e8d0');
      t.rect(cx + 3, hy + 5, 1, 2, '#f0e8d0');
    }
    if (kind === 'griffin') t.rect(cx - 1, hy + 4, 2, 3, '#e8a030');
    if (kind === 'bear' || kind === 'wolf' || kind === 'cat') {
      t.rect(cx - hw, hy - 2, 2, 2, base);
      t.rect(cx + hw - 2, hy - 2, 2, 2, base);
    }
  }
  saddle(t, cx, top - 1, o);
}

export function drawMounts({ Img, save, composite }) {
  const N = MOUNT_DEFS.length;
  const sheet = new Img(FW * 16, FH * N);
  MOUNT_DEFS.forEach(([, , kind, col, o], m) => {
    for (let f = 0; f < 4; f++) {
      // ordem das direções igual à do herói: baixo, esquerda, direita, cima
      const make = (dir) => {
        const t = new Img(FW, FH);
        if (dir === 0) drawFront(t, kind, col, o, f, false);
        else if (dir === 3) drawFront(t, kind, col, o, f, true);
        else drawSide(t, kind, col, o, f);
        t.outline(0, 0, FW, FH, OUT);
        // sombra no chão
        return t;
      };
      for (const dir of [0, 2, 3]) composite(sheet, make(dir), (dir * 4 + f) * FW, m * FH);
      // esquerda = direita espelhada
      sheet.mirror((2 * 4 + f) * FW, m * FH, FW, FH, (1 * 4 + f) * FW, m * FH);
    }
  });
  save('assets/sprites/mounts.png', sheet);
  // ícones (o quadro de lado, para as telas) já vêm da própria folha
  return MOUNT_DEFS.map(([id, name, kind, , o]) => ({ id, name, kind, seat: SEAT[kind], glow: o.glow ?? 0, ghost: !!o.ghost }));
}

export const MOUNT_FRAME = { w: FW, h: FH, ground: GROUND };
