# Vaelmor — Projeto: expansão do mundo, mapa, coleta e inventário

> Documento de projeto (nada aqui está implementado ainda). Serve de guia para
> as próximas etapas. Valores numéricos são pontos de partida para ajuste.

## 0. Premissa

> Revisado: o herói voltou a ser **humano**; o ser encapuzado do conceito
> virou o mob **Errante**.

**Teren** é um aventureiro humano. Por uma **Fenda** no Blackland, seres de
**outra dimensão** atravessam para este mundo: os **Errantes**, figuras
encapuzadas de rosto escuro e olhos de luz, com mantos que se desfazem em
fios de "céu estrelado".

Consequências de jogo que o projeto aproveita:

- As vilas (Brumavale, Pedrafria) seguem habitadas e são os pontos seguros;
  vilas mais perto do Blackland estão abandonadas e viram **ruínas** com baús.
- O **Blackland** é a região ao redor da Fenda: a outra dimensão "vaza"
  para cá, escurecendo a terra e fazendo nascer cristais. É onde os Errantes
  são mais comuns e mais fortes.
- A fauna e os inimigos são nativos de cada bioma; Errantes aparecem em
  florestas fechadas e à noite em qualquer bioma.

---

## 1. Mundo e biomas

### 1.1 Estrutura do mundo

| Item | Proposta |
|---|---|
| Tamanho | **1024 × 1024 tiles** (≈ 70× o mapa atual de 120 × 120) |
| Divisão | **chunks de 32 × 32 tiles** carregados por proximidade (raio de 3 chunks em volta da câmera); fora disso, só os dados ficam em memória |
| Geração | determinística pela seed; o mapa nunca é gerado inteiro de uma vez, cada chunk é gerado quando entra no raio |
| Biomas | escolhidos por três campos de ruído: **temperatura**, **umidade** e **corrupção** (distância até a Fenda), mais **altitude** para montanhas, rios e lagos |
| Transições | faixa de mistura de 6–10 tiles entre biomas (vegetação e chão se misturam, sem fronteira reta) |
| Escala | tiles de 16 px; câmera mantém ~20 × 12 tiles visíveis |

Tabela de decisão por campo (valores normalizados 0–1):

| Corrupção | Temperatura | Umidade | Bioma |
|---|---|---|---|
| > 0,72 | — | — | **Blackland** |
| ≤ 0,72 | < 0,30 | — | **Snowland** |
| ≤ 0,72 | > 0,70 | < 0,35 | **Dustland** (deserto) |
| ≤ 0,72 | 0,30–0,70 | < 0,30 | **Blockland** |
| ≤ 0,72 | 0,30–0,70 | ≥ 0,30 | **Greenland** |

Altitude alta vira montanha em qualquer bioma (penhascos com passagens, como a
escarpa atual). Rios nascem em altitudes altas e descem pelo gradiente até
lagoas ou até o mar na borda do mundo.

Disposição sugerida (para orientar a geração): Fenda + Blackland no centro-
leste; Greenland ao redor do ponto de chegada (oeste); Snowland ao norte;
Dustland ao sul; Blockland nas faixas de transição e cadeias de montanha.

### 1.2 Greenland — florestas majestosas

- **Identidade:** floresta densa e antiga, árvores enormes (copa de 4×4 a
  6×6 tiles), clareiras com luz, rios largos, cachoeiras e lagoas.
- **Paleta:** verdes saturados, troncos castanhos, flores amarelas e
  violetas, água azul-turquesa.
- **Terreno:** chão de musgo e grama alta, raízes expostas, troncos caídos
  (obstáculos), pontes naturais, cogumelos gigantes em áreas úmidas.
- **Fauna:** cervos, javalis, coelhos, pássaros em bando, peixes nos rios,
  vaga-lumes à noite.
- **Inimigos:** limos (atuais), lobos (atuais), **ent-jovem** (tronco que
  acorda), **vespa-de-seiva** (enxame pequeno).
- **Ambiente:** neblina matinal comum, chuva frequente, raios de luz entre as
  copas (sprites ADD), muitos sons de vida.
- **Recursos:** madeira (T1–T4), fibra (linho, algodão-bravo), ervas,
  cogumelos, couro leve.
- **Marcos:** Árvore-Mãe (gigante, mirante), Queda do Serro (atual), ruínas
  de Brumavale.

### 1.3 Snowland — o norte congelado

