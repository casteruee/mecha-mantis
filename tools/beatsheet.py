"""Contact sheets for beat_abdomen_v0 from the 0.25 s thumbnail frames.

python -I tools/beatsheet.py <thumbsDir> <outDir>
Writes contact_sheet_all.png (0-5.2 s) and contact_sheet_abdomen.png (2.5-5.2 s).
"""
import os
import re
import sys
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
files = sorted(
    (float(re.search(r'still_([\d.]+)s', f).group(1)), os.path.join(src, f))
    for f in os.listdir(src) if f.endswith('.png')
)


def sheet(items, path, cols, cell_w, label):
    n = len(items)
    rows = (n + cols - 1) // cols
    iw, ih = Image.open(items[0][1]).size
    cell_h = round(cell_w * ih / iw)
    lab_h = 26
    head_h = 34
    im = Image.new('RGB', (cols * cell_w, head_h + rows * (cell_h + lab_h)), (24, 22, 28))
    d = ImageDraw.Draw(im)
    for i, (t, p) in enumerate(items):
        x, y = (i % cols) * cell_w, head_h + (i // cols) * (cell_h + lab_h)
        thumb = Image.open(p).convert('RGB').resize((cell_w - 4, cell_h - 4))
        im.paste(thumb, (x + 2, y + 2))
        d.rectangle([x + 2, y + cell_h - 2, x + cell_w - 2, y + cell_h + lab_h - 2], fill=(8, 8, 10))
        d.text((x + 10, y + cell_h + 2), f'{t:.2f} s', fill=(255, 255, 255))
    d.text((10, 8), label, fill=(255, 255, 255))
    im.save(path)
    print('wrote', path, im.size)


sheet(items=files, path=os.path.join(out, 'contact_sheet_all.png'), cols=6, cell_w=300, label=f'film · 0-{files[-1][0]:.1f} s @ {(files[1][0]-files[0][0]):.2f} s')
sheet(items=[(t, p) for t, p in files if t >= 2.5], path=os.path.join(out, 'contact_sheet_abdomen.png'), cols=4, cell_w=380, label=f'film · 2.5-{files[-1][0]:.1f} s')
