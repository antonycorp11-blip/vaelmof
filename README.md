# Vaelmor

Protótipo jogável de um jogo 2D top-down em pixel art 16×16 que roda 100% no
navegador, como PWA para celular em modo paisagem. Feito com **TypeScript +
Vite + Phaser 3** (sem Godot).

O foco é o **mundo vivo** e a jogabilidade básica: Teren explora o vale do
Rio Serro, entre as vilas de Brumavale e Pedrafria, com fauna, inimigos, ciclo
de dia e noite e clima. Não há história, diálogos, menus, save, economia nem
música.

---

## Como rodar localmente

Requisitos: Node.js 18+ (testado com Node 22) e npm.

```bash
npm install
npm run dev        # servidor de desenvolvimento em http://localhost:5173 (também exposto na rede local)
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o dist/ em http://localhost:4173 (com service worker)
```

Para testar no celular durante o desenvolvimento, abra no aparelho o endereço
de rede que o `npm run dev` mostra (ex.: `http://192.168.0.10:5173`), com
celular e computador na mesma rede Wi-Fi. O service worker só é registrado no
build de produção (`npm run preview` ou deploy).

`npm run assets` regera todos os PNGs (mapa, inimigos e herói); `npm run hero` regera só o Teren (já estão versionados; só é
preciso rodar se você alterar `scripts/generate-assets.mjs`).

### Controles

| Ação | Toque | Teclado |
|---|---|---|
| Mover | joystick flutuante na metade esquerda da tela (analógico) | WASD ou setas |
| Ataque da arma (golpe / raio / flecha) | botão grande (segurar repete) | J (segurar repete) |
| Esquiva | botão **ESQUIVA** | K |
| Habilidade da arma | terceiro botão (muda com a arma) | L |
| Coletar recurso | botão **COLETAR** (aparece perto de árvore, pedra, cristal…; segurar repete) | E |
| Mirar (arco, cajado, habilidades) | automático no inimigo mais próximo; **segure e arraste** o botão para mirar à mão (linha pontilhada) — a habilidade sai ao soltar | mouse (mira para onde ele aponta) |
| Trocar de arma / armadura | na **MOCHILA** (botão de classe ou MOCHILA na barra do topo): toque no item → EQUIPAR | Q (próxima arma) |
| Mochila | botão **MOCHILA** na barra do topo | — |

Os botões aparecem em aparelhos com toque (ou ao primeiro toque na tela).
Em desktop sem toque, use `?touch=1` para exibi-los.

### Parâmetros de URL (para teste)

| Parâmetro | Efeito | Exemplo |
|---|---|---|
| `cycle` | duração do dia em segundos (padrão 600 = 10 min) | `?cycle=60` |
| `time` | hora inicial como fração do dia (0 = meia-noite, 0.5 = meio-dia; padrão 0.36 ≈ 08:40) | `?time=0.8` |
| `weather` | fixa o clima: `clear`, `rain` ou `fog` | `?weather=rain` |
| `seed` | semente do gerador do mapa (padrão 1337) | `?seed=42` |
| `touch=1` | força os controles de toque | `?touch=1` |
| `debug` | mostra FPS/contagem de objetos e expõe `window.vaelmor` | `?debug=1` |

Exemplo para ver a noite chuvosa rapidamente: `http://localhost:5173/?time=0.9&weather=rain`.

---

## O que foi implementado

