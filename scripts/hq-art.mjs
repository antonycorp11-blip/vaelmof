// Arte da sede do clã: cada construção desenhada para a sede (não mais as
// casas das cidades), em 3/4 de cima, com materiais de verdade — tábuas,
// toras, pedra aparelhada, reboco com enxaimel, telhas, palha e ardósia —,
// luz de cima à esquerda, sombra do beiral, janelas com moldura e vidro,
// portas com ferragens e detalhes do ofício (bigorna e forja, fardos e
// caixotes, ouro, ervas). Uma folha por construção, um quadro por nível;
// a guarita do portão tem quadros abrindo (paliçada e pedra).

const OUT = '#1a1420';

// ------------------------------------------------------------------ cores
const hexToRgb = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** k > 0 clareia (puxando para o amarelo), k < 0 escurece (puxando para o roxo). */
function tone(c, k) {
  const [r, g, b] = hexToRgb(c);
  if (k >= 0) return rgbToHex(r + (255 - r) * k + 10 * k, g + (255 - g) * k + 6 * k, b + (255 - b) * k * 0.7);
  const m = 1 + k;
  return rgbToHex(r * m + 12 * -k, g * m, b * m + 24 * -k);
}
/** Rampa de 5 tons: sombra funda, sombra, base, luz, brilho. */
const ramp = (c) => [tone(c, -0.5), tone(c, -0.25), c, tone(c, 0.18), tone(c, 0.38)];

const WOOD = ramp('#8a5a34');
const DARKWOOD = ramp('#5e3a22');
const LOG = ramp('#7a4e2c');
const STONE = ramp('#9a948a');
const COLDSTONE = ramp('#8a8f98');
const PLASTER = ramp('#e8dcc0');
const THATCH = ramp('#c8a050');
const SHINGLE = ramp('#a8483a');
const SLATE = ramp('#5a6478');
const GOLDR = ramp('#e8b830');
const IRON = ramp('#6a6e78');

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ------------------------------------------------------------------ materiais
function fill(t, x, y, w, h, c) {
  t.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c);
}
function px(t, x, y, c, a = 1) {
  t.set(Math.round(x), Math.round(y), c, a);
}
/** Escurece uma área (sombra) misturando com preto-azulado. */
function shadow(t, x, y, w, h, a = 0.35) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (t.alpha(x + xx, y + yy)) t.set(x + xx, y + yy, '#1a1028', a);
}

/** Tábuas verticais com frestas, nós e pregos. */
function planks(t, x, y, w, h, R, r) {
  for (let px0 = x; px0 < x + w; px0 += 4) {
    const pw = Math.min(4, x + w - px0);
    const c = r() < 0.5 ? R[2] : r() < 0.5 ? R[3] : tone(R[2], -0.08);
    fill(t, px0, y, pw, h, c);
    fill(t, px0, y, 1, h, tone(c, 0.12));
    fill(t, px0 + pw - 1, y, 1, h, R[0]);
    if (r() < 0.5) px(t, px0 + 1 + Math.floor(r() * 2), y + 2 + Math.floor(r() * (h - 4)), R[1]);
    px(t, px0 + 1, y + 1, R[4]);
    px(t, px0 + 1, y + h - 2, R[1]);
  }
  fill(t, x, y + h - 2, w, 2, R[1]);
}

/** Toras deitadas com pontas arredondadas. */
function logs(t, x, y, w, h, R, r) {
  for (let ly = y; ly < y + h; ly += 4) {
    const lh = Math.min(4, y + h - ly);
    const c = r() < 0.5 ? R[2] : tone(R[2], 0.06);
    fill(t, x, ly, w, lh, c);
    fill(t, x, ly, w, 1, R[3]);
    if (lh > 3) fill(t, x, ly + 3, w, 1, R[0]);
    for (let k = 0; k < w / 10; k++) px(t, x + Math.floor(r() * w), ly + 1 + Math.floor(r() * 2), R[1]);
    // pontas das toras (anéis)
    for (const ex of [x - 1, x + w - 2]) {
      fill(t, ex, ly, 3, lh, R[3]);
      px(t, ex + 1, ly + 1, R[1]);
      px(t, ex, ly + lh - 1, R[0]);
    }
  }
}

/** Pedra aparelhada: blocos de tamanhos variados, argamassa, luz no topo. */
function stones(t, x, y, w, h, R, r, bh = 5) {
  fill(t, x, y, w, h, R[0]);
  let row = 0;
  for (let sy = y; sy < y + h; sy += bh, row++) {
    let sx = x - (row % 2 ? 3 : 0);
    while (sx < x + w) {
      const bw = 5 + Math.floor(r() * 5);
      const x0 = Math.max(x, sx);
      const x1 = Math.min(x + w, sx + bw - 1);
      const hh = Math.min(bh - 1, y + h - sy);
      if (x1 > x0 && hh > 0) {
        const c = r() < 0.33 ? R[2] : r() < 0.5 ? R[3] : tone(R[2], -0.07);
        fill(t, x0, sy, x1 - x0, hh, c);
        fill(t, x0, sy, x1 - x0, 1, tone(c, 0.16));
        fill(t, x1 - 1, sy, 1, hh, tone(c, -0.12));
        if (r() < 0.25) px(t, x0 + 1 + Math.floor(r() * Math.max(1, x1 - x0 - 2)), sy + 1 + Math.floor(r() * Math.max(1, hh - 1)), tone(c, -0.15));
      }
      sx += bw;
    }
  }
}

