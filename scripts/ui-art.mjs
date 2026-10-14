// Kit visual da interface: molduras 9-slice, botões, barras e ícones de menu.
// Chamado por generate-assets.mjs. Tudo em pixel art, no estilo do mapa.

const OUT = '#0b0d14';
const GOLD = ['#ffd77a', '#c8a050', '#8a6a2a'];

/** Moldura de painel 24×24 (cantos de 8): pedra escura, filete dourado, rebites. */
function frame(Img, fill, edge) {
  const t = new Img(24, 24);
  t.rect(0, 0, 24, 24, OUT);
  t.rect(1, 1, 22, 22, edge[2]);
  t.rect(2, 2, 20, 20, edge[1]);
  t.rect(3, 3, 18, 18, OUT);
  t.rect(4, 4, 16, 16, fill[0]);
  // brilho em cima e sombra embaixo (dá volume)
  t.rect(4, 4, 16, 1, fill[1]);
  t.rect(4, 19, 16, 1, fill[2]);
  t.rect(2, 2, 20, 1, edge[0]);
  // rebites nos cantos
  for (const [x, y] of [[2, 2], [20, 2], [2, 20], [20, 20]]) {
    t.rect(x, y, 2, 2, edge[0]);
    t.set(x + 1, y + 1, edge[2]);
  }
  return t;
}

/** Botão 24×14 (cantos de 5) com bisel; `down` = pressionado. */
function button(Img, c, down) {
  const t = new Img(24, 14);
  t.rect(0, 0, 24, 14, OUT);
  t.rect(1, 1, 22, 12, c[2]);
  t.rect(1, down ? 2 : 1, 22, down ? 11 : 10, c[1]);
  t.rect(2, down ? 3 : 2, 20, 1, c[0]);
  if (!down) t.rect(1, 11, 22, 2, c[2]);
  return t;
}

/** Ícones de menu 16×16. */
const ICONS = [
  // 0 mochila
  (t) => {
    t.rect(3, 5, 10, 9, '#8a5a32');
    t.rect(3, 5, 10, 2, '#a8743f');
    t.rect(5, 2, 6, 3, '#6e4426');
    t.rect(6, 3, 4, 1, '#0b0d14');
    t.rect(6, 9, 4, 2, '#d9b04a');
  },
  // 1 atributos/patentes: escudo com estrela
  (t) => {
    for (let y = 2; y < 14; y++) {
      const i = y < 9 ? 0 : y - 8;
      t.rect(3 + i, y, 10 - i * 2, 1, y < 8 ? '#2f5fae' : '#1c3a70');
    }
    for (const [x, y] of [[8, 4], [7, 5], [8, 5], [9, 5], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [7, 7], [9, 7], [6, 8], [10, 8]]) t.set(x, y, '#ffd77a');
  },
  // 2 exército: estandarte
  (t) => {
    t.rect(4, 1, 1, 14, '#a8743f');
    t.rect(5, 2, 8, 7, '#b5483a');
    t.rect(5, 2, 8, 1, '#cf6a50');
    t.rect(9, 9, 4, 2, '#b5483a');
    t.rect(10, 11, 3, 1, '#b5483a');
    t.rect(7, 4, 3, 3, '#ffd77a');
  },
  // 3 mapa
  (t) => {
    t.rect(2, 3, 12, 10, '#e6d7b3');
    t.rect(2, 3, 12, 1, '#f3e8cc');
    t.line(4, 11, 7, 6, '#b5483a');
    t.line(7, 6, 10, 9, '#b5483a');
    t.line(10, 9, 12, 5, '#b5483a');
    t.rect(11, 4, 2, 2, '#3a78bd');
    t.rect(5, 1, 1, 2, '#8a5a32');
    t.rect(10, 1, 1, 2, '#8a5a32');
  },
  // 4 engrenagem (debug)
  (t) => {
    t.ellipse(8, 8, 5, 5, '#9aa4b0');
    for (const [x, y] of [[7, 1], [7, 13], [1, 7], [13, 7], [3, 3], [11, 3], [3, 11], [11, 11]]) t.rect(x, y, 2, 2, '#9aa4b0');
    t.ellipse(8, 8, 2, 2, '#0b0d14');
  },
  // 5 guerra: espadas cruzadas
  (t) => {
    t.line(2, 13, 12, 3, '#dfe6ee');
    t.line(3, 13, 13, 3, '#9aa4b0');
    t.line(13, 13, 3, 3, '#dfe6ee');
    t.line(12, 13, 2, 3, '#9aa4b0');
    t.rect(3, 11, 3, 1, '#d9b04a');
    t.rect(10, 11, 3, 1, '#d9b04a');
  },
  // 6 glória: louro com estrela
  (t) => {
    for (let a = 0.6; a < 2.6; a += 0.35) {
      t.set(8 - Math.cos(a) * 6, 9 + Math.sin(a) * 4 - 3, '#78ba60');
      t.set(8 + Math.cos(a) * 6, 9 + Math.sin(a) * 4 - 3, '#78ba60');
    }
    for (const [x, y] of [[8, 3], [7, 4], [8, 4], [9, 4], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [7, 6], [8, 6], [9, 6], [6, 7], [7, 7], [9, 7], [10, 7], [6, 8], [10, 8]]) t.set(x, y, '#ffd77a');
  },
  // 7 seguir: pegadas/seta
  (t) => {
    t.rect(7, 3, 2, 10, '#bfe0ff');
    t.line(4, 7, 8, 3, '#bfe0ff');
    t.line(11, 7, 8, 3, '#bfe0ff');
    t.line(4, 8, 8, 4, '#7fa8d8');
  },
  // 8 atacar: espada para cima
  (t) => {
    t.line(8, 1, 8, 10, '#dfe6ee');
    t.line(9, 2, 9, 10, '#9aa4b0');
    t.rect(5, 10, 7, 1, '#d9b04a');
    t.rect(8, 11, 2, 3, '#8a5a32');
  },
  // 9 segurar: escudo
  (t) => {
    for (let y = 2; y < 14; y++) {
      const i = y < 9 ? 0 : y - 8;
      t.rect(3 + i, y, 10 - i * 2, 1, y < 8 ? '#9aa4b0' : '#6a7480');
    }
    t.rect(7, 3, 2, 9, '#b5483a');
    t.rect(4, 6, 8, 2, '#b5483a');
  },
  // 10 aquartelar: tenda
  (t) => {
    for (let y = 3; y < 13; y++) t.rect(8 - (y - 3) * 0.6, y, 1 + (y - 3) * 1.2, 1, y % 2 ? '#c8963c' : '#a87a2c');
    t.rect(7, 9, 2, 4, '#4f2f1a');
    t.rect(8, 1, 1, 3, '#8a5a32');
    t.rect(9, 1, 3, 2, '#b5483a');
  },
  // 11 convocar: corneta
  (t) => {
    t.line(3, 9, 10, 5, '#d9b04a');
    t.line(3, 10, 10, 6, '#b08a2c');
    t.ellipse(12, 6, 2.5, 3.5, '#d9b04a');
    t.ellipse(12, 6, 1.2, 2, '#6a4a10');
    for (const r of [3, 5]) for (let a = -0.6; a <= 0.6; a += 0.2) t.set(12 + Math.cos(a) * r + 2, 6 + Math.sin(a) * r, '#ffffff');
  },
  // 12 fechar
  (t) => {
    t.line(4, 4, 11, 11, '#ffffff');
    t.line(5, 4, 12, 11, '#ffffff');
    t.line(11, 4, 4, 11, '#ffffff');
    t.line(12, 4, 5, 11, '#ffffff');
  },
  // 13 mais
  (t) => {
    t.rect(7, 3, 2, 10, '#ffffff');
    t.rect(3, 7, 10, 2, '#ffffff');
  },
  // 14 coração
  (t) => {
    t.ellipse(5.5, 6, 3, 3, '#e04848');
    t.ellipse(10.5, 6, 3, 3, '#e04848');
    for (let y = 7; y < 13; y++) t.rect(3 + (y - 7), y, 10 - (y - 7) * 2, 1, '#e04848');
    t.rect(4, 4, 2, 2, '#ffb0b0');
  },
  // 15 caveira (campeão no mapa)
  (t) => {
    t.ellipse(8, 7, 5, 4.5, '#f3ead2');
    t.rect(5, 10, 6, 3, '#f3ead2');
    t.rect(5, 6, 2, 2, '#0b0d14');
    t.rect(9, 6, 2, 2, '#0b0d14');
    t.rect(6, 12, 1, 1, '#0b0d14');
    t.rect(9, 12, 1, 1, '#0b0d14');
  },
  // 16 cidade (mapa)
  (t) => {
    t.rect(2, 7, 12, 7, '#c0c0bc');
    for (const x of [2, 6, 10]) t.rect(x, 4, 4, 3, '#c0c0bc');
    t.rect(6, 10, 4, 4, '#4f2f1a');
    t.rect(2, 7, 12, 1, '#e6e6e0');
  },
  // 17 spot (mapa): chama dourada
  (t) => {
    t.ellipse(8, 9, 4.5, 4.5, '#ff9a2a');
    t.ellipse(8, 6, 3, 5, '#ff9a2a');
    t.ellipse(8, 9, 2.5, 3, '#ffd34a');
  },
];

