# Cadence LinkedIn card — redesign bundle

A self-contained brief for redesigning the daily LinkedIn signal card so it actually uses
the Cadence design system (warm editorial paper + category colors + signal tiers) instead of
the current off-brand blue gradient.

## How to use

1. Open a fresh Claude session **inside this repo** (so it can run the satori pipeline and
   write `scripts/linkedin-daily-card.js`).
2. Paste the contents of **`PROMPT.md`** and attach the **`reference/`** folder.
3. Ask for the 2–3 mockups first, pick one, then have Claude implement and re-render.

To regenerate the current (before) card yourself for comparison:

```bash
node scripts/linkedin-daily-card.js 2026-06-22   # writes linkedin/2026-06-22/daily-signal.png
```

## Files

```
PROMPT.md                          ← the design brief (paste this)
README.md                          ← you are here
reference/
  current-card-BEFORE.png          ← current off-brand output (the thing to beat)
  current-generator.js             ← script to replace (satori helpers + font loading)
  sample-edition.json              ← real 2026-06-22 edition data (design against this)
  brand-colors.css                 ← authoritative color tokens (paper, ink, blue, --cat-*, signal tiers)
  brand-typography.css             ← authoritative type tokens (Spectral / Plex Sans / Plex Mono + scale)
  logo-lockup.svg                  ← brand wordmark + 6-bar mark geometry
  mark-favicon.svg                 ← compact mark (skewX -22.49)
```

## The one-line diagnosis

The current card hardcodes a generic `#3465A4 → #264E83` gradient and white-on-blue text.
The real brand is warm cream paper `#FAFAF6`, clay-ink text, scrubs blue `#3D74B8` as an
*accent*, eight specialty colors, and a three-tier signal scale. Rebuild on the real tokens.

## Fonts (already in the repo)

`vendor/fonts-ttf/` ships: IBM Plex Sans 500/600, IBM Plex Mono 400/500, Spectral 500
(no 600 — map to 500), and `cadence-bupin.ttf` (步频 subset of Noto Serif CJK SC).
Do not use a face/weight that isn't in that folder — satori will fall back and look wrong.
