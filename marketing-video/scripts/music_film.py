"""Synthesize the product film's score: original and royalty-free, following its timeline.

    pip install numpy scipy soundfile
    python scripts/music_film.py

Reads src/film/timeline.json (written by `scripts/voiceover.py ... film`) and writes
public/music-film.mp3. 96 BPM in C major (C - G/B - Am - F). Piano and strings open, an impact
lands on the title, a pulse builds through the features, full drums for budget and savings, a
breakdown for privacy, and a swell into the call to action that ends on a held chord.
"""

import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(11)

root = Path(__file__).resolve().parent.parent
timeline = json.loads((root / "src" / "film" / "timeline.json").read_text())
fps = timeline["fps"]
scenes = {s["id"]: s for s in timeline["scenes"]}
total = timeline["total"] / fps
half = timeline["transition"] / 2 / fps


def cut(scene_id: str) -> float:
    """Middle of the transition into a scene, snapped to the beat."""
    return round((scenes[scene_id]["start"] / fps + half) / BEAT) * BEAT


TITLE = cut("title")
PULSE = cut("today")
FULL = cut("budget")
BREAK = cut("privacy")
CTA = cut("cta")
FINAL = round((total - 4.2) / BEAT) * BEAT

n = int((total + 0.5) * SR)
L = np.zeros(n)
R = np.zeros(n)


def midi(m: float) -> float:
    return 440 * 2 ** ((m - 69) / 12)


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def add(at: float, sig: np.ndarray, gain: float = 1.0, pan: float = 0.0) -> None:
    """Mix a mono signal in at `at` seconds; pan -1 (left) to 1 (right)."""
    i = int(at * SR)
    if i >= n or at < 0:
        return
    sig = sig[: n - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt((1 - pan) / 2) * 1.414
    R[i : i + len(sig)] += sig * np.sqrt((1 + pan) / 2) * 1.414


def add_wide(at: float, render, gain: float = 1.0) -> None:
    """Mix two independent renders left and right, for width (strings, pads)."""
    i = int(at * SR)
    if i >= n or at < 0:
        return
    for buf in (L, R):
        sig = render()[: n - i] * gain
        buf[i : i + len(sig)] += sig


def filt(x: np.ndarray, kind: str, hz) -> np.ndarray:
    return sosfilt(butter(2, hz, kind, fs=SR, output="sos"), x)


# Instruments ---------------------------------------------------------------------------------
def piano(freq: float, length: float = 2.4, vel: float = 1.0) -> np.ndarray:
    """Soft felt piano: slightly inharmonic partials, faster decay up the series, hammer thump."""
    t = t_axis(length)
    sig = np.zeros_like(t)
    for k, amp in enumerate((1.0, 0.45, 0.22, 0.12, 0.06), start=1):
        f = freq * k * np.sqrt(1 + 0.0004 * k * k)
        sig += amp * np.sin(2 * np.pi * f * t) * np.exp(-t * (1.1 + 0.9 * k) * (freq / 400) ** 0.3)
    thump = filt(rng.standard_normal(len(t)), "low", 600) * np.exp(-t * 80) * 0.15
    return (sig + thump) * np.minimum(1, t / 0.004) * vel


def strings(freqs: list[float], length: float, attack: float = 0.8) -> np.ndarray:
    t = t_axis(length)
    sig = np.zeros_like(t)
    for f in freqs:
        for detune in (-0.08, -0.03, 0.03, 0.08):
            vib = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * t + rng.random() * 6)
            ph = np.cumsum(f * 2 ** (detune / 12) * vib) / SR
            sig += 2 * (ph % 1) - 1
    sig = filt(sig / (len(freqs) * 4), "low", 1800)
    env = np.minimum(1, t / attack) * np.minimum(1, (length - t) / 0.6)
    return sig * env


def pulse_bass(freq: float) -> np.ndarray:
    t = t_axis(BEAT / 2)
    sig = np.tanh(2 * (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)))
    return filt(sig, "low", 900) * np.exp(-t * 7) * np.minimum(1, t / 0.003)


def kick(punch: float = 1.0) -> np.ndarray:
    t = t_axis(0.5)
    phase = 2 * np.pi * np.cumsum(45 + 85 * np.exp(-t * 32)) / SR
    return np.sin(phase) * np.exp(-t * 6) * punch


def snap() -> np.ndarray:
    t = t_axis(0.3)
    return filt(rng.standard_normal(len(t)), "band", [1200, 5000]) * np.exp(-t * 18)


def hat(open_: bool = False) -> np.ndarray:
    t = t_axis(0.3 if open_ else 0.07)
    return filt(rng.standard_normal(len(t)), "high", 8000) * np.exp(-t * (12 if open_ else 80))


def impact() -> np.ndarray:
    """Low cinematic boom with a noise tail."""
    t = t_axis(3.0)
    phase = 2 * np.pi * np.cumsum(32 + 60 * np.exp(-t * 9)) / SR
    boom = np.sin(phase) * np.exp(-t * 1.6)
    air = filt(rng.standard_normal(len(t)), "band", [200, 3000]) * np.exp(-t * 2.5) * 0.35
    return boom + air