### Mundo e biomas (`src/systems/WorldGenerator.ts`)
- Mundo de **480×480 tiles** (≈ 7.700 px de lado) com **cinco biomas** em volta
  do vale original, que fica no centro-norte como o coração de Greenland.
  As fronteiras são deformadas por ruído e a luz, o clima e as partículas
  mudam suavemente ao cruzá-las. Cada bioma tem **fauna e inimigos próprios**
  (≈ 450 criaturas no mundo):
  - **Greenland** (oeste e em volta do vale): florestas densas de carvalhos
    antigos, carvalhos, pinheiros e salgueiros, um **grande rio** descendo das
    montanhas de neve com **lagoas** pelo caminho (e um segundo rio a leste do
    vale), samambaias, flores grandes; **javalis** (investida), raposas,
    cervos, lobos, limos e bandoleiros.
  - **Snowland** (norte): neve **constante**, luz fria e mais escura,
    **pinheiros altíssimos** nevados (copa 3×3), lagos e rios **congelados**
    (gelo andável), montanhas nevadas com paredão, pedras com neve, arbustos
    congelados, cristais de gelo; **ursos-polares** (erguem-se e esmagam o
    chão), lebres-da-neve, lobos-da-neve, cervos claros e Errantes.
  - **Blockland** (leste): chão de pedra, cascalho e capim seco, **blocos de
    pedra** em aglomerados, muitas montanhas, quase sem vegetação, um único
    riacho, veios de minério; **golens de pedra** (lentos, resistentes ao
    empurrão, esmagam), cabras-montesas, limos de pedra e bandoleiros.
  - **Blackland** (sudeste): terra arrasada de cinzas e obsidiana, muito
    escura, rachaduras em brasa, **cristais** roxos e ciano que **brilham**,
    árvores de cristal e árvores mortas, fungos luminosos, espinheiros, ossos,
    poças do vazio; cinzas caindo e brasas subindo; **aranhas de cristal**
    (saltam no herói), muitos Errantes e limos do vazio.
  - **Dustland** (sul): dunas, arenito, mesas com paredões em camadas,
    cactos, arbustos secos, crânios, vento de areia e **oásis** com palmeiras
    — o Rio Serro atravessa o deserto e morre num oásis; **escorpiões**
    (ferroada rápida), lagartos, bandoleiros, limos de areia e lobos do deserto.
- Montanhas: manchas grandes de ruído viram **maciços** intransponíveis; as
  duas fileiras de baixo de cada maciço são o paredão (arte própria por bioma).
- Só uma **janela** de 72×48 tiles em volta da câmera vira tilemap; o mundo
  inteiro fica em arrays compactos (`src/systems/TileWindow.ts`) e a colisão é
  resolvida direto nesses arrays (`src/systems/TileCollision.ts`). Assim o
  mundo pode crescer sem criar milhões de objetos no celular.
- Arte de todos os biomas gerada por código em `scripts/generate-assets.mjs`
  (linhas 8–15 do tileset), no mesmo estilo do resto do mapa.

### Vale de Vaelmor (`src/systems/MapGenerator.ts`)
- O vale original, **120×120 tiles** gerado por código com ruído de valor/fbm
  (determinístico pela seed), em **6 camadas de tilemap**: chão, água,
  penhascos, decoração, copas (acima das entidades) e colisão (invisível).
- **Planalto ao norte** e **vale ao sul**, separados por uma escarpa contínua
  de penhascos (3 tiles: borda, face, base) que **bloqueia o movimento**.
  Só há **duas passagens**: uma escadaria de pedra (a estrada para Pedrafria)
  e uma rampa de terra a oeste.
- **Rio Serro**: nasce num lago no topo do mapa, desce pelo planalto (mais
  estreito), despenca na **Queda do Serro** — cachoeira animada de 4 frames
  com espuma animada e névoa de partículas na base — e atravessa o vale de
  norte a sul. A água tem **animação de fluxo** (4 frames, ondas descendo para
  o sul) e margens de areia com juncos e vitórias-régias.
- **Árvores em 3 variantes**: carvalho (vale, concentrado em manchas de
  floresta), pinheiro (planalto, mais denso na encosta perto da escarpa) e
  salgueiro (2–4 tiles da margem do rio). **Tronco com colisão**, copa 3×2
  sem colisão desenhada acima do jogador.
- **Brumavale** (margem leste do rio, início do jogo) e **Pedrafria** (na
  encosta do planalto, logo acima da escadaria): 5 casas cada, praça de
  calçamento, cercas simples, tochas e um poço em Brumavale. Ligadas por uma
  **estrada de terra** que sobe a escadaria. Uma segunda estrada cruza o rio
  por uma ponte e sobe a rampa oeste; uma trilha leva ao mirante da queda.
- Flores (4 cores), arbustos (com e sem frutas), pedras, capim alto,
  cogumelos, tocos e placas como decoração.
