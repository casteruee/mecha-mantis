"""Build film/landscape_v8.json — v8 one-take teardown choreography on the R9/R10 model.

Owner brief (2026-11-18): (1) the gap between the 360° showcase and the abdomen act is dead air — trim it;
(2) v7's FPV pass felt like "crashing in then bobbing, too fast" — redesign the whole teardown camera to be
silky, multi-angle and impactful, following FPV-film craft (research: fluidity over speed; speed reads from
proximity; one-take = timed beats: establish -> hero #1 -> transition/reveal -> hero #2 -> exit; FPV is an
accent, used once).

Master timeline (absolute s):
  showcase 0-4.5 | intro 4.5-6.0 (flow) | abdomen 6.0-8.6 | explode 8.6-12.9 (flow) | release 12.9-16.5
Beats (main-film s = abs-4.5), one committed 200->330 orbit arc, el dives monotonically then rises (no bob):
  td_wide 4.10 -> td_in 4.75 -> td_arc1 5.15 -> td_impact 5.45 (hero #1: pulse + slow-mo)
  -> td_arc2 5.90 -> td_arc3 6.20 (orbit reveal) -> td_thru_a 6.45 -> td_thru_b 6.85 (hero #2: the pass)
  -> td_thru_c 7.30 -> td_out 7.90 -> td_hold 8.40 (handoff)
Sound cues follow the picture and are re-synthesised by tools/makesfx.py from this file's sound block."""
import json

D = 4.5
sc = json.load(open('film/landscape_v7.json', encoding='utf-8'))
src = json.loads(json.dumps(sc))
sh = lambda x: round(x + D, 6)

sc['name'] = 'ORCHIS MX-7 · 16:9 landscape v8 (one-take teardown), 0–16.5 s'
sc['note'] = ('v8: dead-air trimmed (intro 2.3->1.5 s) and the teardown rebuilt as a single flowing take on '
              'PCHIP splines (no per-key stops). FPV craft applied: establish -> impact hero -> orbit reveal -> '
              'proximity pass (the accent, 0.85 s, clearances ~1 u) -> pull-out, one committed 130-degree arc, '
              'monotone dive-then-rise. R9/R10 model. Sound re-synthesised to the new beats.')
sc['product']['date'] = '2026-11-18'

# ------------------------------------------------------------ shots
sc['shots']['hero_push'] = {'az': 24, 'el': 12.5, 'd': 0.86, 'target': [0.55, 3.3, 0.0], 'screenY': 0.55, 'fov': 28, 'ease': 'inOut'}
TD = [
    ('td_wide', 4.10, 200, 15.0, 1.60, 28, [0.5, 3.5, 0]),
    ('td_in', 4.75, 212, 11.5, 1.18, 28, [0.5, 3.5, 0]),
    ('td_arc1', 5.15, 223, 8.0, 0.82, 30, [0.5, 3.5, 0]),
    ('td_impact', 5.45, 231, 5.5, 0.58, 34, [0.5, 3.5, 0]),
    ('td_arc2', 5.90, 242, 4.0, 0.64, 32, [0.5, 3.5, 0]),
    ('td_arc3', 6.20, 253, 2.5, 0.72, 30, [0.5, 3.5, 0]),
    ('td_thru_a', 6.45, 264, 1.0, 0.46, 36, [-1.6, 5.6, 0.2]),
    ('td_thru_b', 6.85, 277, -1.0, 0.28, 40, [0.8, 4.0, -0.2]),
    ('td_thru_c', 7.30, 291, -2.0, 0.52, 34, [3.2, 3.0, -0.6]),
    ('td_out', 7.90, 310, 4.0, 0.92, 29, [0.5, 3.5, 0]),
    ('td_hold', 8.40, 330, 12.0, 1.25, 28, [0.5, 3.5, 0]),
]
for name, t, az, el, d, fov, tgt in TD:
    sc['shots'][name] = {'az': az, 'el': el, 'd': d, 'target': tgt, 'screenY': 0.5, 'fov': fov, 'ease': 'flow'}

