"""Generate the voiceover with Kokoro (offline, Apache-2.0 TTS).

    pip install kokoro-onnx soundfile numpy
    # model files: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
    python scripts/voiceover.py path/to/kokoro-v1.0.onnx path/to/voices-v1.0.bin

Writes one WAV per line to public/voiceover/ and src/timeline.json: every scene's length and
when each line starts. The video and scripts/music.py both read the timeline, so picture, voice
and music stay in sync.
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

VOICE = "af_heart"
SPEED = 1.0
FPS = 30
TRANSITION = 15  # frames two scenes overlap (keep in sync with src/StudexPromo.tsx)
VOICE_DELAY = 8  # frames into a scene before its line starts
TAIL = 12  # frames of quiet after a line before the next transition begins
END_HOLD = 45  # frames the last scene holds after the final line
HOOK_DELAY = 6

# Shortest each scene may be, so its animations have room even with a short line.
MIN_FRAMES = {"hook": 95, "intro": 80, "schedule": 120, "exams": 110, "money": 125, "files": 105, "privacy": 100, "outro": 120}

# Scene id -> lines. The hook is split per word so the words on screen land with the voice.
SCRIPT = {
    "hook": ["Classes.", "Tasks.", "Exams.", "Allowance.", "Savings.", "That's a lot to juggle."],
    "intro": ["Meet Studex. Your student life, organized."],
    "schedule": ["See your next class, and everything due today, the moment you open the app."],
    "exams": ["Count down to every exam, tick off your study topics, and stay on track for your target grade."],
    "money": ["Know exactly how much is safe to spend today, so your allowance lasts the week. And watch your savings grow."],
    "files": ["Scan your handouts into clean PDFs, filed by subject."],
    "privacy": ["It works offline. No account. Your data stays on your phone."],
    "outro": ["Studex. Pay once, keep it for life. Get it now at studex dot P H."],
}

root = Path(__file__).resolve().parent.parent
out = root / "public" / "voiceover"
out.mkdir(parents=True, exist_ok=True)
kokoro = Kokoro(sys.argv[1], sys.argv[2])

timeline: dict = {"fps": FPS, "transition": TRANSITION, "scenes": []}
for scene, lines in SCRIPT.items():
    clips = []
    cursor = HOOK_DELAY if scene == "hook" else VOICE_DELAY
    for i, text in enumerate(lines):
        samples, rate = kokoro.create(text, voice=VOICE, speed=SPEED, lang="en-us")
        # Trim leading and trailing silence so timing is tight, then normalise to -1 dBFS.
        loud = np.where(np.abs(samples) > 0.01)[0]
        samples = samples[max(0, loud[0] - 400) : loud[-1] + 2400]
        samples = samples / np.abs(samples).max() * 0.89
        name = f"{scene}-{i}.wav"
        sf.write(out / name, samples, rate)
        frames = math.ceil(len(samples) / rate * FPS)
        clips.append({"file": f"voiceover/{name}", "text": text, "from": cursor, "frames": frames})
        print(f"{name:14} {len(samples) / rate:5.2f}s  {text}")
        cursor += frames
    is_last = scene == list(SCRIPT)[-1]
    duration = max(MIN_FRAMES[scene], cursor + (END_HOLD if is_last else TRANSITION + TAIL))
    timeline["scenes"].append({"id": scene, "duration": duration, "voice": clips})

start = 0
for s in timeline["scenes"]:
    s["start"] = start
    start += s["duration"] - TRANSITION
timeline["total"] = start + TRANSITION
print(f"total {timeline['total']} frames = {timeline['total'] / FPS:.1f}s")
(root / "src" / "timeline.json").write_text(json.dumps(timeline, indent=2) + "\n")