- Ao entrar numa vila, perto da queda ou num bioma novo, o nome aparece na tela.

### Coleta e mochila (`src/systems/Gathering.ts`, `src/systems/Inventory.ts`)
- **Todo recurso do mapa é coletável**: árvores, pedras, blocos, minério,
  cristais, gelo, cactos, arbustos (frutas e fibra). Perto de um, aparece o
  botão **COLETAR** e um marcador no recurso; cada golpe rende um pouco.
- O item depende do tipo **e da região**: *Madeira de Greenland*, *Madeira
  de Snowland* (pinheiro nevado), *Pedra de Blockland*, *Cristal de
  Blackland*, *Fibra de Dustland*… (`src/data/items.ts`) — as receitas de
  craft vão pedir o material específico de cada região.
- Recursos se esgotam (árvore vira toco, pedra some) e voltam depois de
  2,5 min, quando o herói estiver longe.
- **Mochila** no estilo Albion (sem slots de equipamento por enquanto):
  48 espaços, pilhas de 999, peso total (máx. 300 kg; acima disso Teren fica
  mais lento).

### Debug (botão **DEBUG** na barra do topo, ao centro)
- Teleporte para o coração de cada bioma (Vale, Greenland, Snowland,
  Blockland, Blackland, Dustland).
- **MAPA**: o mundo inteiro (1 px por tile) com a posição do herói; **tocar
  no mapa leva o herói para aquele ponto** (ou para o chão livre mais
  próximo).
- **Voo** (atravessa montanhas, água e árvores, 3× mais rápido),
  **Invencível**, **Dia** e **Noite**.
- Mostra o bioma atual, o tile e o FPS.

### Vida
- **Ovelhas** (13, em rebanhos perto de Brumavale) e **cervos** (11, nas
  florestas e no planalto) vagam aleatoriamente perto de seu ponto de origem
  e **fogem** quando o jogador se aproxima (cervos percebem de mais longe e
  correm mais rápido); contornam obstáculos ao fugir.
- **Pássaros** (7) sobrevoam o mapa em trajetos levemente ondulados, com
  sombra no chão e sem colisão; ao sair do mapa reaparecem numa borda.

### Teren (`src/entities/Player.ts`)
- **Humano**, aventureiro de cabelo escuro bagunçado, olhos verdes, camisa
  branca, colete e ombreiras de couro, capa verde, botas e espada de aço.
- Montado em **camadas LPC** (Liberated Pixel Cup — pixel art feita por
  artistas, ver `CREDITS.md`) por `scripts/hero/build.py`, a partir da receita
  `scripts/hero/recipe.json`: corpo, cabeça, olhos, nariz, sobrancelhas,
  cabelo, roupa, capa e espada, cada um numa linha. Trocar uma linha troca a
  peça em **todas** as animações — é a base para equipar armaduras e armas.
- Animações de arte: andar (8 quadros), golpe com espada (quadros 128×128 com
  o rastro da lâmina), magia e queda, nas 4 direções. O código cuida do resto:
  tempo de cada quadro sincronizado com o impacto, avanço no golpe, giro de
  360° no finalizador, poeira nos passos, disparada com rastro na esquiva,
  recuo ao tomar dano. Exibido a 0,44× (~22 px do mundo, 1,4 tile).
- Movimento com **aceleração e frenagem suaves**, joystick analógico (direção
  livre) e cadência dos passos casada com a velocidade real (os pés não
  deslizam).
- Sem tremor: câmera com **zoom inteiro** (cada pixel da arte vira N pixels da
  tela), herói com escala que dá um número inteiro de pixels de tela por pixel
  da arte e física em **passo variável** (telas de 120 Hz do iPhone com física
  fixa em 60 Hz faziam o herói andar aos trancos contra a câmera).
- Movimento em **8 direções** (o joystick é analógico na intensidade, mas a
  direção é quantizada em 45°). Velocidade em `PLAYER.speed` (`src/config.ts`).
- **HP 10** com barra segmentada no HUD; pisca e fica invulnerável por 0,9 s
  após tomar dano. Ao morrer, volta a Brumavale com HP cheio.