/** Reboco claro com manchas. */
function plaster(t, x, y, w, h, R, r) {
  fill(t, x, y, w, h, R[3]);
  for (let k = 0; k < (w * h) / 9; k++) px(t, x + Math.floor(r() * w), y + Math.floor(r() * h), r() < 0.6 ? R[2] : R[4]);
  fill(t, x, y + h - 2, w, 2, R[2]);
}

/** Enxaimel: vigas escuras por cima do reboco. */
function timber(t, x, y, w, h, R) {
  const beam = (bx, by, bw, bh) => {
    fill(t, bx, by, bw, bh, R[1]);
    fill(t, bx, by, Math.max(1, bw > bh ? bw : 1), 1, R[2]);
  };
  beam(x, y, w, 2);
  beam(x, y + Math.round(h / 2) - 1, w, 2);
  const n = Math.max(2, Math.round(w / 18));
  for (let i = 0; i <= n; i++) {
    const bx = Math.round(x + (i * (w - 2)) / n);
    beam(bx, y, 2, h);
  }
  // diagonais nos painéis de cima
  for (let i = 0; i < n; i++) {
    const a = Math.round(x + (i * (w - 2)) / n) + 2;
    const b = Math.round(x + ((i + 1) * (w - 2)) / n);
    const hy = Math.round(h / 2) - 2;
    if (i % 2) t.line(a, y + 2, b - 1, y + hy, R[1]);
    else t.line(b - 1, y + 2, a, y + hy, R[1]);
  }
}

/** Telhado de duas águas visto de frente: telhas em fileiras (`kind` telha/ardósia/palha). */
function roof(t, x, y, w, h, R, r, kind = 'tile') {
  const inset = Math.round(h * 0.35);
  for (let ry = 0; ry < h; ry++) {
    const k = ry / Math.max(1, h - 1);
    const a = Math.round(x + inset * (1 - k));
    const b = Math.round(x + w - inset * (1 - k));
    for (let rx = a; rx < b; rx++) {
      let c;
      if (kind === 'thatch') {
        const n = (Math.sin(rx * 1.7 + ry * 0.3) + Math.sin(rx * 0.61)) * 0.5;
        c = n > 0.35 ? R[3] : n > -0.3 ? R[2] : R[1];
        if (ry % 6 === 5) c = R[1];
        if (k < 0.15) c = R[3];
      } else {
        const rowH = kind === 'slate' ? 3 : 3;
        const row = Math.floor(ry / rowH);
        const sw = kind === 'slate' ? 4 : 5;
        const col = Math.floor((rx - x + (row % 2) * Math.floor(sw / 2)) / sw);
        const v = ((col * 7 + row * 13) % 5) / 5;
        c = v < 0.4 ? R[2] : v < 0.8 ? R[3] : tone(R[2], -0.06);
        if (ry % rowH === rowH - 1) c = R[1];
        else if ((rx - x + (row % 2) * Math.floor(sw / 2)) % sw === sw - 1) c = tone(c, -0.14);
        if (k < 0.5) c = tone(c, (0.5 - k) * 0.22);
      }
      // a água da esquerda pega mais luz
      if (rx < x + w * 0.22) c = tone(c, 0.05);
      px(t, rx, y + ry, c);
    }
    // bordas inclinadas
    px(t, a, y + ry, R[0]);
    px(t, b - 1, y + ry, R[0]);
  }
  // cumeeira e beiral
  fill(t, x + inset, y, w - inset * 2, 1, R[4]);
  fill(t, x + inset, y + 1, w - inset * 2, 1, R[3]);
  fill(t, x, y + h - 1, w, 1, R[0]);
  if (kind === 'thatch') for (let fx = x + 1; fx < x + w - 1; fx += 2) px(t, fx, y + h, R[1]);
}

/** Janela com moldura, vidro (reflexo) e floreira opcional. */
function window(t, x, y, w = 7, h = 8, frame = DARKWOOD, arched = false) {
  fill(t, x - 1, y - 1, w + 2, h + 2, frame[0]);
  fill(t, x, y, w, h, '#2a3a5a');
  fill(t, x, y, w, Math.ceil(h / 2), '#3a5078');
  px(t, x + 1, y + 1, '#a8c8e8');
  px(t, x + 2, y + 1, '#6a8ab8');
  fill(t, x + Math.floor(w / 2), y, 1, h, frame[1]);
  fill(t, x, y + Math.floor(h / 2), w, 1, frame[1]);
  if (arched) {
    for (let k = 0; k < Math.ceil(w / 2); k++) {
      px(t, x + k, y - 1 - Math.round(Math.sqrt(Math.max(0, (w / 2) ** 2 - (w / 2 - k - 0.5) ** 2)) * 0.6), frame[0]);
      px(t, x + w - 1 - k, y - 1 - Math.round(Math.sqrt(Math.max(0, (w / 2) ** 2 - (w / 2 - k - 0.5) ** 2)) * 0.6), frame[0]);
    }
  }
  fill(t, x - 1, y + h + 1, w + 2, 1, frame[3]);
}

