"""Teren (viajante de outra dimensão) — gera o spritesheet a partir da arte
conceitual (concept.png: frente, costas e perfil com fundo transparente).

Cada vista é recortada, deformada para animar (flutuar, ondular a barra do
manto, inclinar ao se mover) em alta resolução e só então reduzida para a
escala do jogo, com paleta reduzida e contorno escuro, para casar com a
pixel art do mapa.

  python3 scripts/hero3/build.py     (requer Pillow e numpy)

Saída: public/assets/sprites/teren.png  +  src/entities/terenSheet.ts
"""
import json, math, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(HERE, 'concept.png')
HEIGHT = int(os.environ.get('TEREN_H', 92))  # altura final (px do mundo)
IDLE, MOVE = 8, 8
PAD = 4

im = Image.open(SRC).convert('RGBA')
A = np.array(im).astype(np.float32)

OFFS = {}
def crop(name, x0, x1):
    sub = A[:, x0:x1]
    a = sub[:, :, 3] > 20
    ys, xs = np.where(a)
    OFFS[name] = (ys.min(), xs.min() + x0)
    return sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

views = {'front': crop('front', 0, 592), 'back': crop('back', 592, 1092), 'side': crop('side', 1092, A.shape[1])}
# olhos brilhantes (coordenadas na arte original) — somem na redução, então são repintados
EYES = {'front': [(108, 300), (110, 337)], 'side': [(118, 1289)], 'back': []}

def warp(img, t, moving, view):
    """Deforma a vista: ondulação da barra (mais forte embaixo), balanço e inclinação."""
    h, w = img.shape[:2]
    out = np.zeros_like(img)
    ys = np.arange(h)
    k = np.clip((ys / h - 0.42) / 0.58, 0, 1) ** 1.6  # só do meio para baixo
    amp = (0.022 if moving else 0.014) * w
    speed = 2 if moving else 1
    dx = amp * k * np.sin(2 * math.pi * (t * speed - ys / h * 1.6))
    if moving and view == 'side':
        dx += 0.09 * w * k ** 1.3  # a barra fica para trás (olhando para a esquerda → arrasta à direita)
    if moving and view != 'side':
        dx += 0.01 * w * k * np.sin(2 * math.pi * t * 2 + 1.3)
    for y in range(h):
        s = dx[y]
        xi = np.arange(w) - s
        x0 = np.floor(xi).astype(int)
        f = (xi - x0)[:, None]
        valid0 = (x0 >= 0) & (x0 < w)
        valid1 = (x0 + 1 >= 0) & (x0 + 1 < w)
        row = img[y]
        a = np.where(valid0[:, None], row[np.clip(x0, 0, w - 1)], 0)
        b = np.where(valid1[:, None], row[np.clip(x0 + 1, 0, w - 1)], 0)
        out[y] = a * (1 - f) + b * f
    return out

def downscale(img, H):
    from PIL import ImageFilter
    h, w = img.shape[:2]
    # suaviza a textura miúda do tecido antes de reduzir (evita ruído)
    rad = max(0.0, (h / H) * 0.35)
    img = np.array(Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32)
    W = max(1, round(w * H / h))
    # pré-multiplica alpha para a média não "sujar" as bordas
    pm = img.copy()
    pm[:, :, :3] *= pm[:, :, 3:4] / 255
    small = np.array(Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8)).resize((W, H), Image.BOX)).astype(np.float32)
    a = small[:, :, 3:4]
    rgb = np.where(a > 0, small[:, :, :3] * 255 / np.maximum(a, 1), 0)
    return np.concatenate([rgb, a], axis=2)

def finish(small):
    """Alpha binário, contraste leve, paleta reduzida e contorno escuro."""
    rgb = small[:, :, :3]
    alpha = small[:, :, 3] > 110
    rgb = np.clip((rgb - 128) * 1.12 + 128 + 4, 0, 255)
    return rgb, alpha

def place(rgb, alpha, FW, FH, oy):
    frame = np.zeros((FH, FW, 4), np.uint8)
    h, w = alpha.shape
    x0 = (FW - w) // 2
    y0 = FH - PAD - h + oy
    frame[y0:y0 + h, x0:x0 + w, :3] = rgb.astype(np.uint8)
    frame[y0:y0 + h, x0:x0 + w, 3] = alpha * 255
    return frame