# ------------------------------------------------------------ acts
sc['acts'] = [
    {'act': 'intro', 't': sh(0.0), 'status': 'Stalking in', 'flow': True,
     'camera': [{'t': sh(0.0), 'shot': 'hero'}, {'t': sh(1.5), 'shot': 'hero_push'}]},
    {'act': 'abdomen', 't': sh(1.5), 'button': 'abdomen', 'status': 'Abdomen',
     'open': [sh(1.85), sh(2.75)], 'close': [sh(3.45), sh(3.95)],
     'camera': [{'t': sh(1.85), 'shot': 'abdomen'}, {'t': sh(2.75), 'shot': 'abdomen_open'},
                {'t': sh(3.45), 'shot': 'abdomen_hold'}, {'t': sh(3.95), 'shot': 'abdomen_close'},
                {'t': sh(4.10), 'shot': 'abdomen_settle'}]},
    {'act': 'explode', 't': sh(4.10), 'button': 'teardown', 'status': 'Teardown', 'flow': True,
     'camera': [{'t': sh(t), 'shot': name} for name, t, *_ in TD]},
    {'act': 'release', 't': sh(8.40), 'button': 'release', 'status': 'Release',
     'camera': [{'t': sh(8.40), 'shot': 'release_low'}, {'t': sh(9.45), 'shot': 'release_ready'},
                {'t': sh(11.0), 'shot': 'release_strike'}, {'t': sh(12.0), 'shot': 'release_tip'}]},
]
sc['release'] = {'raise': [sh(8.40), sh(9.45)], 'strike': [sh(9.45), sh(11.0)], 'fade': [sh(11.25), sh(12.0)]}

# ------------------------------------------------------------ explode choreography (main-film s)
def T(out, dur, back, ret, stag, amp=None):
    d = {'out': sh(out), 'dur': dur, 'back': sh(back), 'ret': ret, 'stagger': stag}
    if amp:
        d['amp'] = amp
    return d

