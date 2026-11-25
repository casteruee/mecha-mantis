"""Build film/landscape_v7.json = landscape_v6.json with the v7 impact pass:
- flythrough-aftermath camera: after full expansion the camera dives THROUGH the exploded
  body (hold 6.9-7.45 main) — neck/wing gap -> core pass -> abdomen/tail exit -> pull-out
- anchors follow the R10 upright posture (head +1.05y/+0.4x, forelegs raised)
Everything else (showcase / abdomen act / release choreography / sound / motion) is v6 untouched.
Times are authored in main-film seconds and shifted +4.5 by sh()."""
import json

D = 4.5
sc = json.load(open('film/landscape_v6.json', encoding='utf-8'))
src = json.loads(json.dumps(sc))
sh = lambda x: round(x + D, 6)

sc['name'] = 'ORCHIS MX-7 · 16:9 landscape v7 (impact flythrough), 0–16.5 s'
sc['note'] = ('v7: v6 film on the R9/R10 model (abdomen girth -10%, upright alert posture). The teardown keeps the '
              'v6 beats (wide -> gap -> impact at 6.4 with pulse/slow-mo) and then FLIES THROUGH the expanded body '
              'during the hold (6.9-7.45: neck/wing gap -> core pass at fov 42 -> abdomen/tail exit), pulls out '
              'through the reassembly and hands off to the release unchanged. Sound cues unchanged (score = v3 '
              'original +4.5 s).')
sc['product']['date'] = '2026-11-18'

# ---- flythrough camera (FPV / cinewhoop feel per owner): d = heroDist(23.5) multiples.
# The three thru_* keys fly THROUGH the frozen expansion — no per-key stops: 'linear' segments keep
# momentum (banked kinks read as drone turns), the punch-out into td_out is 'out' (fast exit, slow settle).
TD = [
    ('td_wide', 5.00, 200, 15, 1.60, 28, [0.5, 3.5, 0], 'inOut'),
    ('td_in', 5.70, 212, 12, 1.35, 28, [0.5, 3.5, 0], 'inOut'),
    ('td_gap', 6.05, 219, 8, 0.85, 30, [0.5, 3.5, 0], 'inOut'),
    ('td_deep', 6.40, 225, 5, 0.50, 34, [0.5, 3.5, 0], 'inOut'),
    ('td_low1', 6.75, 238, 2.5, 0.56, 32, [0.5, 3.5, 0], 'linear'),
    ('td_thru_a', 6.95, 245, 5, 0.30, 40, [-1.6, 5.8, 0.3], 'linear'),
    ('td_thru_b', 7.18, 256, 0, 0.15, 46, [0.9, 4.0, -0.3], 'linear'),
    ('td_thru_c', 7.45, 267, -4, 0.28, 40, [3.3, 3.0, -0.8], 'linear'),
    ('td_out', 8.15, 245, 8, 1.10, 28, [0.5, 3.5, 0], 'out'),
    ('td_hold', 8.60, 212, 16, 1.52, 28, [0.5, 3.5, 0], 'inOut'),
]
sc['shots'] = {k: v for k, v in sc['shots'].items() if not k.startswith('td_')}
for name, t, az, el, d, fov, tgt, ease in TD:
    sc['shots'][name] = {'az': az, 'el': el, 'd': d, 'target': tgt, 'screenY': 0.5, 'fov': fov, 'ease': ease}
for a in sc['acts']:
    if a['act'] == 'explode':
        a['camera'] = [{'t': sh(t), 'shot': name} for name, t, *_ in TD]

# ---- anchors follow the R10 posture (head +0.4x/+1.05y; foreleg raise ~+0.8y)
for L in sc['labels']['explode']:
    if L['title'] == 'Optic head':
        L['anchor'] = [-2.75, 7.40, 0.6]
sc['shots']['release_low']['target'] = [-1.5, 4.3, 0.0]
sc['shots']['release_ready']['target'] = [-2.65, 5.3, 0.6]

