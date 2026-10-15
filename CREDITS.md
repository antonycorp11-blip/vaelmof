# Créditos e licenças

## Arte (placeholder)

Durante o desenvolvimento deste protótipo o ambiente de build **não tinha
acesso a kenney.nl nem a opengameart.org** (as requisições foram bloqueadas
pela política de rede). Por isso **nenhum asset de terceiros foi baixado ou
incluído**.

Todos os gráficos em `public/assets/` e `public/icons/` foram **gerados
proceduralmente** por `scripts/generate-assets.mjs` (código próprio deste
repositório), numa grade 16×16 e com uma paleta única definida em `PAL`.

| Asset | Fonte | Licença |
|---|---|---|
| `public/assets/tilesets/*` | gerado por `scripts/generate-assets.mjs` | mesma do repositório |
| `public/assets/sprites/*` | gerado por `scripts/generate-assets.mjs` | mesma do repositório |
| `public/assets/tiles/*` | gerado por `scripts/generate-assets.mjs` | mesma do repositório |
| `public/icons/*` | gerado por `scripts/generate-assets.mjs` | mesma do repositório |
| `public/assets/sprites/outfit-*.png`, `wpn-*.png`, `armor-icons.png` e `public/assets/skins/*` (herói, soldados, mercadores, coletores) | peças LPC montadas por `scripts/chars/build.py` (ver abaixo e `CREDITS-LPC.md`) | CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 |
| `public/assets/sprites/wraith.png` | arte conceitual do autor do jogo, animada por `scripts/wraith/build.py` | mesma do repositório |

### Substituição sugerida (licença livre)

Para a arte final, as fontes recomendadas são:

- **Kenney — Tiny Town** (https://kenney.nl/assets/tiny-town) — CC0 1.0
- **Kenney — Tiny Dungeon** (https://kenney.nl/assets/tiny-dungeon) — CC0 1.0
- **Kenney — Roguelike/RPG Pack** (https://kenney.nl/assets/roguelike-rpg-pack) — CC0 1.0
- **OpenGameArt** (https://opengameart.org) — verificar a licença de cada pacote (CC0, CC-BY, CC-BY-SA, OGA-BY…)

Ao trocar um arquivo, registre aqui: nome do pacote, autor, URL e licença
(e a atribuição exigida, se houver). O layout esperado de cada arquivo está
em `public/assets/README.md`.

## Personagens — Liberated Pixel Cup (LPC)

O herói, os soldados de cada povo, os mercadores e os coletores são montados
por `scripts/chars/build.py` a partir das peças do **Universal LPC Spritesheet
Character Generator**
(https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator),
baixadas sob demanda (clone esparso) e recoloridas pelas paletas do próprio
projeto. Receitas: `scripts/chars/recipes.py`.

Cada peça pode ser usada sob **qualquer uma** das licenças listadas
(CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0, CC-BY 4.0… conforme a peça); todas exigem
atribuição aos autores. Obras derivadas (os spritesheets gerados
`outfit-*.png`, `wpn-*.png`, `armor-icons.png` e `public/assets/skins/*`)
seguem a licença da peça (CC-BY-SA: compartilhar pela mesma licença).

**A lista completa de peças, autores, licenças e fontes está em
[`CREDITS-LPC.md`](CREDITS-LPC.md)** (gerada pelo mesmo script).

## Código e bibliotecas

| Item | Licença |
|---|---|
| [Phaser 3](https://phaser.io) (3.90.0) | MIT |
| [Vite](https://vitejs.dev) | MIT |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 |

## Fontes tipográficas

| Fonte | Onde | Autor | Licença |
|---|---|---|---|
| [Tiny5](https://fonts.google.com/specimen/Tiny5) (subconjunto latino) | `public/fonts/tiny5-latin.woff2` — toda a interface | The Tiny5 Project Authors (Stefano Gissi) | SIL Open Font License 1.1 (`public/fonts/OFL-tiny5.txt`) |

As molduras, botões, barras e ícones da interface são originais, gerados por
`scripts/ui-art.mjs`.
