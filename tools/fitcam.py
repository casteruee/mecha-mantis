"""Recover the hero camera (azimuth / elevation / distance / target) from landmarks.

Model landmarks (world units, L = 10) are matched to hand-picked pixels in hero.png (1672x941),
then a pinhole camera with a fixed vertical FOV is fitted by least squares.
az: degrees from +Z toward -X (0 = pure side view of the left-to-right body, 90 = straight at the face); el: degrees above horizontal.
"""
import json
import sys

import numpy as np
from scipy.optimize import least_squares

W, H = 1672, 941
FOV = float(sys.argv[1]) if len(sys.argv) > 1 else 28.0

# (model xyz, hero pixel, name)
LM = [
    ((-4.0, 6.05, 0.0), (455, 205), 'head centre'),
    ((-0.8, 3.78, 0.0), (800, 385), 'prothorax / thorax joint'),
    ((5.72, 2.32, 0.0), (1338, 578), 'abdomen tip'),
    ((2.76, 1.76, 0.0), (1150, 655), 'abdomen underside'),
    ((-4.3, 4.95, 1.2), (440, 335), 'near foreleg knee'),
    ((-4.7, 4.83, -1.2), (310, 340), 'far foreleg knee'),
    ((-3.76, 1.6, 1.06), (460, 722), 'near claw tip'),
    ((-4.16, 1.48, -1.34), (305, 712), 'far claw tip'),
]
P = np.array([l[0] for l in LM], float)
UV = np.array([l[1] for l in LM], float)


def project(x, pts):
    az, el, d, tx, ty, tz = x
    a, e = np.radians(az), np.radians(el)
    t = np.array([tx, ty, tz])
    pos = t + d * np.array([-np.sin(a) * np.cos(e), np.sin(e), np.cos(a) * np.cos(e)])
    f = (t - pos) / np.linalg.norm(t - pos)
    r = np.cross(f, [0, 1, 0]); r /= np.linalg.norm(r)
    u = np.cross(r, f)
    q = pts - pos
    xc, yc, zc = q @ r, q @ u, q @ f
    th = np.tan(np.radians(FOV / 2))
    nx, ny = xc / (zc * th * W / H), yc / (zc * th)
    return np.stack([(nx + 1) / 2 * W, (1 - ny) / 2 * H], 1)


res = least_squares(lambda x: (project(x, P) - UV).ravel(), [20, 10, 25, 0.5, 3.5, 0], bounds=([-80, -30, 5, -10, -5, -10], [80, 60, 200, 10, 12, 10]))
err = np.linalg.norm(project(res.x, P) - UV, axis=1)
out = dict(fov=FOV, az=round(res.x[0], 2), el=round(res.x[1], 2), d=round(res.x[2], 2), target=[round(v, 3) for v in res.x[3:]],
           rms_px=round(float(np.sqrt((err ** 2).mean())), 1), per_point={l[2]: round(float(e), 1) for l, e in zip(LM, err)})
print(json.dumps(out, ensure_ascii=False, indent=1))