- **Camadas**: o herói são 4 sprites sincronizados — fundo do traje (capa),
  arma atrás, corpo com traje/armadura, arma na frente —, então **qualquer
  armadura combina com qualquer arma**. As folhas de cada traje/arma são
  carregadas só quando equipadas (poupa memória no celular).
- **Armaduras completas** (corpo inteiro, sem peças separadas):

  | Armadura | Defesa | Velocidade | Bônus |
  |---|---|---|---|
  | Traje do Andarilho (couro leve, capa verde) | 10% | — | — |
  | Armadura de Placas (aço, grande-elmo) | 45% | −12% | — |
  | Armadura Legionária (bronze, saiote, penacho) | 30% | −5% | — |
  | Vestes Arcanas (chapéu de mago, tabardo, capa) | 0% | — | habilidades recarregam 30% mais rápido |
  | Couraça do Caçador (capuz, couro escuro, capa rasgada) | 15% | +6% | esquiva recarrega 25% antes |

  Defesa = parte do dano absorvida (mínimo 1 de dano).
- **Mira**: arco, cajado e habilidades miram sozinhos no inimigo mais próximo
  (marcado com um retículo vermelho); arrastar o botão mira à mão; no desktop,
  o mouse mira. **Andando, arco e cajado disparam sem parar** (o herói segue
  andando); parado, toca a animação completa do tiro.
- **A arma define a classe** (como no Albion — não há classe fixa): troque
  de arma no botão de classe da barra do topo (ou Q / 1–4). Cada arma tem
  folha de sprites, combo e habilidade próprios (`src/data/weapons.ts`):

  | Arma | Classe | Ataque | Habilidade |
  |---|---|---|---|
  | Espada | Guerreiro | corte descendente → corte ascendente → giro de 360° | **Investida** (avança cortando) |
  | Montante | Guerreiro pesado | corte → corte reverso → estocada longa (lento, dano alto, alcance maior) | **Giro** de 360° |
  | Cajado | Mago | **Raio** arcano (projétil) | **Chama** (explode em área) |
  | Arco | Arqueiro | **Flecha** (rápida, longe) | **Tiro triplo** (3 flechas que atravessam) |

  O dano sai no quadro em que a lâmina passa ou o disparo acontece; apertar de
  novo no fim do golpe encadeia o combo; a habilidade pode interromper o golpe.
- **Esquiva**: disparada de 260 ms com **invulnerabilidade**, passos
  acelerados, rastro de imagens e poeira; cooldown de 650 ms.
- **Chama** (habilidade do cajado): projétil que explode ao tocar um inimigo, um obstáculo ou no fim
  do alcance, causando **dano 3 em área** (raio 30 px); cooldown longo de
  4 s. Atravessa a água (é possível atingir inimigos do outro lado do rio) e
  ilumina o caminho à noite.
- Entradas têm buffer de 200 ms (toques rápidos não se perdem) e os botões
  mostram o cooldown como um setor escurecido.

### Inimigos (`src/entities/`)
- **Limo** (HP 4): fica quicando; ao entrar no raio de detecção (88 px)
  persegue o jogador aos pulos. **Dano por contato** (1).
- **Lobo** (HP 6): patrulha; ao avistar (112 px) se aproxima, **agacha e pisca
  em vermelho** como aviso e dá uma **investida** rápida (dano 2 no contato
  durante o bote), depois se recupera.
- **Bandoleiro** (HP 8): patrulha estradas e arredores; ao detectar (118 px)
  mostra "!", persegue e **ataca de perto** com adaga: ergue a lâmina e pisca
  (aviso), dá um passo e corta (dano 2 no quadro de impacto).
- **Errante** (HP 6): ser encapuzado de outra dimensão (a arte conceitual do
  antigo herói, animada por `scripts/wraith/build.py`) que vaga pelas
  florestas fechadas. Flutua meio translúcido; ao notar o herói (110 px, mais
  à noite) se aproxima, **para e acende os olhos** (aviso) e avança num toque
  gélido (dano 2), depois recua quase invisível. À noite os olhos brilham.
- Todos têm HP (barra aparece quando feridos), recebem dano do golpe e da
  chama, **piscam em branco** ao serem atingidos, sofrem knockback e têm
  **animação de morte** (achatamento + partículas). Renascem no ponto de
  origem após 45 s se o jogador estiver longe.
