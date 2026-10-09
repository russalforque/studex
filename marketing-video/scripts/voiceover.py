"""Generate a video's voiceover with Kokoro (offline, Apache-2.0 TTS).

    pip install kokoro-onnx soundfile numpy
    # model files: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
    python scripts/voiceover.py path/to/kokoro-v1.0.onnx path/to/voices-v1.0.bin [promo|film]

Writes one WAV per line and a timeline JSON: every scene's length and when each line starts.
The video and the music script both read the timeline, so picture, voice and music stay in sync.
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

FPS = 30
VOICE = "af_heart"

VIDEOS = {
    # 9:16 social cut (src/StudexPromo.tsx).
    "promo": {
        "audio_dir": "voiceover",
        "timeline": "src/timeline.json",
        "speed": 1.0,
        "transition": 15,  # frames two scenes overlap
        "voice_delay": 8,  # frames into a scene before its line starts
        "first_delay": 6,  # same, for the opening scene
        "tail": 12,  # frames of quiet after a line before the next transition begins
        "end_hold": 45,  # frames the last scene holds after the final line
        # Shortest each scene may be, so its animations have room even with a short line.
        "min_frames": {"hook": 95, "intro": 80, "schedule": 120, "exams": 110, "money": 125, "files": 105, "privacy": 100, "outro": 120},
        # Scene id -> lines. The hook is split per word so the words on screen land with the voice.
        "script": {
            "hook": ["Classes.", "Tasks.", "Exams.", "Allowance.", "Savings.", "That's a lot to juggle."],
            "intro": ["Meet Studex. Your student life, organized."],
            "schedule": ["See your next class, and everything due today, the moment you open the app."],
            "exams": ["Count down to every exam, tick off your study topics, and stay on track for your target grade."],
            "money": ["Know exactly how much is safe to spend today, so your allowance lasts the week. And watch your savings grow."],
            "files": ["Scan your handouts into clean PDFs, filed by subject."],
            "privacy": ["It works offline. No account. Your data stays on your phone."],
            "outro": ["Studex. Free to download. Upgrade whenever you're ready, at studex dot P H."],
        },
    },
    # 16:9 product film with real app screens (src/film/).
    "film": {
        "audio_dir": "voiceover/film",
        "timeline": "src/film/timeline.json",
        "speed": 0.95,
        "transition": 20,
        "voice_delay": 14,
        "first_delay": 20,
        "tail": 16,
        "end_hold": 75,
        "min_frames": {"open": 150, "title": 110, "today": 150, "plan": 150, "exams": 130, "subjects": 160, "files": 160, "budget": 170, "savings": 130, "privacy": 150, "cta": 180},
        "script": {
            "open": ["Between classes, deadlines, exams, and a weekly allowance, student life moves fast."],
            "title": ["Studex brings it all together, in one calm app."],
            "today": ["Open it, and your day is ready. Your next class, and exactly what's due."],
            "plan": ["Your timetable and your tasks live side by side, with reminders before every class."],
            "exams": ["Count down to every exam, and tick off study topics as you prepare."],
            "subjects": ["Each subject keeps its grades, attendance, notes, and files together, so you always know where you stand."],
            "files": ["Scan handouts and notes into clean PDFs that open anytime, even without internet."],
            "budget": ["Studex works out how much is safe to spend today, so your allowance lasts the whole week."],
            "savings": ["And it helps you set money aside for the things that matter."],
            "privacy": ["It works completely offline. No account needed. And your data never leaves your phone."],
            "cta": ["Studex is free to download. Start today, and upgrade whenever you're ready, at studex dot P H."],
        },
    },
}

root = Path(__file__).resolve().parent.parent
kokoro = Kokoro(sys.argv[1], sys.argv[2])
video = sys.argv[3] if len(sys.argv) > 3 else "promo"
cfg = VIDEOS[video]
script = cfg["script"]
out = root / "public" / cfg["audio_dir"]
out.mkdir(parents=True, exist_ok=True)

timeline: dict = {"fps": FPS, "transition": cfg["transition"], "scenes": []}
for n, (scene, lines) in enumerate(script.items()):
    clips = []
    cursor = cfg["first_delay"] if n == 0 else cfg["voice_delay"]
    for i, text in enumerate(lines):
        samples, rate = kokoro.create(text, voice=VOICE, speed=cfg["speed"], lang="en-us")
        # Trim leading and trailing silence so timing is tight, then normalise to -1 dBFS.
        loud = np.where(np.abs(samples) > 0.01)[0]
        samples = samples[max(0, loud[0] - 400) : loud[-1] + 2400]
        samples = samples / np.abs(samples).max() * 0.89
        name = f"{scene}-{i}.wav"
        sf.write(out / name, samples, rate)
        frames = math.ceil(len(samples) / rate * FPS)
        clips.append({"file": f"{cfg['audio_dir']}/{name}", "text": text, "from": cursor, "frames": frames})
        print(f"{name:14} {len(samples) / rate:5.2f}s  {text}")
        cursor += frames
    is_last = n == len(script) - 1
    tail = cfg["end_hold"] if is_last else cfg["transition"] + cfg["tail"]
    duration = max(cfg["min_frames"][scene], cursor + tail)
    timeline["scenes"].append({"id": scene, "duration": duration, "voice": clips})

start = 0
for s in timeline["scenes"]:
    s["start"] = start
    start += s["duration"] - cfg["transition"]
timeline["total"] = start + cfg["transition"]
print(f"total {timeline['total']} frames = {timeline['total'] / FPS:.1f}s")
path = root / cfg["timeline"]
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(timeline, indent=2) + "\n")
