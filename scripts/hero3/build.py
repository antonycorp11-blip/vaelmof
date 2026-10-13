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
HEIGHT = int(os.environ.get('TEREN_H', 48))  # altura da arte (exibida a 0.5 → 24 px do mundo, 1,5 tile)
IDLE, MOVE = 12, 12
PAD = 4

im = Image.open(SRC).convert('RGBA')
A = np.array(im).astype(np.float32)

OFFS = {}
def crop(name, x0, x1):
    sub = A[:, x0:x1]
    a = sub[:, :, 3] > 20
    ys, xs = np.where(a)
    v = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    px = int(v.shape[1] * 0.3)
    OFFS[name] = (ys.min(), xs.min() + x0 - px)
    return np.pad(v, ((0, 0), (px, px), (0, 0)))

views = {'front': crop('front', 0, 592), 'back': crop('back', 592, 1092), 'side': crop('side', 1092, A.shape[1])}
# olhos brilhantes (coordenadas na arte original) — somem na redução, então são repintados
EYES = {'front': [(108, 300), (110, 337)], 'side': [(118, 1289)], 'back': []}

def warp(img, t, moving, view):
    """Deforma a vista: balanço do corpo (a barra atrasa em relação ao capuz),
    ondas correndo pelas tiras do manto, barra esticando com a flutuação e,
    em movimento, inclinação para a frente com as tiras arrastando para trás."""
    h, w = img.shape[:2]
    ys = np.arange(h) / h
    k = np.clip((ys - 0.38) / 0.62, 0, 1) ** 1.4  # peso das tiras (0 no capuz → 1 na barra)
    T = 2 * math.pi
    if not moving:
        dx = 0.035 * w * np.sin(T * (t - 0.45 * ys))                    # pêndulo lento
        dx += 0.06 * w * k * np.sin(T * (t * 2 - ys * 2.2))              # ondas nas tiras
        stretch = 0.035 * math.sin(T * t + 0.6)
    elif view == 'side':
        dx = 0.07 * w * (1 - ys) ** 1.5                                 # capuz à frente (a arte olha p/ direita)
        dx -= 0.17 * w * k ** 1.2                                        # barra arrasta para trás
        dx += 0.07 * w * k * np.sin(T * (t * 2 - ys * 2.6))
        stretch = 0.05 + 0.03 * math.sin(T * t * 2)
    else:
        dx = 0.05 * w * np.sin(T * (t - 0.5 * ys))                      # balança de um lado ao outro
        dx += 0.07 * w * k * np.sin(T * (t * 2 - ys * 2.4))
        stretch = 0.04 + 0.03 * math.sin(T * t * 2)
    # barra esticada: linhas abaixo de 40% leem a origem um pouco mais acima
    sy = np.where(ys > 0.4, 0.4 + (ys - 0.4) / (1 + stretch), ys) * h
    H2 = int(round(h * (1 + max(0, stretch) * 0.6)))
    out = np.zeros((H2, w, 4), np.float32)
    for y in range(H2):
        yy = y / h
        src = (0.4 + (yy - 0.4) / (1 + stretch)) * h if yy > 0.4 else y
        y0 = int(src)
        if y0 >= h:
            continue
        yi = min(y, h - 1)
        xi = np.arange(w) - dx[min(int(src), h - 1)]
        x0 = np.floor(xi).astype(int)
        f = (xi - x0)[:, None]
        row = img[y0]
        a = np.where(((x0 >= 0) & (x0 < w))[:, None], row[np.clip(x0, 0, w - 1)], 0)
        b = np.where(((x0 + 1 >= 0) & (x0 + 1 < w))[:, None], row[np.clip(x0 + 1, 0, w - 1)], 0)
        out[y] = a * (1 - f) + b * f
    return out

def downscale(img, K):
    """Reduz pelo fator fixo K (mesma escala em todos os quadros: a barra esticada fica maior)."""
    from PIL import ImageFilter
    h, w = img.shape[:2]
    H = max(1, round(h * K))
    # suaviza a textura miúda do tecido antes de reduzir (evita ruído)
    rad = max(0.0, 0.35 / K)
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

def _unused_place(rgb, alpha, FW, FH, oy):
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

TOP = PAD + 6  # folga acima do capuz para a flutuação
frames = {}
for name, img in views.items():
    K = HEIGHT / img.shape[0]
    oy, ox = OFFS[name]
    seq = []
    for i in range(IDLE + MOVE):
        moving = i >= IDLE
        n = MOVE if moving else IDLE
        t = (i - IDLE if moving else i) / n
        s = downscale(warp(img, t, moving, name), K)
        eyes = [((ey - oy) * K, (ex - ox) * K) for ey, ex in EYES[name]]
        seq.append((finish(s), t, moving, eyes))
    frames[name] = seq
