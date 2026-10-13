"""Teren (herói humano) — monta os spritesheets a partir das camadas LPC.

A receita (recipe.json) tem a "base" (corpo, rosto, cabelo, roupa, capa) e as
armas. Cada peça é uma folha "universal" do Liberated Pixel Cup (64×64 por
quadro, 13 colunas × 21 linhas); trocar uma peça é trocar uma linha da
receita, e todas as animações continuam consistentes.

  python3 scripts/hero/build.py      (requer Pillow)

Para cada arma <id> gera:
  public/assets/sprites/hero-<id>.png          folha universal (base + arma)
     linhas (cada animação em 4 direções: cima, esquerda, baixo, direita):
     0–3 magia · 4–7 estocada · 8–11 andar · 12–15 golpe · 16–19 arco · 20 queda
  public/assets/sprites/hero-<id>-<anim>.png   animações em quadros grandes
     (128 ou 192 px), como os "slash_128"/"*_oversize" do gerador LPC: as
     camadas de 64 px entram centralizadas e a arma usa a arte própria.
e src/entities/heroSheets.ts com o tamanho e a ordem dos quadros de cada folha.
Créditos e licenças de cada peça: recipe.json e CREDITS.md.
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites')
recipe = json.load(open(os.path.join(HERE, 'recipe.json'), encoding='utf-8'))
cache = {}


def img(layer):
    f = layer['file']
    if f not in cache:
        cache[f] = Image.open(os.path.join(HERE, 'layers', f)).convert('RGBA')
    return cache[f]


meta = {}
for wid, w in recipe['weapons'].items():
    layers = sorted(recipe['base'] + w['layers'], key=lambda l: l['z'])
    sheet = Image.new('RGBA', (832, 1344))
    for l in layers:
        sheet.alpha_composite(img(l).crop((0, 0, 832, 1344)))
    sheet.save(os.path.join(OUT, f'hero-{wid}.png'), optimize=True)
    entry = {'name': w['name'], 'class': w['class'], 'big': {}}
    for b in w['big']:
        F = b['frame']
        n = len(b['cols'])
        o = (F - 64) // 2
        big = Image.new('RGBA', (n * F, 4 * F))
        for l in sorted(recipe['base'] + b['layers'], key=lambda l: l['z']):
            im = img(l)
            for d in range(4):
                for i, c in enumerate(b['cols']):
                    if im.size[0] == 832:  # camada de 64 px: quadro do corpo centralizado
                        fr = im.crop((c * 64, (b['row'] + d) * 64, c * 64 + 64, (b['row'] + d) * 64 + 64))
                        big.alpha_composite(fr, (i * F + o, d * F + o))
                    else:  # arte própria da animação grande
                        big.alpha_composite(im.crop((i * F, d * F, i * F + F, d * F + F)), (i * F, d * F))
        big.save(os.path.join(OUT, f'hero-{wid}-{b["anim"]}.png'), optimize=True)
        entry['big'][b['anim']] = {'frame': F, 'frames': n, 'footY': o + 61}
    meta[wid] = entry
    print(f'hero-{wid}.png', ' + '.join(f'{k} ({v["frame"]}px × {v["frames"]})' for k, v in entry['big'].items()))

with open(os.path.join(ROOT, 'src', 'entities', 'heroSheets.ts'), 'w', encoding='utf-8') as f:
    f.write('// Gerado por scripts/hero/build.py — não editar à mão.\n')
    f.write(f'export const HERO_SHEETS = {json.dumps(meta, ensure_ascii=False)} as const;\n')
    f.write('export type WeaponId = keyof typeof HERO_SHEETS;\n')
