"""Head tracing toolkit for r7: grid overlay, trace preview on the reference, and render-overlay check.

python -I tools/headtrace.py grid <img> <out>                    10% grid with labels
python -I tools/headtrace.py draw <img> <out>                    thick trace (target shape) on the reference
python -I tools/headtrace.py overlay <img> <out> x0 y0 x1 y1     thin trace mapped onto OUR render via the head bbox
"""
import math
import sys
from PIL import Image, ImageDraw, ImageFont

mode, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGB')
W, H = im.size
d = ImageDraw.Draw(im)
font = ImageFont.load_default()

if mode == 'grid':
    for i in range(1, 10):
        x = W * i / 10
        y = H * i / 10
        d.line([(x, 0), (x, H)], fill=(255, 120, 0), width=1)
        d.line([(0, y), (W, y)], fill=(255, 120, 0), width=1)
        d.text((x + 3, 4), f'{i/10:.1f}', fill=(200, 60, 0), font=font)
        d.text((4, y + 2), f'{i/10:.1f}', fill=(200, 60, 0), font=font)
    d.text((4, 4), '0.0', fill=(200, 60, 0), font=font)

# traced head geometry in fractions of ref-head-macro (grid-read): silhouette, eye, antennae
TR = [
    (0.298, 0.185), (0.370, 0.185), (0.455, 0.190), (0.545, 0.250),
    (0.575, 0.330), (0.520, 0.430), (0.430, 0.510), (0.355, 0.585),
    (0.315, 0.525), (0.285, 0.440), (0.245, 0.330), (0.265, 0.270),
]
EYE = dict(c=(0.487, 0.305), a=0.0855, b=0.048, ang=-35)
ANT = [((0.297, 0.247), (0.185, 0.115), (0.090, 0.030)), ((0.428, 0.235), (0.455, 0.120), (0.478, 0.010))]
# the head bounding box the trace lives in (fractions of ref-head-macro) -> mapped onto our render's head bbox
BOX = (0.245, 0.185, 0.575, 0.60)

if mode in ('draw', 'overlay'):
    if mode == 'overlay':
        x0, y0, x1, y1 = (float(v) for v in sys.argv[4:8])

        def mp(fx, fy):
            bx0, by0, bx1, by1 = BOX
            return (x0 + (fx - bx0) / (bx1 - bx0) * (x1 - x0), y0 + (fy - by0) / (by1 - by0) * (y1 - y0))
    else:
        def mp(fx, fy):
            return (fx * W, fy * H)
    col = (220, 20, 60) if mode == 'draw' else (255, 30, 30)
    wd = 4 if mode == 'draw' else 3
    pts = [mp(x, y) for x, y in TR]
    d.line(pts + [pts[0]], fill=col, width=wd, joint='curve')
    cx, cy = mp(*EYE['c'])
    a, b = EYE['a'] * W, EYE['b'] * W
    ang = math.radians(EYE['ang'])
    ell = []
    for i in range(48):
        t = i / 48 * 2 * math.pi
        ex, ey = a * math.cos(t), b * math.sin(t)
        ell.append(mp(EYE['c'][0] + (ex * math.cos(ang) - ey * math.sin(ang)) / W, EYE['c'][1] + (ex * math.sin(ang) + ey * math.cos(ang)) / H))
    d.line(ell + [ell[0]], fill=(20, 90, 220) if mode == 'draw' else (30, 110, 255), width=wd)
    for p1, p2, p3 in ANT:
        d.line([mp(*p1), mp(*p2), mp(*p3)], fill=(20, 160, 40) if mode == 'draw' else (30, 200, 30), width=wd, joint='curve')

im.save(out)
print('wrote', out, im.size)
