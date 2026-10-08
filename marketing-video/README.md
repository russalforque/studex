# Studex promo video

A 42-second vertical (1080×1920, 9:16) narrated marketing video for Reels, TikTok, Stories and Shorts,
built with [Remotion](https://remotion.dev). It uses the app's own colours, Manrope font and logo.

| Scene | Message |
|---|---|
| Hook | Classes. Tasks. Exams. Allowance. Savings. That's a lot to juggle. |
| Intro | Studex · Your student life, organized. |
| Schedule | Know what's next: next class card, tasks checking off |
| Exams | Ace every exam: countdown, study topics, grade target |
| Money | Spend smart: safe to spend today, expenses, savings goal |
| Files | Scan handouts: camera scan to PDF |
| Privacy | Works offline, no account, data stays on your phone |
| Outro | Pay once, keep it for life · Get Studex ₱199 · studex.ph |

```bash
npm install
npm run dev      # Remotion Studio preview; each scene is also its own composition
npm run render   # writes out/studex-promo.mp4
```

On-screen copy (price, domain, sample data) lives in `src/scenes/`.

## Voiceover and music

Both are generated offline and committed, so `npm run render` works without these steps.

- **Voiceover**: [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) TTS (Apache-2.0), voice `af_heart`.
  The script is the `SCRIPT` table in `scripts/voiceover.py`. Running it writes
  `public/voiceover/*.wav` and `src/timeline.json`, which sets every scene's length from its line.
- **Music**: an original track synthesized by `scripts/music.py` (112 BPM, F major) that follows
  the timeline: light hook, drop on the logo, breakdown under the privacy scene, final chord. No
  samples or third-party audio, so there is nothing to license. It ducks under the voice in
  `src/audio.tsx`.

```bash
python -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile numpy scipy
# kokoro-v1.0.onnx and voices-v1.0.bin from
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
.venv/bin/python scripts/voiceover.py kokoro-v1.0.onnx voices-v1.0.bin
.venv/bin/python scripts/music.py   # re-run after the voiceover, since timing may change
```

Scene animations are timed in frames inside each scene; after a big script change, check that
they still land on the words.