/** Porta de tábuas com arco, ferragens e argola. */
function door(t, x, y, w, h, R = WOOD, double = false) {
  fill(t, x - 1, y - 2, w + 2, h + 2, OUT);
  for (let dx = 0; dx < w; dx++) {
    const top = Math.round(Math.max(0, 3 - Math.sqrt(Math.max(0, (w / 2) ** 2 - (dx - w / 2 + 0.5) ** 2)) * (3 / (w / 2))));
    for (let dy = top; dy < h; dy++) {
      let c = (dx % 3 === 2) ? R[1] : dx % 3 === 0 ? R[3] : R[2];
      if (dy > h - 3) c = tone(c, -0.12);
      px(t, x + dx, y + dy - 1, c);
    }
  }
  for (const by of [Math.round(h * 0.25), Math.round(h * 0.7)]) fill(t, x, y + by, w, 1, IRON[1]);
  if (double) fill(t, x + Math.floor(w / 2), y - 1, 1, h, R[0]);
  px(t, x + (double ? Math.floor(w / 2) - 2 : w - 3), y + Math.round(h * 0.5), GOLDR[3]);
  if (double) px(t, x + Math.floor(w / 2) + 1, y + Math.round(h * 0.5), GOLDR[3]);
}

/** Estandarte pendurado, ponta em V. */
function banner(t, x, y, w, h, c) {
  const R = ramp(c);
  fill(t, x - 1, y - 1, w + 2, 1, DARKWOOD[1]);
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const cut = yy > h - 4 && Math.abs(xx - (w - 1) / 2) < (yy - (h - 4)) * 0.9;
      if (cut) continue;
      px(t, x + xx, y + yy, xx === 0 ? R[3] : xx === w - 1 ? R[1] : R[2]);
    }
  // emblema dourado
  fill(t, x + Math.floor(w / 2) - 1, y + 3, 2, 3, GOLDR[3]);
  px(t, x + Math.floor(w / 2) - 1, y + 3, GOLDR[4]);
}

function crate(t, x, y, s = 7) {
  fill(t, x, y, s, s, WOOD[2]);
  fill(t, x, y, s, 1, WOOD[3]);
  t.line(x, y, x + s - 1, y + s - 1, WOOD[1]);
  t.line(x + s - 1, y, x, y + s - 1, WOOD[1]);
  fill(t, x, y + s - 1, s, 1, WOOD[0]);
  fill(t, x + s - 1, y, 1, s, WOOD[0]);
}
function barrel(t, x, y) {
  for (let k = 0; k < 9; k++) {
    const ww = 6 + (k > 1 && k < 7 ? 1 : 0);
    fill(t, x + (7 - ww) / 2, y + k, ww, 1, k === 0 ? WOOD[4] : WOOD[2]);
  }
  fill(t, x, y + 2, 7, 1, IRON[1]);
  fill(t, x, y + 6, 7, 1, IRON[1]);
  fill(t, x + 1, y + 1, 1, 7, WOOD[3]);
}
function sack(t, x, y) {
  t.ellipse(x + 3, y + 4, 3.5, 3.5, '#c8b080');
  t.ellipse(x + 2, y + 3, 1.5, 1.5, '#e0cc9c');
  fill(t, x + 2, y, 3, 2, '#a89060');
}
function goldPile(t, x, y) {
  for (let k = 0; k < 4; k++) t.ellipse(x + 4, y + 5 - k, 4 - k, 1.2, k % 2 ? GOLDR[3] : GOLDR[2]);
  px(t, x + 3, y + 1, GOLDR[4]);
}
function smokePuff(t, x, y) {
  t.ellipse(x, y, 3, 2.5, '#c8c8d0', 0.55);
  t.ellipse(x + 3, y - 4, 2.5, 2, '#d8d8e0', 0.4);
  t.ellipse(x + 1, y - 8, 2, 1.6, '#e0e0e8', 0.3);
}
function chimney(t, x, y, h, R = STONE, r = Math.random) {
  stones(t, x, y, 6, h, R, r, 3);
  fill(t, x - 1, y - 1, 8, 2, R[1]);
  fill(t, x, y - 1, 6, 1, R[3]);
}
function groundShadow(t, cx, y, rx, ry = 3) {
  t.ellipse(cx, y, rx, ry, '#000000', 0.32);
}