json.dump(sc, open('film/landscape_v7.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('wrote film/landscape_v7.json')

# ---------------------------------------------------------------- self-check
bad = []


def flat(d, p=''):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out.update(flat(v, p + k + '.'))
        elif isinstance(v, list) and v and all(isinstance(x, (int, float)) for x in v):
            out[p + k] = v
    return out


CHANGED_OK = {'explode.groups.head.dist'}   # v6 already carries the v5->v6 intentional deltas
ALLOW = {
    'shots.release_low.target', 'shots.release_ready.target',
    'shots.td_wide.az', 'shots.td_wide.el', 'shots.td_wide.d', 'shots.td_wide.fov',
}
f6, f7 = flat(src), flat(sc)
for k in sorted(f6):
    if k.startswith('shots.td_') or k.startswith('labels.') or k in ALLOW or k in CHANGED_OK:
        continue
    if f6[k] != f7.get(k):
        bad.append(('UNINTENDED CHANGE', k, f6[k], f7.get(k)))
# sound / motion / abdomen / release timing untouched (release shot *targets* move, the release block must not)
for k in ('motion', 'abdomen', 'release', 'sound', 'showcase', 'cursor'):
    if src[k] != sc[k]:
        bad.append(('BLOCK DRIFT', k))
# labels: only the Optic head anchor moved
for a, b in zip(src['labels']['explode'], sc['labels']['explode']):
    if a != b and not (a['title'] == 'Optic head' and a['anchor'] == [-3.15, 6.35, 0.6] and b['anchor'] == [-2.75, 7.40, 0.6]):
        bad.append(('LABEL DRIFT', a['title'], a, b))
if src['labels']['abdomen'] != sc['labels']['abdomen']:
    bad.append(('ABDOMEN LABEL DRIFT',))
# camera keys: monotonic, in act bounds, no orphan shot refs
keys = [(k['t'], k['shot']) for a in sc['acts'] if a['act'] == 'explode' for k in a['camera']]
ts = [t for t, _ in keys]
if ts != sorted(ts) or len(set(ts)) != len(ts):
    bad.append(('CAMERA NOT MONOTONIC', ts))
if abs(ts[0] - sc['acts'][2]['t']) > 1e-9 or abs(ts[-1] - sc['acts'][3]['t']) > 1e-9:
    bad.append(('CAMERA/ACT BOUNDS', ts[0], ts[-1]))
if [s for _, s in keys] != [n for n, *_ in TD]:
    bad.append(('CAMERA SHOTS', keys))
for name, t, az, el, d, fov, tgt, ease in TD:
    got = sc['shots'][name]
    if (got['az'], got['el'], got['d'], got['fov'], got['target'], got['ease']) != (az, el, d, fov, tgt, ease):
        bad.append(('SHOT PARAMS', name, got))
for a in sc['acts']:
    for k in a['camera']:
        if k['shot'] not in sc['shots']:
            bad.append(('ORPHAN SHOT', a['act'], k))
if 'td_low2' in sc['shots']:
    bad.append(('STALE SHOT td_low2',))
# thru keys inside the hold window (main 6.65-7.45), impact key untouched
hold = sc['explode']['hold']
thru = [t for n, t, *_ in TD if n.startswith('td_thru')]
if not all(hold[0] - D - 0.05 <= t <= hold[1] - D + 0.06 for t in thru):
    bad.append(('THRU OUTSIDE HOLD', thru, hold))
deep = dict((n, (az, el, d, fov)) for n, t, az, el, d, fov, _, _ in TD)['td_deep']
if deep != (225, 5, 0.50, 34):
    bad.append(('IMPACT KEY CHANGED', deep))
# FPV feel: the pass itself must be stop-free (linear segments) and the punch-out eases out
for n, t, az, el, d, fov, tgt, ease in TD:
    if n.startswith('td_thru') and ease != 'linear':
        bad.append(('THRU NOT LINEAR', n, ease))
if dict((n, e) for n, *_ , e in TD)['td_out'] != 'out':
    bad.append(('PUNCH-OUT EASE',))
print('camera keys:', keys)
print('SELF-CHECK', 'PASS' if not bad else 'FAIL')
for b in bad:
    print(' ', b)
