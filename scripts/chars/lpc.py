"""Acesso às peças do Universal LPC Spritesheet Character Generator.

Usa um clone esparso do repositório (só baixa os arquivos que a receita pede),
lê as definições (sheet_definitions/*.json), recolore pelas paletas do LPC
(a arte vem numa cor base e a variante é um mapa de cores) e monta:

  universal(parts, body)   folha "universal" 832×1344 (13×21 quadros de 64 px):
                           0–3 magia · 4–7 estocada · 8–11 andar · 12–15 golpe ·
                           16–19 arco · 20 queda — a mesma do herói.
  big(parts, body, anim)   animações grandes das armas e ferramentas
                           (golpes de 128/192 px, estocada de 192, andar 128…).

Cada peça é (definição, opções): a definição é o caminho do JSON sem a pasta
nem a extensão (ex.: 'torso/armour/torso_armour_plate'); as opções dão a cor
('color', ou 'color_1'/'color_2' quando a peça tem duas) e, se preciso, 'z'.
"""
import json, os, subprocess
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_URL = 'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git'
REPO = os.environ.get('LPC_REPO', os.path.join(HERE, '.lpc'))

# animações da folha universal: (nome, linha inicial, quadros)
UNIVERSAL = [('spellcast', 0, 7), ('thrust', 4, 8), ('walk', 8, 9), ('slash', 12, 6), ('shoot', 16, 13), ('hurt', 20, 6)]
# animações grandes: tamanho do quadro e número de quadros por direção
BIG = {
    'slash_128': (128, 6),
    'halfslash_128': (128, 6),
    'thrust_128': (128, 8),
    'walk_128': (128, 9),
    'slash_oversize': (192, 6),
    'slash_reverse_oversize': (192, 6),
    'thrust_oversize': (192, 8),
    'tool_axe': (128, 6),
    'tool_hammer': (128, 6),
}

_index = None
_warned = set()
_have = set()
_defs = {}
_pal = {}


def ensure_repo():
    if not os.path.isdir(os.path.join(REPO, '.git')):
        subprocess.run(['git', 'clone', '--depth', '1', '--filter=blob:none', '--sparse', REPO_URL, REPO], check=True)
        subprocess.run(['git', '-C', REPO, 'sparse-checkout', 'set', '--no-cone', 'sheet_definitions/*', 'palette_definitions/*', 'CREDITS.csv'], check=True)


def index():
    global _index
    if _index is None:
        ensure_repo()
        out = subprocess.run(['git', '-C', REPO, 'ls-tree', '-r', '--name-only', 'HEAD'], check=True, capture_output=True, text=True).stdout
        _index = set(out.split('\n'))
    return _index


def fetch(paths):
    """Traz para o disco os arquivos pedidos (em lote: um só `sparse-checkout add`)."""
    need = [p for p in paths if p not in _have and not os.path.exists(os.path.join(REPO, p))]
    if need:
        subprocess.run(['git', '-C', REPO, 'sparse-checkout', 'add', '--stdin'], input='\n'.join(need), text=True, check=True, capture_output=True)
    _have.update(paths)


def definition(name):
    if name not in _defs:
        ensure_repo()
        with open(os.path.join(REPO, 'sheet_definitions', name + '.json'), encoding='utf-8') as f:
            _defs[name] = json.load(f)
    return _defs[name]


def palette(material, family='ulpc'):
    key = (material, family)
    if key not in _pal:
        with open(os.path.join(REPO, 'palette_definitions', material, f'{material}_{family}.json'), encoding='utf-8') as f:
            _pal[key] = json.load(f)
    return _pal[key]


META_BASE = {'cloth': 'white', 'metal': 'steel', 'body': 'light', 'hair': 'orange', 'wood': 'maple', 'eye': 'blue'}


def _hex(c):
    c = c.lstrip('#')
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))


def _family_of(material, variant):
    """Em que paleta (ulpc/lpcr) está a variante."""
    for fam in ('ulpc', 'lpcr'):
        try:
            if variant in palette(material, fam):
                return fam
        except FileNotFoundError:
            pass
    raise KeyError(f'cor {variant!r} não existe em {material}')


def color_map(recolor, wanted):
    """Mapa cor-base → cor-alvo para uma peça (uma ou duas cores)."""
    if not recolor:
        return {}
    slots = [(recolor, wanted.get('color'))] if 'material' in recolor else [(recolor[k], wanted.get(k)) for k in sorted(recolor) if k.startswith('color_')]
    out = {}
    for spec, target in slots:
        if not target:
            continue
        mat = spec['material']
        base = spec.get('base') or META_BASE[mat]
        bfam = 'ulpc'
        if '.' in base:
            bfam, base = base.split('.')
        src = palette(mat, bfam).get(base)
        if src is None:
            src = palette(mat, _family_of(mat, base))[base]
        dst = None
        cands = [(mat, bfam), (mat, 'ulpc'), (mat, 'lpcr')] + [tuple(p.split('.')) for p in spec.get('palettes', []) if '.' in p]
        for m2, f2 in cands:
            try:
                pal = palette(m2, f2)
            except FileNotFoundError:
                continue
            if target in pal:
                dst = pal[target]
                break
        if dst is None:
            print(f'  aviso: cor {target!r} não existe para {mat}')
            continue
        if len(dst) != len(src):
            # paletas de tamanhos diferentes: estica a menor
            dst = [dst[round(i * (len(dst) - 1) / max(1, len(src) - 1))] for i in range(len(src))]
        for a, b in zip(src, dst):
            out[_hex(a)] = _hex(b)
    return out


