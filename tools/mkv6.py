"""Build film/landscape_v6.json = landscape_v5.json with the impact teardown:
- 17 finer trains (head-local explode, foreneck sections, thorax additions, springs, collars, wing pins)
- groups.head.dist 1.8 -> 0.5 (the head stays put and explodes locally)
- flythrough teardown camera (方案 A 穿越式, 8 keys td_*)
Everything else (showcase / abdomen / release / sound / motion) is copied from v5 untouched.
Times are authored in main-film seconds here and shifted +4.5 by sh() — never hand-edit absolute times.
"""
import json

D = 4.5
sc = json.load(open('film/landscape_v5.json', encoding='utf-8'))
sh = lambda x: round(x + D, 6)

sc['name'] = 'ORCHIS MX-7 · 16:9 landscape v6 (impact teardown + flythrough camera), 0–16.5 s'
sc['note'] = ('v6: showcase 0–4.5 s and the abdomen/release acts are v5 untouched; the teardown act is rebuilt — '
              'finer trains (head-local explode, foreneck sections, thorax plates/drums/actuators/tracks, femur '
              'springs, abdomen collars, wing pins; 33 trajectories / 150+ parts), head stays in place (micro-move '
              '0.5), flythrough camera (方案 A: wide→gap→deep impact→low orbit→pull-out), shadow fix (real key-light '
              'shadows) and the holographic assist layer (guide lines, scan curtain, impact pulse, HUD brackets, '
              'data plaques, particle flow, dashed reference rings). Sound cues unchanged.')
sc['product']['date'] = '2026-11-18'


def T(out, dur, back, ret, stag):
    return {'out': sh(out), 'dur': dur, 'back': sh(back), 'ret': ret, 'stagger': stag}


# ---- finer trains (main-film s). v5 trains are kept identical; these are the v6 additions.
# reassembly order: core-adjacent seats first (thorax/neck), then head locals, then periphery; all seated by 8.28.
tr = sc['explode']['trains']
tr.update({
    'thoraxPlate':   T(5.74, 0.68, 7.56, 0.50, 0.06),
    'thoraxVentral': T(5.78, 0.64, 7.58, 0.50, 0.05),
    'thoraxTrackA':  T(5.82, 0.64, 7.56, 0.50, 0.05),
    'thoraxTrackB':  T(5.86, 0.62, 7.58, 0.50, 0.05),
    'thoraxDrum':    T(5.86, 0.60, 7.60, 0.48, 0.05),
    'thoraxAct':     T(5.90, 0.60, 7.62, 0.48, 0.05),
    'neckPlate':     T(5.76, 0.66, 7.58, 0.50, 0.06),
    'neckGlass':     T(5.88, 0.60, 7.62, 0.48, 0.05),
    'neckAct':       T(5.92, 0.58, 7.64, 0.45, 0.05),
    'headShield':    T(5.78, 0.62, 7.62, 0.48, 0.05),
    'headPanel':     T(5.82, 0.60, 7.64, 0.48, 0.05),
    'headRing':      T(5.84, 0.62, 7.66, 0.50, 0.06),
    'headCheek':     T(5.86, 0.60, 7.66, 0.48, 0.05),
    'headJaw':       T(5.90, 0.58, 7.68, 0.45, 0.05),
    'springOut':     T(5.84, 0.66, 7.68, 0.52, 0.06),
    'abdCollar':     T(5.78, 0.62, 7.66, 0.50, 0.06),
    'wingPin':       T(5.94, 0.56, 7.70, 0.45, 0.045),
})

# ---- tighten the v5 close windows: at main 8.55 every item must be exactly seated (0% apart, no residue).
# The v5 numbers left caps/thoraxShells/gears/pane-bay-0 returning until ~8.75 (probe-verified residual at 8.55).
CLOSE_FIX = {'thoraxShells': 7.55, 'gears': 7.62, 'caps': 7.45}
for name, back in CLOSE_FIX.items():
    tr[name]['back'] = sh(back)
