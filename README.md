# Kinetics — PT News Feed

> Working name pending final brand. Curated physical therapy / rehab news for clinicians (practicing + academic). US + China + Australia. Not patient-facing.

Forked from the GreenStack cloud-deploy AIHOT pattern. Methodology: `climate agent/internal-design/methodology-kit/`.

## Surface area

- `index.html` — static site (Cloudflare Pages, no build step)
- `news.json` — the feed data, committed daily by cron
- `design-system/` — visual layer (rebrand pass pending designer round 1)
- `scripts/news-refresh.js` — Exa search → dedup → Claude curation → news.json
- `.github/workflows/refresh.yml` — daily 07:00 UTC cron + workflow_dispatch

## Run locally

```
EXA_API_KEY=... ANTHROPIC_API_KEY=... node scripts/news-refresh.js
```

## Pending (see PT_session_handoff.md)

- 7-file design-system rebrand pass after designer ships (methodology 02)
- GitHub Secrets: EXA_API_KEY + ANTHROPIC_API_KEY
- Cloudflare Pages hookup, first manual workflow_dispatch run
