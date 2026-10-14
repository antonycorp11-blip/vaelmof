# Vaelmor

Protótipo jogável de um jogo 2D top-down em pixel art 16×16 que roda 100% no
navegador, como PWA para celular em modo paisagem. Feito com **TypeScript +
Vite + Phaser 3** (sem Godot).

O foco é o **mundo vivo** e a jogabilidade básica: Teren explora um mundo
grande de cinco biomas e 14 cidades muradas, a partir da capital Brumavale,
com fauna, inimigos, ciclo de dia e noite e clima. Não há história, diálogos, menus, save, economia nem
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
| Habilidades da arma (3) | três botões em arco em volta do golpe (mudam com a arma; saem ao soltar) | L · U · I |
| Coletar recurso | botão **COLETAR** (aparece perto de árvore, pedra, cristal…; segurar repete) | E |
| Mirar (arco, cajado, habilidades) | automático no inimigo mais próximo; **segure e arraste** o botão para mirar à mão (linha pontilhada) — a habilidade sai ao soltar | mouse (mira para onde ele aponta) |
| Trocar de arma / armadura | na **MOCHILA**: toque no item → EQUIPAR | Q (próxima arma) |
| Mochila | ícone da **bolsa** (sob o minimapa) | B |
| Teren: atributos e patentes | ícone do **escudo** (selo dourado +N quando há pontos) | C |
| Quartel (recrutar, aquartelar, guerra) | ícone do **estandarte** | G |
| Mapa do mundo | ícone do **mapa** ou tocar no **minimapa** | M |
| Missões do Lorde | ícone do **pergaminho** | T |
| Ranking de Clãs | ícone da **coroa** | R |
| Sede do clã | ícone da **casa** | H |
| Ordens do exército | botões **seguir / atacar / segurar** sob a vida | 1 / 2 / 3 |
| Aquartelar / convocar (andar sozinho) | botão da **tenda** (vira corneta com o exército no quartel) | 4 |

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

### Mundo e biomas (`src/systems/WorldGenerator.ts`, `src/systems/Terrain.ts`)
- Mundo de **1536×1536 tiles** (≈ 24.600 px de lado, ~10× a área do mundo
  anterior), cercado de **mar** (no Blackland, de **abismo**). Gerado em ~2 s
  ao abrir o jogo, determinístico pela seed. **Cinco biomas** + o **Vale de
  Vaelmor** (o entorno da capital, um Greenland mais calmo). Cada bioma tem
  **fauna e inimigos próprios** (≈ 3.300 criaturas no mundo):
  - **Greenland** (centro-oeste): florestas densas de carvalhos antigos,
    carvalhos, pinheiros e salgueiros, muitos **rios** serpenteando até o mar e
    **lagoas**; javalis, raposas, cervos, lobos, limos e bandoleiros.
  - **Snowland** (norte): neve constante, pinheiros altíssimos nevados, lagos e
    rios **congelados** (gelo andável), mar com orla de gelo, montanhas nevadas;
    ursos-polares, lebres, lobos-da-neve, cervos claros e Errantes.
  - **Blockland** (leste): pedra, cascalho, blocos em aglomerados, muitas
    montanhas, veios de minério; golens, cabras, limos de pedra e bandoleiros.
  - **Blackland** (sudeste): cinzas e obsidiana, muito escura, **cristais que
    brilham**, poças e rios do vazio, abismo na borda do mundo; aranhas de
    cristal, Errantes e limos do vazio.
  - **Dustland** (sul): dunas, arenito, mesas, cactos, crânios e **oásis** com
    palmeiras; escorpiões, lagartos, bandoleiros, limos de areia.
- **Fronteiras**: curvas largas de ruído com ondulação fina por cima (nada de
  linha reta) e uma **faixa de mistura** de ~14 tiles de cada lado, onde
  aparecem manchas do bioma vizinho (neve na grama, areia nas cinzas…), com
  as árvores e a decoração daquela mancha.
