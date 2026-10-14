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
| `public/assets/sprites/outfit-*.png`, `wpn-*.png`, `armor-icons.png` (trajes, armas e retratos) | camadas LPC montadas por `scripts/hero/build.py` (ver abaixo) | CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 |
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
spritesheets gerados `outfit-*.png` e `wpn-*.png`) seguem a mesma licença da
peça (CC-BY-SA: compartilhar pela mesma licença).

| Peça | Onde | Arquivo LPC | Autores | Licenças | Fonte |
|---|---|---|---|---|---|
| corpo | base | `body/bodies/male/light.png` | bluecarrot16, Benjamin K. Smith (BenCreating), Evert, Eliza Wyatt (ElizaWy), TheraHedwig, MuffinElZangano, Durrani, Johannes Sj?lund (wulax), Stephen Challener (Redshrike) | CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| cabeça | base | `head/heads/human/male/light.png` | bluecarrot16, Benjamin K. Smith (BenCreating), Stephen Challener (Redshrike) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| olhos | base | `eyes/human/adult/green.png` | JaidynReiman, Matthew Krohn (makrohn), Stephen Challener (Redshrike) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| nariz | base | `head/nose/straight/adult/light.png` | Thane Brimhall (pennomi), Matthew Krohn (makrohn) | GPL 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-base-character-expressions |
| sobrancelhas | base | `eyes/eyebrows/thick/adult/dark_brown.png` | ElizaWy | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Hair |
| cabelo | base | `hair/messy2/male/dark_brown.png` | Manuel Riecke (MrBeast) | CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| capa (atrás) | Traje do Andarilho | `cape/solid_behind/forest.png` | Nila122, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| calça | Traje do Andarilho | `legs/pants/male/brown.png` | bluecarrot16, JaidynReiman, ElizaWy, Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, GPL 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| botas | Traje do Andarilho | `feet/boots/male/brown.png` | bluecarrot16, Nila122 | OGA-BY 3.0, CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-clothes-and-hair |
| camisa | Traje do Andarilho | `torso/clothes/longsleeve/longsleeve/male/white.png` | JaidynReiman, Johannes Sjölund (wulax) | CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| colete de couro | Traje do Andarilho | `torso/armour/leather/male/brown.png` | Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| ombreiras | Traje do Andarilho | `shoulders/leather/male/brown.png` | Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| cinto | Traje do Andarilho | `torso/waist/belt_leather/male/brown.png` | bluecarrot16, Johannes Sjölund (wulax), Matthew Krohn (makrohn) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-combat-armor-for-women |
| capa (frente) | Traje do Andarilho | `cape/solid/female/forest.png` | bluecarrot16, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| laço da capa | Traje do Andarilho | `neck/capetie/male/brown.png` | bluecarrot16, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| botas de placas | Armadura de Placas | `feet/armour/plate/male/steel.png` | Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| grevas | Armadura de Placas | `legs/armour/plate/male/steel.png` | bluecarrot16, Michael Whitlock (bigbeargames), Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| camisa | Armadura de Placas | `torso/clothes/longsleeve/longsleeve/male/charcoal.png` | JaidynReiman, Johannes Sjölund (wulax) | CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| peitoral de placas | Armadura de Placas | `torso/armour/plate/male/steel.png` |  recolor by bigbeargames |  color reduced to 7 colors and adapted to v3 bases by bluecarrot16 |  run/jump/sit/climb/revised combat by JaidynReiman |
| braçais de placas | Armadura de Placas | `arms/armour/plate/male/steel.png` | Michael Whitlock (bigbeargames), Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| ombreiras de placas | Armadura de Placas | `shoulders/plate/male/steel.png` | bluecarrot16, Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| grande-elmo | Armadura de Placas | `hat/helmet/greathelm/male/steel.png` | bluecarrot16 | OGA-BY 3.0, CC-BY 3.0, CC-BY 4.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-helmets |
| sandálias | Armadura Legionária | `feet/sandals/male/brown.png` | Nila122, JaidynReiman, Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-roman-armor |
| saiote legionário | Armadura Legionária | `legs/skirts/legion/male/maroon.png` | bluecarrot16, Nila122 | OGA-BY 3.0, CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-roman-armor |
| couraça legionária | Armadura Legionária | `torso/armour/legion/male/bronze.png` | JaidynReiman, bluecarrot16, Nila122 | OGA-BY 3.0, CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-roman-armor |
| ombreiras legionárias | Armadura Legionária | `shoulders/legion/male/bronze.png` | Nila122 | OGA-BY 3.0, CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-roman-armor |
| braçadeiras de bronze | Armadura Legionária | `arms/bracers/male/bronze.png` | Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| elmo legionário | Armadura Legionária | `hat/helmet/legion/adult/bronze.png` | bluecarrot16, Nila122, JaidynReiman, Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-roman-armor |
| penacho | Armadura Legionária | `hat/accessory/plumage_legion/adult/maroon.png` | bluecarrot16, Nila122, JaidynReiman, Matthew Krohn (makrohn), Johannes Sjölund (wulax) | CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-roman-armor |
| capa arcana (atrás) | Vestes Arcanas | `cape/solid_behind/purple.png` | Nila122, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| calça | Vestes Arcanas | `legs/leggings/male/navy.png` | ElizaWy, JaidynReiman, Bluecarrot16 | OGA-BY 3.0, GPL 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Clothing |
| botas | Vestes Arcanas | `feet/boots/male/black.png` | bluecarrot16, Nila122 | OGA-BY 3.0, CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-clothes-and-hair |
| túnica | Vestes Arcanas | `torso/clothes/longsleeve/longsleeve/male/navy.png` | JaidynReiman, Johannes Sjölund (wulax) | CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| tabardo arcano | Vestes Arcanas | `torso/jacket/tabard/male/purple.png` | bluecarrot16, Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| faixa | Vestes Arcanas | `torso/waist/sash/male/charcoal.png` | bluecarrot16, Nila122 | OGA-BY 3.0, GPL 2.0, GPL 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/more-lpc-clothes-and-hair |
| capa arcana | Vestes Arcanas | `cape/solid/female/purple.png` | bluecarrot16, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| chapéu de mago | Vestes Arcanas | `hat/magic/wizard/base/adult/purple.png` | Michael Whitlock (bigbeargames), Tuomo Untinen (reemax), JaidynReiman | CC-BY-SA 3.0, GPL 2.0, GPL 3.0 | https://opengameart.org/content/lpc-items-and-game-effects |
| capa rasgada (atrás) | Couraça do Caçador | `cape/tattered_behind/forest.png` | Nila122, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| calça | Couraça do Caçador | `legs/pants/male/forest.png` | bluecarrot16, JaidynReiman, ElizaWy, Matthew Krohn (makrohn), Johannes Sjölund (wulax) | OGA-BY 3.0, GPL 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles |
| couraça escura | Couraça do Caçador | `torso/armour/leather/male/black.png` | Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| capa rasgada | Couraça do Caçador | `cape/tattered/female/forest.png` | Nila122, JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-curly-hair-elven-ears-white-cape-with-blue-trim-and-more |
| capuz | Couraça do Caçador | `hat/cloth/hood/adult/forest.png` | Johannes Sjölund (wulax),JaidynReiman | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| espada (atrás) | Espada | `weapon/sword/arming/universal/bg/steel.png` | ElizaWy; walk and down by JaidynReiman | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Props/Sword%2001%20-%20Arming%20Sword |
| espada (frente) | Espada | `weapon/sword/arming/universal/fg/steel.png` | ElizaWy; walk and down by JaidynReiman | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Props/Sword%2001%20-%20Arming%20Sword |
| espada no golpe (atrás) | Espada | `weapon/sword/arming/attack_slash/bg/steel.png` | ElizaWy; walk and down by JaidynReiman | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Props/Sword%2001%20-%20Arming%20Sword |
| espada no golpe (frente) | Espada | `weapon/sword/arming/attack_slash/fg/steel.png` | ElizaWy; walk and down by JaidynReiman | OGA-BY 3.0 | https://github.com/ElizaWy/LPC/tree/main/Characters/Props/Sword%2001%20-%20Arming%20Sword |
| montante (atrás) | Montante | `weapon/sword/longsword/universal_behind/longsword.png` | Johannes Sjölund (wulax), bluecarrot16 | OGA-BY 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| montante | Montante | `weapon/sword/longsword/longsword.png` | Johannes Sjölund (wulax), bluecarrot16 | OGA-BY 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| montante no golpe (atrás) | Montante | `weapon/sword/longsword/attack_slash/behind/longsword.png` | Johannes Sjölund (wulax), bluecarrot16 | OGA-BY 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| montante no golpe | Montante | `weapon/sword/longsword/attack_slash/longsword.png` | Johannes Sjölund (wulax), bluecarrot16 | OGA-BY 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| montante no golpe reverso (atrás) | Montante | `weapon/sword/longsword/attack_slash_reverse/behind/longsword.png` | Johannes Sjölund (wulax), bluecarrot16 | OGA-BY 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| montante no golpe reverso | Montante | `weapon/sword/longsword/attack_slash_reverse/longsword.png` | Johannes Sjölund (wulax), bluecarrot16 | OGA-BY 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| montante na estocada (atrás) | Montante | `weapon/sword/longsword/attack_thrust/behind/longsword.png` | Johannes Sjölund (wulax), bluecarrot16 | OGA-BY 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| montante na estocada | Montante | `weapon/sword/longsword/attack_thrust/longsword.png` | Johannes Sjölund (wulax), bluecarrot16 | OGA-BY 3.0, CC-BY-SA 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| cajado (atrás) | Cajado | `weapon/magic/gnarled/universal/background/gnarled.png` | bluecarrot16 | OGA-BY 3.0+, GPL 3.0, CC-BY 4.0 | https://opengameart.org/content/lpc-more-weapons |
| cajado | Cajado | `weapon/magic/gnarled/universal/foreground/gnarled.png` | bluecarrot16 | OGA-BY 3.0+, GPL 3.0, CC-BY 4.0 | https://opengameart.org/content/lpc-more-weapons |
| cajado no ataque (atrás) | Cajado | `weapon/magic/gnarled/thrust/background/gnarled.png` | bluecarrot16 | OGA-BY 3.0+, GPL 3.0, CC-BY 4.0 | https://opengameart.org/content/lpc-more-weapons |
| cajado no ataque | Cajado | `weapon/magic/gnarled/thrust/foreground/gnarled.png` | bluecarrot16 | OGA-BY 3.0+, GPL 3.0, CC-BY 4.0 | https://opengameart.org/content/lpc-more-weapons |
| aljava | Arco | `quiver/quiver.png` | Johannes Sjölund (wulax) | CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| arco (atrás) | Arco | `weapon/ranged/bow/normal/universal/background/normal.png` |  walk animations by pvigier |  split into layers and tweaked for v3 character bases by bluecarrot16. pvigier has agreed to license this sheet as OGA-BY 3.0+. | Johannes Sjölund (wulax), Pierre Vigier (pvigier) |
| arco | Arco | `weapon/ranged/bow/normal/universal/foreground/normal.png` |  walk animations by pvigier |  split into layers and tweaked for v3 character bases by bluecarrot16. pvigier has agreed to license this sheet as OGA-BY 3.0+. | Johannes Sjölund (wulax), Pierre Vigier (pvigier) |
| flecha | Arco | `weapon/ranged/bow/arrow/arrow.png` | Johannes Sjölund (wulax) | OGA-BY 3.0, CC-BY-SA 3.0, GPL 3.0 | https://opengameart.org/content/lpc-medieval-fantasy-character-sprites |
| arco andando (atrás) | Arco | `weapon/ranged/bow/normal/walk/background/normal.png` |  walk animations by pvigier |  split into layers and tweaked for v3 character bases by bluecarrot16. pvigier has agreed to license this sheet as OGA-BY 3.0+. | Johannes Sjölund (wulax), Pierre Vigier (pvigier) |
| arco andando | Arco | `weapon/ranged/bow/normal/walk/foreground/normal.png` |  walk animations by pvigier |  split into layers and tweaked for v3 character bases by bluecarrot16. pvigier has agreed to license this sheet as OGA-BY 3.0+. | Johannes Sjölund (wulax), Pierre Vigier (pvigier) |

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
