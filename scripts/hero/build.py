"""Teren (herói humano) — monta o spritesheet a partir das camadas LPC.

A receita (recipe.json) lista as peças em ordem de profundidade; cada peça é
uma folha "universal" do Liberated Pixel Cup (64×64 por quadro, 13 colunas ×
21 linhas). Trocar uma peça (cabelo, roupa, arma) é trocar uma linha da
receita — todas as animações continuam consistentes.

  python3 scripts/hero/build.py      (requer Pillow)

Saída: public/assets/sprites/hero.png e hero-slash.png
Linhas (cada uma em 4 direções: cima, esquerda, baixo, direita):
  0–3 magia (7)   4–7 estocada (8)   8–11 andar (9)   12–15 golpe (6)
  16–19 arco (13) 20 queda/morte (6)
hero-slash.png: golpe de espada em quadros 128×128 (6 colunas × 4 direções),
como o "slash_128" do gerador LPC: cada camada do corpo/roupa entra com o
quadro do golpe normal centralizado, e a espada usa a arte própria do golpe.
Créditos e licenças de cada peça: recipe.json e CREDITS.md.
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
recipe = json.load(open(os.path.join(HERE, 'recipe.json'), encoding='utf-8'))
sheet = Image.new('RGBA', (832, 1344))
for layer in sorted(recipe['layers'], key=lambda l: l['z']):
    im = Image.open(os.path.join(HERE, 'layers', layer['file'])).convert('RGBA')
    sheet.alpha_composite(im.crop((0, 0, 832, 1344)))
out = os.path.join(ROOT, 'public', 'assets', 'sprites', 'hero.png')
sheet.save(out, optimize=True)
print('hero.png', sheet.size, len(recipe['layers']), 'camadas')

# golpe com espada em 128×128
SLASH_ROW = 12  # linhas 12–15 da folha universal (cima, esquerda, baixo, direita)
big = Image.new('RGBA', (6 * 128, 4 * 128))
layers = [(l['z'], 'body', l) for l in recipe['layers'] if 'weapon/' not in l['file']]
layers += [(l['z'], 'big', l) for l in recipe['slash128']['layers']]
for z, kind, layer in sorted(layers, key=lambda t: t[0]):
    im = Image.open(os.path.join(HERE, 'layers', layer['file'])).convert('RGBA')
    if kind == 'big':
        big.alpha_composite(im.crop((0, 0, 768, 512)))
        continue
    for d in range(4):
        for c in range(6):
            fr = im.crop((c * 64, (SLASH_ROW + d) * 64, c * 64 + 64, (SLASH_ROW + d) * 64 + 64))
            big.alpha_composite(fr, (c * 128 + 32, d * 128 + 32))
out2 = os.path.join(ROOT, 'public', 'assets', 'sprites', 'hero-slash.png')
big.save(out2, optimize=True)
print('hero-slash.png', big.size)
