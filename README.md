# IEEE Arcade

Mini-games and quizzes for the **IEEE ISIMA Student Branch** stand at ISIMA's integration day.
Visitors scan a QR code, pick a nickname, play on their phone, and appear on a live scoreboard
shown on a big screen at the stand.

Live site: https://ieee-arcade.vercel.app

- Plain HTML, CSS and vanilla JavaScript: no framework, no build step, no npm dependencies in the site.
- Scores are stored in **Supabase** (free hosted database), called with plain `fetch()`.
- Works on bad Wi-Fi: no CDNs or remote fonts; scores that can't be sent are queued and retried.

## Pages

| Page | What it is |
| --- | --- |
| `index.html` | Hub: join with a nickname, points and rank, quiz and game cards, Student Branch info |
| `chapters.html` | Our 4 chapters and affinity group (CS, CIS, RAS, WIE) |
| `quiz.html?set=quiz-ieee` | Quiz engine (also `quiz-cs`, `quiz-sb`) |
| `leaderboard.html` | Top 50 on the phone |
| `dashboard.html` | Big-screen scoreboard for the stand (1920x1080, press **Fullscreen**) |
| `games/2048/` | **IEEE Journey** (2048 reskin) |
| `games/t-rex/` | **Bug Runner** (T-Rex runner reskin) |
| `games/memory/` | **Tech Match** (memory game with our chapter and partner logos) |

## Run it locally

```
npx serve -l 3000
```

Open http://localhost:3000 on your PC, or http://YOUR-PC-IP:3000 on your phone (same Wi-Fi).
`serve.json` turns off "clean URLs" so `quiz.html?set=...` and the game folders work locally
(Vercel ignores this file).

## Configuration

`js/config.js` holds the Supabase **Project URL** and **publishable (anon) key**. The publishable key is
meant to be public: the database rules only allow reading, joining and submitting capped scores.
**Never** put the secret key (`sb_secret_...`) in this repo.

To remove a player (e.g. an inappropriate nickname): Supabase dashboard → Table Editor → `players` → delete the row
(their scores are deleted with it).

**Staff reset of a demo phone:** long-press the Student Branch logo on the hub for 3 seconds, then confirm.

## Add or edit quiz questions

Edit `data/quiz.json` (no code changes needed):

```json
{ "q": "Your question?", "options": ["A", "B", "C", "D"], "answer": 1, "explain": "Shown after answering (optional)" }
```

- `answer` is the **index** of the correct option, starting at 0 (`1` = "B" above).
- True/false questions: just use 2 options, e.g. `["True", "False"]`.
- Each run picks 10 random questions from the set, and options are shuffled automatically.
- Check your JSON at https://jsonlint.com before committing: one missing comma breaks the whole file.
  Invalid questions (e.g. `answer` out of range) are skipped and reported in the browser console.

## Scoring

All formulas are in one place: the `SCORING` block at the top of `js/arcade.js`.
Keep the caps in sync with the Supabase `submit_score()` function.

| Activity | Points | Max |
| --- | --- | --- |
| Quiz (each) | 100 per correct answer + up to 50 speed bonus, 10 questions | 1500 |
| IEEE Journey (2048) | game score / 20 | 500 |
| Bug Runner | distance / 2 | 500 |
| Tech Match | 500 − moves × 8 − seconds (minimum 50) | 500 |

Only each player's **best** score per activity counts.

## Editing content

- **Student Branch links** (footer on every page): `js/layout.js`, the `SB` object.
- **Tile labels in IEEE Journey**: `games/2048/js/ieee_arcade.js`, `TILE_LABELS`.
- **Tech Match cards**: `games/memory/memory.js`, `FACES`. One slot uses the SB mascot because
  `assets/img/ieee-logo.png` is not in the repo yet; the comment there explains how to switch.
- **Dashboard QR code**: `assets/img/qr.png` (points to https://ieee-arcade.vercel.app/).
- **Colors**: CSS variables at the top of `css/style.css` (palette inspired by isima.ieee.tn).

Logo rule: logos are shown as-is (never stretched, recolored or redrawn). The chapter and SB logos are
white artwork, so they always sit on dark tiles.

## Credits

- **IEEE Journey** is based on [2048](https://github.com/gabrielecirulli/2048) by Gabriele Cirulli (MIT License, `games/2048/LICENSE.txt`).
- **Bug Runner** is based on [T-Rex Runner](https://github.com/wayou/t-rex-runner) by wayou, extracted from Chromium (BSD 3-Clause License, `games/t-rex/LICENSE`).
- Mascot from [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) ("technologist"); the animated
  version on the dashboard comes from [Animated Fluent Emojis](https://github.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis).
- Design inspired by [isima.ieee.tn](https://isima.ieee.tn/).
- IEEE, IEEE society and chapter logos are trademarks of IEEE.