export function drawUiKit({ Img, save, composite }) {
  // molduras: painel principal, painel interno (cartas, linhas) e moldura de slot
  const panel = frame(Img, ['#161b28', '#202838', '#0f131c'], GOLD);
  save('assets/ui/frame.png', panel);
  const inner = frame(Img, ['#1d2434', '#283146', '#141a26'], ['#5a6a8a', '#3a4660', '#252d40']);
  save('assets/ui/frame-inner.png', inner);
  const hl = frame(Img, ['#26324a', '#33415e', '#1a2232'], GOLD);
  save('assets/ui/frame-hl.png', hl);
  // botões: 4 cores × (normal, pressionado) numa folha 24×14 por quadro
  const colors = {
    blue: ['#6a9ae0', '#2f5fae', '#1c3a70'],
    red: ['#e07060', '#a83030', '#6a1a1a'],
    gold: ['#ffe08a', '#c8a050', '#7a5a20'],
    dark: ['#4a5470', '#2a3248', '#161b28'],
    green: ['#8ad07a', '#3e8a3a', '#1f4a1e'],
  };
  for (const [name, c] of Object.entries(colors)) {
    const img = new Img(48, 14);
    composite(img, button(Img, c, false), 0, 0);
    composite(img, button(Img, c, true), 24, 0);
    save(`assets/ui/btn-${name}.png`, img);
  }
  // barra (fundo e preenchimento) 12×8, cantos de 3
  {
    const t = new Img(12, 8);
    t.rect(0, 0, 12, 8, OUT);
    t.rect(1, 1, 10, 6, '#2a2234');
    t.rect(1, 1, 10, 1, '#3a3046');
    save('assets/ui/bar.png', t);
  }
  // ícones
  const img = new Img(16 * ICONS.length, 16);
  ICONS.forEach((draw, i) => {
    const t = new Img(16, 16);
    draw(t);
    t.outline(0, 0, 16, 16);
    composite(img, t, i * 16, 0);
  });
  save('assets/ui/icons.png', img);
}