- **Transições suaves de terreno** (`Terrain.ts`): cada tile tem um material
  com prioridade; o material mais alto "derrama" meio tile sobre o vizinho
  numa camada própria (`edge`), com contorno orgânico, linha de borda e sombra
  leve — sem as escadinhas de tiles quadrados. Vale para fronteiras de bioma,
  margens de rios e lagos (areia, gelo), estradas (a grama cobre a beira da
  terra), clareiras de floresta e **o contorno das montanhas**.
- Montanhas: maciços intransponíveis com paredão de 2 tiles embaixo; recuam
  em volta das cidades e abrem passagens irregulares onde as estradas cruzam.

### Cidades e estradas (`src/systems/Cities.ts`)
- **14 cidades muradas**, 2–3 por bioma: **Brumavale** (capital, início do
  jogo), Carvalhal e Pontealta (Greenland); Pedrafria, Invernia e Gelomar
  (Snowland); Rochedo, Forjaval e Muralha Velha (Blockland); Umbravale e
  Cinzalva (Blackland); Areia Rubra, Miragem e Solgrave (Dustland).
- Cada cidade: **muralha** com torres e **4 portões**, avenidas calçadas em
  cruz até a **praça** (fonte, barracas de feira, bancos, vasos), ruas
  secundárias em grade, **quarteirões cheios de casas** (pequenas, médias e
  grandes — a capital tem ~75), quintais com barris, caixotes, feno e sacos,
  estandartes nos portões e **tochas** nas avenidas. Em Greenland, **fazendas**
  cercadas com plantações e ovelhas do lado de fora.
- **Arte por bioma** (`scripts/world-art.mjs`): casas de enxaimel com telhado
  vermelho/palha (Greenland), cabanas de tronco com neve no telhado
  (Snowland), casas de pedra com ardósia (Blockland), pedra escura com
  telhado roxo, espinhos e janelas violeta (Blackland), adobe com teto plano,
  toldos e **cúpulas** (Dustland); muralhas, torres e calçamento próprios.
  À noite, as janelas acendem.
- **Estradas de terra** ligam as cidades (árvore geradora mínima + atalhos),
  saindo pelos portões, com **pontes** sobre rios e o vazio.
- Ao entrar numa cidade aparece o nome e "Cidade de <bioma>".

### Desempenho do mundo grande (`src/systems/Streamer.ts`)
- Só uma **janela** de 72×48 tiles em volta da câmera vira tilemap; o mundo
  fica em arrays compactos (`TileWindow.ts`) e a colisão é resolvida direto
  neles (`TileCollision.ts`).
- **Streaming por células** de 32×32 tiles: criaturas, casas, torres, tochas e
  luzes só existem nas células perto da câmera (5×5); longe, são destruídas e
  voltam ao retornar. Ficam ~350 objetos vivos em vez de dezenas de milhares.
- O mapa do debug é desenhado com 1 px a cada 2×2 tiles.

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

### Interface (`src/ui/`)
- **Kit visual** (`src/ui/kit.ts`, arte em `scripts/ui-art.mjs`): molduras
  9-slice em pixel art (painel, painel interno, destaque), botões em 5 cores
  com bisel que afunda ao tocar, barras e 18 ícones; fonte **Tiny5** (números bem legíveis)
  embutida (`public/fonts`). Todas as telas usam as mesmas peças.
- **HUD:** à esquerda o brasão do clã com a insígnia da patente, vida, Glória,
  ouro, patente, exército, as 4 ordens e as missões ativas; à direita, no alto,
  a **barra de menu** numa moldura só e, embaixo dela, o **minimapa** e o relógio.
- **Minimapa** (`Minimap.ts`): 110 tiles em volta do herói com cidades
  (quadrados; Brumavale dourada), **spots de up** (anéis dourados), campeões
  (losangos vermelhos), soldados (azul aliado / vermelho inimigo) e o herói
  (seta). Tocar abre o **mapa completo** (`MapPanel.ts`) com nomes das
  cidades e legenda.
- Telas: **Teren** (atributos com barra até 1000 e marca do mínimo da próxima
  patente + escada de patentes com insígnias), **Quartel de Brumavale**
  (cartas com retrato de cada soldado, recrutas, cura explicada, aquartelar e
  guerra), **Mochila** e **Debug**.

