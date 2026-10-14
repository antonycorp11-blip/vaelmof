// Trabalhadores da sede em pixel art: cada um com roupa e ferramenta do
// ofício. Folha workers.png: 5 ofícios × 18 quadros (4 direções × 4 de
// caminhada + 2 de trabalho virado para a direita), 20×28 cada; e
// workers-props.png: as pilhas de cada ofício (32×24).

const FW = 20;
const FH = 28;
const OUT = '#141018';
const SKIN = ['#f0c8a0', '#d8a878', '#a87850', '#e8b890', '#c8986a'];

// ofício: roupa [base, sombra], calça, cabelo/chapéu, ferramenta, carga
export const JOBS = [
  { id: 'wood', shirt: ['#b83a2a', '#8a2418'], plaid: '#2a1a12', pants: '#3a3a52', hat: '#6a4a2a', tool: 'axe', skin: 0 },
  { id: 'stone', shirt: ['#8a8a92', '#62626a'], apron: '#a8743f', pants: '#4a3a2a', hat: '#5a3a1e', tool: 'pick', skin: 2 },
  { id: 'fiber', shirt: ['#5a9a4a', '#3e7a32'], dress: true, pants: '#5a9a4a', hat: '#e8d090', tool: 'sickle', skin: 3 },
  { id: 'ore', shirt: ['#7a5a3a', '#5a4026'], pants: '#3a2a1e', hat: '#c8a050', lamp: true, tool: 'pick', skin: 1 },
  { id: 'crystal', shirt: ['#7a4ab8', '#58308a'], robe: true, pants: '#58308a', hat: '#2a1a40', tool: 'hammer', skin: 4 },
];

function person(t, job, dir, f, work) {
  const s = SKIN[job.skin];
  const step = [0, 1, 0, -1][f];
  const cx = 10;
  const ground = 27;
  const bob = f % 2 ? 0 : -1;
  // pernas
  const lx = (o, d) => {
    t.rect(cx + o, ground - 6 + Math.max(0, d), 2, 6 - Math.abs(d), job.pants);
    t.rect(cx + o, ground - 1, 2, 1, '#2a1a12');
  };
  if (job.dress || job.robe) t.rect(cx - 3, ground - 8 + bob, 6, 7, job.shirt[1]);
  if (dir === 1 || dir === 2) {
    lx(-1 + step, step);
    lx(0 - step, -step);
  } else {
    lx(-3, step);
    lx(1, -step);
  }
  // tronco
  const ty = ground - 15 + bob;
  t.rect(cx - 3, ty, 6, 8, job.shirt[0]);
  t.rect(cx - 3, ty + 6, 6, 2, job.shirt[1]);
  if (job.plaid) for (let y = 0; y < 8; y += 2) t.rect(cx - 3, ty + y, 6, 1, job.plaid);
  if (job.apron && dir !== 3) t.rect(cx - 2, ty + 2, 4, 7, job.apron);
  if (job.robe) t.rect(cx - 1, ty, 2, 9, '#c8a8ff');
  // braços
  const arm = (x, d) => t.rect(x, ty + 1 + d, 2, 5, job.shirt[1]);
  if (dir === 1 || dir === 2) arm(cx - 1, 0);
  else {
    arm(cx - 5, step);
    arm(cx + 3, -step);
  }
  // cabeça
  const hy = ty - 7;
  t.rect(cx - 3, hy, 6, 6, s);
  if (dir === 0) {
    t.set(cx - 2, hy + 3, OUT);
    t.set(cx + 1, hy + 3, OUT);
  } else if (dir === 2) t.set(cx + 2, hy + 3, OUT);
  else if (dir === 1) t.set(cx - 3, hy + 3, OUT);
  // chapéu / cabelo
  t.rect(cx - 4, hy - 1, 8, 2, job.hat);
  if (job.id === 'wood') t.rect(cx - 3, hy - 3, 6, 2, job.hat);
  if (job.id === 'fiber') t.rect(cx - 5, hy, 10, 1, job.hat);
  if (job.id === 'crystal') {
    t.rect(cx - 2, hy - 4, 4, 3, job.hat);
    t.set(cx, hy - 5, job.hat);
  }
  if (job.lamp) t.rect(cx - 1, hy - 2, 2, 2, '#ffe08a');
  if (dir === 3) t.rect(cx - 3, hy, 6, 4, job.hat);
  // ferramenta (de lado, e no trabalho)
  if (dir === 2 || work !== undefined) {
    const up = work === 0;
    const hx = cx + 2;
    const hy2 = up ? ty - 6 : ty + 3;
    if (job.tool === 'axe') {
      t.line(hx, ty + 4, hx + (up ? 2 : 5), hy2, '#8a5a32');
      t.rect(hx + (up ? 2 : 5) - 1, hy2 - 1, 3, 3, '#c0c0c8');
    } else if (job.tool === 'pick') {
      t.line(hx, ty + 4, hx + (up ? 2 : 5), hy2, '#8a5a32');
      t.line(hx + (up ? 0 : 3), hy2 - 1, hx + (up ? 4 : 7), hy2 + 1, '#a8a8b0');
    } else if (job.tool === 'sickle') {
      t.line(hx, ty + 4, hx + 3, hy2 + 1, '#8a5a32');
      t.line(hx + 3, hy2 + 1, hx + 6, hy2 - 1, '#d8d8e0');
      t.set(hx + 6, hy2, '#d8d8e0');
    } else {
      t.line(hx, ty + 4, hx + (up ? 2 : 4), hy2, '#8a5a32');
      t.rect(hx + (up ? 1 : 3), hy2 - 1, 3, 2, '#8a8a92');
    }
  }
}

