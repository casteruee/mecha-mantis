"""Density metrics (round 3 onward), identical for the reference and for our stills.

python -I tools/measure.py measure img.png [...]
python -I tools/measure.py json img1.png [img2.png ...]      (mask auto-found as <name>_mask.png, or the hero polygon)
python -I tools/measure.py maskpreview img.png out.png

object   : pixels whose max channel differs from the background colour by > 30, minus pale low-saturation grey
           (the soft ground shadow: lum > 140 and saturation < 25).
body     : body mask ∩ (colour diff from background > 14). Mask = rendered (ours, mask=1) or hand polygon (hero). Body mask = everything except the 4 walking legs and the antennae.
           hero.png: hand-traced polygon in tools/hero_body_poly.json; our stills: a render with mask=1 (body white, legs black).
dark_body: share of body pixels with luma < 80.
edge     : on the 900 px wide thumbnail, share of body pixels whose Sobel gradient magnitude > 60.
blob     : largest 8-connected component of pure black (luma < 30), as a share of the whole frame (limit 0.005).
dark_box : the old metric (luma < 80 inside the object bounding box), kept for reference only.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))


def luma(im):
    return 0.299 * im[..., 0] + 0.587 * im[..., 1] + 0.114 * im[..., 2]


def body_mask(path, H, W):
    base = os.path.splitext(path)[0]
    if os.path.exists(base + '_mask.png'):
        m = np.asarray(Image.open(base + '_mask.png').convert('L').resize((W, H), Image.NEAREST))
        return m > 127
    polys = json.load(open(os.path.join(HERE, 'hero_body_poly.json'), encoding='utf-8'))
    key = os.path.basename(path)
    if key in polys:
        img = Image.new('L', (W, H), 0)
        ImageDraw.Draw(img).polygon([tuple(p) for p in polys[key]], fill=255)
        return np.asarray(img) > 127
    return None


def analyse(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(float)
    H, W, _ = im.shape
    lum = luma(im)
    bg = np.median(np.concatenate([im[:20].reshape(-1, 3), im[:, :20].reshape(-1, 3)]), axis=0)
    diff = np.abs(im - bg).max(axis=2)
    sat = im.max(2) - im.min(2)
    obj = (diff > 30) & ~((lum > 140) & (sat < 25))
    ys, xs = np.nonzero(obj)
    x0, x1 = np.percentile(xs, [0.1, 99.9]).astype(int)
    y0, y1 = np.percentile(ys, [0.1, 99.9]).astype(int)
    dark_box = float((lum[y0:y1 + 1, x0:x1 + 1] < 80).mean())
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mag = ((r - g) > 70) & ((b - g) > 30)
    bm = body_mask(path, H, W)
    # same rule for both: body mask ∩ "not background" (max channel diff > 14)
    body = (diff > 14) & bm if bm is not None else obj
    dark_body = float((lum[body] < 80).mean())
    tw, th = 900, round(H * 900 / W)
    small = cv2.resize(lum.astype(np.float32), (tw, th), interpolation=cv2.INTER_AREA)
    gx = cv2.Sobel(small, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(small, cv2.CV_32F, 0, 1, ksize=3)
    gm = np.sqrt(gx * gx + gy * gy)
    bsmall = cv2.resize(body.astype(np.uint8), (tw, th), interpolation=cv2.INTER_NEAREST) > 0
    edge = float((gm[bsmall] > 60).mean())
    n, lab, stats, _ = cv2.connectedComponentsWithStats((lum < 30).astype(np.uint8), connectivity=8)
    if n > 1:
        bi = int(np.argmax(stats[1:, cv2.CC_STAT_AREA])) + 1
        blob = float(stats[bi, cv2.CC_STAT_AREA] / (W * H))
        blob_box = [int(v) for v in stats[bi, :4]]
    else:
        blob, blob_box = 0.0, [0, 0, 0, 0]
    return dict(W=W, H=H, box=(int(x0), int(y0), int(x1), int(y1)), wfrac=(x1 - x0) / W, hfrac=(y1 - y0) / H,
                dark_box=dark_box, dark_body=dark_body, edge=edge, blob=blob, blob_box=blob_box,
                body_frac=float(body.mean()), magenta=float(mag[y0:y1 + 1, x0:x1 + 1].mean()), masked=bm is not None)


def fmt(d):
    return (f"box {d['wfrac']:.2f}w x {d['hfrac']:.2f}h | dark_body {d['dark_body']:.3f} | edge {d['edge']:.3f} | "
            f"max black blob {d['blob'] * 100:.2f}% at {d['blob_box']} | magenta {d['magenta']:.3f} | old dark_box {d['dark_box']:.3f} | mask={d['masked']}")


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'measure':
        for p in sys.argv[2:]:
            print(p, fmt(analyse(p)))
    elif mode == 'json':
        print(json.dumps({p: analyse(p) for p in sys.argv[2:]}))
    elif mode == 'maskpreview':
        p, out = sys.argv[2], sys.argv[3]
        im = np.asarray(Image.open(p).convert('RGB')).copy()
        H, W, _ = im.shape
        bm = body_mask(p, H, W)
        im[~bm] = (im[~bm] * 0.35 + np.array([255, 255, 255]) * 0.65).astype(np.uint8)
        Image.fromarray(im).save(out)