- Quantidade: 11 limos, 8 lobos, 7 bandoleiros, 6 errantes. Um de cada fica a poucos
  passos de Brumavale para teste rápido.

### Controles mobile e teclado (`src/input/`)
- Joystick flutuante: aparece onde o polegar toca na metade esquerda; se o
  dedo passa do limite, a base acompanha. Em repouso fica visível em
  baixa opacidade no canto inferior esquerdo.
- Três botões redondos à direita: **GOLPE 88 px**, **ESQUIVA 68 px** e
  **CHAMA 68 px** de diâmetro (mínimo exigido: 56 px), com área de toque 15%
  maior, multitoque (mover e atacar ao mesmo tempo) e respeito às áreas
  seguras (notch) via `env(safe-area-inset-*)`. Ficam no canto inferior
  direito, abaixo da faixa do HUD, sem sobrepô-lo.
- Teclado: WASD/setas, J, K, L.

### Dia e noite (`src/systems/DayNightSystem.ts`)
- Ciclo configurável, **padrão 10 minutos reais** (`DAY_NIGHT.cycleMs` ou
  `?cycle=`). Relógio do jogo no HUD.
- Um retângulo com **blend MULTIPLY** cobre a visão: dia em tons quentes
  quase neutros (deixa os verdes vivos), nascer/pôr do sol alaranjado,
  crepúsculo rosa-violeta e **noite azul/violeta**.
- Ao anoitecer, **janelas acendem** (frame aceso da casa) e **tochas acendem**
  (animação de chama), com **luz radial** (sprite de gradiente com blend ADD e
  leve cintilação). Sem shaders.

### Clima (`src/systems/WeatherSystem.ts`)
- Sistema separado do dia: alterna entre **limpo, chuva e neblina** em
  intervalos aleatórios de 45–100 s, com **transição suave** de 6 s.
- **Chuva**: partículas leves (máx. 140 gotas + 30 respingos) e tom
  cinza-azulado. **Neblina**: textura tileável em overlay de baixa opacidade
  (≤ 42%) que deriva com o vento.
- O tom do clima é **multiplicado** pela luz do dia no mesmo overlay, então
  os dois se combinam (ex.: noite chuvosa fica mais escura e fria).

### Câmera
- Segue Teren com suavização (lerp 0,12), limitada às bordas do mapa.
- O zoom mantém **a mesma área de mundo de 20×12 tiles** em qualquer
  proporção de tela. Em celulares 19,5:9 isso dá ≈ 23×10,5 tiles visíveis
  (844×390) e ≈ 23×10 (915×412).

### PWA e mobile
- `public/manifest.json` com `"orientation": "landscape"`,
  `"display": "standalone"`, nome e ícones 192 e 512 (+ maskable e
  apple-touch-icon).
- `public/sw.js`: no build, um plugin do Vite injeta a lista de **todos os
  arquivos do `dist/`** (JS, PNGs, manifest, ícones) e uma versão por hash;
  estratégia cache-first, funciona offline após o primeiro carregamento.
- Em retrato aparece a tela **"Gire o aparelho para jogar"** (CSS
  `orientation: portrait`).
- No primeiro toque tenta tela cheia e `screen.orientation.lock('landscape')`
  quando suportado (Android/Chrome). No iOS a API não existe; instalado como
  PWA, o app usa o manifest.
- Zoom de pinça, duplo toque, menu de contexto e rolagem da página
  bloqueados (`user-scalable=no`, `touch-action: none`, `gesturestart`…).
- Canvas em tela cheia com `Phaser.Scale.FIT`. A resolução interna acompanha
  a proporção da tela (px CSS × devicePixelRatio, limitado a 2), então o FIT
  preenche a tela sem tarjas e fica nítido em telas retina; ao girar/
  redimensionar, a resolução é recalculada.

---

## Decisões tomadas