sc['explode']['shellBack']['panes'] = sh(7.74)
sc['explode']['shellBack']['belly'] = sh(7.90)

# ---- head micro-move: the head stays in place and explodes locally
sc['explode']['groups']['head']['dist'] = 0.5

sc['explode']['note'] = ('Layered teardown v6 (finer). Stage 1 shell (5.15–6.0 main): glass cage blooms, belly drops, '
                         'wings lift, scan curtain sweeps 5.1–5.6. Stage 2 majors (5.5–6.5): head micro-moves 0.5 and '
                         'explodes locally (shield/panel/cheeks/jaws/collar rings), prothorax sections step, abdomen '
                         'slides, forelegs off their pins. Stage 3 trains (5.74–6.6): foreneck rings/windows/actuators, '
                         'thorax plates/drums/actuators/tracks, springs, collars, wing pins, plus the v5 trains. Stage 4 '
                         'dust (6.0–6.7): 32 bolts. Hold 6.65–7.45 (slow-motion clock, impact pulse at 6.4). Reassembly '
                         'build order; all seated by 8.28; precise zero at 8.55. Pure translation, only gears spin.')

# ---- flythrough teardown camera (方案 A 穿越式). d = heroDist(23.5) multiples.
TD = [
    ('td_wide', 5.00, 200, 15, 1.60, 28),
    ('td_in',   5.70, 212, 12, 1.35, 28),
    ('td_gap',  6.05, 219, 8, 0.85, 30),
    ('td_deep', 6.40, 225, 5, 0.50, 34),
    ('td_low1', 6.75, 238, 2.5, 0.56, 32),
    ('td_low2', 7.45, 265, 2, 0.62, 30),
    ('td_out',  8.10, 245, 10, 1.10, 28),
    ('td_hold', 8.60, 212, 16, 1.52, 28),
]
for name, t, az, el, d, fov in TD:
    sc['shots'][name] = {'az': az, 'el': el, 'd': d, 'target': [0.5, 3.5, 0.0], 'screenY': 0.5, 'fov': fov, 'ease': 'inOut'}
for a in sc['acts']:
    if a['act'] == 'explode':
        a['camera'] = [{'t': sh(t), 'shot': name} for name, t, *_ in TD]

