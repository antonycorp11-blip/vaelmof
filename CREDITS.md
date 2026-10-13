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
| `public/assets/hero/*` | gerado por `scripts/hero/` (modelo 3D procedural → pixel art) | mesma do repositório |

### Substituição sugerida (licença livre)

Para a arte final, as fontes recomendadas são:

- **Kenney — Tiny Town** (https://kenney.nl/assets/tiny-town) — CC0 1.0
- **Kenney — Tiny Dungeon** (https://kenney.nl/assets/tiny-dungeon) — CC0 1.0
- **Kenney — Roguelike/RPG Pack** (https://kenney.nl/assets/roguelike-rpg-pack) — CC0 1.0
- **OpenGameArt** (https://opengameart.org) — verificar a licença de cada pacote (CC0, CC-BY, CC-BY-SA, OGA-BY…)

Ao trocar um arquivo, registre aqui: nome do pacote, autor, URL e licença
(e a atribuição exigida, se houver). O layout esperado de cada arquivo está
em `public/assets/README.md`.

## Código e bibliotecas

| Item | Licença |
|---|---|
| [Phaser 3](https://phaser.io) (3.90.0) | MIT |
| [Vite](https://vitejs.dev) | MIT |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 |

## Fontes tipográficas

O HUD usa a fonte `monospace` do sistema; nenhuma fonte é distribuída.