### Debug (ícone da engrenagem, vermelho)
- Teleporte para o coração de cada bioma (Vale, Greenland, Snowland,
  Blockland, Blackland, Dustland).
- **MAPA**: o mundo inteiro (1 px por tile) com a posição do herói; **tocar
  no mapa leva o herói para aquele ponto** (ou para o chão livre mais
  próximo).
- **Voo** (atravessa montanhas, água e árvores, 3× mais rápido),
  **Invencível**, **Dia** e **Noite**.
- **+50 pontos** de atributo, **Zerar atributos**, **Spot: próximo** e
  **Cidade: próxima** (teleporta para cada spot / cidade, um por toque). O
  MAPA marca as cidades (retângulo branco com o nome) e os spots (círculo
  dourado).

### Clãs, missões e saque — o loop do começo (`src/systems/Clans.ts`, `Missions.ts`, `Bosses.ts`, `Loot.ts`, `src/data/gear.ts`)
- **Começo:** o jogo abre na tela **FUNDE O TEU CLÃ** (nome com o teclado do
  celular, 12 brasões, 12 cores). A cor vai para os soldados (arte tingida e
  anel no chão) e o brasão para o HUD. O mundo fica pausado até fundar.
- **Objetivo:** fazer o clã subir Bando → Clã → Clã Juramentado → Clã de
  Renome → Clã Lendário → **Casa** (Casa = 30.000 de Glória **e** a última
  patente, Soberano de Vaelmor). A Glória do clã é a do herói.
- **Clãs rivais (≈17 no começo):** cada um tem sede numa cidade, líder com
  nome, brasão, cor, Glória, soldados e uma peça rara. Um motor do mundo
  (a cada ~22 s) faz os clãs recrutarem, guerrearem entre si, subirem de
  degrau, surgirem e se desfazerem; tudo vira **crônica** (linha no alto da
  tela e lista no painel).
- **Ranking de Clãs** (ícone da coroa, tecla R): lista por Glória com brasão,
  degrau, cidade e soldados; ficha do clã e onde anda o bando dele (ver
  "Clãs no mapa").
- **Missões** (ícone do pergaminho, tecla T): o **Lorde** de cada cidade
  oferece 3 missões (é preciso estar na cidade): **caçada** (N criaturas no
  bioma), **procurado** (personagem nomeado marcado no minimapa e no mapa,
  que deixa cair uma peça rara), **guerra** contra um clã e **duelo** de
  campeão. Até 3 ativas, com progresso no HUD; cumpridas pagam na hora em
  Glória e recrutas.
- **Armas e armaduras raras:** 32 armas (4 por raridade para espada,
  montante, arco e cajado) e 20 armaduras, em 4 raridades — **Temperada**
  (×1,25 dano / +4% defesa), **Rúnica** (×1,6 / +8%, com brilho),
  **Ancestral** (×2,1 / +12%) e **Lendária** (×2,8 / +17%). Cada uma tem nome,
  tom e brilho próprios (contorno luminoso na arma e no corpo) e exige mais do
  atributo principal. **Só se ganham derrotando personagens**: campeões,
  líderes de clã, procurados e, raramente (5%), bandidos. Caem no chão com um
  facho de luz na cor da raridade e são pegos ao passar por cima. A mochila
  agora fica salva. Não há craft; a coleta vai servir para erguer a **sede do
  clã** (próxima etapa).

### Mercadores e ouro (`src/systems/Market.ts`, `src/ui/MarketPanel.ts`, tecla V)
- Um **mercador na praça de cada cidade**. Compra material da coleta (madeira
  e pedra 1, gelo 2, minério 4, cristal 8 de ouro; **de outra região vale o
  dobro**), peças de equipamento (comum 15, Temperada 80, Rúnica 250,
  Ancestral 700, Lendária 2000) e saque. Vende 15 recrutas e mercenários que
  entram no exército na hora (dentro do limite da patente) — o jeito de se
  refazer depois de perder o exército.
- Cada mercador tem um **caixa** (2.500, renova 80/min): dá para ganhar ouro,
  mas não à vontade. Bandidos também deixam 1–4 moedas.

