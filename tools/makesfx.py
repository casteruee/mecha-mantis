"""Synthesise the film score (storyboard-v1.md sound spec) into a WAV, cues read from film/landscape.json.

python -I tools/makesfx.py film/landscape.json out/score.wav
then: ffmpeg -i video.mp4 -i score.wav -c:v copy -c:a aac -b:a 256k -af loudnorm=I=-14:TP=-3 -shortest out.mp4

All cues are code-generated (no samples, no copyright): ambience, UI clicks, sweeps, shell slide,
coil hum, risers, impact + debris crackle, slow-motion drone, reverse sweep, strike whip, fade-out.
"""
import json
import math
import struct
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(2026)

script = json.load(open(sys.argv[1], encoding='utf-8'))
OUT = sys.argv[2]
DUR = script['duration']
S = script['sound']
N = int(DUR * SR)
t = np.arange(N) / SR
mix = np.zeros(N)


def seg(a, b):
    return slice(max(0, int(a * SR)), min(N, int(b * SR)))


def env_adsr(length, a=0.01, d=0.05, s=0.7, r=0.1):
    n = int(length * SR)
    e = np.zeros(n)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    ns = max(0, n - na - nd - nr)
    if na: e[:na] = np.linspace(0, 1, na)
    if nd: e[na:na + nd] = np.linspace(1, s, nd)
    if ns: e[na + nd:na + nd + ns] = s
    if nr: e[na + nd + ns:] = np.linspace(s, 0, n - na - nd - ns)
    return e


def add(at, sig, gain=1.0):
    i = int(at * SR)
    j = min(N, i + len(sig))
    if i < N:
        mix[i:j] += gain * sig[:j - i]


def noise(length):
    return rng.standard_normal(int(length * SR))


def lowpass(x, cutoff):
    # one-pole lowpass, cutoff in Hz
    a = math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def bandpass(x, lo, hi):
    return lowpass(x, hi) - lowpass(x, lo)


def sweep(f0, f1, length, shape='exp', gain=1.0):
    n = int(length * SR)
    tt = np.arange(n) / SR
    k = tt / max(1e-6, length)
    f = f0 * (f1 / f0) ** k if shape == 'exp' else f0 + (f1 - f0) * k
    ph = 2 * np.pi * np.cumsum(f) / SR
    return gain * np.sin(ph) * env_adsr(length, 0.02 * length, 0.1 * length, 0.85, 0.25 * length)


def click(gain=1.0, bright=1.0):
    n = int(0.07 * SR)
    tt = np.arange(n) / SR
    body = np.sin(2 * np.pi * (900 * bright) * tt) * np.exp(-tt * 55)
    ping = np.sin(2 * np.pi * (2400 * bright) * tt) * np.exp(-tt * 90) * 0.6
    nz = noise(0.012) * np.exp(-np.arange(int(0.012 * SR)) / SR * 220) * 0.5
    out = body + ping
    out[:len(nz)] += nz
    return gain * out


# 1. ambience: soft room tone + low drone, fade in over 1.2 s
amb = lowpass(noise(DUR), 320) * 0.05
amb += 0.028 * np.sin(2 * np.pi * 52 * t) + 0.02 * np.sin(2 * np.pi * 78.5 * t + 1.2)
fade_in = np.clip(t / 1.2, 0, 1)
mix += amb * (0.35 + 0.65 * fade_in)

# 2. light tick at 1.0 s
add(S['tick'][0], click(0.22, 1.5))

# 3. UI clicks at 2.5 / 5.1 / 8.45 (+ a small press thud)
for c in S['clicks']:
    add(c, click(0.85, 1.0))
    thud = np.sin(2 * np.pi * 140 * np.arange(int(0.06 * SR)) / SR) * env_adsr(0.06, 0.002, 0.02, 0.3, 0.03)
    add(c, thud, 0.5)

# 4. short sweep at the abdomen button (2.35–2.75)
add(S['sweep'][0], sweep(220, 880, 0.4, gain=0.28))
sw_n = noise(0.4)
add(S['sweep'][0], bandpass(sw_n, 400, 3000) * env_adsr(0.4, 0.08, 0.1, 0.6, 0.2), 0.2)