json.dump(sc, open('film/landscape_v6.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('wrote film/landscape_v6.json')

# ---------------------------------------------------------------- self-check
src = json.load(open('film/landscape_v5.json', encoding='utf-8'))
bad = []


def flat(d, p=''):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out.update(flat(v, p + k + '.'))
        elif isinstance(v, list) and v and all(isinstance(x, (int, float)) for x in v):
            out[p + k] = v
    return out


f5, f6 = flat(src), flat(sc)
CHANGED_OK = {'explode.groups.head.dist', 'explode.shellBack.panes', 'explode.shellBack.belly'}
for k in sorted(f5):
    if k.startswith('explode.trains.') or k in CHANGED_OK:
        continue
    if f5[k] != f6.get(k):
        bad.append(('UNINTENDED CHANGE', k, f5[k], f6.get(k)))
# v5 trains untouched (except the intentional close-window fix)?
for k, v in src['explode']['trains'].items():
    if k in CLOSE_FIX:
        v = {**v, 'back': sh(CLOSE_FIX[k])}
    if sc['explode']['trains'].get(k) != v:
        bad.append(('V5 TRAIN DRIFT', k, v, sc['explode']['trains'].get(k)))
# head dist
if sc['explode']['groups']['head']['dist'] != 0.5:
    bad.append(('HEAD DIST', sc['explode']['groups']['head']['dist']))
# new trains well-formed
NEW = ['thoraxPlate', 'thoraxVentral', 'thoraxTrackA', 'thoraxTrackB', 'thoraxDrum', 'thoraxAct',
       'neckPlate', 'neckGlass', 'neckAct', 'headShield', 'headPanel', 'headRing', 'headCheek', 'headJaw',
       'springOut', 'abdCollar', 'wingPin']
for name in NEW:
    w = sc['explode']['trains'][name]
    if not (w['out'] + w['dur'] < w['back']):
        bad.append(('OUT/BACK', name, w))
    if w['back'] + w['ret'] > sh(8.55):
        bad.append(('SEAT LATE', name, w['back'] + w['ret']))
    if not (0.045 <= w['stagger'] <= 0.08):
        bad.append(('STAGGER', name, w['stagger']))
    if not (sh(5.5) <= w['out'] <= sh(6.6)):
        bad.append(('OUT WINDOW', name, w['out']))
if sorted(NEW) != sorted(set(NEW)):
    bad.append(('DUP TRAIN NAME',))
missing = [n for n in NEW if n not in sc['explode']['trains']]
if missing:
    bad.append(('MISSING', missing))
# camera keys: monotonic, match the plan table exactly
keys = [(k['t'], k['shot']) for a in sc['acts'] if a['act'] == 'explode' for k in a['camera']]
ts = [t for t, _ in keys]
if ts != sorted(ts) or len(set(ts)) != len(ts):
    bad.append(('CAMERA NOT MONOTONIC', ts))
if [s for _, s in keys] != [n for n, *_ in TD]:
    bad.append(('CAMERA SHOTS', keys))
for name, t, az, el, d, fov in TD:
    got = sc['shots'][name]
    if (got['az'], got['el'], got['d'], got['fov']) != (az, el, d, fov):
        bad.append(('SHOT PARAMS', name, got))
if abs(ts[0] - sc['acts'][2]['t']) > 1e-9 or abs(ts[-1] - sc['acts'][3]['t']) > 1e-9:
    bad.append(('CAMERA/ACT BOUNDS', ts[0], ts[-1]))
# global seat check: every item seated before main 8.55 (acceptance: 0% apart, no residue)
ITEMS = {'bands': 7, 'modules': 6, 'tail': 4, 'eyes': 2, 'thoraxShells': 10, 'gears': 8, 'femurShells': 8,
         'caps': 14, 'dust': 32, 'thoraxPlate': 3, 'thoraxVentral': 2, 'thoraxTrackA': 2, 'thoraxTrackB': 2,
         'thoraxDrum': 2, 'thoraxAct': 4, 'neckPlate': 3, 'neckGlass': 2, 'neckAct': 2, 'headShield': 1,
         'headPanel': 1, 'headRing': 2, 'headCheek': 2, 'headJaw': 2, 'springOut': 2, 'abdCollar': 2, 'wingPin': 2}
SEAT = sh(8.55)
for name, n in ITEMS.items():
    w = sc['explode']['trains'][name]
    seat = w['back'] + w['stagger'] * (n - 1) + w['ret']
    if seat > SEAT - 0.03:
        bad.append(('SEAT LATE', name, seat))
for name, w in sc['explode']['groups'].items():
    if w['back'] + w['ret'] > SEAT - 0.03:
        bad.append(('GROUP SEAT LATE', name, w['back'] + w['ret']))
sb = sc['explode']['shellBack']
for k, slack in (('wings', 0), ('panes', 0.33 * 0.6), ('belly', 0)):
    if sb[k] + slack + 0.55 > SEAT - 0.03:
        bad.append(('SHELL SEAT LATE', k, sb[k] + slack + 0.55))
if sorted(ITEMS) != sorted(sc['explode']['trains']):
    bad.append(('ITEMS/TRAINS MISMATCH', sorted(set(sc['explode']['trains']) ^ set(ITEMS))))
# part/trajectory bookkeeping for the score
items = sum(ITEMS[n] for n in NEW)
print('trains total:', len(sc['explode']['trains']), '(v5: %d + new %d)' % (len(src['explode']['trains']), len(NEW)))
print('new train items:', items)
print('camera keys:', keys)
print('SELF-CHECK', 'PASS' if not bad else 'FAIL')
for b in bad:
    print(' ', b)