sc['explode'] = {
    'note': ('One-take teardown v8. Staged expansion completes by 5.75 (main); impact 5.45 (pulse + slow-mo); '
             'hold 5.75-7.35 widens to 1.6 s for the showcase: orbit reveal 5.90-6.20 then the proximity pass '
             '6.45-7.30 (the FPV accent, once). Reassembly 7.45-8.40; everything seated by 8.36; exact zero at '
             '8.40. Pure translation, only gears spin.'),
    'out': [sh(4.55), sh(5.55)], 'rejoin': [sh(7.45), sh(8.40)], 'hold': [sh(5.75), sh(7.35)],
    'slow': [sh(5.45), sh(6.05)], 'slowRate': 0.22,
    # the turntable completes 330 deg BEFORE the pass (frozen structure to fly around; the last 30 deg
    # completes during the reassembly via the (360-spinDeg) term) — v8 probe caught the spinning abdomen
    # sweeping through the flight path otherwise
    'spin': [sh(4.25), sh(6.45)], 'spinDeg': 330,
    'scan': [4.25, 0.5],
    'shell': {'wings': [sh(4.30), 0.6], 'panes': [sh(4.35), 0.8], 'belly': [sh(4.45), 0.6]},
    'shellBack': {'wings': sh(7.75), 'panes': sh(7.55), 'belly': sh(7.80)},
    'groups': {
        'abdomen': {'dir': [0.978, -0.206, 0], 'dist': 2.3, 'out': sh(4.55), 'dur': 0.85, 'back': sh(7.45), 'ret': 0.5},
        'prothorax': {'dir': [-0.84, 0.54, 0], 'dist': 0.55, 'out': sh(4.70), 'dur': 0.7, 'back': sh(7.52), 'ret': 0.5},
        'head': {'dir': [-0.84, 0.54, 0], 'dist': 0.5, 'out': sh(4.80), 'dur': 0.7, 'back': sh(7.60), 'ret': 0.5},
        'forelegR': {'dir': [0.15, 0.1, 1], 'dist': 2.2, 'out': sh(4.90), 'dur': 0.62, 'back': sh(7.70), 'ret': 0.52},
        'forelegL': {'dir': [0.15, 0.1, -1], 'dist': 2.2, 'out': sh(4.90), 'dur': 0.62, 'back': sh(7.70), 'ret': 0.52},
        'wings': {'dir': [0, 1, 0.12], 'dist': 1.25, 'out': sh(4.50), 'dur': 0.7, 'back': sh(7.75), 'ret': 0.52},
    },
    'trains': {
        'bands': T(4.72, 0.72, 7.50, 0.50, 0.05, {'bandStep': 0.26}),
        'modules': T(4.78, 0.68, 7.52, 0.48, 0.06, {'moduleOut': 0.34}),
        'tail': T(4.82, 0.65, 7.55, 0.48, 0.07),
        'eyes': T(4.78, 0.60, 7.50, 0.46, 0.08),
        'thoraxShells': T(4.80, 0.68, 7.38, 0.48, 0.05),
        'gears': T(4.85, 0.65, 7.45, 0.48, 0.05),
        'femurShells': T(4.78, 0.62, 7.48, 0.46, 0.05),
        'caps': T(4.88, 0.58, 7.30, 0.44, 0.045),
        'dust': T(5.00, 0.68, 7.40, 0.44, 0.012),
        'thoraxPlate': T(4.74, 0.68, 7.42, 0.48, 0.06),
        'thoraxVentral': T(4.78, 0.64, 7.44, 0.48, 0.05),
        'thoraxTrackA': T(4.82, 0.64, 7.42, 0.48, 0.05),
        'thoraxTrackB': T(4.86, 0.62, 7.44, 0.48, 0.05),
        'thoraxDrum': T(4.86, 0.60, 7.46, 0.46, 0.05),
        'thoraxAct': T(4.90, 0.60, 7.48, 0.46, 0.05),
        'neckPlate': T(4.76, 0.66, 7.44, 0.48, 0.06),
        'neckGlass': T(4.88, 0.60, 7.48, 0.46, 0.05),
        'neckAct': T(4.92, 0.58, 7.50, 0.44, 0.05),
        'headShield': T(4.78, 0.62, 7.48, 0.46, 0.05),
        'headPanel': T(4.82, 0.60, 7.50, 0.46, 0.05),
        'headRing': T(4.84, 0.62, 7.52, 0.48, 0.06),
        'headCheek': T(4.86, 0.60, 7.52, 0.46, 0.05),
        'headJaw': T(4.90, 0.58, 7.54, 0.44, 0.05),
        'springOut': T(4.84, 0.66, 7.54, 0.50, 0.06),
        'abdCollar': T(4.78, 0.62, 7.52, 0.48, 0.06),
        'wingPin': T(4.94, 0.56, 7.56, 0.44, 0.045),
    },
}