/** Torre redonda/quadrada com telhado cônico (cantos do salão de pedra). */
function towerCone(t, x, y, w, h, R, roofR, r) {
  stones(t, x, y, w, h, R, r, 4);
  fill(t, x, y, 1, h, R[3]);
  fill(t, x + w - 1, y, 1, h, R[1]);
  // telhado cônico
  const rh = Math.round(w * 1.1);
  for (let k = 0; k < rh; k++) {
    const hw = Math.round(((k + 1) / rh) * (w / 2 + 2));
    for (let xx = -hw; xx < hw; xx++) {
      const c = xx < -hw / 3 ? roofR[3] : xx > hw / 3 ? roofR[1] : roofR[2];
      px(t, x + w / 2 + xx, y - rh + k, k % 3 === 2 ? tone(c, -0.15) : c);
    }
  }
  fill(t, x + w / 2 - 0.5, y - rh - 3, 1, 3, DARKWOOD[2]);
  window(t, x + Math.floor(w / 2) - 2, y + 6, 4, 6, DARKWOOD, true);
}

// ------------------------------------------------------------------ construções
/** Cada função devolve um Img do tamanho pedido para o nível. */
const BUILD = {
  /** Salão do Clã: casa longa de palha → salão de pedra e madeira → fortaleza. */
  hall(Img, lv) {
    const W = [112, 128, 144][lv - 1];
    const H = [84, 96, 112][lv - 1];
    const t = new Img(W, H);
    const r = rng(11 + lv);
    groundShadow(t, W / 2, H - 3, W / 2 - 4, 4);
    const wallH = [26, 30, 34][lv - 1];
    const x0 = lv === 3 ? 22 : 8;
    const x1 = W - x0;
    const top = H - 3 - wallH;
    if (lv === 1) {
      logs(t, x0, top, x1 - x0, wallH, LOG, r);
      fill(t, x0, H - 7, x1 - x0, 4, STONE[1]);
      stones(t, x0, H - 7, x1 - x0, 4, STONE, r, 4);
      roof(t, x0 - 6, top - 34, x1 - x0 + 12, 36, THATCH, r, 'thatch');
      shadow(t, x0, top + 2, x1 - x0, 3, 0.3);
      // cabeças de dragão na cumeeira (casa longa)
      for (const [hx, s] of [[x0 + 8, -1], [x1 - 8, 1]]) {
        t.line(hx, top - 33, hx + s * 4, top - 40, DARKWOOD[2]);
        px(t, hx + s * 5, top - 41, DARKWOOD[3]);
      }
      door(t, W / 2 - 7, H - 21, 14, 18, WOOD, true);
      for (const wx of [x0 + 10, x1 - 17]) window(t, wx, top + 9, 7, 8);
      banner(t, W / 2 - 22, top + 4, 6, 14, '#b83a3a');
      banner(t, W / 2 + 16, top + 4, 6, 14, '#b83a3a');
      barrel(t, x1 - 2, H - 12);
      crate(t, x0 - 6, H - 10);
    } else if (lv === 2) {
      // base de pedra, andar de reboco com enxaimel, telhas
      stones(t, x0, top + 12, x1 - x0, wallH - 12, STONE, r);
      plaster(t, x0, top, x1 - x0, 13, PLASTER, r);
      timber(t, x0, top, x1 - x0, 13, DARKWOOD);
      roof(t, x0 - 6, top - 38, x1 - x0 + 12, 40, SHINGLE, r);
      shadow(t, x0, top + 2, x1 - x0, 3, 0.3);
      chimney(t, x1 - 22, top - 44, 12, STONE, r);
      smokePuff(t, x1 - 19, top - 50);
      door(t, W / 2 - 8, H - 24, 16, 21, DARKWOOD, true);
      fill(t, W / 2 - 11, H - 4, 22, 2, STONE[3]);
      for (const wx of [x0 + 8, x0 + 22, x1 - 29, x1 - 15]) window(t, wx, top + 15, 7, 9, DARKWOOD, true);
      for (const wx of [x0 + 12, x1 - 19]) window(t, wx, top + 3, 6, 6);
      banner(t, x0 + 2, top + 13, 6, 16, '#b83a3a');
      banner(t, x1 - 8, top + 13, 6, 16, '#b83a3a');
      for (const k of [0, 9]) barrel(t, x1 + 1 - k, H - 12);
    } else {
      // fortaleza: corpo de pedra, ardósia, duas torres com telhado cônico
      stones(t, x0, top, x1 - x0, wallH, COLDSTONE, r);
      fill(t, x0, top, x1 - x0, 1, COLDSTONE[4]);
      roof(t, x0 - 6, top - 40, x1 - x0 + 12, 42, SLATE, r, 'slate');
      shadow(t, x0, top + 2, x1 - x0, 3, 0.3);
      for (const tx of [4, W - 22]) towerCone(t, tx, top - 22, 18, wallH + 22, COLDSTONE, SLATE, r);
      // ameias sobre a entrada
      for (let ax = W / 2 - 16; ax < W / 2 + 16; ax += 5) stones(t, ax, top - 6, 3, 6, COLDSTONE, r, 3);
      door(t, W / 2 - 9, H - 27, 18, 24, DARKWOOD, true);
      fill(t, W / 2 - 13, H - 4, 26, 2, COLDSTONE[3]);
      fill(t, W / 2 - 15, H - 2, 30, 1, COLDSTONE[2]);
      for (const wx of [x0 + 8, x0 + 20, x1 - 27, x1 - 15]) window(t, wx, top + 9, 6, 10, DARKWOOD, true);
      for (const bx of [W / 2 - 24, W / 2 + 18]) banner(t, bx, top + 4, 7, 20, '#b83a3a');
      // bandeirinhas nas torres
      for (const tx of [4 + 9, W - 13]) {
        fill(t, tx, top - 48, 1, 6, DARKWOOD[1]);
        fill(t, tx + 1, top - 48, 5, 3, '#d84a4a');
      }
    }
    t.outline(0, 0, W, H, OUT);
    return t;
  },

  /** Alojamento: cabana de toras com cabides de armas → alojamento de pedra. */
  barracks(Img, lv) {
    const W = [80, 88, 96][lv - 1];
    const H = [60, 66, 72][lv - 1];
    const t = new Img(W, H);
    const r = rng(23 + lv);
    groundShadow(t, W / 2, H - 3, W / 2 - 4);
    const wallH = [20, 22, 24][lv - 1];
    const x0 = 6;
    const x1 = W - 18;
    const top = H - 3 - wallH;
    if (lv >= 2) stones(t, x0, top, x1 - x0, wallH, STONE, r);
    else logs(t, x0, top, x1 - x0, wallH, LOG, r);
    if (lv === 2) {
      plaster(t, x0, top, x1 - x0, 8, PLASTER, r);
      timber(t, x0, top, x1 - x0, 8, DARKWOOD);
    }
    roof(t, x0 - 5, top - 26, x1 - x0 + 10, 28, lv === 1 ? THATCH : lv === 2 ? SHINGLE : SLATE, r, lv === 1 ? 'thatch' : lv === 2 ? 'tile' : 'slate');
    shadow(t, x0, top + 2, x1 - x0, 3, 0.3);
    door(t, x0 + 10, H - 18, 10, 15, WOOD);
    for (const wx of [x0 + 26, x0 + 40]) if (wx + 7 < x1) window(t, wx, top + 7, 6, 7);
    if (lv === 3) banner(t, x1 - 10, top + 2, 6, 14, '#3a6ab8');
    // cavalete de armas e boneco de treino ao lado
    const rx = W - 15;
    fill(t, rx, H - 17, 12, 2, DARKWOOD[2]);
    fill(t, rx, H - 9, 12, 2, DARKWOOD[2]);
    for (const [sx, c] of [[rx + 2, IRON[3]], [rx + 6, IRON[4]], [rx + 10, IRON[3]]]) {
      fill(t, sx, H - 22, 1, 15, c);
      fill(t, sx - 1, H - 13, 3, 1, GOLDR[2]);
    }
    if (lv >= 2) {
      // boneco de palha
      fill(t, rx - 6, H - 20, 1, 17, DARKWOOD[2]);
      t.ellipse(rx - 6, H - 14, 3, 4, THATCH[2]);
      t.ellipse(rx - 6, H - 20, 2, 2, THATCH[3]);
    }
    t.outline(0, 0, W, H, OUT);
    return t;
  },

  /** Arsenal: forja aberta com bigorna, fogo e chaminé fumegando. */
  arsenal(Img) {
    const W = 84;
    const H = 66;
    const t = new Img(W, H);
    const r = rng(37);
    groundShadow(t, W / 2, H - 3, W / 2 - 4);
    const x0 = 8;
    const x1 = W - 8;
    const top = H - 26;
    stones(t, x0, top, x1 - x0, 23, STONE, r);
    roof(t, x0 - 5, top - 22, x1 - x0 + 10, 24, SHINGLE, r);
    shadow(t, x0, top + 2, x1 - x0, 3, 0.3);
    chimney(t, x0 + 6, top - 32, 14, STONE, r);
    smokePuff(t, x0 + 9, top - 38);
    // boca da forja: brasa e fogo
    const fx = x0 + 6;
    const fy = top + 8;
    fill(t, fx - 1, fy - 1, 16, 12, OUT);
    fill(t, fx, fy, 14, 10, '#2a1a14');
    for (let k = 0; k < 14; k++) {
      const h = 3 + ((k * 7) % 5);
      for (let j = 0; j < h; j++) px(t, fx + k, fy + 9 - j, j < 2 ? '#ffe070' : j < 4 ? '#ff9a2a' : '#c83a1a');
    }
    // porta larga aberta e bancada
    door(t, x1 - 20, H - 19, 12, 16, DARKWOOD);
    // bigorna na frente
    const ax = W / 2 - 4;
    fill(t, ax, H - 9, 10, 3, IRON[2]);
    fill(t, ax + 2, H - 6, 6, 3, IRON[1]);
    fill(t, ax - 2, H - 9, 3, 2, IRON[2]);
    fill(t, ax, H - 9, 10, 1, IRON[4]);
    // espadas encostadas e escudo
    for (const [sx, c] of [[x1 - 4, IRON[4]], [x1 - 1, IRON[3]]]) fill(t, sx, top + 4, 1, 16, c);
    t.ellipse(x0 + 30, top + 14, 4, 5, '#3a6ab8');
    t.ellipse(x0 + 30, top + 14, 2, 3, GOLDR[2]);
    barrel(t, 1, H - 12);
    t.outline(0, 0, W, H, OUT);
    return t;
  },

  /** Enfermaria: casa de reboco com cruz vermelha e ervas; depois, maior com pátio. */
  infirmary(Img, lv) {
    const W = [64, 76][lv - 1];
    const H = [56, 64][lv - 1];
    const t = new Img(W, H);
    const r = rng(41 + lv);
    groundShadow(t, W / 2, H - 3, W / 2 - 4);
    const x0 = 6;
    const x1 = W - 6;
    const top = H - 3 - (lv === 1 ? 20 : 24);
    plaster(t, x0, top, x1 - x0, H - 3 - top, PLASTER, r);
    fill(t, x0, H - 7, x1 - x0, 4, STONE[2]);
    stones(t, x0, H - 7, x1 - x0, 4, STONE, r, 4);
    roof(t, x0 - 4, top - 20, x1 - x0 + 8, 22, lv === 1 ? SHINGLE : SLATE, r, lv === 1 ? 'tile' : 'slate');
    shadow(t, x0, top + 2, x1 - x0, 3, 0.3);
    // cruz vermelha na fachada
    const cx = W / 2;
    fill(t, cx - 1, top + 3, 3, 9, '#d83a3a');
    fill(t, cx - 4, top + 6, 9, 3, '#d83a3a');
    fill(t, cx - 1, top + 3, 1, 9, '#ff7a6a');
    door(t, cx - 5, H - 17, 10, 14, WOOD);
    window(t, x0 + 4, top + 6, 6, 7);
    window(t, x1 - 10, top + 6, 6, 7);
    // vasos de ervas
    for (const vx of [x0 - 2, x1 - 4]) {
      fill(t, vx, H - 8, 6, 5, '#b8683a');
      fill(t, vx, H - 8, 6, 1, '#d8885a');
      t.ellipse(vx + 3, H - 10, 3, 2.5, '#4a9a4a');
      px(t, vx + 2, H - 11, '#8ad87a');
    }
    if (lv === 2) banner(t, x1 - 2, top - 2, 5, 12, '#f0f0f0');
    t.outline(0, 0, W, H, OUT);
    return t;
  },

  /** Tesouraria: cofre de pedra com porta de ferro, moedas; depois colunas e ouro. */
  treasury(Img, lv) {
    const W = [64, 72, 80][lv - 1];
    const H = [56, 62, 70][lv - 1];
    const t = new Img(W, H);
    const r = rng(53 + lv);
    groundShadow(t, W / 2, H - 3, W / 2 - 4);
    const x0 = 7;
    const x1 = W - 7;
    const top = H - 3 - (20 + lv * 2);
    stones(t, x0, top, x1 - x0, H - 3 - top, lv === 3 ? COLDSTONE : STONE, r, 4);
    // telhado: frontão triangular (templo) com borda dourada
    const ph = 14 + lv * 2;
    for (let k = 0; k < ph; k++) {
      const hw = Math.round(((k + 1) / ph) * ((x1 - x0) / 2 + 4));
      for (let xx = -hw; xx < hw; xx++) px(t, W / 2 + xx, top - ph + k, k === ph - 1 ? STONE[1] : xx < 0 ? STONE[3] : STONE[2]);
      px(t, W / 2 - hw, top - ph + k, lv >= 2 ? GOLDR[3] : STONE[1]);
      px(t, W / 2 + hw - 1, top - ph + k, lv >= 2 ? GOLDR[2] : STONE[0]);
    }
    fill(t, x0 - 4, top - 1, x1 - x0 + 8, 2, lv >= 2 ? GOLDR[2] : STONE[1]);
    // moeda no frontão
    t.ellipse(W / 2, top - ph / 2 + 1, 3, 3, GOLDR[2]);
    px(t, W / 2 - 1, top - ph / 2, GOLDR[4]);
    // colunas
    if (lv >= 2)
      for (const cx of [x0 + 3, x1 - 6]) {
        fill(t, cx, top + 1, 4, H - 4 - top, STONE[3]);
        fill(t, cx, top + 1, 1, H - 4 - top, STONE[4]);
        fill(t, cx + 3, top + 1, 1, H - 4 - top, STONE[1]);
      }
    // porta de ferro com rebites
    const dw = 12;
    const dx = W / 2 - dw / 2;
    fill(t, dx - 1, H - 20, dw + 2, 18, OUT);
    fill(t, dx, H - 19, dw, 16, IRON[2]);
    for (let yy = H - 17; yy < H - 4; yy += 4) for (let xx = dx + 1; xx < dx + dw; xx += 4) px(t, xx, yy, IRON[4]);
    fill(t, dx + dw / 2 - 1, H - 12, 2, 2, GOLDR[3]);
    // moedas e baús
    goldPile(t, x0 - 6, H - 10);
    goldPile(t, x1 - 1, H - 10);
    if (lv === 3) {
      crate(t, x1 + 1, H - 18, 6);
      goldPile(t, x1 + 1, H - 23);
    }
    t.outline(0, 0, W, H, OUT);
    return t;
  },

  /** Armazém: celeiro de tábuas com portão duplo, caixotes, barris e sacos. */
  warehouse(Img, lv) {
    const W = [80, 92][lv - 1];
    const H = [62, 70][lv - 1];
    const t = new Img(W, H);
    const r = rng(67 + lv);
    groundShadow(t, W / 2, H - 3, W / 2 - 4);
    const x0 = 8;
    const x1 = W - 8;
    const top = H - 3 - (22 + lv * 2);
    planks(t, x0, top, x1 - x0, H - 3 - top, lv === 1 ? WOOD : ramp('#9a4a34'), r);
    // celeiro: telhado alto
    roof(t, x0 - 5, top - 26, x1 - x0 + 10, 28, lv === 1 ? THATCH : SHINGLE, r, lv === 1 ? 'thatch' : 'tile');
    shadow(t, x0, top + 2, x1 - x0, 3, 0.3);
    // portão duplo com X
    const gw = 20;
    const gx = W / 2 - gw / 2;
    fill(t, gx - 1, H - 22, gw + 2, 20, OUT);
    planks(t, gx, H - 21, gw, 18, DARKWOOD, r);
    t.line(gx, H - 21, gx + gw / 2 - 1, H - 4, WOOD[3]);
    t.line(gx + gw / 2 - 1, H - 21, gx, H - 4, WOOD[3]);
    t.line(gx + gw / 2, H - 21, gx + gw - 1, H - 4, WOOD[3]);
    t.line(gx + gw - 1, H - 21, gx + gw / 2, H - 4, WOOD[3]);
    // janela do palheiro
    fill(t, W / 2 - 4, top - 10, 8, 7, OUT);
    fill(t, W / 2 - 3, top - 9, 6, 6, '#2a1a14');
    fill(t, W / 2 - 3, top - 5, 6, 2, THATCH[3]);
    // pilha de carga
    crate(t, 0, H - 11);
    crate(t, 2, H - 18, 6);
    barrel(t, x1 + 0, H - 12);
    sack(t, x1 - 8, H - 10);
    if (lv === 2) {
      crate(t, x1 - 2, H - 20, 6);
      sack(t, 8, H - 9);
    }
    t.outline(0, 0, W, H, OUT);
    return t;
  },
};