- **Identidade:** neve funda, lagos congelados, pinheiros altíssimos (copa
  alta e estreita, 2×6 tiles), ambiente **mais escuro e azulado** mesmo de dia.
- **Paleta:** brancos azulados, azul-petróleo, verde-escuro dos pinheiros,
  luzes frias.
- **Terreno:** neve (deixa pegadas e reduz a velocidade em 15%), gelo
  (escorrega: aceleração reduzida), montes de neve, estalactites de gelo,
  cavernas.
- **Fauna:** raposas-do-gelo, alces de pelagem branca, corujas, peixes sob o
  gelo (buraco de pesca).
- **Inimigos:** **lobos-da-geada** (variante dos lobos), **golem de gelo**
  (lento, forte), **espírito da nevasca** (aparece na tempestade).
- **Ambiente:** **neve constante** (partículas, densidade variável),
  nevascas que reduzem a visão, aurora boreal à noite.
- **Recursos:** madeira de pinheiro (T3–T6), minério de prata, cristal de
  gelo, couro grosso, peixe.
- **Mecânica do bioma:** **Frio** — barra que sobe longe de fogueiras e à
  noite; cheia, causa lentidão. A Chama de Teren acende fogueiras.

### 1.4 Blockland — pedra e blocos

- **Identidade:** planaltos de rocha, blocos e pilares de pedra, mesas
  (formações de topo plano), desfiladeiros. Pouca vegetação, poucos rios.
- **Paleta:** cinzas quentes, ocre, arenito, liquens verde-acinzentados.
- **Terreno:** muitos desníveis com rampas e escadarias naturais, cascalho,
  pedras quebráveis que abrem atalhos.
- **Fauna:** cabras-montesas, lagartos, aves de rapina.
- **Inimigos:** **bandoleiros** viram **saqueadores-de-pedra** (não humanos:
  criaturas de rocha), **golem de rocha**, **tatu-pedra** (rola e investe).
- **Ambiente:** vento (partículas de poeira), céu limpo, calor de dia e frio
  à noite.
- **Recursos:** **pedra (T1–T6)**, minério de ferro e cobre, carvão,
  pedras preciosas raras.
- **Marcos:** Escadaria dos Antigos, pedreiras abandonadas, Pedrafria
  (ruína atual).

### 1.5 Blackland — a terra arrasada

- **Identidade:** terra "caída" em volta da Fenda: chão escuro e rachado,
  árvores mortas, ruínas engolidas, **cristais** brotando por toda parte.
  O lugar mais perigoso e o mais rico.
- **Paleta:** pretos e roxos profundos, cinza cinza-chumbo, cristais em
  violeta, ciano e magenta (os únicos pontos de luz — usar glow ADD).
- **Terreno:** chão de obsidiana e cinza, poças de "vazio" (dano contínuo),
  pontes de cristal, fendas no chão.
- **Vegetação especial:** **flor-eco** (brilha quando Teren se aproxima),
  **árvore-de-vidro**, musgo luminoso.
- **Fauna:** quase nenhuma nativa; **ecos** (versões translúcidas de
  animais de outros biomas).
- **Inimigos:** **sombras** (rápidas, só podem ser atingidas pela Chama ou
  após o golpe revelá-las), **colosso de cristal**, **devorador do vazio**.
- **Ambiente:** céu sempre crepuscular, partículas subindo do chão,
  cristais pulsando; a luz ambiente segue o ciclo de dia, mas nunca passa de
  um "fim de tarde".
- **Recursos:** **cristais (T4–T8)**, essência do vazio, minério negro,
  madeira petrificada.
- **Mecânica do bioma:** **Ressonância** — Teren é da outra dimensão, então
  aqui ele regenera devagar e a Chama custa menos; inimigos são mais fortes.

### 1.6 Dustland — o deserto (proposta)

- **Identidade:** dunas, cânions vermelhos, oásis raros e **ruínas meio
  enterradas** de cidades antigas (pistas da lore dos humanos extintos).
- **Paleta:** areia dourada, terracota, céu muito claro, verde-esmeralda dos
  oásis.
- **Terreno:** areia (passos deixam rastro que o vento apaga), areia
  movediça (prende), rochas esculpidas pelo vento, cactos e arbustos secos.
- **Fauna:** escorpiões (pequenos), camelos-de-areia, serpentes.
- **Inimigos:** **escaravelho blindado**, **verme-das-dunas** (surge da
  areia), **múmia-eco** nas ruínas.