def recolor(im, cmap):
    """Troca as cores da paleta base pelas da variante (tolerância ±1 por canal)."""
    if not cmap:
        return im
    a = np.array(im)
    rgb = a[..., :3].astype(np.int16)
    out = a.copy()
    vis = a[..., 3] > 0
    for (sr, sg, sb), (tr, tg, tb) in cmap.items():
        m = vis & (np.abs(rgb[..., 0] - sr) <= 1) & (np.abs(rgb[..., 1] - sg) <= 1) & (np.abs(rgb[..., 2] - sb) <= 1)
        out[m, 0] = tr
        out[m, 1] = tg
        out[m, 2] = tb
    return Image.fromarray(out, 'RGBA')


def _variant_of(opts):
    return opts.get('color') or opts.get('variant')


def layers(name, opts, body):
    """Camadas de uma peça: [(z, caminho base, animação grande ou None)]."""
    d = definition(name)
    out = []
    for k, v in d.items():
        if not k.startswith('layer_'):
            continue
        path = v.get(body) or v.get('male') or v.get('muscular') or next((p for kk, p in v.items() if isinstance(p, str) and kk not in ('custom_animation',)), None)
        if not path:
            continue
        if body not in v and body != 'male' and name not in _warned:
            _warned.add(name)
            print(f'  aviso: {name} não tem versão {body}; usando {path}')
        out.append((opts.get('z', v.get('zPos', 0)) + opts.get('dz', 0), path, v.get('custom_animation')))
    return out


def _resolve(path, anim, variant):
    """Arquivo de uma animação: variante pronta, ou base para recolorir."""
    idx = index()
    if variant:
        variant = variant.replace(' ', '_')
    p = path if path.endswith('/') else path + '/'
    cands = []
    if anim:
        if variant:
            cands.append((f'spritesheets/{p}{anim}/{variant}.png', False))
        cands.append((f'spritesheets/{p}{anim}.png', True))
    else:
        if variant:
            cands.append((f'spritesheets/{p}{variant}.png', False))
        cands.append((f'spritesheets/{p.rstrip("/")}.png', True))
        # algumas peças só têm uma variante com o nome da peça
    for c, rec in cands:
        if c in idx:
            return c, rec
    if not anim:
        # peças com uma única variante (ex.: 'mace'): pega o primeiro arquivo da pasta
        pref = f'spritesheets/{p}'
        for c in sorted(idx):
            if c.startswith(pref) and c.endswith('.png') and '/' not in c[len(pref):]:
                return c, True
    return None, False


def _open(path):
    fetch([path])
    return Image.open(os.path.join(REPO, path)).convert('RGBA')


def _prefetch(parts, body, anims):
    paths = []
    for name, opts in parts:
        v = _variant_of(opts)
        for z, path, custom in layers(name, opts, body):
            if custom:
                if custom in anims:
                    f, _ = _resolve(path, None, v)
                    if f:
                        paths.append(f)
            else:
                for a in anims:
                    if a in BIG:
                        continue
                    f, _ = _resolve(path, a, v)
                    if f:
                        paths.append(f)
    fetch(paths)


def universal(parts, body='male', zmin=None, zmax=None, only=None):
    """Folha universal com as camadas de z em [zmin, zmax) (`only`: só estas animações)."""
    anims = [a for a, _, _ in UNIVERSAL if not only or a in only]
    _prefetch(parts, body, anims)
    sheet = Image.new('RGBA', (832, 1344))
    todo = []
    for name, opts in parts:
        d = definition(name)
        cmap = color_map(d.get('recolors'), opts)
        v = _variant_of(opts)
        for z, path, custom in layers(name, opts, body):
            if custom:
                continue
            if (zmin is not None and z < zmin) or (zmax is not None and z >= zmax):
                continue
            todo.append((z, path, v, cmap))
    for z, path, v, cmap in sorted(todo, key=lambda t: t[0]):
        for anim, row, n in UNIVERSAL:
            if anim not in anims:
                continue
            f, rec = _resolve(path, anim, v)
            if not f:
                continue
            im = _open(f)
            if rec:
                im = recolor(im, cmap)
            # cada animação: n quadros × 4 direções (a queda, 1 linha)
            rows = 1 if anim == 'hurt' else 4
            im = im.crop((0, 0, min(im.size[0], n * 64), min(im.size[1], rows * 64)))
            sheet.alpha_composite(im, (0, row * 64))
    return sheet


def big(parts, body, anim, zmin=None, zmax=None):
    """Animação grande (`anim` de BIG): folha quadros × 4 direções, ou None se nenhuma peça tiver."""
    F, n = BIG[anim]
    _prefetch(parts, body, [anim])
    todo = []
    for name, opts in parts:
        d = definition(name)
        cmap = color_map(d.get('recolors'), opts)
        v = _variant_of(opts)
        for z, path, custom in layers(name, opts, body):
            if custom != anim:
                continue
            if (zmin is not None and z < zmin) or (zmax is not None and z >= zmax):
                continue
            todo.append((z, path, v, cmap))
    if not todo:
        return None
    sheet = Image.new('RGBA', (n * F, 4 * F))
    for z, path, v, cmap in sorted(todo, key=lambda t: t[0]):
        f, rec = _resolve(path, None, v)
        if not f:
            continue
        im = _open(f)
        if rec:
            im = recolor(im, cmap)
        sheet.alpha_composite(im.crop((0, 0, min(im.size[0], n * F), min(im.size[1], 4 * F))), (0, 0))
    return sheet


def has_big(parts, body, anim):
    return any(custom == anim for name, opts in parts for _, _, custom in layers(name, opts, body))


def credits(parts):
    """Autores e licenças de cada peça usada (para o CREDITS.md)."""
    out = {}
    for name, _ in parts:
        d = definition(name)
        for c in d.get('credits', []):
            key = c.get('file', name)
            out[key] = c
    return out