1. **Assets procedurais.** O ambiente não tinha acesso a kenney.nl nem a
   opengameart.org (bloqueio de rede). Toda a arte foi gerada por
   `scripts/generate-assets.mjs` (Node puro, codificador PNG próprio, paleta
   única de ~30 cores, contorno automático de 1 px) e salva como PNG em
   `public/assets/` — assim a arte final pode substituir arquivo por arquivo
   (layout em `public/assets/README.md`). Escolhi gerar PNGs em vez de
   desenhar em canvas a cada inicialização para que os arquivos existam,
   sejam cacheados pelo service worker e possam ser trocados sem tocar no código.
2. **Mapa gerado por código** (não Tiled), determinístico pela seed 1337.
   A geografia foi interpretada assim: planalto ao norte com a nascente; a
   Queda do Serro no degrau entre planalto e vale; o rio continua pelo vale
   até a borda sul do mapa (o enunciado diz que o rio "termina na Queda" e
   também "corta o vale de norte a sul"; optei pela leitura em que a queda é
   o ponto marcante entre os dois trechos).
3. **Pedrafria** fica no planalto, na encosta logo acima da escadaria, para
   que a estrada precise usar a passagem do penhasco.
4. **Árvores como tiles**: tronco na camada de decoração com colisão de
   1 tile; copa 3×2 numa camada acima das entidades. Barato e sem
   ordenação por objeto.
5. **Herói em camadas LPC.** Antes testei um modelo 3D convertido em pixel
   art, sprites desenhados à mão em ASCII, um boneco procedural de esferas e
   cápsulas e a arte conceitual animada por deformação — nenhum ficou com
   cara de personagem de verdade. As camadas LPC são pixel art de artistas,
   com anatomia correta e animações coreografadas, no mesmo estilo de
   contorno e sombreado do mapa; o código só monta as peças e cuida do tempo,
   dos efeitos e da física.
6. **Golpe em quadros maiores**: o golpe com espada do LPC usa quadros de
   128×128 (a lâmina sai do quadro de 64). No jogo ele é um sprite à parte
   que substitui o corpo durante o golpe, com os pés no mesmo ponto.
7. **Tempo de jogo único**: jogador e inimigos usam o relógio da cena
   (`this.time.now`); o impacto do golpe é medido no `update`, não com
   `delayedCall`, para não atrasar em quedas de FPS.
8. **Casas e entidades** usam ordenação por y (profundidade = y), então
   Teren passa "atrás" do telhado das casas.
9. **Ataque em arco calculado por geometria** (distância + ângulo), sem
   corpos físicos extras.
10. **Projéteis atravessam água** mas não paredes, árvores ou casas.
11. **Zoom pela área** (√(área da tela / área de 20×12 tiles)) em vez de
   fixar largura ou altura, para funcionar bem em telas 16:9 e 19,5:9.
12. **Luz sem shaders**: overlay MULTIPLY + sprites de brilho ADD, só os
   que estão na tela ficam visíveis.
13. **Simulação por raio**: só inimigos e animais a até 360 px do centro da
    câmera processam IA; os demais ficam parados.
14. Morte do jogador sem tela de game over (não há menus): volta para
    Brumavale após um fade.

## Desempenho (limites)

- ~26 inimigos, 24 animais, 7 pássaros, 10 casas, 24 tochas e 44 luzes no
  mapa inteiro; IA processada só perto da câmera.
- Partículas com teto: chuva 140, respingos 30, névoa da queda 18,
  brasas 40.
- Tilemap com culling nativo do Phaser; animação de água troca índices de
  tiles a cada 85–190 ms (sem shaders).
- `pixelArt: true`, sem antialias, resolução interna limitada a 2× DPR.

---

## Projeto das próximas etapas

[`docs/design/expansao-mundo.md`](docs/design/expansao-mundo.md): os biomas
já estão no jogo (mundo 320×320; chunks ficam para quando o mundo crescer);
mapa com névoa de exploração, coleta por tiers e inventário no estilo Albion
Online ainda não foram implementados.

## Herói: arte e animação

`npm run hero` (`python3 scripts/hero/build.py`, requer Pillow) junta a
**base** (corpo, rosto, cabelo, roupa, capa) com cada **arma** listada em
`scripts/hero/recipe.json` (em ordem de profundidade `z`) e gera, por arma:

