# Stat Twin + Stat Match

**Stat Match** (`/`) — daily NBA player guessing game (mobile-first). **Stat Twin** (`/explore`) — the original slider / explorer (unchanged). Both share `data/seasons.js`, typography, and styling.

## Deploy to Vercel (no build step)

This is a pure static site — Vercel just serves the files. No framework, no `npm install`.

### Option A — drag-and-drop (60 seconds)

1. Sign in to [vercel.com](https://vercel.com).
2. Click **Add New → Project → Deploy** (or use the **Vercel CLI**: `npx vercel deploy --prod` from this folder).
3. Drop this entire folder onto the upload area, or point Vercel at the GitHub repo containing it.
4. That's it. You'll get a `*.vercel.app` URL you can share.

### Option B — GitHub + Vercel (recommended for ongoing edits)

1. Create a new GitHub repo and push the contents of this folder to it.
2. On Vercel: **Add New → Project → Import Git Repository → Deploy**.
3. No build settings to configure. Just press Deploy.
4. Every `git push` redeploys.

### Custom domain

Project → Settings → Domains → add yours. Vercel auto-issues the SSL cert.

## Routes

- `/` — Stat Match (daily game)
- `/explore` — Stat Twin (sliders)

## What's in here

- `index.html` — Stat Match entry
- `explore/index.html` — Stat Twin entry
- `statmatch.jsx` — daily game UI + logic
- `app.jsx` — Stat Twin React app (matching, sliders, layout)
- `silhouette.jsx` — abstract line-art player illustrations
- `tweaks-panel.jsx` — in-page tweak controls (off by default in production)
- `styles.css` — global styles
- `data/seasons.js` — player-season dataset (generated; includes Stat Match clue fields)
- `data/teams.js` — team color palettes & jersey numbers
- `data/match.js` — z-score normalization + similarity scoring
- `vercel.json` — caching headers (optional, sensible defaults)

## Hook up your real data (build `data/seasons.js`)

To regenerate `data/seasons.js` from your local CSVs:

1. Put `PlayerStatistics.csv` and `Players.csv` **next to** this repo folder (`../PlayerStatistics.csv`, `../Players.csv`).
2. From inside this repo:

```bash
npm install
npm run build:seasons
```

That will overwrite `data/seasons.js` with an auto-generated `window.SEASONS = [...]` array that the app loads on page load.

## Notes

- Babel runs in the browser to transpile the JSX. That's fine for a fun project but adds ~3MB on first visit. If this gets traction and you want to make it lean, convert to Vite (npm create vite@latest → drop the source files in → `vercel deploy`).
- Data is illustrative — sourced from public stat tables. Not affiliated with the NBA.
# NBA-Sliders
