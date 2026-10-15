// Pilhas de cada ofício da sede (workers-props.png, 32×24): toras, pedras,
// feixes de fibra, carrinho de minério e cristais.

const OUT = '#141018';

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

export function drawWorkers({ Img, save }) {
  // os coletores em si são peles LPC (scripts/chars); aqui só as pilhas de cada ofício
  save('assets/sprites/workers-props.png', props(Img));
}
