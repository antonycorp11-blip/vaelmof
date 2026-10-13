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
| `public/assets/sprites/hero.png`, `hero-slash.png` | camadas LPC montadas por `scripts/hero/build.py` (ver abaixo) | CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 |
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

## Teren — Liberated Pixel Cup (LPC)

O herói é montado a partir de camadas do **Universal LPC Spritesheet Character
Generator** (https://github.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator),
copiadas para `scripts/hero/layers/` (só as peças usadas, recortadas na folha
universal). Receita: `scripts/hero/recipe.json`.

Cada peça pode ser usada sob **qualquer uma** das licenças listadas
(CC-BY-SA 3.0, GPL 3.0 ou OGA-BY 3.0, conforme a peça); todas exigem
atribuição aos autores abaixo. Obras derivadas desta arte (ex.: os
spritesheets gerados `hero.png` e `hero-slash.png`) seguem a mesma licença da
peça (CC-BY-SA: compartilhar pela mesma licença).

| Peça | Arquivo LPC | Autores | Licenças | Fonte |
|---|---|---|---|---|
| capa (atrás) | `cape/solid_behind/forest.png` | Nila122, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| espada (atrás) | `weapon/sword/arming/universal/bg/steel.png` | ElizaWy; walk and down by JaidynReiman | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Props/Sword%2001%20-%20Arming%20Sword |
| corpo | `body/bodies/male/light.png` | bluecarrot16, Benjamin K. Smith (BenCreating), Evert, Eliza Wyatt (ElizaWy), TheraHedwig, MuffinElZangano, Durrani, Johannes Sj?lund (wulax), Stephen Challener (Redshrike) | CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| calça | `legs/pants/male/brown.png` | bluecarrot16, JaidynReiman, ElizaWy, Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, GPL 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| botas | `feet/boots/male/brown.png` | bluecarrot16, Nila122 | OGA-BY 3.0, CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-clothes-and-hair |
| camisa | `torso/clothes/longsleeve/longsleeve/male/white.png` | JaidynReiman, Johannes Sjölund (wulax) | CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| colete de couro | `torso/armour/leather/male/brown.png` | Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| ombreiras | `shoulders/leather/male/brown.png` | Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| cinto | `torso/waist/belt_leather/male/brown.png` | bluecarrot16, Johannes Sjölund (wulax), Matthew Krohn (makrohn) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-combat-armor-for-women |
| capa (frente) | `cape/solid/female/forest.png` | bluecarrot16, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| laço da capa | `neck/capetie/male/brown.png` | bluecarrot16, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| cabeça | `head/heads/human/male/light.png` | bluecarrot16, Benjamin K. Smith (BenCreating), Stephen Challener (Redshrike) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| olhos | `eyes/human/adult/green.png` | JaidynReiman, Matthew Krohn (makrohn), Stephen Challener (Redshrike) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| nariz | `head/nose/straight/adult/light.png` | Thane Brimhall (pennomi), Matthew Krohn (makrohn) | GPL 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-base-character-expressions |
| sobrancelhas | `eyes/eyebrows/thick/adult/dark_brown.png` | ElizaWy | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Hair |
| cabelo | `hair/messy2/male/dark_brown.png` | Manuel Riecke (MrBeast) | CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| espada (frente) | `weapon/sword/arming/universal/fg/steel.png` | ElizaWy; walk and down by JaidynReiman | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Props/Sword%2001%20-%20Arming%20Sword |
| espada no golpe (atrás) | `weapon/sword/arming/attack_slash/bg/steel.png` | ElizaWy; walk and down by JaidynReiman | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Props/Sword%2001%20-%20Arming%20Sword |
| espada no golpe (frente) | `weapon/sword/arming/attack_slash/fg/steel.png` | ElizaWy; walk and down by JaidynReiman | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Props/Sword%2001%20-%20Arming%20Sword |

## Código e bibliotecas

| Item | Licença |
|---|---|
| [Phaser 3](https://phaser.io) (3.90.0) | MIT |
| [Vite](https://vitejs.dev) | MIT |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 |

## Fontes tipográficas

O HUD usa a fonte `monospace` do sistema; nenhuma fonte é distribuída.