- `outfit-<traje>.png` (+ `-back.png`, o que fica atrás do corpo) e
  `wpn-<arma>-bg.png` / `-fg.png` (arma atrás / na frente do corpo) — folhas
  universais LPC, 64×64 por quadro,
  13 colunas: magia (linhas 0–3), estocada (4–7), andar (8–11), golpe
  (12–15), arco (16–19), queda (20); cada animação em 4 direções (cima,
  esquerda, baixo, direita).
- `wpn-<arma>-<anim>-bg/fg.png` — animações em quadros
  grandes (128 ou 192 px: golpes da espada e do montante, estocadas do montante
  e do cajado, o arco andando) — o corpo entra centralizado e a arma usa a arte
  própria da animação;
- `src/entities/heroSheets.ts` — tamanho e quantidade de quadros de cada folha.

**Armadura nova**: some uma entrada em `outfits` (camadas LPC, defesa,
velocidade, bônus; `hideHair` se tiver elmo/capuz) e rode `npm run hero`.

**Arma nova**: some uma entrada em `weapons` na receita (camadas e animações
grandes), rode `npm run hero` e descreva golpes e habilidade em
`src/data/weapons.ts`.

**Trocar uma peça**: baixe a camada do gerador LPC
(https://github.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator,
pasta `spritesheets/`), coloque em `scripts/hero/layers/` com o mesmo caminho,
troque o arquivo na receita (com autores e licença, que vão para o
`CREDITS.md`) e rode `npm run hero`.

**Errante** (`npm run wraith`): `scripts/wraith/build.py` (Pillow + numpy)
recorta as três vistas de `scripts/wraith/concept.png`, anima (flutuar,
ondular, inclinar), reduz com paleta comum e contorno, repinta os olhos e gera
`public/assets/sprites/wraith.png` + `src/entities/wraithSheet.ts`.

---

## O que é placeholder

| Item | Situação |
|---|---|
| Todo o tileset (grama, terra, areia, rocha, água, cachoeira, penhascos, estrada, ponte, escadaria, flores, arbustos, cercas, árvores) | placeholder procedural — trocar por Kenney Tiny Town / Roguelike RPG Pack ou arte própria |
| Teren | camadas LPC (arte final de terceiros, ver CREDITS). Faltam animações próprias de esquiva e de dano (usa disparada e um quadro da queda) |
| Bandoleiro | rig 2D de poses (48×48, ~24 px de altura) em `scripts/generate-assets.mjs` |
| Limo, Lobo, Ovelha, Cervo, Pássaro | placeholder procedural 16×16 (vista lateral espelhada para quadrúpedes) |
| Casas (2 estilos por vila), poço, tochas | placeholder procedural |
| Efeitos: arco do golpe, chama, explosão, gota, respingo, neblina, brilho | placeholder procedural |
| Ícones de botões e do PWA | placeholder procedural |
| Fonte do HUD | `monospace` do sistema |

Para trocar: substitua o PNG mantendo nome e layout (`public/assets/README.md`)
e registre a fonte/licença em `CREDITS.md`.

---

## Deploy estático

O build gera um site estático em `dist/` com caminhos relativos (`base: './'`),
então funciona na raiz de um domínio ou numa subpasta.

### GitHub Pages
1. Faça push do repositório para o GitHub.
2. Em **Settings → Pages**, em *Build and deployment*, escolha
   **Source: GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` roda `npm ci && npm run build` e
   publica o `dist/` a cada push em `main`/`master` (ou manualmente em
   *Actions → Deploy GitHub Pages → Run workflow*).
4. O jogo fica em `https://<usuario>.github.io/<repositorio>/`.

### Netlify
- **Pelo Git**: *Add new site → Import an existing project*, escolha o
  repositório. O `netlify.toml` já define `npm run build` e a pasta `dist`.
- **Manual**: rode `npm run build` e arraste a pasta `dist/` para
  https://app.netlify.com/drop.

O PWA exige HTTPS (GitHub Pages e Netlify já servem com HTTPS).

## Como instalar no celular