### Clãs no mapa (`src/systems/Bands.ts`)
- Não existe mais "desafiar" por botão: **cada clã rival tem um bando em campo**
  (60% dos soldados, com o líder) que anda de verdade pelo mapa — patrulha
  entre as cidades perto da sede dele, **caça o herói** quando se acha mais
  forte (só rivais de força parecida), **marcha contra a sua sede** e briga
  com bandos rivais quando se cruzam (o vencedor ganha Glória, o perdedor se
  refaz em 3 min).
- **Minimapa e mapa** mostram os bandos na cor do clã; **contorno vermelho
  piscando** = vem atrás de você ou da sua sede (no minimapa, preso na borda na
  direção dele). Quando um caçador chega a ~55 tiles aparece o aviso
  "X SE APROXIMA — lute ou fuja".
- A **26 tiles** o bando vira um exército de soldados de verdade, com o líder
  (personagem nomeado) à frente. **Fugir** funciona: a 50 tiles da batalha os
  inimigos que sobraram voltam a ser um bando. Vencer destrói o bando (o líder
  deixa cair a peça rara dele) e o clã leva 4 min para pôr outro em campo.
- Ataques à sede chegam a pé: o bando aparece no minimapa marchando; a chegada
  estimada vai no painel da sede.
- O painel de Clãs mostra onde anda o bando de cada um (cidade, distância, se
  está caçando) e um botão para ver no mapa.

### Personagens com cara própria
- Líderes de clã, procurados e os capangas deles são montados com as camadas
  LPC: 5 trajes × 4 armas, mais o tom (antes, todo personagem era o mesmo
  bandido). Os procurados andam com 2–7 capangas.

### Herói menos "roubado"
- Golpes de soldados não dão mais 0,9 s de invulnerabilidade ao herói (cada
  soldado que acerta conta) nem o atordoam. Sozinho contra 25 soldados, o
  herói inicial cai em ~15 s.

### Coletores da sede
- Aba **TRABALHO** da sede: contrate coletores (ouro; o Salão comporta 6/12/20)
  para madeira, pedra, fibra, minério e cristal. Eles enchem o **estoque do
  Armazém** (100/300/800 de cada) sozinhos, e o estoque conta para construir,
  melhorar, reparar e treinar. Alguns andam pela sede.

### Sede do clã (`src/systems/HQ.ts`, `src/ui/HQPanel.ts`, ícone da casa, tecla H)
- **Erguer:** só um **Clã** (600 de Glória, não um Bando), num terreno plano
  e seco a até 60 tiles de uma cidade (fora dos muros), com 40 madeira e 30
  pedra. A sede (30×24 tiles) é erguida em volta do herói; árvores e pedras do
  lugar somem e uma estrada de terra liga o portão (ao sul) ao Salão.
- **Construções** (com o que se coleta + ouro; nível 2/3 pede o Salão no mesmo
  nível): **Salão** (coração: cura, chamados dos Lordes, ouro; se cair, o clã
  acaba), **muralhas** por lado (paliçada → pedra), **4 torres** (atiram em
  inimigos e criaturas), **Alojamento** (guarda de 15/40/80 soldados; recrutar
  na sede), **Arsenal** (treino), **Enfermaria** (cura 8% → 16% → 28%/s),
  **Tesouraria** (+20/50/110 de ouro/min) e **Armazém** (baú de 24/48 espaços).
  Construções danificadas são reparadas com material.
- **Só na sede:** os soldados **se curam** (sem sede, em Brumavale), aceitam-se
  **missões** (os chamados vêm do Lorde da cidade mais próxima; sem sede, no
  salão de Brumavale), **treina-se** o exército e usa-se o **baú**.
- **Trajes:** os soldados inimigos sorteiam o traje pela experiência do clã
  (couro, caçador, legionário, placas); os seus trocam de armadura conforme o
  treino total (caçador → legionário → placas).
- **Soldados não sobem mais de patente por abates.** O Arsenal treina
  **Ataque** (+10% de dano por nível), **Defesa** (−5% de dano recebido) e
  **Vida** (+12%), até o nível 10, com ouro e minério; a insígnia do exército
  sobe com o treino total.
