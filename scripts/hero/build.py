"""Teren (herói humano) — monta as folhas de sprites a partir das camadas LPC.

A receita (recipe.json) tem três partes:
  base     corpo, cabeça, olhos, nariz, sobrancelhas e cabelo;
  outfits  trajes/armaduras completos (corpo inteiro: roupa, armadura, elmo…);
  weapons  armas, cada uma com as camadas da folha universal e as animações em
           quadros grandes (golpes de 128/192 px, arco andando…).
Cada peça é uma folha "universal" do Liberated Pixel Cup (64×64 por quadro,
13 colunas × 21 linhas). No jogo, **armadura e arma são camadas separadas**
(sprites sobrepostos), então qualquer armadura combina com qualquer arma.

  python3 scripts/hero/build.py      (requer Pillow)

Saída (public/assets/sprites/):
  outfit-<id>.png         base + traje (camadas com z ≥ 10)
  outfit-<id>-back.png    o que fica atrás do corpo (capa, z < 10), se houver
  wpn-<id>-bg.png / -fg.png              arma atrás / na frente do corpo
  wpn-<id>-<anim>-bg.png / -fg.png       animações grandes da arma (o que for
                                         de 64 px, como a aljava, entra centralizado)
  armor-icons.png         retrato de cada traje (para a mochila)
e src/entities/heroSheets.ts (tamanhos, quadros e atributos).
Linhas da folha universal (cada animação em 4 direções: cima, esquerda, baixo,
direita): 0–3 magia · 4–7 estocada · 8–11 andar · 12–15 golpe · 16–19 arco · 20 queda.
Créditos e licenças de cada peça: recipe.json e CREDITS.md.
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites')
recipe = json.load(open(os.path.join(HERE, 'recipe.json'), encoding='utf-8'))
cache = {}
BACK_Z = 10  # abaixo disso a camada fica atrás do corpo


def img(layer):
    f = layer['file']
    if f not in cache:
        cache[f] = Image.open(os.path.join(HERE, 'layers', f)).convert('RGBA')
    return cache[f]


def universal(layers):
    sheet = Image.new('RGBA', (832, 1344))
    for l in sorted(layers, key=lambda l: l['z']):
        sheet.alpha_composite(img(l).crop((0, 0, 832, 1344)))
    return sheet


def save(im, name):
    im.save(os.path.join(OUT, name), optimize=True)


meta = {'outfits': {}, 'weapons': {}}
portraits = []
for oid, o in recipe['outfits'].items():
    front = [l for l in o['layers'] if l['z'] >= BACK_Z]
    back = [l for l in o['layers'] if l['z'] < BACK_Z]
    # elmo/capuz cobrem o cabelo
    base = [l for l in recipe['base'] if not (o.get('hideHair') and l['file'].startswith('hair/'))]
    sheet = universal(base + front)
    save(sheet, f'outfit-{oid}.png')
    if back:
        save(universal(back), f'outfit-{oid}-back.png')
    # retrato: de frente, parado (andar, linha "baixo", quadro 0), com a capa de trás
    p = Image.new('RGBA', (64, 64))
    if back:
        p.alpha_composite(universal(back).crop((0, 10 * 64, 64, 11 * 64)))
    p.alpha_composite(sheet.crop((0, 10 * 64, 64, 11 * 64)))
    portraits.append(p.crop((12, 8, 52, 62)))
    meta['outfits'][oid] = {k: o[k] for k in ('name', 'desc', 'defense', 'speed', 'bonus')} | {'back': bool(back), 'icon': len(portraits) - 1}
    print(f'outfit-{oid}.png', '(+ back)' if back else '')

icons = Image.new('RGBA', (40 * len(portraits), 54))
for i, p in enumerate(portraits):
    icons.alpha_composite(p, (i * 40, 0))
save(icons, 'armor-icons.png')

for wid, w in recipe['weapons'].items():
    entry = {'name': w['name'], 'class': w['class'], 'bg': False, 'fg': False, 'big': {}}
    for side, sel in (('bg', lambda l: l['z'] < BACK_Z), ('fg', lambda l: l['z'] >= BACK_Z)):
        ls = [l for l in w['layers'] if sel(l)]
        if ls:
            save(universal(ls), f'wpn-{wid}-{side}.png')
            entry[side] = True
    for b in w['big']:
        F = b['frame']
        n = len(b['cols'])
        o = (F - 64) // 2
        e = {'frame': F, 'frames': n, 'footY': o + 61, 'cols': b['cols'], 'row': b['row'], 'bg': False, 'fg': False}
        for side, sel in (('bg', lambda l: l['z'] < BACK_Z), ('fg', lambda l: l['z'] >= BACK_Z)):
            ls = [l for l in b['layers'] if sel(l)]
            if not ls:
                continue
            big = Image.new('RGBA', (n * F, 4 * F))
            for l in sorted(ls, key=lambda l: l['z']):
                im = img(l)
                for d in range(4):
                    for i, c in enumerate(b['cols']):
                        if im.size[0] == 832:  # camada de 64 px (ex.: aljava): quadro centralizado
                            fr = im.crop((c * 64, (b['row'] + d) * 64, c * 64 + 64, (b['row'] + d) * 64 + 64))
                            big.alpha_composite(fr, (i * F + o, d * F + o))
                        else:
                            big.alpha_composite(im.crop((i * F, d * F, i * F + F, d * F + F)), (i * F, d * F))
            save(big, f'wpn-{wid}-{b["anim"]}-{side}.png')
            e[side] = True
        entry['big'][b['anim']] = e
    meta['weapons'][wid] = entry
    print(f'wpn-{wid}', ' + '.join(f'{k} ({v["frame"]}px)' for k, v in entry['big'].items()))

with open(os.path.join(ROOT, 'src', 'entities', 'heroSheets.ts'), 'w', encoding='utf-8') as f:
    f.write('// Gerado por scripts/hero/build.py — não editar à mão.\n')
    f.write(f'export const HERO_SHEETS = {json.dumps(meta["weapons"], ensure_ascii=False)} as const;\n')
    f.write(f'export const OUTFITS = {json.dumps(meta["outfits"], ensure_ascii=False)} as const;\n')
    f.write('export type WeaponId = keyof typeof HERO_SHEETS;\n')
    f.write('export type OutfitId = keyof typeof OUTFITS;\n')
