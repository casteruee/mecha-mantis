"""R10 review sheets: upright alert posture (owner: "stand up like the reference, more life").
Builds comparison sheets (REFERENCE | R9 | R10) into rounds/r10. ASCII labels only (PIL CJK crash).
Run: python -I tools/package-r10.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import shutil

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'rounds/r10'
font = ImageFont.load_default()


def label_text(canvas, pos, value, scale=2):
    tile = Image.new('RGB', (len(value) * 7 + 8, 18), '#f4f4f6')
    ImageDraw.Draw(tile).text((2, 2), value, font=font, fill='#222222')
    canvas.paste(tile.resize((tile.width * scale, tile.height * scale)), pos)


def sheet(name, items, cols=3):
    print('Building', name, flush=True)
    w, h = 800, 450
    rows = (len(items) + cols - 1) // cols
    canvas = Image.new('RGB', (cols * w, rows * (h + 55) + 50), '#f4f4f6')
    for i, (label, file) in enumerate(items):
        print('Reading', file, flush=True)
        x, y = (i % cols) * w, (i // cols) * (h + 55)
        label_text(canvas, (x + 20, y + 10), label)
        im = Image.open(ROOT / file).convert('RGB')
        im.thumbnail((w, h), Image.Resampling.LANCZOS)
        canvas.paste(im, (x + (w - im.width) // 2, y + 55 + (h - im.height) // 2))
    label_text(canvas, (20, canvas.height - 38),
               'R10 | upright alert posture: erect prothorax 44>61 deg, head level +1.05 up, scythe fold raised | R9 abdomen girth kept')
    canvas.save(OUT / name)


sheet('compare_hero.png', [
    ('REFERENCE / HERO', 'hero.png'),
    ('R9 / HUNCHED', 'rounds/r9/still.png'),
    ('R10 / UPRIGHT', 'rounds/r10/still.png'),
])
sheet('compare_front.png', [
    ('REFERENCE / FRONT', 'ref-front.png'),
    ('R9 / FRONT', 'rounds/r9/front.png'),
    ('R10 / FRONT UPRIGHT', 'rounds/r10/front.png'),
])
sheet('compare_abdomen.png', [
    ('REFERENCE / ABDOMEN', 'ref-abdomen-macro.png'),
    ('R9 / ABDOMEN -10%', 'rounds/r9/macro_abdomen.png'),
    ('R10 / ABDOMEN (kept)', 'rounds/r10/macro_abdomen.png'),
])
sheet('compare_posture.png', [
    ('R10 / SIDE PROFILE - upright spine', 'rounds/r10/side.png'),
], cols=1)
for name in ('main.js', 'mantis.js'):
    shutil.copy2(ROOT / 'web' / name, OUT / name)
print('R10 sheets done.')
