"""R9 review sheets: abdomen girth -10% (owner request 2026-11-18).
Builds three side-by-side comparison sheets (REFERENCE | R8 | R9) into rounds/r9 and
copies the code snapshot. Labels are ASCII on purpose: PIL FreeType access-violates on
CJK glyphs with the installed fonts (msyh.ttc hard-crashes, cannot be caught).
Run: python -I tools/package-r9.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import shutil

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'rounds/r9'
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
               'R9 | abdomen girth -10% (rx 1.62>1.458 / rz 1.28>1.152) | same camera, same geometry | reference not pixel-aligned')
    canvas.save(OUT / name)


sheet('compare_hero.png', [
    ('REFERENCE / HERO', 'hero.png'),
    ('R8 / CURRENT', 'rounds/r8/still.png'),
    ('R9 / ABDOMEN -10%', 'rounds/r9/still.png'),
])
sheet('compare_abdomen.png', [
    ('REFERENCE / ABDOMEN', 'ref-abdomen-macro.png'),
    ('R8 / ABDOMEN', 'rounds/r8/macro_abdomen.png'),
    ('R9 / ABDOMEN -10%', 'rounds/r9/macro_abdomen.png'),
])
sheet('compare_front.png', [
    ('REFERENCE / FRONT', 'ref-front.png'),
    ('R8 / FRONT', 'rounds/r8/front.png'),
    ('R9 / FRONT -10%', 'rounds/r9/front.png'),
])
for name in ('main.js', 'mantis.js'):
    shutil.copy2(ROOT / 'web' / name, OUT / name)
print('R9 sheets done.')
