"""Gera os personagens de Vaelmor a partir das peças LPC (ver lpc.py e recipes.py).

    python3 scripts/chars/build.py          (requer Pillow e numpy; baixa as peças na 1ª vez)

Saída:
  public/assets/sprites/
    outfit-<id>.png / outfit-<id>-back.png   trajes do herói (folha universal; a capa
                                             e o que fica atrás do corpo, à parte)
    wpn-<look>-bg.png / -fg.png              armas do herói (atrás / na frente do corpo)
    wpn-<look>-<anim>-bg.png / -fg.png       golpes grandes (128/192 px)
    armor-icons.png                          retrato de cada traje (mochila)
  public/assets/skins/sk-<id>.png + .json   soldados, mercadores e coletores já
                                             montados (corpo + roupa + arma), cada
                                             quadro recortado e empacotado num atlas
  src/entities/heroSheets.ts                 trajes e armas do herói
  src/data/skins.ts                          catálogo dos soldados e figurantes
  CREDITS-LPC.md                             autores e licenças de cada peça usada

Quadro dos soldados (igual ao do jogo): 96×96, pés em y = 77, 15 colunas
(0 parado, 1–8 andar, 9–14 ataque) × 4 direções (baixo, esquerda, direita, cima).
"""
import json, os, re, sys, unicodedata
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lpc  # noqa: E402
import recipes as R  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SPR = os.path.join(ROOT, 'public', 'assets', 'sprites')
SKN = os.path.join(ROOT, 'public', 'assets', 'skins')
os.makedirs(SKN, exist_ok=True)
BACK_Z = 10
CELL, FOOT, COLS = 96, 77, 15
OFF = (CELL - 64) // 2  # onde o quadro de 64 entra na célula (pés em 61 → 77)
# linha LPC por direção do jogo (0 baixo, 1 esquerda, 2 direita, 3 cima)
LPC_DIR = [2, 1, 3, 0]
used = []  # peças usadas (créditos)


