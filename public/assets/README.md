# Assets — layout para substituição

Todos os PNGs desta pasta são **placeholders gerados por código**
(`npm run assets` → `scripts/generate-assets.mjs`). Para usar arte final,
substitua o arquivo mantendo **o mesmo nome, tamanho de frame e ordem**.

## tilesets/vaelmor-tiles.png
Tiles 16×16, 16 colunas × 8 linhas, exportado **extrudado** (margin 1px,
spacing 2px → largura 288, altura 144). `vaelmor-tiles-preview.png` é a
mesma folha sem extrusão, só para referência visual.
Se a sua arte não for extrudada, mude em `WorldScene.buildTilemap` a chamada
`addTilesetImage('tiles', 'tiles', 16, 16, 1, 2)` para `(…, 16, 16, 0, 0)`.

| Índices | Conteúdo |
|---|---|
| 0–2 | grama do vale (3 variantes) |
| 3–5 | grama do planalto (3 variantes) |
| 6 terra (estrada) · 7 areia · 8 chão rochoso · 9 calçamento · 10 ponte · 11 escadaria · 12 chão de floresta · 13 rampa |
| 16–19 | água (4 frames de fluxo para o sul) |
| 20–23 | cachoeira (4 frames) |
| 24–27 | espuma (4 frames) |
| 28–31 | borda da queda (4 frames) |
| 32 borda do penhasco · 33 face · 34 base · 35 face com fenda |
| 48–51 flores · 52–53 arbustos · 54 pedra · 55 capim · 56 cogumelos · 57 juncos · 58 cerca H · 59 cerca V · 60 poste · 61 toco · 62 vitória-régia · 63 placa |
| 64–66 / 80–82 | copa do carvalho (3×2) |
| 67–69 / 83–85 | copa do pinheiro (3×2) |
| 70–72 / 86–88 | copa do salgueiro (3×2) |
| 96 tronco carvalho · 97 tronco pinheiro · 98 tronco salgueiro |
| 112 | marcador de colisão (não é desenhado) |

Os índices estão em `src/systems/Tiles.ts`.

## sprites/
| Arquivo | Frame | Layout |
|---|---|---|
| teren.png | 16×16 | 5 col × 4 lin. Linhas: baixo, esquerda, direita, cima. Colunas: parado, passo A, passo B, ataque; coluna 4 = 4 frames de rolagem (de cima para baixo) |
| bandit.png | 16×16 | 4 col × 4 lin (igual ao Teren, sem rolagem) |
| slime.png | 16×16 | 5 frames (pulo 0–3, 4 extra) |
| wolf.png | 16×16 | 0–1 andar, 2 agachado (preparo), 3 investida, 4 extra — olhando para a esquerda |
| sheep.png | 16×16 | 0–1 andar, 2 pastando — olhando para a esquerda |
| deer.png | 16×16 | 0–1 andar, 2 alerta, 3 correndo — olhando para a esquerda |
| bird.png | 16×16 | 3 frames de asa, visto de cima, olhando para a direita |
| torch.png | 16×16 | 0 apagada, 1–3 chama |
| flame.png | 16×16 | 3 frames, apontando para a direita |
| slash.png | 32×32 | 3 frames de arco, apontando para a direita |
| explosion.png | 32×32 | 5 frames |
| splash.png | 8×8 | 3 frames |
| ui-icons.png | 16×16 | golpe, esquiva, chama, coração |
| glow.png, fog.png, pixel.png, raindrop.png, shadow.png | imagem única | luz radial, neblina tileável, partícula, gota, sombra |

## tiles/
`house-*.png`: 48×48, 2 frames (janelas apagadas / acesas). `well.png`: 32×32.