# 5. shell slide 2.65–4.8: airy filtered noise, envelope follows the open/hold/close
a, b = S['shell']
sl = bandpass(noise(b - a), 500, 4200)
k = np.linspace(0, 1, len(sl))
bell = np.sin(np.pi * np.clip(k * 1.15, 0, 1)) ** 0.8
add(a, sl * bell, 0.16)

# 6. coil hum 2.9–4.85: 82 Hz + harmonics, rising with the glow, pulsing while held
a, b = S['coilHum']
n = int((b - a) * SR)
tt = np.arange(n) / SR
hum = (np.sin(2 * np.pi * 82 * tt) + 0.5 * np.sin(2 * np.pi * 164 * tt + 0.7) + 0.28 * np.sin(2 * np.pi * 246 * tt))
rise = np.clip(tt / 0.9, 0, 1) * (1 - np.clip((tt - (b - a - 0.45)) / 0.45, 0, 1))
pulse = 1 + 0.18 * np.sin(2 * np.pi * 2.2 * tt)
add(a, hum * rise * pulse, 0.12)

# 7. riser 5.2–6.4 into the impact
a, b = S['riser']
add(a, sweep(70, 380, b - a, gain=0.30))
rz = bandpass(noise(b - a), 300, 5200) * np.linspace(0.05, 1.0, int((b - a) * SR)) ** 2
add(a, rz, 0.22)

# 8. impact at 6.4: low boom + debris crackle
imp_n = int(1.1 * SR)
tt = np.arange(imp_n) / SR
boom = np.sin(2 * np.pi * (62 * np.exp(-tt * 2.2) + 34) * tt) * np.exp(-tt * 3.2)
crack = lowpass(noise(0.25), 2600) * np.exp(-np.arange(int(0.25 * SR)) / SR * 9)
add(S['impact'][0], boom, 0.9)
add(S['impact'][0], crack, 0.45)

# 9. debris crackle 6.4–7.4: sparse pops
a, b = S['debris']
n_pops = 70
for i in range(n_pops):
    at = a + (b - a) * rng.random()
    ln = 0.02 + 0.05 * rng.random()
    pop = np.sin(2 * np.pi * (300 + 2200 * rng.random()) * np.arange(int(ln * SR)) / SR) * np.exp(-np.arange(int(ln * SR)) / SR * 60)
    add(at, pop, 0.12 + 0.18 * rng.random())

# 10. slow-motion drone 6.4–7.05
a, b = S['drone']
n = int((b - a) * SR)
tt = np.arange(n) / SR
dr = np.sin(2 * np.pi * 44 * tt) + 0.6 * np.sin(2 * np.pi * 66.5 * tt + 1.1)
add(a, dr * env_adsr(b - a, 0.06, 0.15, 0.85, 0.2), 0.22)

# 11. reverse sweep into the reassembly 7.6–8.3 (a swell that ends at 8.3)
a, b = S['reverse']
n = int((b - a) * SR)
rev = bandpass(noise(b - a), 250, 4800) * (np.linspace(0, 1, n) ** 2.4)
add(a, rev, 0.30)
add(a, sweep(120, 620, b - a, gain=0.16))

# 12. second riser 9.6–11.0
a, b = S['riser2']
add(a, sweep(64, 520, b - a, gain=0.34))
rz2 = bandpass(noise(b - a), 250, 6000) * np.linspace(0.04, 1.0, int((b - a) * SR)) ** 2.2
add(a, rz2, 0.26)

# 13. strike whip at 11.0
n = int(0.5 * SR)
tt = np.arange(n) / SR
whip = np.sin(2 * np.pi * (1500 * np.exp(-tt * 9) + 210) * tt) * np.exp(-tt * 7)
snap = lowpass(noise(0.09), 5200) * np.exp(-np.arange(int(0.09 * SR)) / SR * 34)
add(S['strike'][0], whip, 0.85)
add(S['strike'][0], snap, 0.8)

# 14. master fade-out 11.5–12.0
a, b = S['fadeOut']
fade = np.ones(N)
fade[seg(a, b)] = np.linspace(1, 0, int((b - a) * SR))
fade[int(b * SR):] = 0
mix *= fade

# soft clip + write
mix = np.tanh(mix * 1.25)
peak = np.max(np.abs(mix)) or 1.0
pcm = (mix / peak * 0.92 * 32767).astype('<i2')
with wave.open(OUT, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', OUT, f'{DUR}s {SR}Hz')