**Android (Chrome)**
1. Abra a URL publicada.
2. Toque no menu ⋮ → **Instalar app** (ou **Adicionar à tela inicial**).
3. Abra pelo ícone "Vaelmor": roda em tela cheia, em paisagem, e funciona
   offline depois da primeira abertura.

**iPhone (Safari)**
1. Abra a URL publicada no Safari.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.
3. Abra pelo ícone. Se o iPhone estiver com a rotação travada em retrato,
   destrave na Central de Controle — o iOS não permite que sites travem a
   orientação, então em retrato aparece "Gire o aparelho para jogar".

---

## Testes realizados

- `npm install && npm run build` sem erros (TypeScript estrito).
- Chromium headless (Playwright) emulando celular com toque em **844×390**
  (iPhone paisagem, DPR 2) e **915×412** (Android paisagem, DPR 2), além
  de desktop 915×412 e retrato 390×844: sem erros no console; HUD, botões e
  joystick posicionados sem sobreposição; tela de "gire o aparelho" em retrato.
- Teclado: movimento, Golpe (limo morto em 2 golpes), Chama (cooldown
  iniciado, explosão) e Esquiva (estado de rolagem); inimigos causando dano.
- Toque (eventos reais via CDP): arrastar o joystick move Teren; tocar
  GOLPE, ESQUIVA e CHAMA dispara cada ação; multitoque joystick + botão.
- Visual: dia, crepúsculo com janelas/tochas acesas, noite com chuva,
  neblina, Queda do Serro, as duas vilas e visão geral do mapa.

## O que ficou faltando

- **60 FPS não foi medido em aparelho real.** O ambiente de teste só tinha
  Chromium headless com renderização por software (SwiftShader), que roda a
  ~20–35 FPS e não representa um celular. Os limites de partículas e de
  objetos ativos foram pensados para celular intermediário, mas é preciso
  confirmar num aparelho (use `?debug=1` para ver o FPS).
- **Instalação do PWA** não foi testada num celular físico (manifest e
  service worker validados só no build e no navegador headless).
- **Arte final**: todos os gráficos são placeholders procedurais; nenhum
  asset do Kenney/OpenGameArt foi incluído por falta de acesso à rede.
- Transições de borda entre tipos de terreno (autotile) — hoje as bordas
  entre grama, areia, floresta e água são retas, tile a tile.
- Inimigos não desviam de obstáculos com pathfinding (perseguem em linha
  reta e podem ficar presos atrás de árvores ou do rio).
- Sem som, música, menus, pausa, save, diálogos, história ou economia (fora
  do escopo pedido).
- Sem testes automatizados versionados (os testes acima foram scripts de
  Playwright executados durante o desenvolvimento).
- No iOS não há trava de orientação nem tela cheia por API (limitação da
  plataforma); depende do PWA instalado e da rotação do aparelho.

---

## Estrutura

```
src/
  main.ts                 configuração do Phaser, escala e resize
  config.ts               constantes ajustáveis e parâmetros de URL
  pwa.ts                  service worker, trava de orientação, gestos
  scenes/                 BootScene (carga/animações), WorldScene (mundo), UIScene (HUD + controles)
  entities/               Player (+ heroSheet/heroSheets), Beast (inimigos dos biomas), Critters (fauna dos biomas),
                          Slime, Wolf, Bandit, Wraith, Sheep, Deer, Bird (+ Creature, Enemy, Animal, Flame, Projectile)
  data/                   weapons (armas e classes), items (recursos por região)
  systems/                WorldGenerator (biomas), MapGenerator (vale), TileWindow, TileCollision, Gathering, Inventory,
                          BiomeFx, DayNightSystem, WeatherSystem (+ Tiles, Noise)
  ui/                     DebugPanel (teleporte, mapa, voo), InventoryPanel (mochila)
  input/                  VirtualControls, InputState
public/
  manifest.json, sw.js, icons/
  assets/                 tilesets/, sprites/, tiles/ (PNG placeholder + README de layout)
scripts/generate-assets.mjs   gerador da pixel art placeholder (mapa, inimigos, efeitos)
scripts/hero/                 Teren: receita e camadas LPC + montagem do spritesheet
scripts/wraith/               Errante: arte conceitual + animação procedural
CREDITS.md                fontes e licenças
```
