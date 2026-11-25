"""v8 review sheets: one-take teardown. compare_pass.png = v7 (crash/bob) vs v8 (flow) at the pass beats;
keyframes_v8.png = the v8 beat sheet. ASCII labels only (PIL CJK crash)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import shutil

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'rounds/film_v8_oneTake'
font = ImageFont.load_default()


def label_text(canvas, pos, value, scale=2):
    tile = Image.new('RGB', (len(value) * 7 + 8, 18), '#f4f4f6')
    ImageDraw.Draw(tile).text((2, 2), value, font=font, fill='#222222')
    canvas.paste(tile.resize((tile.width * scale, tile.height * scale)), pos)


def sheet(name, rows, cols, caption):
    print('Building', name, flush=True)
    w, h = 640, 360
    canvas = Image.new('RGB', (cols * w, len(rows) * (h + 50) + 50), '#f4f4f6')
    for i, (label, file) in enumerate([it for row in rows for it in row]):
        x, y = (i % cols) * w, (i // cols) * (h + 50)
        label_text(canvas, (x + 16, y + 8), label)
        im = Image.open(ROOT / file).convert('RGB')
        im.thumbnail((w, h), Image.Resampling.LANCZOS)
        canvas.paste(im, (x + (w - im.width) // 2, y + 50 + (h - im.height) // 2))
    label_text(canvas, (20, canvas.height - 38), caption)
    canvas.save(OUT / name)


V7 = 'rounds/film_v6_impact/work/v7kf'
V8 = 'rounds/film_v7_fpv/work/v8kf'
sheet('compare_pass.png', [
    [('V7 / 6.95 in', f'{V7}/still_11.45s_1280x720.png'),
     ('V7 / 7.18 core (0.67u crash)', f'{V7}/still_11.68s_1280x720.png'),
     ('V7 / 7.45 out', f'{V7}/still_11.95s_1280x720.png')],
    [('V8 / 6.45 in (flow)', f'{V8}/still_10.95s_1280x720.png'),
     ('V8 / 6.85 core (1.8u glide)', f'{V8}/still_11.35s_1280x720.png'),
     ('V8 / 7.30 out', f'{V8}/still_11.80s_1280x720.png')],
], 3, 'V7 crash-in + bob vs V8 one-take flow | PCHIP splines, monotone dive-then-rise, frozen turntable for the pass')
sheet('keyframes_v8.png', [
    [('0.70 intro push (was dead air)', f'{V8}/still_5.20s_1280x720.png'),
     ('1.30 abdomen opens early', f'{V8}/still_5.90s_1280x720.png'),
     ('5.45 hero #1 impact', f'{V8}/still_9.95s_1280x720.png'),
     ('6.20 orbit reveal', f'{V8}/still_10.70s_1280x720.png'),
     ('6.45 pass in', f'{V8}/still_10.95s_1280x720.png')],
    [('6.85 pass core (1.8u glide)', f'{V8}/still_11.35s_1280x720.png'),
     ('7.30 pass out', f'{V8}/still_11.80s_1280x720.png'),
     ('7.90 pull-out', f'{V8}/still_12.40s_1280x720.png'),
     ('8.40 exact reset', f'{V8}/still_12.90s_1280x720.png'),
     ('11.0 strike', f'{V8}/still_14.50s_1280x720.png')],
], 5, 'V8 beat sheet: establish -> hero #1 -> orbit reveal -> hero #2 (proximity pass) -> pull-out -> reset -> strike')
for name in ('landscape.js', 'landscape.html', 'mantis.js', 'main.js'):
    shutil.copy2(ROOT / 'web' / name, OUT / 'src' / name)
print('v8 sheets done.')
