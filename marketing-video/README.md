# Studex promo video

A 25-second vertical (1080×1920, 9:16) marketing video for Reels, TikTok, Stories and Shorts,
built with [Remotion](https://remotion.dev). It uses the app's own colours, Manrope font and logo.

| Scene | Message |
|---|---|
| Hook | Classes. Tasks. Exams. Allowance. Savings. A lot to juggle? |
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

Copy (price, domain, sample data) lives in `src/scenes/`. There is no soundtrack yet; add one with
`<Audio>` from `@remotion/media` in `src/StudexPromo.tsx`.
