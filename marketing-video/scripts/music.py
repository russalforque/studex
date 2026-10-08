"""Synthesize the background music: an original, royalty-free track that follows the timeline.

    pip install numpy scipy soundfile
    python scripts/music.py

Reads src/timeline.json (written by scripts/voiceover.py) and writes public/music.mp3.
112 BPM in F major (I-V-vi-IV). Sections: light hook, riser into the logo, full groove for the
features, a breakdown without drums under the privacy scene, and a final chord at the end.
"""

import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 112
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)

root = Path(__file__).resolve().parent.parent
timeline = json.loads((root / "src" / "timeline.json").read_text())
fps = timeline["fps"]
scenes = {s["id"]: s for s in timeline["scenes"]}
total = timeline["total"] / fps
half = timeline["transition"] / 2 / fps


def snap(seconds: float) -> float:
    """Nearest beat, so section changes land on the groove."""
    return round(seconds / BEAT) * BEAT


# Section boundaries sit in the middle of the scene transitions.
drop = snap(scenes["intro"]["start"] / fps + half)
break_start = snap(scenes["privacy"]["start"] / fps + half)
break_end = snap(scenes["outro"]["start"] / fps + half)
final_hit = snap(total - 2.6)

n = int((total + 0.5) * SR)
L = np.zeros(n)
R = np.zeros(n)


def midi(m: float) -> float:
    return 440 * 2 ** ((m - 69) / 12)