- **Guarda:** POSTAR manda soldados ficarem de guarda nos postos da sede (eles
  saem do posto só atrás de quem chega perto); CHAMAR traz de volta.
- **Ataques de rivais:** clãs de força parecida marcham contra a sede (aviso
  com 2 min). Com o herói por perto, a batalha é de verdade: o inimigo ataca
  muralhas, torres e prédios, e os aquartelados saem para os postos. Longe, a
  força da defesa (guarda, treino, torres, muralhas, Salão) decide; perder
  derruba construções. **Se o Salão cair, o clã acaba**: soldados se
  dispersam, metade da Glória e 25% dos atributos distribuídos se perdem, o
  baú some e é preciso fundar outro clã.
- **Ouro:** rende na Tesouraria/Salão e vem das missões; mostrado no HUD.
- **Corneta:** VOLTAR À SEDE leva o herói para casa (espera de 90 s, não em
  guerra). O herói renasce na sede.

### Patentes e Glória (`src/systems/Ranks.ts`, `src/systems/Progress.ts`)
- Teren **não tem nível**: tem **patente**. Sobe quando **todos os 4
  atributos** chegam ao mínimo e, em algumas, depois de **vencer um campeão**
  em duelo (a Glória vira pontos, os pontos viram atributos). A tela de Teren
  diz exatamente o que falta. A patente define quantos soldados
  ele comanda. Patente conquistada não se perde.
- **Glória** é o status de desempenho em batalha: sobe com abates (do herói
  vale mais, do exército vale 1) e vitórias em guerra (2 por soldado inimigo),
  cai com derrotas (1 por soldado inimigo), baixas no exército (−1 cada) e com
  a morte do herói (−5%). **1 ponto de atributo a cada 10 de Glória ganha**
  (perdas não tiram pontos e não travam os próximos).
- O teto de 1000 por atributo ficou; o que mudou foi o ritmo: uma criatura
  básica rende 2 de Glória (0,2 ponto), contra 0,5 ponto antes. Saves antigos
  convertem os pontos já ganhos em Glória.

  | Patente | Cada atributo ≥ | Glória ≥ | Duelo | Exército |
  |---|---|---|---|---|
  | Andarilho | 10 | 0 | — | 5 |
  | Escudeiro | 20 | 150 | — | 10 |
  | Lâmina Jurada | 40 | 600 | — | 20 |
  | Guardião de Ferro | 70 | 1.500 | Brakk, o Saqueador (sul de Brumavale) | 35 |
  | Cavaleiro Rúnico | 110 | 3.000 | — | 50 |
  | Paladino das Marcas | 170 | 5.000 | Ysra da Lâmina Fria (sul de Pedrafria) | 80 |
  | Senhor da Guerra | 250 | 8.000 | — | 120 |
  | Lorde Estandarte | 380 | 12.000 | Ulgar de Rochedo (sul de Rochedo) | 180 |
  | Grão-Senhor | 600 | 20.000 | — | 250 |
  | Soberano de Vaelmor | 1000 | 30.000 | Morvath, o Arauto (sul de Umbravale) | 300 |

- **Insígnia sobre a cabeça** de todo mundo, sempre visível: escudo **azul**
  para o herói e os aliados, **vermelho** para inimigos, com a insígnia da
  patente (ponto, divisas, barras, estrelas, coroa). Os soldados usam as quatro
  primeiras patentes (Miliciano → Escudeiro → Lâmina Jurada → Guardião de
  Ferro, por abates); os campeões mostram a sua.
- Campeões (`src/systems/Champions.ts`): bandidos nomeados, maiores e muito
  mais fortes, que esperam fora dos muros da cidade; derrotados, não voltam.
- A tela **Teren** mostra os atributos e a escada inteira, com o que falta
  para a próxima; subir de patente mostra um aviso.

### Exércitos e guerra (`src/systems/Army.ts`, `src/ui/ArmyPanel.ts`)
- **Recrutamento** no quartel de **Brumavale** (dentro dos muros): Lâmina do
  Vale (linha de frente, 1 recruta), Quebra-Escudos (choque, 2), Flecha
  Cinzenta (atiradores, 1) e Arcanista (magia em área, 3). Os recrutas da cidade
  renovam 1 a cada 3 s (até 60); o limite é o da patente. O exército fica
  salvo no aparelho.