def riser(length: float) -> np.ndarray:
    t = t_axis(length)
    noise = rng.standard_normal(len(t))
    # Sweep a band upward by mixing progressively higher bands.
    lo = filt(noise, "band", [300, 1500])
    hi = filt(noise, "band", [2000, 9000])
    x = t / length
    return (lo * (1 - x) + hi * x) * x**2.2


# Arrangement --------------------------------------------------------------------------------
# (bass, chord, melody notes for the bar's piano motif)
PROG = [
    (36, [60, 64, 67], [76, 74, 72, 67]),  # C
    (35, [59, 62, 67], [74, 72, 71, 67]),  # G/B
    (33, [57, 60, 64], [72, 71, 69, 64]),  # Am
    (29, [57, 60, 65], [69, 72, 77, 76]),  # Fmaj7-ish
]

bar = 0
at = 0.0
while at < FINAL:
    bass_note, chord, motif = PROG[bar % 4]
    in_break = BREAK <= at < CTA
    level = 0.55 if at < TITLE else 0.8 if in_break else 1.0

    freqs = [midi(m) for m in chord] + [midi(chord[0] - 12)]
    add_wide(at, lambda: strings(freqs, BAR + 0.5, 0.9 if at < TITLE else 0.4), 0.42 * level)

    # Piano: motif on beats, chord tones in between once the pulse arrives.
    for k, m in enumerate(motif):
        add(at + k * BEAT, piano(midi(m), vel=0.9 if k == 0 else 0.7), 0.2, pan=-0.2 + 0.13 * k)
    if at >= PULSE and not in_break:
        for k in range(4):
            add(at + (k + 0.5) * BEAT, piano(midi(chord[k % 3] + 12), 1.2, 0.5), 0.12, pan=0.35)

    if PULSE <= at and not in_break:
        for k in range(8):
            add(at + k * BEAT / 2, pulse_bass(midi(bass_note + 12)), 0.26 if at < FULL else 0.32)

    if PULSE <= at < FULL:
        add(at, kick(0.7), 0.6)
        add(at + 2 * BEAT, kick(0.7), 0.6)
        for k in range(4):
            add(at + (k + 0.5) * BEAT, hat(), 0.06, pan=0.4)
    elif at >= FULL and not in_break:
        for k in range(4):
            add(at + k * BEAT, kick(), 0.75)
            add(at + (k + 0.5) * BEAT, hat(), 0.08, pan=0.4)
        add(at + BEAT, snap(), 0.22, pan=-0.1)
        add(at + 3 * BEAT, snap(), 0.22, pan=0.1)
    elif in_break:
        add(at, kick(0.5), 0.35)

    # A low drone under the opening.
    if at < TITLE:
        t = t_axis(BAR + 0.3)
        add(at, np.sin(2 * np.pi * midi(bass_note) * t) * np.minimum(1, t / 0.5) * np.minimum(1, (BAR + 0.3 - t) / 0.3), 0.18)

    at += BAR
    bar += 1

# Swells and hits on the big moments.
add(TITLE - 2 * BEAT * 2, riser(4 * BEAT), 0.12)
add(TITLE, impact(), 0.55)
add(CTA - 4 * BEAT, riser(4 * BEAT), 0.14)
add(CTA, impact(), 0.45)
for hit in (TITLE, FULL, CTA):
    add(hit, hat(open_=True), 0.12, pan=-0.3)
    add(hit + 0.01, hat(open_=True), 0.12, pan=0.3)

# Final held chord: C major with an added 9th, piano and strings ringing out.
end_len = total + 0.5 - FINAL
for m, p in ((48, 0), (60, -0.3), (64, -0.1), (67, 0.1), (74, 0.3), (79, 0.4)):
    add(FINAL, piano(midi(m), end_len, 0.9), 0.22, pan=p)
add_wide(FINAL, lambda: strings([midi(m) for m in (48, 55, 64, 67, 74)], end_len, 0.3), 0.5)
add(FINAL, kick(), 0.6)
add(FINAL, impact(), 0.25)

# Light stereo room: two short, filtered, cross-fed reflections.
for delay, gain in ((0.031, 0.18), (0.067, 0.12)):
    d = int(delay * SR)
    L[d:] += filt(R[:-d], "low", 4000) * gain
    R[d:] += filt(L[:-d], "low", 4000) * gain

mix = np.stack([L, R], axis=1)
mix = filt(mix.T, "high", 30).T  # clear sub rumble
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix /= np.abs(mix).max() / 0.9
fade = int(2.0 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix = mix[: int(total * SR)]
sf.write(root / "public" / "music-film.mp3", mix, SR, format="MP3")
print(f"music-film.mp3 {total:.1f}s  title {TITLE:.2f}  pulse {PULSE:.2f}  full {FULL:.2f}  break {BREAK:.2f}-{CTA:.2f}  final {FINAL:.2f}")