# ------------------------------------------------------------ motion / cursor / labels / sound
sc['motion']['walk']['stop'] = [sh(1.1), sh(1.7)]
sc['cursor']['clicks'] = [
    {'t': sh(1.7), 'button': 'abdomen', 'move': [sh(1.3), sh(1.7)]},
    {'t': sh(4.25), 'button': 'teardown', 'move': [sh(4.0), sh(4.25)]},
    {'t': sh(8.2), 'button': 'release', 'move': [sh(7.95), sh(8.2)]},
]
sc['labels']['abdomen'] = [
    {'t': [sh(2.15), sh(3.95)], 'title': 'Glass cage', 'sub': '56 panes, radial', 'anchor': [3.1, 3.7, 1.15], 'at': [0.3, 0.28]},
    {'t': [sh(2.45), sh(3.95)], 'title': 'Coil core', 'sub': '20 lit coils', 'anchor': [2.4, 3.2, 0.0], 'at': [0.72, 0.3]},
    {'t': [sh(2.65), sh(3.95)], 'title': 'Tip', 'sub': 'machined, chrome', 'anchor': [5.75, 2.05, 0.0], 'at': [0.68, 0.72]},
]
sc['labels']['explode'] = [
    {'t': [sh(5.70), sh(8.00)], 'title': 'Optic head', 'sub': '2 × lens', 'anchor': [-2.75, 7.40, 0.6], 'track': 'head', 'at': [0.24, 0.3]},
    {'t': [sh(5.75), sh(8.00)], 'title': 'Band stack', 'sub': '7 rings stepped', 'anchor': [3.2, 3.6, 1.3], 'track': 'abdomen', 'at': [0.72, 0.26]},
    {'t': [sh(5.85), sh(8.00)], 'title': 'Drive gears', 'sub': 'spinning free', 'anchor': [0.3, 4.15, 0.95], 'at': [0.2, 0.62]},
    {'t': [sh(5.95), sh(8.00)], 'title': 'Tail stack', 'sub': '5 segments', 'anchor': [5.7, 2.2, 0.3], 'track': 'abdomen', 'at': [0.72, 0.7]},
]
sc['sound'] = {
    'note': 'cues re-synthesised by tools/makesfx.py to the v8 beat sheet (impact = slow[0]); loudness -14 LUFS',
    'ambience': [sh(0.0), sh(0.9)],
    'tick': [sh(0.15)],
    'clicks': [sh(1.7), sh(4.25), sh(8.2)],
    'sweep': [sh(1.55), sh(1.95)],
    'shell': [sh(1.85), sh(3.95)],
    'coilHum': [sh(2.10), sh(4.00)],
    'riser': [sh(4.30), sh(5.45)],
    'impact': [sh(5.45)],
    'debris': [sh(5.45), sh(6.55)],
    'drone': [sh(5.45), sh(6.10)],
    'reverse': [sh(7.45), sh(8.25)],
    'riser2': [sh(9.45), sh(11.0)],
    'strike': [sh(11.0)],
    'fadeOut': [sh(11.5), sh(12.0)],
}

