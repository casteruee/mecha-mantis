from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import shutil, json, zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'rounds/r8'
font = ImageFont.load_default()
small = font

def label_text(canvas, pos, value, scale=2):
    tile = Image.new('RGB',(len(value)*7+8,18),'#f4f4f6')
    ImageDraw.Draw(tile).text((2,2),value,font=font,fill='#222222')
    canvas.paste(tile.resize((tile.width*scale,tile.height*scale)),pos)
labels = {'参考':'REFERENCE','R7（已作废）':'R7 / REJECTED','R8 候选':'R8 / CANDIDATE','参考正面':'REFERENCE / FRONT','R8 正面':'R8 / FRONT','头部正向检查':'HEAD / FRONT CHECK','头部斜视':'HEAD / THREE-QUARTER','头部侧向检查':'HEAD / SIDE CHECK','灰模：检查实际曲面':'CLAY / SURFACE CHECK'}

def sheet(name, items, cols):
    print('Building', name, flush=True)
    w, h = 800, 450
    rows = (len(items)+cols-1)//cols
    canvas = Image.new('RGB', (cols*w, rows*(h+55)+45), '#f4f4f6')
    d = ImageDraw.Draw(canvas)
    for i, (label, file) in enumerate(items):
        print('Reading', file, flush=True)
        x, y = (i%cols)*w, (i//cols)*(h+55)
        label_text(canvas,(x+20,y+10),labels[label])
        im = Image.open(ROOT/file).convert('RGB')
        im.thumbnail((w,h), Image.Resampling.LANCZOS)
        canvas.paste(im,(x+(w-im.width)//2,y+55+(h-im.height)//2))
    label_text(canvas,(20,canvas.height-35),'R8 candidate | Same geometry across review views | Reference and renders are not pixel-aligned')
    canvas.save(OUT/name)

sheet('compare_hero.png', [('参考','hero.png'),('R7（已作废）','rounds/r7_void/still.png'),('R8 候选','rounds/r8/still.png')],3)
sheet('compare_head.png', [('参考','ref-head-macro.png'),('R7（已作废）','rounds/r7_void/macro_head.png'),('R8 候选','rounds/r8/macro_head.png')],3)
sheet('compare_front.png', [('参考正面','ref-front.png'),('R8 正面','rounds/r8/front.png')],2)
sheet('head_views.png', [('头部正向检查','rounds/r8/head_front.png'),('头部斜视','rounds/r8/macro_head.png'),('头部侧向检查','rounds/r8/head_side.png'),('灰模：检查实际曲面','rounds/r8/head_clay.png')],2)
for name in ['main.js','mantis.js']:
    shutil.copy2(ROOT/'web'/name,OUT/name)
checks=json.loads((OUT/'render-checks.json').read_text())
assert len(checks)==8 and all(not c['errors'] and c['nonFinitePositions']==0 for c in checks)
files = list((ROOT/'web').glob('*')) + [ROOT/'package.json',ROOT/'package-lock.json',ROOT/'CURRENT-SPEC.md']
files += [ROOT/'tools'/n for n in ['review-r8.mjs','render.mjs','headtrace.py','package-r8.py']]
files += list(OUT.glob('*.png')) + list(OUT.glob('*.md')) + list(OUT.glob('*.json')) + list(OUT.glob('*.js'))
files += [ROOT/n for n in ['hero.png','ref-front.png','ref-head-macro.png','ref-forearm-macro.png','ref-abdomen-macro.png']]
files += [ROOT/'rounds/r7_void'/n for n in ['still.png','macro_head.png','VOID.md']]
with zipfile.ZipFile(OUT/'ORCHIS-R8-review.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in files:
        if p.is_file(): z.write(p,p.relative_to(ROOT).as_posix())
print('Packaged R8; all eight render checks passed (technical checks only).')
