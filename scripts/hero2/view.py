import sys
from PIL import Image
sys.path.insert(0, '/home/user/vaelmof/scripts/hero2')
from pal import PAL
def load(f):
    rows=[l.rstrip('\n') for l in open(f) if not l.startswith('#')]
    rows=[r for r in rows if r.strip()]
    return rows
def render(files,out,scale=10,bg=(92,138,66)):
    gs=[load(f) for f in files]
    W=sum(max(len(r) for r in g) for g in gs)+4*len(gs); H=max(len(g) for g in gs)
    im=Image.new('RGB',(W,H),bg); x=0
    for g in gs:
        for y,r in enumerate(g):
            for c,ch in enumerate(r):
                if ch in PAL: im.putpixel((x+c,y),PAL[ch])
        x+=max(len(r) for r in g)+4
    big=im.resize((W*scale,H*scale),Image.NEAREST)
    # tamanho real ao lado (2x) para julgar no jogo
    small=im.resize((W*2,H*2),Image.NEAREST)
    o=Image.new('RGB',(big.width,big.height+small.height+8),bg); o.paste(big,(0,0)); o.paste(small,(0,big.height+8)); o.save(out)
if __name__=='__main__':
    for f in sys.argv[2:]:
        rows=load(f); print(f, len(rows), sorted(set(len(r) for r in rows)))
    render(sys.argv[2:],sys.argv[1])