json.dump(sc, open('film/landscape_v8.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('wrote film/landscape_v8.json')

# ---------------------------------------------------------------- self-check
bad = []
ITEMS = {'bands': 7, 'modules': 6, 'tail': 4, 'eyes': 2, 'thoraxShells': 10, 'gears': 8, 'femurShells': 8,
         'caps': 14, 'dust': 32, 'thoraxPlate': 3, 'thoraxVentral': 2, 'thoraxTrackA': 2, 'thoraxTrackB': 2,
         'thoraxDrum': 2, 'thoraxAct': 4, 'neckPlate': 3, 'neckGlass': 2, 'neckAct': 2, 'headShield': 1,
         'headPanel': 1, 'headRing': 2, 'headCheek': 2, 'headJaw': 2, 'springOut': 2, 'abdCollar': 2, 'wingPin': 2}
EX = sc['explode']
REJOIN_END = EX['rejoin'][1] - D   # main
# acts contiguous, cameras in bounds, ends meeting the next act
for i, a in enumerate(sc['acts']):
    ks = [k['t'] for k in a['camera']]
    nxt = sc['acts'][i + 1]['t'] if i + 1 < len(sc['acts']) else sh(12.0)
    if not (a['t'] <= ks[0] <= a['t'] + 0.5):
        bad.append(('ACT FIRST KEY', a['act'], ks[0], a['t']))
    if abs(ks[-1] - nxt) > 1e-9:
        bad.append(('ACT LAST KEY', a['act'], ks[-1], nxt))
    if ks != sorted(ks) or len(set(ks)) != len(ks):
        bad.append(('ACT KEYS NOT MONOTONIC', a['act'], ks))
    for k in a['camera']:
        if k['shot'] not in sc['shots']:
            bad.append(('ORPHAN SHOT', a['act'], k['shot']))
if sc['acts'][2].get('flow') is not True or sc['acts'][0].get('flow') is not True:
    bad.append(('FLOW FLAG',))
if sc['acts'][1].get('flow') or sc['acts'][3].get('flow'):
    bad.append(('FLOW ON V3 ACT',))
# camera beats: az monotone; el monotone down to thru_b then up (no bob); impact == slow[0]
azs = [t[2] for t in TD]
els = [t[3] for t in TD]
if azs != sorted(azs):
    bad.append(('AZ NOT MONOTONIC', azs))
turn = els.index(min(els))
if els[:turn + 1] != sorted(els[:turn + 1], reverse=True) or els[turn:] != sorted(els[turn:]):
    bad.append(('EL NOT DIVE-THEN-RISE', els))
impact_t = dict((n, t) for n, t, *_ in TD)['td_impact']
if abs(impact_t - (EX['slow'][0] - D)) > 1e-9:
    bad.append(('IMPACT != SLOW START', impact_t, EX['slow'][0]))
# the pass must fly around a FROZEN structure: the turntable ends at/before td_thru_a
if EX['spin'][1] - D > dict((n, t) for n, t, *_ in TD)['td_thru_a'] + 1e-9:
    bad.append(('SPIN NOT FROZEN FOR PASS', EX['spin'][1] - D))
# explode window sanity
if not (EX['out'][0] < EX['slow'][0] < EX['hold'][0] < EX['hold'][1] < EX['rejoin'][0] < EX['rejoin'][1]):
    bad.append(('EXPLODE WINDOW ORDER', EX['out'], EX['slow'], EX['hold'], EX['rejoin']))
if EX['hold'][1] - EX['hold'][0] < 1.5:
    bad.append(('HOLD TOO SHORT', EX['hold']))
# every item seated before the rejoin end
for name, n in ITEMS.items():
    w = EX['trains'][name]
    seat = (w['back'] - D) + w['stagger'] * (n - 1) + w['ret']
    if seat > REJOIN_END - 0.03:
        bad.append(('SEAT LATE', name, round(seat, 3)))
for name, w in EX['groups'].items():
    if (w['back'] - D) + w['ret'] > REJOIN_END - 0.03:
        bad.append(('GROUP SEAT LATE', name))
sb = EX['shellBack']
for k, slack in (('wings', 0), ('panes', 0.33 * 0.6), ('belly', 0)):
    if (sb[k] - D) + slack + 0.55 > REJOIN_END - 0.03:
        bad.append(('SHELL SEAT LATE', k))
if sorted(ITEMS) != sorted(EX['trains']):
    bad.append(('ITEMS/TRAINS MISMATCH', sorted(set(EX['trains']) ^ set(ITEMS))))
# sound follows the picture
S = sc['sound']
if S['impact'][0] != sc['explode']['slow'][0]:
    bad.append(('IMPACT CUE != SLOW', S['impact'], sc['explode']['slow']))
clicks_abs = [c['t'] for c in sc['cursor']['clicks']]
if [round(x, 6) for x in S['clicks']] != [round(x, 6) for x in clicks_abs]:
    bad.append(('CLICK CUES != CURSOR', S['clicks'], clicks_abs))
if S['riser'][1] != S['impact'][0] or S['riser2'][1] != S['strike'][0]:
    bad.append(('RISER END != HIT', S['riser'], S['riser2']))
if not (sh(0) <= S['ambience'][0] and S['fadeOut'][1] == sh(12.0)):
    bad.append(('SOUND SPAN',))
# unchanged blocks
for k in ('showcase', 'product', 'ui', 'buttons', 'cards', 'abdomen'):
    if k == 'product':
        continue
    if src[k] != sc[k]:
        bad.append(('BLOCK DRIFT', k))
if src['shots']['release_strike']['target'] != 'tip_forelegR' or src['shots']['release_tip']['target'] != 'tip_forelegR':
    bad.append(('TIP FOLLOW LOST',))
if src['shots']['hero_push'] if 'hero_push' in src['shots'] else False:
    bad.append(('HERO_PUSH OVERWRITE',))
print('acts:', [(a['act'], a['t'], round(a['t'] - D, 2)) for a in sc['acts']])
print('camera beats:', [(n, t) for n, t, *_ in TD])
print('max seat:', round(max((w['back'] - D) + w['stagger'] * (ITEMS[n] - 1) + w['ret'] for n, w in EX['trains'].items()), 3), '(limit', round(REJOIN_END - 0.03, 3), ')')
print('SELF-CHECK', 'PASS' if not bad else 'FAIL')
for b in bad:
    print(' ', b)