def add(buf: np.ndarray, start: float, sig: np.ndarray, gain: float = 1.0) -> None:
    i = int(start * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    buf[i : i + len(sig)] += sig * gain


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def lowpass(x: np.ndarray, hz: float) -> np.ndarray:
    return sosfilt(butter(2, hz, "low", fs=SR, output="sos"), x)


def highpass(x: np.ndarray, hz: float) -> np.ndarray:
    return sosfilt(butter(2, hz, "high", fs=SR, output="sos"), x)


# Instruments ---------------------------------------------------------------------------------
def pluck(freq: float, length: float = 1.2) -> np.ndarray:
    """Soft marimba-like pluck."""
    t = t_axis(length)
    body = np.sin(2 * np.pi * freq * t) * np.exp(-t * 4.5)
    bar = 0.35 * np.sin(2 * np.pi * freq * 3.99 * t) * np.exp(-t * 18)
    click = 0.15 * np.sin(2 * np.pi * freq * 9.9 * t) * np.exp(-t * 60)
    return (body + bar + click) * np.minimum(1, t / 0.003)


def pad(freqs: list[float], length: float) -> np.ndarray:
    t = t_axis(length)
    sig = np.zeros_like(t)
    for f in freqs:
        for detune in (-0.12, 0, 0.12):
            ph = (t * f * 2 ** (detune / 12) + rng.random()) % 1
            sig += 2 * ph - 1
    sig = lowpass(sig / (len(freqs) * 3), 1400)
    env = np.minimum(1, t / 0.25) * np.minimum(1, (length - t) / 0.3)
    return sig * env


def bass(freq: float, length: float) -> np.ndarray:
    t = t_axis(length)
    sig = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(4 * np.pi * freq * t)
    return np.tanh(1.6 * sig) * np.exp(-t * 3) * np.minimum(1, t / 0.004)


def kick() -> np.ndarray:
    t = t_axis(0.45)
    phase = 2 * np.pi * np.cumsum(48 + 90 * np.exp(-t * 28)) / SR
    return np.sin(phase) * np.exp(-t * 7)


def clap() -> np.ndarray:
    t = t_axis(0.25)
    noise = sosfilt(butter(2, [900, 4000], "band", fs=SR, output="sos"), rng.standard_normal(len(t)))
    return noise * np.exp(-t * 22)


def hat() -> np.ndarray:
    t = t_axis(0.08)
    return highpass(rng.standard_normal(len(t)), 7000) * np.exp(-t * 70)


# Arrangement --------------------------------------------------------------------------------
# (bass root, chord tones) per bar: F, C, Dm, Bb
PROG = [(41, [65, 69, 72]), (36, [64, 67, 72]), (38, [62, 65, 69]), (34, [62, 65, 70])]
ARP = [0, 1, 2, 1, 3, 2, 1, 2]  # 8ths over the chord, index 3 = root an octave up

pad_bus = np.zeros(n)
bass_bus = np.zeros(n)
pump = np.ones(n)  # sidechain from the kick

bar_index = 0
bar_start = 0.0
while bar_start < final_hit:
    root_note, chord = PROG[bar_index % 4]
    in_hook = bar_start < drop
    in_break = break_start <= bar_start < break_end
    drums = not in_hook and not in_break

    add(pad_bus, bar_start, pad([midi(m - 12) for m in chord], BAR + 0.1), 0.5 if in_hook else 0.8)

    tones = chord + [chord[0] + 12]
    for step, idx in enumerate(ARP):
        at = bar_start + step * BEAT / 2
        if at >= final_hit:
            break
        note = pluck(midi(tones[idx]))
        gain = 0.30 if step % 2 == 0 else 0.22
        add(L, at, note, gain)
        add(R, at, note, gain)
        # Dotted-8th echo, ping-ponged for width.
        echo = (L, R)[step % 2]
        add(echo, at + 0.75 * BEAT, note, gain * 0.35)
        add((R, L)[step % 2], at + 1.5 * BEAT, note, gain * 0.15)

    if not in_hook or bar_start >= drop - BAR:
        for beat in (0, 1.5, 2, 3.5):
            add(bass_bus, bar_start + beat * BEAT, bass(midi(root_note), BEAT * 1.4), 0.55)

    if drums:
        for beat in range(4):
            at = bar_start + beat * BEAT
            add(L, at, kick(), 0.75)
            add(R, at, kick(), 0.75)
            i = int(at * SR)
            k = np.arange(min(int(BEAT * SR), n - i)) / SR
            pump[i : i + len(k)] = 1 - 0.55 * np.exp(-k * 9)
            if beat in (1, 3):
                add(L, at, clap(), 0.28)
                add(R, at + 0.008, clap(), 0.28)
            add(L, at + BEAT / 2, hat(), 0.10)
            add(R, at + BEAT / 2, hat(), 0.14)
    elif in_hook:
        # A soft heartbeat kick under the hook words.
        for beat in (0, 2):
            add(L, bar_start + beat * BEAT, kick(), 0.45)
            add(R, bar_start + beat * BEAT, kick(), 0.45)

    bar_start += BAR
    bar_index += 1

# Riser into the drop: filtered noise swelling over the last bar of the hook.
rise_len = BAR
t = t_axis(rise_len)
riser = highpass(rng.standard_normal(len(t)), 2500) * (t / rise_len) ** 2
add(L, drop - rise_len, riser, 0.12)
add(R, drop - rise_len, riser, 0.12)
# Crash-like burst on the drop and when the drums come back after the break.
for at in (drop, break_end):
    t = t_axis(1.6)
    crash = highpass(rng.standard_normal(len(t)), 5000) * np.exp(-t * 3)
    add(L, at, crash, 0.08)
    add(R, at, crash, 0.08)

# Final chord: F major, ringing out.
end_len = total + 0.5 - final_hit
for m in (53, 65, 69, 72, 77):
    note = pluck(midi(m), end_len) * np.exp(-t_axis(end_len) * 0.3)
    add(L, final_hit, note, 0.25)
    add(R, final_hit, note, 0.25)
add(pad_bus, final_hit, pad([midi(m) for m in (53, 57, 60)], end_len), 0.9)
add(bass_bus, final_hit, bass(midi(41), end_len), 0.6)
add(L, final_hit, kick(), 0.75)
add(R, final_hit, kick(), 0.75)

bed = pad_bus * 0.6 + bass_bus * 0.9
bed *= pump
L += bed
R += bed

mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.2) / np.tanh(1.2)  # gentle limiting
mix /= np.abs(mix).max() / 0.9
fade = int(1.2 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix = mix[: int(total * SR)]
sf.write(root / "public" / "music.mp3", mix, SR, format="MP3")
print(f"music.mp3 {total:.1f}s  drop {drop:.2f}s  break {break_start:.2f}-{break_end:.2f}s  final {final_hit:.2f}s")