- **Ambiente:** calor (ondulação de miragem por cima do horizonte —
  deformação leve só no fundo), **tempestade de areia** (substitui chuva).
- **Recursos:** areia (vidro), pedra calcária, fibra de cacto, couro de
  réptil, relíquias.
- **Mecânica do bioma:** **Sede/Calor** — o oposto do Frio; oásis e sombra
  recuperam.

### 1.7 Clima por bioma

O `WeatherSystem` atual passa a ter tabelas por bioma:

| Bioma | Climas possíveis |
|---|---|
| Greenland | limpo, chuva, neblina, tempestade |
| Snowland | neve leve, nevasca, limpo-frio, aurora (noite) |
| Blockland | limpo, vento de poeira, chuva rara |
| Blackland | "cinzas" (partículas subindo), pulso de cristal, limpo-escuro |
| Dustland | limpo, calor, tempestade de areia |

Na transição entre biomas, o clima faz crossfade pela posição do jogador.

### 1.8 Desempenho (celular)

- Só os chunks próximos têm tilemap e objetos; o resto é dado bruto.
- Teto de partículas por clima (≤ 150), luzes ADD só dentro da câmera.
- Criaturas fora do raio de simulação congelam (já é assim hoje).
- Atlas de tiles por bioma (carregado sob demanda), todos extrudados.

---

## 2. Mapa e coleta

### 2.1 Mapa

- **Minimapa** circular no canto superior direito (sem cobrir botões):
  mostra terreno ao redor, rios, recursos próximos (opcional) e inimigos
  fortes. Toque abre o mapa completo.
- **Mapa completo** (tela cheia, pausa a ação):
  - **Névoa de exploração:** só aparece o que Teren já viu (raio de
    descoberta ~12 tiles), salvo por chunk.
  - Legenda por bioma, ícones de **marcos**, ruínas, a Fenda e nascentes.
  - **Marcadores do jogador** (toque longo): até 20, com 6 ícones.
  - **Pedras de passagem** (viagem rápida) descobertas em cada bioma.
  - Pinça para zoom, arrastar para mover (no mapa a pinça é liberada).
- Gerado a partir dos mesmos dados de bioma/altitude: cada chunk vira 32×32
  pixels numa textura do mapa, atualizada ao descobrir.

### 2.2 Coleta

Inspirada no Albion Online, simplificada para o celular.

**Tipos de recurso (5 famílias):**

| Família | Nó no mundo | Exemplos por bioma |
|---|---|---|
| Madeira | árvores | carvalho (Green), pinheiro (Snow), petrificada (Black) |
| Pedra | rochas | arenito (Block), calcário (Dust), obsidiana (Black) |
| Minério | veios | cobre/ferro (Block), prata (Snow), minério negro (Black) |
| Fibra | plantas | linho (Green), fibra de cacto (Dust) |
| Couro | animais caçados | couro leve (Green), grosso (Snow), réptil (Dust) |
| Especiais | — | cristais (Black), ervas, cogumelos, peixe, relíquias |

**Tiers:** T1 a T8. O tier do nó depende do bioma e da distância até a
Fenda (mais perto = tier mais alto). Cor do contorno/brilho indica o tier.

**Como coletar:**

1. Ao chegar perto de um nó, o botão contextual **COLETAR** substitui o
   GOLPE (ou aparece acima dele) e o nó ganha contorno.
2. **Segurar** o botão (ou a tecla E) coleta em ciclos de ~1,2 s; cada ciclo
   gera 1–3 unidades e reduz a "carga" do nó.
3. O nó tem **carga** (ex.: 6 ciclos para T1, 10 para T5); esgotado, fica
   visualmente "vazio" e **renasce** depois de 3–10 min.
4. Coletar tier acima do nível de coleta do jogador é possível, mas lento
   (ciclo × 2) e com chance de falha.
5. Chance pequena de **item raro** por ciclo (semente, gema, relíquia).
6. Interrupções: levar dano cancela o ciclo atual.

**Progressão:** cada família tem um nível de coleta (1–100) que sobe ao
coletar; o nível reduz o tempo do ciclo e libera tiers.

**Ferramentas:** ignoradas por enquanto (os slots de equipamento ficam para
depois); a coleta usa as mãos de Teren com um efeito de "puxar" etéreo.

---

