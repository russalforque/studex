# Studex marketing videos

Two narrated videos built with [Remotion](https://remotion.dev), in the app's own colours, Manrope
font and logo.

```bash
npm install
npm run dev          # Remotion Studio preview; every scene is also its own composition
npm run render       # out/studex-promo.mp4
npm run render:film           # out/studex-film.mp4 (16:9)
npm run render:film-vertical  # out/studex-film-vertical.mp4 (9:16)
```

## StudexFilm: product film (16:9 and 9:16)

66 seconds, in two cuts: `StudexFilm` (1920×1080) for YouTube, the website and presentations, and
`StudexFilmVertical` (1080×1920) for Reels, TikTok and Shorts. Both share the narration, music and
animation timing; each scene picks its layout from `useTall()` (`src/film/kit.tsx`). In the vertical
cut, key content stays above the bottom ~350px, where social apps overlay captions. It shows **real Studex
screens** (captured from the app with sample data) in a device frame, with cards lifting out of the
screen to highlight details. Code in `src/film/`.

| Scene | Narration |
|---|---|
| Open | Between classes, deadlines, exams, and a weekly allowance, student life moves fast. |
| Title | Studex brings it all together, in one calm app. |
| Today | Open it, and your day is ready. Your next class, and exactly what's due. |
| Plan | Your timetable and your tasks live side by side, with reminders before every class. |
| Exams | Count down to every exam, and tick off study topics as you prepare. |
| Subjects | Each subject keeps its grades, attendance, notes, and files together, so you always know where you stand. |
| Files | Scan handouts and notes into clean PDFs that open anytime, even without internet. |
| Budget | Studex works out how much is safe to spend today, so your allowance lasts the whole week. |
| Savings | And it helps you set money aside for the things that matter. |
| Privacy | It works completely offline. No account needed. And your data never leaves your phone. |
| CTA | Studex is free to download. Start today, and upgrade whenever you're ready, at studex dot P H. |

The scenes follow the order of the app's own tour (`src/features/guide/tourSteps.ts`): day at a
glance, tasks and schedule, exams, subjects, files, budget, then savings and privacy.

### App screens

`public/screens/` holds the screenshots. To recapture them after UI changes:

```bash
# from the repo root: run the app with the license check bypassed (dev builds only)
VITE_LICENSE_BYPASS=1 npx vite --port 5173
# in marketing-video/
npm run screens
```

`scripts/capture-screens.mjs` freezes the clock at Thursday 8 Oct 2026, 8:50 in Manila, seeds a
semester through the app's own repositories (subjects, classes, tasks, exams, grades, allowance,
expenses, savings, and study files imported through the app's own scan/import pipeline) and saves
393×852 screenshots at 3×, plus one handout page (`handout.jpg`) for the scanning shot. The cards that lift out of the phone are
cut from these by the rectangles in `CARDS` (`src/film/kit.tsx`); check them if a layout changes.

## StudexPromo: social cut (9:16)

42 seconds, 1080×1920, for Reels, TikTok, Stories and Shorts, with stylised mock screens.
Code in `src/scenes/`.

| Scene | Message |
|---|---|
| Hook | Classes. Tasks. Exams. Allowance. Savings. That's a lot to juggle. |
| Intro | Studex · Your student life, organized. |
| Schedule | Know what's next: next class card, tasks checking off |
| Exams | Ace every exam: countdown, study topics, grade target |
| Money | Spend smart: safe to spend today, expenses, savings goal |
| Files | Scan handouts: camera scan to PDF |
| Privacy | Works offline, no account, data stays on your phone |
| Outro | Free to download · Upgrade anytime · Get Studex free · studex.ph |

## Voiceover and music

Both are generated offline and committed, so rendering works without these steps.

- **Voiceover**: [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) TTS (Apache-2.0), voice
  `af_heart`. Each video's script is in `VIDEOS` in `scripts/voiceover.py`. Running it writes the
  voice clips and the video's timeline (`src/timeline.json` or `src/film/timeline.json`), which
  sets every scene's length from its line.
- **Music**: original tracks synthesized in code, following each timeline. No samples or
  third-party audio, so there is nothing to license. They duck under the voice (`src/audio.tsx`).
  - `scripts/music.py` → `public/music.mp3` (promo): 112 BPM, plucks and four-on-the-floor.
  - `scripts/music_film.py` → `public/music-film.mp3` (film): 96 BPM, piano and strings, impacts
    on the title and call to action, a breakdown under privacy.

```bash
python -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile numpy scipy
# kokoro-v1.0.onnx and voices-v1.0.bin from
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
.venv/bin/python scripts/voiceover.py kokoro-v1.0.onnx voices-v1.0.bin promo   # or: film
.venv/bin/python scripts/music.py          # or: scripts/music_film.py; re-run after the voiceover
```

Scene animations are timed in frames inside each scene; after a big script change, check that
they still land on the words.
