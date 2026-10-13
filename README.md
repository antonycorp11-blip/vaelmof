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

`npm run assets` regera todos os PNGs (mapa, inimigos e herói); `npm run hero` regera só o herói (já estão versionados; só é
preciso rodar se você alterar `scripts/generate-assets.mjs`).

### Controles

| Ação | Toque | Teclado |
|---|---|---|
| Mover (8 direções) | joystick flutuante na metade esquerda da tela | WASD ou setas |
| Golpe (arco) | botão **GOLPE** (segurar repete) | J (segurar repete) |
| Esquiva (rolagem) | botão **ESQUIVA** | K |
| Chama (projétil em área) | botão **CHAMA** | L |

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

### Mundo (`src/systems/MapGenerator.ts`)
- Mapa único de **120×120 tiles** gerado por código com ruído de valor/fbm
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
- Ao entrar numa vila ou perto da queda, o nome da área aparece na tela.

### Vida
- **Ovelhas** (13, em rebanhos perto de Brumavale) e **cervos** (11, nas
  florestas e no planalto) vagam aleatoriamente perto de seu ponto de origem
  e **fogem** quando o jogador se aproxima (cervos percebem de mais longe e
  correm mais rápido); contornam obstáculos ao fugir.
- **Pássaros** (7) sobrevoam o mapa em trajetos levemente ondulados, com
  sombra no chão e sem colisão; ao sair do mapa reaparecem numa borda.