BIGW = max(f[0][1].shape[1] for seq in frames.values() for f in seq) + 4
BIGW += BIGW % 2
FH = TOP + max(f[0][1].shape[0] for seq in frames.values() for f in seq) + PAD

# paleta comum (quantização) para todas as vistas — mantém as cores coerentes
probe = np.concatenate([f[0][0][f[0][1]] for seq in frames.values() for f in seq])
pal_img = Image.fromarray(probe.reshape(-1, 1, 3).astype(np.uint8)).quantize(colors=28, method=Image.Quantize.MEDIANCUT)
def quant(rgb, alpha):
    q = Image.fromarray(rgb.astype(np.uint8)).quantize(palette=pal_img, dither=Image.Dither.NONE).convert('RGB')
    return np.array(q).astype(np.float32), alpha

def bob_of(t, moving):
    # flutuação: 3 px da arte (1,5 px do mundo); em movimento, dois ciclos mais curtos
    return int(round(-3 - 3 * math.sin(2 * math.pi * t))) if not moving else int(round(-2 - 2 * math.sin(4 * math.pi * t)))

rows = [('front', False), ('side', True), ('side', False), ('back', False)]  # o perfil da arte olha p/ direita
COLS = IDLE + MOVE
big = []
eye_pos = []
for r, (name, flip) in enumerate(rows):
    row = []
    for c, ((rgb, alpha), t, moving, eyes) in enumerate(frames[name]):
        rgb, alpha = quant(rgb, alpha)
        bob = bob_of(t, moving)
        h, w = alpha.shape
        x0 = (BIGW - w) // 2
        y0 = TOP + bob
        fr = np.zeros((FH, BIGW, 4), np.uint8)
        fr[y0:y0 + h, x0:x0 + w, :3] = rgb.astype(np.uint8)
        fr[y0:y0 + h, x0:x0 + w, 3] = alpha * 255
        fr = outline(fr)
        pulse = 0.5 + 0.5 * math.sin(2 * math.pi * t)
        for ey, ex in eyes:
            cy, cx = int(round(y0 + ey)), int(round(x0 + ex))
            if c == 0:
                eye_pos.append((r, cx, cy))
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    if abs(dx) + abs(dy) == 2 or not (0 <= cy + dy < FH and 0 <= cx + dx < BIGW) or not fr[cy + dy, cx + dx, 3]:
                        continue
                    fr[cy + dy, cx + dx, :3] = (170, 200, 255) if (dx or dy) else (255, 252, 228)
            if pulse > 0.6 and fr[cy, cx + 1, 3]:
                fr[cy, cx + 1, :3] = (255, 252, 228)
        if flip:
            fr = fr[:, ::-1]
        row.append(fr)
    big.append(row)

# recorta simétrico em volta do centro (a origem do sprite é o meio do quadro)
cols_used = np.zeros(BIGW, bool)
for row in big:
    for fr in row:
        cols_used |= fr[:, :, 3].any(axis=0)
xs = np.where(cols_used)[0]
half = int(max(BIGW / 2 - xs.min(), xs.max() + 1 - BIGW / 2)) + 1
cx0 = BIGW // 2 - half
FW = 2 * half
FOOT = TOP + HEIGHT  # ponto de apoio (a sombra fica aqui)
sheet = np.zeros((FH * 4, FW * COLS, 4), np.uint8)
for r, row in enumerate(big):
    for c, fr in enumerate(row):
        sheet[r * FH:(r + 1) * FH, c * FW:(c + 1) * FW] = fr[:, cx0:cx0 + FW]

# olhos por linha, relativos à base, em px da arte
EYE = {0: None, 1: None, 2: None, 3: None}
for r, cx, cy in eye_pos:
    x = cx - BIGW // 2
    if rows[r][1]:
        x = -x
    if EYE[r] is None:
        EYE[r] = [x, cy - FOOT]
EYE[2] = EYE[2] or EYE[1]
eyes_meta = [EYE[r] or [0, (EYE[0] or [0, -HEIGHT])[1]] for r in range(4)]

out_png = os.path.join(ROOT, 'public', 'assets', 'sprites', 'teren.png')
Image.fromarray(sheet).save(out_png)
meta = {'frameW': FW, 'frameH': FH, 'footY': FOOT, 'height': HEIGHT, 'cols': COLS, 'idle': IDLE, 'move': MOVE, 'eyes': eyes_meta}
with open(os.path.join(ROOT, 'src', 'entities', 'terenSheet.ts'), 'w') as f:
    f.write('// Gerado por scripts/hero3/build.py — não editar à mão.\n')
    f.write(f'export const TEREN_SHEET = {json.dumps(meta)} as const;\n')
print('teren.png', sheet.shape[1], 'x', sheet.shape[0], meta)