/** Torres de vigia: madeira sobre pernas (nível 1) e pedra com ameias (nível 2). */
function towerArt(Img, lv) {
  const W = 34;
  const H = 66;
  const t = new Img(W, H);
  const r = rng(79 + lv);
  groundShadow(t, W / 2, H - 3, 13, 3);
  if (lv === 1) {
    // pernas e travessas
    for (const lx of [6, W - 8]) fill(t, lx, 22, 2, H - 25, LOG[2]);
    for (const ly of [34, 48]) {
      t.line(7, ly, W - 8, ly + 8, LOG[1]);
      t.line(W - 8, ly, 7, ly + 8, LOG[1]);
    }
    // plataforma e parapeito de tábuas
    planks(t, 3, 14, W - 6, 10, WOOD, r);
    fill(t, 2, 23, W - 4, 2, DARKWOOD[1]);
    // telhadinho
    roof(t, 1, 0, W - 2, 15, THATCH, r, 'thatch');
    fill(t, 5, 14, 2, 3, DARKWOOD[1]);
    fill(t, W - 7, 14, 2, 3, DARKWOOD[1]);
    // arqueiro (silhueta) no parapeito
    t.ellipse(W / 2, 12, 2.5, 2.5, '#d8a878');
    fill(t, W / 2 - 1, 14, 3, 2, '#5a7a3a');
  } else {
    stones(t, 4, 14, W - 8, H - 17, COLDSTONE, r, 4);
    fill(t, 4, 14, 1, H - 17, COLDSTONE[3]);
    fill(t, W - 5, 14, 1, H - 17, COLDSTONE[1]);
    // ameias
    fill(t, 2, 10, W - 4, 5, COLDSTONE[2]);
    fill(t, 2, 10, W - 4, 1, COLDSTONE[4]);
    for (let ax = 2; ax < W - 3; ax += 6) {
      stones(t, ax, 4, 4, 6, COLDSTONE, r, 3);
    }
    // seteiras
    for (const sy of [22, 38]) {
      fill(t, W / 2 - 1, sy, 2, 7, OUT);
      fill(t, W / 2 - 3, sy + 3, 6, 1, OUT);
    }
    banner(t, W / 2 - 3, 46, 6, 10, '#b83a3a');
  }
  t.outline(0, 0, W, H, OUT);
  return t;
}