def slug(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', '-', s)


def save(im, path):
    write_png(im, path)


def quant(im):
    """PNG com paleta exata (a arte LPC tem poucas cores): índice 0 = transparente."""
    a = np.array(im)
    opaque = a[..., 3] >= 128
    cols = a[..., :3][opaque]
    uniq, inv = np.unique(cols.reshape(-1, 3), axis=0, return_inverse=True)
    if len(uniq) > 255:
        # raro: reduz as cores e mantém a transparência
        q = im.convert('RGB').quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = np.array(q.getpalette()[: 255 * 3]).reshape(-1, 3)
        idx = np.array(q) + 1
        idx[~opaque] = 0
        out = Image.fromarray(idx.astype(np.uint8), 'P')
        out.putpalette([0, 0, 0] + pal.flatten().tolist())
    else:
        idx = np.zeros(a.shape[:2], np.uint8)
        idx[opaque] = inv.reshape(-1) + 1
        out = Image.fromarray(idx, 'P')
        out.putpalette([0, 0, 0] + uniq.flatten().tolist())
    return out


def write_png(im, path):
    quant(im).save(path, transparency=0, compress_level=9)


# ------------------------------------------------------------------ peças grandes
def big_of(parts, body, anim):
    """(atrás, na frente) de uma animação grande, ou (None, None)."""
    if not lpc.has_big(parts, body, anim):
        return None, None
    return lpc.big(parts, body, anim, zmax=BACK_Z), lpc.big(parts, body, anim, zmin=BACK_Z)


def big_kind(parts, body, wanted):
    for a in wanted:
        if lpc.has_big(parts, body, a):
            return a
    return None


def pick_frames(sheet, F, cols):
    """Nova folha só com as colunas `cols` (em cada uma das 4 direções)."""
    if sheet is None:
        return None
    out = Image.new('RGBA', (len(cols) * F, 4 * F))
    for d in range(4):
        for i, c in enumerate(cols):
            out.alpha_composite(sheet.crop((c * F, d * F, c * F + F, d * F + F)), (i * F, d * F))
    return out


def crop_walk_into(u, sheet, F):
    """Andar grande (128) recortado no quadro de 64 da folha universal (para o herói)."""
    o = (F - 64) // 2
    for d in range(4):
        for f in range(9):
            u.alpha_composite(sheet.crop((f * F + o, d * F + o, f * F + o + 64, d * F + o + 64)), (f * 64, (8 + d) * 64))


# ------------------------------------------------------------------ herói: armas
def hero_weapons():
    meta = {}
    for wid, w in R.WEAPON_LOOKS.items():
        parts = w['parts']
        used.extend(parts)
        cls = w['class']
        entry = {'name': w['name'], 'class': cls, 'bg': False, 'fg': False, 'big': {}}
        bg = lpc.universal(parts, 'male', zmax=BACK_Z)
        fg = lpc.universal(parts, 'male', zmin=BACK_Z)
        # arma que só tem andar grande (cimitarra, lanças): recorta no quadro normal
        wb, wf = big_of(parts, 'male', 'walk_128')
        if wb is not None and cls != 'bow':
            crop_walk_into(bg, wb, 128)
            crop_walk_into(fg, wf, 128)
        for side, im in (('bg', bg), ('fg', fg)):
            if im.getbbox():
                save(im, os.path.join(SPR, f'wpn-{wid}-{side}.png'))
                entry[side] = True
        bigs = {}

        def add(anim, sheets, F, row, cols):
            b, f = sheets
            n = len(cols)
            e = {'frame': F, 'frames': n, 'footY': (F - 64) // 2 + 61, 'cols': cols, 'row': row, 'bg': False, 'fg': False}
            for side, im in (('bg', b), ('fg', f)):
                if im is not None and im.getbbox():
                    save(im, os.path.join(SPR, f'wpn-{wid}-{anim}-{side}.png'))
                    e[side] = True
            bigs[anim] = e

        if cls == 'sword':
            k = big_kind(parts, 'male', ['slash_128', 'slash_oversize'])
            F = lpc.BIG[k][0]
            add('slash', big_of(parts, 'male', k), F, 12, [0, 1, 2, 3, 4, 5])
        elif cls == 'greatsword':
            k = big_kind(parts, 'male', ['slash_oversize', 'slash_128'])
            F = lpc.BIG[k][0]
            sl = big_of(parts, 'male', k)
            add('slash', sl, F, 12, [0, 1, 2, 3, 4, 5])
            if lpc.has_big(parts, 'male', 'slash_reverse_oversize'):
                add('rslash', big_of(parts, 'male', 'slash_reverse_oversize'), 192, 12, [5, 4, 3, 2, 1, 0])
            else:
                add('rslash', tuple(pick_frames(s, F, [5, 4, 3, 2, 1, 0]) for s in sl), F, 12, [5, 4, 3, 2, 1, 0])
            if lpc.has_big(parts, 'male', 'thrust_oversize'):
                add('thrust', big_of(parts, 'male', 'thrust_oversize'), 192, 4, [0, 1, 2, 3, 4, 5, 6, 7])
            else:
                # sem estocada própria: o golpe esticado em 8 passos
                seq = [0, 1, 2, 3, 3, 4, 5, 5]
                add('thrust', tuple(pick_frames(s, F, seq) for s in sl), F, 12, seq)
        elif cls == 'staff':
            add('thrust', big_of(parts, 'male', 'thrust_oversize'), 192, 4, [0, 1, 2, 3, 4, 5, 6, 7])
        elif cls == 'bow':
            add('walk', tuple(pick_frames(s, 128, [1, 2, 3, 4, 5, 6, 7, 8]) for s in big_of(parts, 'male', 'walk_128')), 128, 8, [1, 2, 3, 4, 5, 6, 7, 8])
        entry['big'] = bigs
        meta[wid] = entry
        print('arma', wid, cls, ', '.join(f'{a} {e["frame"]}' for a, e in bigs.items()))
    return meta


# ------------------------------------------------------------------ herói: trajes
def hero_outfits():
    meta = {}
    portraits = []
    body, base = R.person(**R.HERO_BODY)
    items = [(oid, o) for oid, o in R.HERO_OUTFITS.items()]
    for b, lst in R.RARE_OUTFITS.items():
        src = R.HERO_OUTFITS[b]
        for e in lst:
            name, parts = e[0], e[1]
            nohair = len(e) > 2 and e[2]
            items.append((f'g_{slug(name)}', R.O(name, src['desc'], src['defense'], src['speed'], src['bonus'], parts, nohair, b)))
    for oid, o in items:
        b = R.strip_hair(base) if o['nohair'] else base
        parts = b + o['parts']
        used.extend(parts)
        front = lpc.universal(parts, body, zmin=BACK_Z)
        back = lpc.universal(parts, body, zmax=BACK_Z)
        has_back = back.getbbox() is not None
        save(front, os.path.join(SPR, f'outfit-{oid}.png'))
        if has_back:
            save(back, os.path.join(SPR, f'outfit-{oid}-back.png'))
        # retrato: de frente, parado, com a capa
        p = Image.new('RGBA', (64, 64))
        if has_back:
            p.alpha_composite(back.crop((0, 10 * 64, 64, 11 * 64)))
        p.alpha_composite(front.crop((0, 10 * 64, 64, 11 * 64)))
        portraits.append(p.crop((12, 8, 52, 62)))
        meta[oid] = {'name': o['name'], 'desc': o['desc'], 'defense': o['defense'], 'speed': o['speed'], 'bonus': o['bonus'], 'back': has_back, 'icon': len(portraits) - 1, 'base': o['base'] or oid}
        print('traje', oid)
    icons = Image.new('RGBA', (40 * len(portraits), 54))
    for i, p in enumerate(portraits):
        icons.alpha_composite(p, (i * 40, 0))
    save(icons, os.path.join(SPR, 'armor-icons.png'))
    return meta


# ------------------------------------------------------------------ soldados e figurantes
ATTACK_PICK = [0, 1, 2, 4, 5, 7]  # 6 dos 8 passos da estocada
SHOOT_PICK = [1, 3, 5, 7, 8, 10]


def bake(sid, body, parts, weapon, kind):
    """Folha 15×4 de células 96×96, recortada e empacotada num atlas."""
    allp = parts + weapon
    used.extend(allp)
    U = lpc.universal(allp, body)
    cells = {}

    def blank():
        return Image.new('RGBA', (CELL, CELL))

    def put_uni(c, row, col):
        c.alpha_composite(U.crop((col * 64, row * 64, col * 64 + 64, row * 64 + 64)), (OFF, OFF))

    def put_big(c, sheet, F, i, d):
        if sheet is None:
            return
        o = (F - 64) // 2
        fr = sheet.crop((i * F, d * F, i * F + F, d * F + F))
        # recorta o que passa da célula
        x = OFF - o
        y = OFF - o
        box = (max(0, -x), max(0, -y), min(F, CELL - x), min(F, CELL - y))
        c.alpha_composite(fr.crop(box), (max(0, x), max(0, y)))

    wb, wf = big_of(weapon, body, 'walk_128') if weapon else (None, None)
    # ataque: qual folha grande, que linha do corpo e que colunas
    atk = None
    if kind in ('sword', 'greatsword'):
        k = big_kind(weapon, body, ['slash_128', 'slash_oversize'] if kind == 'sword' else ['slash_oversize', 'slash_128', 'thrust_oversize'])
        if k and k.startswith('slash'):
            atk = (big_of(weapon, body, k), lpc.BIG[k][0], 12, [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5])
        elif k == 'thrust_oversize':
            atk = (big_of(weapon, body, k), 192, 4, ATTACK_PICK, ATTACK_PICK)
        else:
            atk = ((None, None), 64, 4 if kind == 'greatsword' else 12, ATTACK_PICK if kind == 'greatsword' else [0, 1, 2, 3, 4, 5], None)
    elif kind == 'staff':
        if lpc.has_big(weapon, body, 'thrust_oversize'):
            atk = (big_of(weapon, body, 'thrust_oversize'), 192, 4, ATTACK_PICK, ATTACK_PICK)
        else:
            atk = ((None, None), 64, 4, ATTACK_PICK, None)
    elif kind == 'bow':
        atk = ((None, None), 64, 16, SHOOT_PICK, None)
    elif kind in ('tool_axe', 'tool_hammer'):
        seq = [5, 4, 3, 1, 0, 0]
        atk = (big_of(weapon, body, kind), 128, 12, seq, seq)
    elif kind == 'thrust':
        atk = ((None, None), 64, 4, ATTACK_PICK, None)
    else:
        atk = ((None, None), 64, 8, [0, 1, 2, 3, 4, 5], None)
    (ab, af), AF, arow, acols, wcols = atk
    for d in range(4):
        lr = LPC_DIR[d]
        for c in range(COLS):
            cell = blank()
            if c <= 8:
                if wb is not None:
                    put_big(cell, wb, 128, c, lr)
                put_uni(cell, 8 + lr, c)
                if wf is not None:
                    put_big(cell, wf, 128, c, lr)
            else:
                i = c - 9
                if ab is not None:
                    put_big(cell, ab, AF, wcols[i], lr)
                put_uni(cell, arow + lr, acols[i])
                if af is not None:
                    put_big(cell, af, AF, wcols[i], lr)
            cells[d * COLS + c] = cell
    pack(sid, cells)


def pack(sid, cells):
    """Recorta cada célula ao desenho e empacota em prateleiras (atlas JSON do Phaser)."""
    items = []
    for k, im in cells.items():
        bb = im.getbbox() or (0, 0, 1, 1)
        items.append((k, bb, im.crop(bb)))
    items.sort(key=lambda t: -(t[1][3] - t[1][1]))
    W = 512
    x = y = rowh = 0
    pos = {}
    for k, bb, im in items:
        w, h = im.size
        if x + w > W:
            x = 0
            y += rowh + 1
            rowh = 0
        pos[k] = (x, y)
        x += w + 1
        rowh = max(rowh, h)
    H = y + rowh
    atlas = Image.new('RGBA', (W, H))
    frames = {}
    for k, bb, im in items:
        px, py = pos[k]
        atlas.alpha_composite(im, (px, py))
        w, h = im.size
        frames[str(k)] = {
            'frame': {'x': px, 'y': py, 'w': w, 'h': h},
            'rotated': False,
            'trimmed': True,
            'spriteSourceSize': {'x': bb[0], 'y': bb[1], 'w': w, 'h': h},
            'sourceSize': {'w': CELL, 'h': CELL},
        }
    write_png(atlas, os.path.join(SKN, f'sk-{sid}.png'))
    with open(os.path.join(SKN, f'sk-{sid}.json'), 'w') as f:
        json.dump({'frames': frames, 'meta': {'image': f'sk-{sid}.png', 'size': {'w': W, 'h': H}, 'scale': '1'}}, f, separators=(',', ':'))


ROLE = {'sword': 'warrior', 'greatsword': 'warrior', 'bow': 'archer', 'staff': 'mage'}
ROLE_I = {'warrior': 0, 'archer': 1, 'mage': 2}


def faction_skins(key, F):
    out = []
    for t, tier in enumerate(F['tiers']):
        row = {}
        for typ in ('sword', 'greatsword', 'bow', 'staff'):
            role = ROLE[typ]
            ids = []
            # recrutas de espada e arco: duas caras (variedade nas fileiras)
            people = F['people']
            variants = [people[0], people[2 if typ == 'bow' else 1]] if t <= 1 and typ in ('sword', 'bow') else [people[{'sword': 0, 'greatsword': 1, 'bow': 2, 'staff': 1}[typ] % len(people)]]
            for vi, ppl in enumerate(variants):
                if t == 3 and F.get('elite'):
                    ppl = F['elite']
                body, base = R.person(**ppl)
                if tier['nohair'][ROLE_I[role]]:
                    base = R.strip_hair(base)
                sid = f'{key}-{t}-{typ}' + (f'-{vi}' if len(variants) > 1 else '')
                bake(sid, body, base + tier[role], F['weapons'][typ][t], typ)
                ids.append(sid)
                print('pele', sid)
            row[typ] = ids
        out.append(row)
    return out


def main():
    only = set(sys.argv[1:])
    weapons = outfits = None
    if not only or 'hero' in only:
        weapons = hero_weapons()
        outfits = hero_outfits()
        with open(os.path.join(ROOT, 'src', 'entities', 'heroSheets.ts'), 'w', encoding='utf-8') as f:
            f.write('// Gerado por scripts/chars/build.py — não editar à mão.\n')
            f.write(f'export const HERO_SHEETS = {json.dumps(weapons, ensure_ascii=False)} as const;\n')
            f.write(f'export const OUTFITS = {json.dumps(outfits, ensure_ascii=False)} as const;\n')
            f.write("/** Classe da arma (o que ela faz). */\nexport type WeaponId = 'sword' | 'greatsword' | 'staff' | 'bow';\n")
            f.write('/** Aparência da arma (qual folha de sprites). */\nexport type LookId = keyof typeof HERO_SHEETS;\n')
            f.write('export type OutfitId = keyof typeof OUTFITS;\n')
    if not only or 'skins' in only:
        cat = {'factions': {}, 'ally': None, 'merchants': [], 'workers': {}}
        for b, F in R.FACTIONS.items():
            cat['factions'][b] = {'name': F['name'], 'tiers': faction_skins(f'b{b}', F)}
        cat['ally'] = faction_skins('ally', R.ALLY)
        for i, (ppl, parts) in enumerate(R.MERCHANTS):
            body, base = R.person(**ppl)
            bake(f'merchant-{i}', body, base + parts, [], 'idle')
            cat['merchants'].append(f'merchant-{i}')
            print('pele mercador', i)
        for job, (ppl, parts, tool) in R.WORKERS.items():
            body, base = R.person(**ppl)
            kind = 'tool_axe' if 'axe' in tool[0] or 'pickaxe' in tool[0] else 'tool_hammer' if 'hammer' in tool[0] else 'thrust'
            bake(f'worker-{job}', body, base + parts, [tool], kind)
            cat['workers'][job] = f'worker-{job}'
            print('pele coletor', job)
        with open(os.path.join(ROOT, 'src', 'data', 'skins.ts'), 'w', encoding='utf-8') as f:
            f.write('// Gerado por scripts/chars/build.py — não editar à mão.\n')
            f.write('/** Soldados e figurantes já montados (public/assets/skins/sk-<id>.png + .json). */\n')
            f.write(f'export const SKINS = {json.dumps(cat, ensure_ascii=False)} as const;\n')
            f.write(f'/** Célula de cada quadro, linha dos pés e colunas (0 parado, 1–8 andar, 9–14 ataque). */\nexport const SKIN_CELL = {CELL};\nexport const SKIN_FOOT = {FOOT};\nexport const SKIN_COLS = {COLS};\n')
    write_credits()


def all_parts():
    """Todas as peças que as receitas usam (para os créditos, rode o que rodar)."""
    out = []
    out += R.person(**R.HERO_BODY)[1]
    for o in R.HERO_OUTFITS.values():
        out += o['parts']
    for lst in R.RARE_OUTFITS.values():
        for e in lst:
            out += e[1]
    for w in R.WEAPON_LOOKS.values():
        out += w['parts']
    for F in list(R.FACTIONS.values()) + [R.ALLY]:
        for ppl in F['people'] + ([F['elite']] if F.get('elite') else []):
            out += R.person(**ppl)[1]
        for tier in F['tiers']:
            for role in ('warrior', 'archer', 'mage'):
                out += tier[role]
        for lst in F['weapons'].values():
            for w in lst:
                out += w
    for ppl, parts in R.MERCHANTS:
        out += R.person(**ppl)[1] + parts
    for ppl, parts, tool in R.WORKERS.values():
        out += R.person(**ppl)[1] + parts + [tool]
    return out


def write_credits():
    seen = {}
    for name, _ in all_parts():
        if name in seen:
            continue
        seen[name] = lpc.credits([(name, {})])
    lines = [
        '# Créditos das peças LPC',
        '',
        'Personagens (herói, soldados, mercadores, coletores) montados por `scripts/chars/build.py`',
        'com peças do **Universal LPC Spritesheet Character Generator**',
        '(https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator).',
        'Cada peça mantém a licença dos autores (CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0, CC0…).',
        '',
        '| Peça | Arquivo | Autores | Licenças | Fontes |',
        '|---|---|---|---|---|',
    ]
    for name in sorted(seen):
        for file, c in sorted(seen[name].items()):
            lines.append(f"| `{name}` | `{file}` | {', '.join(c.get('authors', []))} | {', '.join(c.get('licenses', []))} | {' '.join(c.get('urls', [])[:2])} |")
    with open(os.path.join(ROOT, 'CREDITS-LPC.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