- **Ordens:** SEGUIR (formação atrás do herói), ATACAR (cada soldado busca o
  inimigo mais próximo), SEGURAR (fica onde o herói estava).
- Os soldados **sobem de patente** com abates (Miliciano → Escudeiro →
  Lâmina Jurada → Guardião de Ferro), ganhando vida e dano. Quem morre se
  perde (e custa Glória).
- **Cura:** após 4 s sem levar dano, só na sede do clã (8–28% da vida por
  segundo); antes de ter sede, em Brumavale (15%).
- **Aquartelar / convocar:** o botão da tenda manda o exército para o
  quartel e Teren anda sozinho; a corneta convoca todos de volta, curados,
  marchando por trás do herói (não funciona no meio de uma guerra).
- **Desvio de obstáculos:** quando não enxergam o herói (árvore, muro,
  casa), os soldados seguem um campo de fluxo (BFS de 40 tiles em volta do
  herói) e, de perto, sondas que giram em volta do obstáculo.
- **Guerra:** DECLARAR GUERRA traz o exército de uma casa rival (cada casa
  tem sua cor) do mesmo tamanho e composição do seu. Ao perder 70% do
  exército, o inimigo foge: **vitória**, com Glória. Se Teren cai, é
  **derrota** e a Glória cai.
- **Motor:** um sprite por soldado (as camadas LPC do herói são fundidas numa
  folha de 96 px por tipo e lado), sem física do Phaser (grade espacial para
  se afastarem, colisão direto no mapa), IA em turnos alternados e flechas
  num pool. Para 500 × 500: alvo achado numa grade grossa por lado (em vez de
  varrer todos os soldados), soldados fora da tela atualizam em quadros
  alternados, anel no chão sem reordenar profundidade, cada quadro da folha
  recortado ao desenho (a GPU deixa de pintar ~70% de pixels transparentes) e
  números de dano/avisos como BitmapText reaproveitado (antes, cada número era
  um canvas novo — o que mais travava no iPhone). Lógica medida: ~24 ms → ~8 ms
  por quadro com 1000 soldados.
- Debug: **+500 glória**, **Recrutas cheios**, **Aliados +50** (ignora o limite), **Inimigos
  50 / 100 / 300** (teste de estresse), **Limpar exércitos** e **Campeão:
  próximo**.

### Atributos e spots de up — estilo MU (`src/systems/Progress.ts`, `src/systems/SpawnSpots.ts`, `src/ui/AttributesPanel.ts`)
- Cada abate rende **pontos de atributo**: **0,5 na criatura básica** (slime,
  lobo, javali), 0,75 em bandido/aranha/escorpião, 1 em errante/urso, 1,25 no
  golem — **× o nível da região** (Vale/Greenland 1, Dustland 1,5, Snowland 2,
  Blockland 2,5, Blackland 3). O nível também multiplica a vida das criaturas
  e aumenta o dano delas (+50% por nível acima de 1).
- **Tela de ATRIBUTOS** (C no teclado): Força, Agilidade, Vitalidade e
  Energia começam em 10 e vão até **1000** cada (up longo de propósito);
  botões +1 / +10, barra até 1000, efeito de cada atributo e os números finais
  do herói. Salvo no aparelho (localStorage).

  | Atributo | Efeito |
  |---|---|
  | Força | dano das espadas +1% por ponto; +0,5 kg de carga por ponto |
  | Agilidade | dano do arco +1% por ponto; velocidade de ataque (até 2,2× em 1000); passo (até +20%) |
  | Vitalidade | +1 de vida a cada 2 pontos (10 → 505) |
  | Energia | dano do cajado +1% por ponto; recarga das habilidades (até −50%) |