def outline(frame):
    a = frame[:, :, 3] > 0
    o = frame.copy()
    nb = np.zeros_like(a)
    nb[1:] |= a[:-1]; nb[:-1] |= a[1:]; nb[:, 1:] |= a[:, :-1]; nb[:, :-1] |= a[:, 1:]
    edge = nb & ~a
    o[edge] = [28, 24, 40, 255]
    return o

# vistas reduzidas para medir o quadro
frames = {}
sizes = []
for name, img in views.items():
    seq = []
    for i in range(IDLE + MOVE):
        moving = i >= IDLE
        t = (i % IDLE) / IDLE
        s = downscale(warp(img, t, moving, name), HEIGHT)
        k = s.shape[0] / img.shape[0]
        oy, ox = OFFS[name]
        eyes = [((ey - oy) * k, (ex - ox) * k) for ey, ex in EYES[name]]
        seq.append((finish(s), t, moving, eyes, s.shape[1]))
        sizes.append(s.shape[1])
    frames[name] = seq
FW = max(sizes) + 2 * PAD + 6
FW += FW % 2
FH = HEIGHT + 2 * PAD + 2

# paleta comum (quantização) para todas as vistas — mantém as cores coerentes
probe = np.concatenate([f[0][0][f[0][1]] for seq in frames.values() for f in seq])
pal_img = Image.fromarray(probe.reshape(-1, 1, 3).astype(np.uint8)).quantize(colors=28, method=Image.Quantize.MEDIANCUT)
def quant(rgb, alpha):
    q = Image.fromarray(rgb.astype(np.uint8)).quantize(palette=pal_img, dither=Image.Dither.NONE).convert('RGB')
    return np.array(q).astype(np.float32), alpha

rows = [('front', False), ('side', False), ('side', True), ('back', False)]
COLS = IDLE + MOVE
sheet = np.zeros((FH * 4, FW * COLS, 4), np.uint8)
for r, (name, flip) in enumerate(rows):
    for c, ((rgb, alpha), t, moving, eyes, w) in enumerate(frames[name]):
        rgb, alpha = quant(rgb, alpha)
        bob = int(round(-1.5 - 1.5 * math.sin(2 * math.pi * t)))  # flutua
        fr = outline(place(rgb, alpha, FW, FH, bob))
        # olhos: núcleo branco-quente com halo azulado (pulsa levemente)
        x0 = (FW - w) // 2
        y0 = FH - PAD - alpha.shape[0] + bob
        pulse = 0.5 + 0.5 * math.sin(2 * math.pi * t)
        for ey, ex in eyes:
            cy, cx = int(round(y0 + ey)), int(round(x0 + ex))
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    if 0 <= cy + dy < FH and 0 <= cx + dx < FW and fr[cy + dy, cx + dx, 3]:
                        if abs(dx) + abs(dy) == 2:
                            continue
                        fr[cy + dy, cx + dx, :3] = (170, 200, 255) if (dx or dy) else (255, 252, 228)
            if pulse > 0.6 and 0 <= cy < FH and 0 <= cx + 1 < FW:
                fr[cy, cx + 1, :3] = (255, 252, 228)
        if flip:
            fr = fr[:, ::-1]
        sheet[r * FH:(r + 1) * FH, c * FW:(c + 1) * FW] = fr

out_png = os.path.join(ROOT, 'public', 'assets', 'sprites', 'teren.png')
Image.fromarray(sheet).save(out_png)
meta = {'frameW': FW, 'frameH': FH, 'footY': FH - PAD, 'cols': COLS, 'idle': IDLE, 'move': MOVE}
with open(os.path.join(ROOT, 'src', 'entities', 'terenSheet.ts'), 'w') as f:
    f.write('// Gerado por scripts/hero3/build.py — não editar à mão.\n')
    f.write(f'export const TEREN_SHEET = {json.dumps(meta)} as const;\n')
print('teren.png', sheet.shape[1], 'x', sheet.shape[0], meta)
