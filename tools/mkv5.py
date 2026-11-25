"""Build film/landscape_v5.json = landscape_v4.json with the reworked layered teardown (trains + dust + rings)."""
import json

D = 4.5
sc = json.load(open('film/landscape_v4.json', encoding='utf-8'))
sh = lambda x: round(x + D, 6)

sc['name'] = 'ORCHIS MX-7 · 16:9 landscape v5 (360° showcase + layered teardown), 0–16.5 s'
sc['note'] = ('v5: showcase 0–4.5 s as in v4; the teardown act is rebuilt as the reference-style layered exploded '
              'drawing — core skeleton, 6 major components, real-part trains (optics, band stack, tail stack, side '
              'shells, gears, femur shells, joint caps) and 32 fastener bolts, plus orbit rings. Release ending '
              'unchanged (live blade-tip follow).')

def T(out, dur, back, ret, stag, amp=None):
    d = {'out': sh(out), 'dur': dur, 'back': sh(back), 'ret': ret, 'stagger': stag}
    if amp: d['amp'] = amp
    return d

sc['explode'] = {
    'note': ('Layered teardown. Stage 1 shell (5.15–6.0 main-film time): glass cage blooms as 7 bay petals, belly '
             'plates drop, wings lift. Stage 2 majors (5.5–6.5): head slides off the neck pin, prothorax backs out, '
             'abdomen slides along its axis, forelegs off their shoulder pins. Stage 3 trains (5.7–6.65): optics, '
             'band stack, tail stack, thorax side shells, drive gears along their shafts, femur shells, joint caps. '
             'Stage 4 dust (6.0–6.7): 32 fastener bolts drift along their screw axes. Thorax + walking legs stay as '
             'the core reference. Hold 6.65–7.45 (slow-motion clock). Reassembly layered in build order: dust, '
             'trains, majors, cage closes last. Pure translation, only gears spin.'),
    'out': [sh(5.5), sh(6.5)], 'rejoin': [sh(7.55), sh(8.55)], 'hold': [sh(6.65), sh(7.45)],
    'slow': [sh(6.4), sh(7.0)], 'slowRate': 0.22,
    'spin': [sh(5.2), sh(8.4)], 'spinDeg': 330,
    'shell': {'wings': [sh(5.15), 0.6], 'panes': [sh(5.2), 0.8], 'belly': [sh(5.3), 0.6]},
    'shellBack': {'wings': sh(7.88), 'panes': sh(7.9), 'belly': sh(7.98)},
    'groups': sc['explode']['groups'],   # major components unchanged from v4
    'trains': {
        'bands':        T(5.72, 0.72, 7.62, 0.52, 0.05, {'bandStep': 0.26}),
        'modules':      T(5.78, 0.68, 7.66, 0.50, 0.06, {'moduleOut': 0.34}),
        'tail':         T(5.82, 0.65, 7.70, 0.50, 0.07),
        'eyes':         T(5.78, 0.60, 7.62, 0.48, 0.08),
        'thoraxShells': T(5.80, 0.68, 7.68, 0.50, 0.05),
        'gears':        T(5.85, 0.65, 7.72, 0.50, 0.05),
        'femurShells':  T(5.78, 0.62, 7.64, 0.48, 0.05),
        'caps':         T(5.88, 0.58, 7.76, 0.45, 0.045),
        'dust':         T(6.00, 0.68, 7.50, 0.45, 0.012),
    },
}

sc['labels']['explode'] = [
    {'t': [sh(5.9), sh(8.35)], 'title': 'Optic head',   'sub': '2 × lens',          'anchor': [-3.15, 6.35, 0.6], 'track': 'head',     'at': [0.24, 0.3]},
    {'t': [sh(5.95), sh(8.35)], 'title': 'Band stack',  'sub': '7 rings stepped',   'anchor': [3.2, 3.6, 1.3],    'track': 'abdomen',  'at': [0.72, 0.26]},
    {'t': [sh(6.1), sh(8.35)], 'title': 'Drive gears',  'sub': 'spinning free',     'anchor': [0.3, 4.15, 0.95],                       'at': [0.2, 0.62]},
    {'t': [sh(6.2), sh(8.35)], 'title': 'Tail stack',   'sub': '5 segments',        'anchor': [5.7, 2.2, 0.3],     'track': 'abdomen',  'at': [0.72, 0.7]},
]

json.dump(sc, open('film/landscape_v5.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('wrote film/landscape_v5.json')
print('trains:', {k: (v['out'], v['back']) for k, v in sc['explode']['trains'].items()})