/**
 * Guarita do portão: duas torres e o portão de folhas (abrindo em 4 quadros).
 * `stone` = muralha de pedra; senão, paliçada.
 */
function gateArt(Img, stone, open) {
  const W = 104;
  const H = 72;
  const t = new Img(W, H);
  const r = rng(97 + (stone ? 1 : 0));
  groundShadow(t, W / 2, H - 3, W / 2 - 2, 4);
  const TW = 20;
  const R = stone ? COLDSTONE : LOG;
  // vão do portão (4 tiles = 64 px) entre as torres
  const gx0 = TW;
  const gx1 = W - TW;
  // arco/viga por cima do vão
  if (stone) {
    stones(t, gx0, 10, gx1 - gx0, 14, COLDSTONE, r, 4);
    for (let ax = gx0; ax < gx1; ax += 6) stones(t, ax, 5, 4, 5, COLDSTONE, r, 3);
    fill(t, gx0, 23, gx1 - gx0, 2, COLDSTONE[0]);
  } else {
    logs(t, gx0, 14, gx1 - gx0, 8, LOG, r);
    for (let ax = gx0; ax < gx1; ax += 5) {
      fill(t, ax, 6, 3, 8, LOG[2]);
      px(t, ax + 1, 5, LOG[3]);
    }
  }
  // folhas do portão: fecham do meio; abrem girando para dentro (encolhem)
  const leafW = (gx1 - gx0) / 2;
  const k = 1 - open; // 1 fechado, 0 aberto
  const lw = Math.max(2, Math.round(leafW * k));
  const gy0 = 25;
  const gh = H - 3 - gy0;
  // vão: sombra só sob a viga; o resto fica transparente (vê-se o chão por baixo)
  for (let yy = 0; yy < 10; yy++) for (let xx = gx0; xx < gx1; xx++) px(t, xx, gy0 + yy, '#1e140e', 0.85 * (1 - yy / 10));
  for (const side of [-1, 1]) {
    const lx = side < 0 ? gx0 : gx1 - lw;
    planks(t, lx, gy0, lw, gh, stone ? DARKWOOD : WOOD, r);
    if (lw > 6) {
      for (const by of [gy0 + 6, gy0 + gh - 9]) fill(t, lx, by, lw, 2, IRON[1]);
      for (const by of [gy0 + 6, gy0 + gh - 9]) px(t, side < 0 ? lx + lw - 3 : lx + 2, by, IRON[4]);
    }
    // argolas no meio quando fechado
    if (open === 0) px(t, side < 0 ? lx + lw - 3 : lx + 2, gy0 + gh / 2, GOLDR[3]);
  }
  // chão do vão (terra) quando aberto
  // torres laterais
  for (const tx of [0, W - TW]) {
    if (stone) {
      stones(t, tx + 1, 8, TW - 2, H - 11, COLDSTONE, r, 4);
      fill(t, tx, 4, TW, 5, COLDSTONE[2]);
      for (let ax = tx; ax < tx + TW - 2; ax += 6) stones(t, ax, 0, 4, 5, COLDSTONE, r, 3);
      fill(t, tx + TW / 2 - 1, 20, 2, 8, OUT);
    } else {
      // torreões de toras com telhadinho
      logs(t, tx + 2, 18, TW - 4, H - 21, LOG, r);
      roof(t, tx, 4, TW, 15, THATCH, r, 'thatch');
    }
    banner(t, tx + TW / 2 - 3, stone ? 30 : 34, 6, 12, '#b83a3a');
  }
  // tochas ao lado do vão
  for (const tx of [gx0 - 2, gx1 + 1]) {
    fill(t, tx, 30, 1, 5, DARKWOOD[2]);
    px(t, tx, 29, '#ffd060');
    px(t, tx, 28, '#ff8a2a');
  }
  void R;
  t.outline(0, 0, W, H, OUT);
  return t;
}

