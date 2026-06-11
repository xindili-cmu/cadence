# Cadence 步频 — PT News Feed

> Curated physical therapy / rehab news for clinicians (practicing + academic). US + China + Australia. Not patient-facing.

Forked from the GreenStack cloud-deploy AIHOT pattern. Methodology: `climate agent/internal-design/methodology-kit/`.

## Surface area

- `index.html` — static site (Cloudflare Pages, no site build step; loads precompiled `app.min.js`)
- `news.json` — the feed data, committed daily by cron
- `archive/YYYY-MM.json` — every curated item, appended monthly by cron (survives feed rotation)
- `design-system/` — visual layer (rebrand pass pending designer round 1)
  - `app/*.jsx` — app sources (edit these); compiled to `app/app.min.js`
- `scripts/news-refresh.js` — Exa search → dedup → Claude curation → news.json
- `scripts/build-app.js` — JSX → minified `app.min.js` (production React, no in-browser Babel)
- `.github/workflows/refresh.yml` — daily 07:00 UTC cron + workflow_dispatch
- `.github/workflows/build-app.yml` — rebuilds + commits `app.min.js` on any `*.jsx` push

After editing any `design-system/app/*.jsx` or `components/**`: run `npm run build-app`
and commit `app.min.js`, or just push — CI rebuilds it. If `app.min.js` is missing,
index.html falls back to in-browser Babel compile (slow but functional).

## Run locally

```
EXA_API_KEY=... ANTHROPIC_API_KEY=... node scripts/news-refresh.js
```

## Pending (see PT_session_handoff.md)

- 7-file design-system rebrand pass after designer ships (methodology 02)
- GitHub Secrets: EXA_API_KEY + ANTHROPIC_API_KEY
- Cloudflare Pages hookup, first manual workflow_dispatch run
