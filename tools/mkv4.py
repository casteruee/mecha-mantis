"""Build film/landscape_v4.json = landscape_v3.json with every time shifted +4.5 s and a showcase pre-roll block."""
import json

D = 4.5
src = json.load(open('film/landscape_v3.json', encoding='utf-8'))
sc = json.loads(json.dumps(src))  # deep copy

sc['name'] = 'ORCHIS MX-7 · 16:9 landscape v4 (360° showcase + v3 film), 0–16.5 s'
sc['note'] = ('v4: 0–4.5 s modeling showcase (one full 360° turntable, camera eases into the exact hero shot, '
              'dashboard fades in), then the film_v3_merge film plays unchanged from 4.5 s (every v3 time shifted '
              '+4.5 s; nothing else edited).')
sc['duration'] = 16.5
sc['product']['date'] = '2026-11-17'

sc['showcase'] = {
    'note': 'turntable: the model spins exactly 360° about Y (ease inOut) and settles to 0 just before the handoff; the camera drifts from this framing into SHOTS.hero so 4.5 s is seamless with the v3 film\'s first frame.',
    'spin': [0.15, 4.35],
    'cam': {'az': -8, 'el': 17, 'd': 1.26, 'target': [0.55, 3.3, 0.0], 'screenY': 0.52, 'fov': 28, 'ease': 'inOut'},
    'ui': [3.55, 4.35],
}

def sh(x):
    return round(x + D, 6)

for a in sc['acts']:
    a['t'] = sh(a['t'])
    for k in a['camera']:
        k['t'] = sh(k['t'])
    for key in ('open', 'close'):
        if key in a:
            a[key] = [sh(v) for v in a[key]]

ex = sc['explode']
for key in ('out', 'rejoin', 'hold', 'slow', 'spin'):
    ex[key] = [sh(v) for v in ex[key]]
for key in ('wings', 'panes', 'belly', 'bands', 'tail', 'modules'):
    s, dur = ex['shell'][key]
    ex['shell'][key] = [sh(s), dur]
    ex['shellBack'][key] = sh(ex['shellBack'][key])
for g in ex['groups'].values():
    g['out'] = sh(g['out'])
    g['back'] = sh(g['back'])
ex['note'] = 'Times shifted +4.5 s from film_v3.json; choreography unchanged. ' + ex['note']

for key in ('raise', 'strike', 'fade'):
    sc['release'][key] = [sh(v) for v in sc['release'][key]]

for c in sc['cursor']['clicks']:
    c['t'] = sh(c['t'])
    c['move'] = [sh(v) for v in c['move']]

for grp in sc['labels'].values():
    for L in grp:
        L['t'] = [sh(v) for v in L['t']]

for key in ('tick', 'clicks', 'sweep', 'shell', 'coilHum', 'riser', 'impact', 'debris', 'drone', 'reverse', 'riser2', 'strike', 'fadeOut', 'ambience'):
    v = sc['sound'][key]
    sc['sound'][key] = [sh(x) for x in v]
sc['sound']['note'] = 'cues in seconds (all shifted +4.5 s from film_v3), synthesised by tools/makesfx.py; loudness -14 LUFS'

json.dump(sc, open('film/landscape_v4.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('wrote film/landscape_v4.json')
# quick self-check: v3 keys all shifted?
v3 = src
def times(d, p=''):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out.update(times(v, p + k + '.'))
        elif isinstance(v, list) and v and all(isinstance(x, (int, float)) for x in v):
            out[p + k] = v
    return out
t3, t4 = times(v3), times(sc)
for k in sorted(t3):
    if k in ('camera.heroAzWorld', 'camera.heroDist', 'camera.pullback', 'motion.walk.speed', 'motion.walk.stepHz', 'motion.walk.stepLift', 'motion.walk.stepSwing', 'motion.forearmLift', 'motion.gearRate.body', 'motion.gearRate.abd', 'fps', 'blend'):
        continue
    if k.startswith('explode.groups') and (k.endswith('.dur') or k.endswith('.ret') or k.endswith('.dist') or '.dir' in k):
        continue
    if k.startswith('explode.shell.'):
        continue
    a, b = t3[k], t4.get(k)
    if k == 'duration':
        ok = b == [16.5]
    else:
        ok = b == [round(x + D, 6) for x in a]
    if not ok:
        print('MISMATCH', k, a, b)
print('shift check done')