## 3. Inventário (estilo Albion Online, sem slots de equipamento)

### 3.1 Regras

| Regra | Proposta |
|---|---|
| Espaços | **48 slots** em grade (8 × 6) |
| Pilhas | até **999** por slot para recursos; 1 para itens únicos |
| Peso | cada item tem peso; **capacidade de carga** ~ 300 kg; acima de 100% a velocidade cai (como no Albion): 100–125% −20%, 125–150% −50%, >150% quase parado |
| Tiers | ícone com **numeral romano** (I–VIII) no canto e cor por tier |
| Encantamento | `.0` a `.3` (fio de brilho no contorno), para o futuro |
| Qualidade | normal → obra-prima (5 níveis), para itens fabricados no futuro |
| Organizar | botão **Ordenar** (por tipo → tier → quantidade) |
| Dividir pilha | segurar + arrastar abre o seletor de quantidade |
| Descartar | arrastar para fora / lixeira, com confirmação |

### 3.2 Interface (mobile em paisagem)

- Abre por um botão de mochila no HUD (canto superior esquerdo, ao lado da
  vida) ou pela tecla **I**.
- Painel ocupa a metade direita da tela; a metade esquerda mostra Teren e a
  barra de **peso** (kg atual / máximo, colorida pela faixa de lentidão).
- Toque seleciona → painel de **detalhes** (nome, tier, peso unitário e
  total, descrição, valor); **toque longo + arrastar** move; soltar sobre
  outra pilha igual **junta**.
- Slots com 56 px no mínimo (mesma regra dos botões atuais).
- O jogo **não pausa** com o inventário aberto (como no Albion), mas o
  movimento fica bloqueado enquanto ele estiver aberto.

### 3.3 Modelo de dados

```ts
interface ItemDef {
  id: string;            // "madeira_carvalho"
  family: 'madeira' | 'pedra' | 'minerio' | 'fibra' | 'couro' | 'especial';
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  weight: number;        // kg por unidade
  maxStack: number;      // 999 ou 1
  icon: string;          // frame no atlas de ícones
  biome?: string;
}

interface ItemStack {
  defId: string;
  qty: number;
  enchant?: 0 | 1 | 2 | 3;
  quality?: 1 | 2 | 3 | 4 | 5;
}

interface Inventory {
  slots: (ItemStack | null)[]; // 48
  capacity: number;            // kg
}
```

- Itens definidos em `src/data/items.json` (tabela por família × tier).
- O inventário vira um sistema (`InventorySystem`) com eventos
  (`added`, `removed`, `weightChanged`) consumidos pela UI e pelo jogador
  (velocidade). A UI fica numa cena própria (`InventoryScene`) sobre a UIScene.
- Salvamento fica para depois (o formato acima já é serializável).

---

## 4. Personagem: Teren (aplicado nesta versão)

- Arte: camadas **LPC** (Liberated Pixel Cup) montadas por
  `scripts/hero/build.py` a partir de `scripts/hero/recipe.json` — corpo,
  rosto, cabelo, roupa, capa e espada como peças. A receita é o embrião dos
  **slots de equipamento**: equipar uma armadura = trocar a camada de torso.
- Animações: andar, golpe (128×128 com rastro), magia e queda da arte; giro
  do finalizador, disparada da esquiva, poeira e recuo feitos em código.
- O ser encapuzado do conceito é o mob **Errante** (`scripts/wraith/`).

## 5. Ordem sugerida de implementação

1. **Mundo em chunks** com um bioma só (Greenland) e streaming — base técnica.
2. Campos de bioma + tabela de decisão + transições; Snowland e Blockland.
3. Blackland (cristais com glow) e Dustland.
4. Clima por bioma.
5. Nós de coleta + botão COLETAR + níveis de coleta.
6. InventorySystem + InventoryScene + peso/velocidade.
7. Minimapa e mapa completo com névoa de exploração.
8. Ruínas e marcos com a lore dos humanos extintos.

## 6. Arte necessária (por bioma)

Para cada bioma: tileset de chão com transições (autotile 47 peças),
água/gelo/areia animados, 3–5 árvores ou formações grandes, 10–15
decorações, 3 nós de coleta por tier visual, 2–3 criaturas e 2–3 inimigos,
ícones de inventário dos recursos. Recomendo a mesma pipeline do Teren:
arte conceitual (gerada ou feita por artista) → redução e animação
automatizadas, para manter o estilo coeso.
