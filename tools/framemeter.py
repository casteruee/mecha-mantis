"""Framing meter for beat_abdomen: silhouette bbox fractions on mask renders.

python -I tools/framemeter.py img.png [img.png ...]
prints: name  w%  h%  (x0,y0,x1,y1 in px)
"""
import sys
import numpy as np
from PIL import Image


def meter(path):
    im = np.asarray(Image.open(path).convert('L'))
    H, W = im.shape
    ys, xs = np.nonzero(im > 40)
    if len(xs) == 0:
        print(path, 'EMPTY')
        return
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    print(f'{path.split(chr(92))[-1].split("/")[-1]:38s} w={(x1-x0)/W:.3f} h={(y1-y0)/H:.3f}  box=({x0},{y0})-({x1},{y1})  W={W} H={H}')


for p in sys.argv[1:]:
    meter(p)