- **Requisitos**: espada e traje de couro são livres; Montante pede Força 60,
  Cajado Energia 25, Arco Agilidade 30; Placas Força 80 + Vitalidade 40,
  Legionária Força 40 + Vitalidade 20, Arcano Energia 50, Caçador Agilidade
  40. Na mochila, o item bloqueado fica apagado com o que falta; a tela de
  atributos lista os bloqueados. Zerar os atributos devolve a espada/couro.
- **Spots de up** (32): 2 no Vale de Vaelmor (Charco dos Slimes, Trilha dos
  Lobos) e até 6 por bioma, longe das cidades (ex.: Covil dos Lobos, Gruta dos Ursos, Pedreira dos Golens, Cripta
  Errante, Ninho de Escorpiões). Ao chegar perto, o spot já está cheio (6–12
  criaturas) e **repõe uma a cada 3,5–7 s** (o dobro da pressa quando está
  pela metade); ao entrar aparece o nome e o nível. Longe (> 60 tiles), o spot
  se esvazia para poupar memória.
- Fora de combate (6 s sem levar dano) a vida regenera aos poucos.
- Mostra o bioma atual, o tile e o FPS.

### Vida
- **Ovelhas** (em rebanhos nas fazendas das cidades de Greenland) e
  **cervos** vagam aleatoriamente perto de seu ponto de origem
  e **fogem** quando o jogador se aproxima (cervos percebem de mais longe e
  correm mais rápido); contornam obstáculos ao fugir.
- **Pássaros** (7) sobrevoam o mapa em trajetos levemente ondulados, com
  sombra no chão e sem colisão; ao sair do mapa reaparecem numa borda.

### Teren (`src/entities/Player.ts`)
- **Acerto sem tremer a tela:** golpes, flechas e magias não sacodem a câmera nem congelam o jogo; o acerto aparece no alvo (estrela branca com clarão, flash branco e número de dano). Só o terremoto da marreta dá um tremor leve.
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

  | Arma | Classe | Ataque | Habilidades (1 · 2 · 3) |
  |---|---|---|---|
  | Espada | Guerreiro | corte descendente → corte ascendente → giro de 360° | **Investida** (avança cortando) · **Redemoinho** (giro avançando) · **Grito de guerra** (dano +35% e defesa +25% por 8 s) |
  | Montante | Guerreiro pesado | corte → corte reverso → estocada longa (lento, dano alto, alcance maior) | **Giro** de 360° · **Golpe sísmico** (onda à frente, atordoa 1,2 s) · **Fúria** (ataque 1,4× mais rápido e dano +30% por 7 s) |
  | Cajado | Mago | **Raio** arcano (projétil) | **Chama** (explode em área) · **Lança de gelo** (atravessa e deixa lento 3 s) · **Nova arcana** (explosão em volta do herói) |
  | Arco | Arqueiro | **Flecha** (rápida, longe) | **Tiro triplo** (3 flechas que atravessam) · **Flecha perfurante** (dano 5, atravessa) · **Chuva de flechas** (6 ondas no alvo) |

  Cada habilidade tem a sua recarga (3–16 s, reduzida pelo traje arcano e pela
  Energia). O dano de tudo é multiplicado pelo atributo da arma.

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
  data/                   weapons (armas e classes), items (recursos por região), buildings (gerado: medidas das casas)
  systems/                WorldGenerator (mundo e biomas), Terrain (transições), Cities (cidades e estradas),
                          Streamer (objetos por região), TileWindow, TileCollision, Gathering, Inventory, Progress,
                          SpawnSpots, BiomeFx, DayNightSystem, WeatherSystem (+ Tiles, Noise)
  ui/                     DebugPanel (teleporte, mapa, voo), InventoryPanel (mochila), AttributesPanel (atributos)
  input/                  VirtualControls, InputState
public/
  manifest.json, sw.js, icons/
  assets/                 tilesets/, sprites/, tiles/ (PNG placeholder + README de layout)
scripts/generate-assets.mjs   gerador da pixel art placeholder (mapa, inimigos, efeitos)
scripts/world-art.mjs         transições de terreno, tiles de cidade e construções por bioma
scripts/hero/                 Teren: receita e camadas LPC + montagem do spritesheet
scripts/wraith/               Errante: arte conceitual + animação procedural
CREDITS.md                fontes e licenças
```