export const HQ_LEVELS = { hall: 3, barracks: 3, arsenal: 1, infirmary: 2, treasury: 3, warehouse: 2 };

/** Gera as folhas da sede e devolve o tamanho de cada (para src/data/hqArt.ts). */
export function drawHQ({ Img, save, composite }) {
  const meta = {};
  for (const [id, n] of Object.entries(HQ_LEVELS)) {
    const frames = [];
    for (let lv = 1; lv <= n; lv++) frames.push(BUILD[id](Img, lv));
    const fw = Math.max(...frames.map((f) => f.w));
    const fh = Math.max(...frames.map((f) => f.h));
    const sheet = new Img(fw * n, fh);
    // cada nível centralizado embaixo do quadro (a base é o pé do sprite)
    frames.forEach((f, i) => composite(sheet, f, i * fw + Math.floor((fw - f.w) / 2), fh - f.h));
    save(`assets/tiles/hq-${id}.png`, sheet);
    meta[id] = { w: fw, h: fh, frames: n, widths: frames.map((f) => f.w) };
  }
  {
    const sheet = new Img(34 * 2, 66);
    composite(sheet, towerArt(Img, 1), 0, 0);
    composite(sheet, towerArt(Img, 2), 34, 0);
    save('assets/tiles/hq-tower.png', sheet);
    meta.tower = { w: 34, h: 66, frames: 2, widths: [34, 34] };
  }
  {
    // guarita: 4 quadros de paliçada (fechado → aberto) e 4 de pedra
    const sheet = new Img(104 * 8, 72);
    [false, true].forEach((stone, si) => [0, 0.34, 0.67, 1].forEach((o, i) => composite(sheet, gateArt(Img, stone, o), (si * 4 + i) * 104, 0)));
    save('assets/tiles/hq-gate.png', sheet);
    meta.gate = { w: 104, h: 72, frames: 8, widths: Array(8).fill(104) };
  }
  return meta;
}