### Teren (`src/entities/Player.ts`, `src/entities/HeroRig.ts`)
- **Sprite "3D → pixel art"** gerado por `scripts/hero/` (ver
  [Herói: pipeline e modularidade](#herói-pipeline-e-modularidade)) a partir
  do conceito "aventureiro do Serro": estilo JRPG com ~3 cabeças de altura,
  cabelo castanho espetado, olhos grandes com brilho, cachecol vermelho, capa
  azul com barra e emblema dourados e forro vermelho, camisa creme bordada,
  cintos com fivelas douradas, luvas, calça verde, botas altas e espada de
  cabo azul. **8 direções de sprite**, luz e volume coerentes, contorno
  seletivo. A arte tem o dobro da densidade do mapa e é exibida em escala
  0,5 (≈ 27 px do mundo de altura, perto do tamanho dos outros personagens).
- A passada da corrida é casada com `PLAYER.speed` (64 px/s) para o pé
  não "patinar"; com joystick parcial o ritmo dos passos acompanha a
  velocidade.
- Animações: respiração parado (8 quadros), corrida (8), combo de 3 golpes
  (7 + 7 + 8), cambalhota (8), dano (3) e conjuração (5) — 54 quadros por
  direção, 432 por camada.
- Movimento em **8 direções** (o joystick é analógico na intensidade, mas a
  direção é quantizada em 45°), e o sprite acompanha as 8. Velocidade em
  `PLAYER.speed` (`src/config.ts`).
- **HP 10** com barra segmentada no HUD; pisca e fica invulnerável por 0,9 s
  após tomar dano. Ao morrer, volta a Brumavale com HP cheio.
- **Golpe: combo de 3 movimentos.** Golpe diagonal descendente → revés
  horizontal → estocada com avanço (dano 2, 2 e 3; a estocada alcança mais
  longe e empurra mais). Cada golpe tem preparo (giro do tronco e lâmina
  sobre o ombro), aceleração, impacto, continuação e recuperação; o dano sai
  no quadro de impacto definido na animação. O rastro branco é a superfície
  realmente varrida pela lâmina entre os quadros. Apertar de
  novo no fim da recuperação (ou dentro de 380 ms) encadeia o próximo; depois
  do golpe final o combo recomeça. Segurar o botão repete. A esquiva cancela
  qualquer golpe. "Hit stop", faíscas e tremida de câmera ao acertar (mais
  fortes no golpe final). Ajustes em `PLAYER.combo` (`src/config.ts`).
- **Esquiva**: rolagem de 260 ms com **invulnerabilidade** durante o
  movimento, rastro de imagens e cooldown de 650 ms.
- **Chama**: projétil que explode ao tocar um inimigo, um obstáculo ou no fim
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
- Todos têm HP (barra aparece quando feridos), recebem dano do golpe e da
  chama, **piscam em branco** ao serem atingidos, sofrem knockback e têm
  **animação de morte** (achatamento + partículas). Renascem no ponto de
  origem após 45 s se o jogador estiver longe.
- Quantidade: 11 limos, 8 lobos, 7 bandoleiros. Um de cada fica a poucos
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
5. **Herói por pipeline "3D → pixel art"** (`scripts/hero/`): um modelo de
   primitivas 3D com esqueleto e cinemática inversa é renderizado em pixel
   art (ray marching, luz quantizada em rampas de cor, supersampling 2×2,
   contorno seletivo). É a técnica de jogos como Dead Cells; dá 8 direções
   coerentes e animação por esqueleto. As proporções são chibi de JRPG
   (cabeça grande, pernas curtas e retas). **A cabeça (rosto e cabelo) é
   desenhada à mão**, pixel a pixel, em 5 vistas (`scripts/hero/heads/*.txt`,
   as outras 3 espelhadas) e encaixada na posição 3D da cabeça a cada quadro,
   com profundidade para cachecol, capa e espada passarem na frente ou atrás. O Bandoleiro segue no rig 2D
   simples de `scripts/generate-assets.mjs`.
6. **Arte do herói com o dobro da densidade** do mapa (exibida a 0,5×):
   olhos com brilho, fivelas e bordados precisam de ~55 px de arte de
   altura; isso mistura densidades de pixel (o herói é mais detalhado que o
   cenário), escolha consciente em favor do personagem.
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

## Herói: pipeline e modularidade

`npm run hero` (≈10 s, usa todos os núcleos) gera `public/assets/hero/`:

| Arquivo | Conteúdo |
|---|---|
| `hero.json` | metadados: tamanho do quadro (112×112), pés (56, 88), escala 0,5, 8 direções, camadas, loadout, atlas por camada e as animações (quadros, duração de cada quadro, quadro de impacto `hit`, quadro de soltar a Chama `release`) |
| `body-base` | corpo e cabeça desenhada à mão (cabelo espetado, olhos grandes com brilho, bochechas), camisa e calção de linho |
| `legs-aventureiro` | calça verde e botas altas com dobra e fivela |
| `torso-aventureiro` | camisa creme com decote de cordão e barra bordada, mangas bufantes, luvas, cinto com fivela grande, bolsa e alça transversal |
| `cape-serro` | capa azul com barra e emblema dourados e forro vermelho, manto curto nos ombros, cachecol vermelho e broche dourado |
| `weapon-espada-serro` | espada: lâmina com sulco e fio vivo, guarda dourada com gemas azuis, cabo azul com anéis dourados e pomo dourado |
| `fx-espada-serro` | rastro dos golpes e o fogo da Chama na mão |

Cada camada é um atlas recortado (PNG + JSON do Phaser) **com os mesmos nomes
de quadro** (`<animação>_<direção>_<quadro>`, ex.: `atk1_3_2`).

**Como funciona** (`scripts/hero/`):

1. `rig.mjs` — esqueleto. A pose descreve onde ficam quadril, pés, mãos e a
   direção da lâmina, mais rotações do tronco e da cabeça; braços e pernas
   são resolvidos por IK de dois ossos. A capa tem âncora e ângulo próprios
   (sobe na corrida e nos golpes).
2. `anims.mjs` — coreografia: quadros-chave por animação, interpolados com
   Catmull-Rom (mãos e lâmina fazem arcos).
3. `equipment.mjs` — as peças, por **slot** (`body`, `legs`, `torso`,
   `cape`, `weapon`). Cada peça é uma função `(juntas) → primitivas 3D`
   (cones, elipsoides, caixas e formas próprias como lâmina e capa), com
   material e detalhes (olhos, pregas, sulco da lâmina…).
4. `render.mjs` — ray marching ortográfico com câmera a 30°, luz vinda do
   alto à esquerda, oclusão ambiente, cores quantizadas nas rampas de
   `palette.mjs`, supersampling 2×2 com voto de material e contorno
   seletivo. **Cada camada só aparece onde está à frente das camadas de
   baixo** (teste de profundidade), então as camadas empilham corretamente.
5. `build.mjs` — renderiza tudo (8 direções × 54 quadros × 6 camadas),
   recorta e empacota os atlas.

**No jogo** (`src/entities/HeroRig.ts`): o sprite físico do Player é a camada
`body`; as outras camadas são sprites que copiam quadro, posição, ângulo,
alpha e tint dele antes de cada render. Trocar uma peça é trocar a textura
da camada: `player.rig.equip('weapon', 'machado')`.

**Para adicionar uma armadura ou arma depois:**

1. Em `scripts/hero/equipment.mjs`, escreva a função da peça no slot certo
   (ex.: `ITEMS.torso.cotaDeMalha = (J) => [...]`, `ITEMS.weapon.machado = ...`)
   usando as juntas de `J` (`J.chest`, `J.chestB`, `J.grip`, `J.weaponB`…).
2. Rode `npm run hero` com o loadout que inclui a peça (hoje o build usa
   `DEFAULT_LOADOUT`; um próximo passo natural é gerar *todas* as peças de
   cada slot e listá-las em `hero.json`).
3. Carregue o atlas no `BootScene` e chame `rig.equip(slot, item)`.

Limites conhecidos do modelo: peças de um slot não "recortam" peças de outro
slot (uma armadura volumosa não esconde a capa de forma diferente da túnica);
armas com geometria muito diferente podem pedir um rastro próprio
(`bladeSegment`).

---

## O que é placeholder

| Item | Situação |
|---|---|
| Todo o tileset (grama, terra, areia, rocha, água, cachoeira, penhascos, estrada, ponte, escadaria, flores, arbustos, cercas, árvores) | placeholder procedural — trocar por Kenney Tiny Town / Roguelike RPG Pack ou arte própria |
| Teren | gerado por `scripts/hero/` (modelo 3D → pixel art, 8 direções, camadas por slot de equipamento). É arte procedural "final de protótipo": substituível por arte desenhada à mão mantendo os nomes de quadro dos atlas |
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
  entities/               Player, Slime, Wolf, Bandit, Sheep, Deer, Bird (+ Creature, Enemy, Animal, Flame)
  systems/                DayNightSystem, WeatherSystem, MapGenerator (+ Tiles, Noise)
  input/                  VirtualControls, InputState
public/
  manifest.json, sw.js, icons/
  assets/                 tilesets/, sprites/, tiles/ (PNG placeholder + README de layout)
scripts/generate-assets.mjs   gerador da pixel art placeholder (mapa, inimigos, efeitos)
scripts/hero/                 pipeline do herói (modelo 3D → pixel art em camadas)
CREDITS.md                fontes e licenças
```