function props(Img) {
  const img = new Img(32 * 5, 24);
  const draw = [
    // toras empilhadas
    (t) => {
      for (const [x, y] of [[3, 15], [12, 15], [21, 15], [7, 9], [16, 9], [11, 3]]) {
        t.rect(x, y, 9, 6, '#8a5a32');
        t.ellipse(x + 8, y + 3, 2, 3, '#d8b070');
        t.set(x + 8, y + 3, '#a8743f');
      }
    },
    // pedras
    (t) => {
      for (const [x, y, r] of [[8, 17, 5], [18, 18, 6], [13, 11, 5], [24, 13, 4]]) {
        t.ellipse(x, y, r, r - 1, '#8a8a92');
        t.ellipse(x - 1, y - 1, r - 2, r - 3, '#b0b0b8');
      }
    },
    // feixes de fibra
    (t) => {
      for (const x of [6, 14, 22]) {
        t.rect(x, 6, 5, 16, '#c8b060');
        t.rect(x, 12, 5, 2, '#8a6a2a');
        t.rect(x + 1, 3, 3, 3, '#a8c060');
      }
    },
    // carrinho de minério
    (t) => {
      t.rect(4, 10, 24, 9, '#5a4026');
      t.rect(4, 10, 24, 2, '#7a5a3a');
      for (const [x, y] of [[8, 7], [13, 6], [19, 7], [24, 8]]) t.ellipse(x, y, 3, 3, '#6a6a72');
      t.set(13, 6, '#e8a050');
      t.ellipse(9, 20, 3, 3, '#2a2a32');
      t.ellipse(23, 20, 3, 3, '#2a2a32');
    },
    // cristais
    (t) => {
      for (const [x, h, c] of [[9, 14, '#b48cff'], [15, 18, '#d0b0ff'], [21, 12, '#9a6ae0']]) {
        for (let y = 0; y < h; y++) t.rect(x - Math.min(3, (h - y) >> 2), 22 - y, Math.min(6, ((h - y) >> 1) + 1), 1, c);
      }
    },
  ];
  draw.forEach((d, i) => {
    const t = new Img(32, 24);
    t.ellipse(16, 21, 13, 3, '#000000', 0.25);
    d(t);
    t.outline(0, 0, 32, 24, OUT);
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 32; x++) {
        const k = (y * 32 + x) * 4;
        if (t.d[k + 3]) img.put(i * 32 + x, y, t.d[k], t.d[k + 1], t.d[k + 2], t.d[k + 3]);
      }
  });
  return img;
}

export function drawWorkers({ Img, save, composite }) {
  const sheet = new Img(FW * 18, FH * JOBS.length);
  JOBS.forEach((job, r) => {
    for (let dir = 0; dir < 4; dir++)
      for (let f = 0; f < 4; f++) {
        const t = new Img(FW, FH);
        t.ellipse(10, 27, 5, 1.5, '#000000', 0.3);
        person(t, job, dir, f);
        t.outline(0, 0, FW, FH, OUT);
        composite(sheet, t, (dir * 4 + f) * FW, r * FH);
      }
    for (let w = 0; w < 2; w++) {
      const t = new Img(FW, FH);
      t.ellipse(10, 27, 5, 1.5, '#000000', 0.3);
      person(t, job, 2, 0, w);
      t.outline(0, 0, FW, FH, OUT);
      composite(sheet, t, (16 + w) * FW, r * FH);
    }
  });
  save('assets/sprites/workers.png', sheet);
  save('assets/sprites/workers-props.png', props(Img));
}
