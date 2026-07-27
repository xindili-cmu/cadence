# Redesign the Cadence daily LinkedIn signal card

Paste this whole file into a fresh Claude session, with the `reference/` folder attached.
Everything Claude needs is in this brief and the attached files — no outside facts required.

---

## Role

You are redesigning a single deliverable: the **1080×1350 (4:5) image** that Cadence
posts to LinkedIn every weekday. It is generated programmatically (no Figma export) by
`scripts/linkedin-daily-card.js` from one immutable edition JSON. Your job is to make it
**look good and on-brand**, then ship a drop-in replacement for that script.

## What Cadence is

Cadence (步频) is a daily curated **physical-therapy / rehab research feed** for clinicians.
Each weekday an editorial pipeline scores 50+ sources and publishes one "edition." The card
is the cover image for the LinkedIn post: an eyebrow + headline + the top ~5 scored items,
each with a 0–100 **SIGNAL** score, a specialty tag, and a title. Brand wordmark is
`Cadence` (the "Ca" in ink, "dence" in blue) followed by `步频`; site is `incadencept.com`.

## The problem — why the current card looks bad

Look at `reference/current-card-BEFORE.png` and `reference/current-generator.js`.

The current card **ignores the Cadence design system entirely.** It invents a generic
corporate **blue→navy gradient** (`#3465A4 → #264E83`) with white-on-blue everything. The
real brand is the opposite: a **warm editorial paper** look (cream background, clay-ink text,
restrained hairlines) closer to NEJM / Cochrane print than to a SaaS dashboard. Specific
failures to fix:

1. **Off-brand palette.** Muddy blue-on-blue gradient; low contrast; nothing matches the
   real tokens in `reference/brand-colors.css`. → Rebuild on warm paper `#FAFAF6` with ink
   text, blue used as an *accent*, not the whole canvas.
2. **No use of the 8 category colors.** Every specialty is the same blue. The design system
   gives each specialty its own hue (see `--cat-*`). Use them so ortho vs peds is scannable.
3. **Repeated "SIGNAL" label on every row** — pure clutter. Label the column once (or not at
   all); the number alone reads as the signal.
4. **Flat score treatment.** All scores look identical. The system defines a 3-tier authority
   scale (≥90 practice-changing / 80–89 worth knowing / 65–79 reference). Encode the tier.
5. **Generic, gradient-y, no editorial character.** No serif voice, no paper warmth, no
   hierarchy beyond "big number, small text."

## Brand system (authoritative — use these exact values)

Full tokens are in `reference/brand-colors.css` and `reference/brand-typography.css`.
The essentials:

**Surfaces & ink (warm, not cool)**
- Paper / page bg: `#FAFAF6`  · card/white: `#FFFFFF` · sunken: `#F6F3EA`
- Ink: 900 `#1E1C17` (headlines) · 700 `#45413A` (body) · 500 `#7A7568` (meta) · hairline `#E4DFD1`

**Primary — "Scrubs Blue"** (accent, links, the mark — NOT a full-bleed background)
- 600 `#3D74B8` (primary) · 700 `#2C5A96` · 800 `#224674` · soft `#E2EDF8` / `#F2F7FC`

**SIGNAL score tiers** (an authority scale inside the blue family — not traffic lights)
- ≥90 practice-changing → navy `#224674` on soft `#E7EEF5`
- 80–89 worth knowing → scrubs `#3D74B8` on soft `#EAF1F8`
- 65–79 reference → clay `#7A7568` on soft `#EFEBE0`

**Eight specialty category colors** (solid / soft tint / ink-on-tint):
| category | solid | soft | ink |
|---|---|---|---|
| orthopedic (slate indigo) | `#3C4C6E` | `#E8EAF1` | `#2B3850` |
| neurological (deep violet) | `#463E7C` | `#E9E6F1` | `#332D5C` |
| sports (burnt sienna) | `#9B4A2C` | `#F5E6DD` | `#75361F` |
| pediatric (ochre) | `#876418` | `#F2EAD3` | `#694E12` |
| geriatric (pine) | `#2F5D52` | `#DFEAE6` | `#22463D` |
| cardiopulmonary (garnet) | `#8C3B43` | `#F4E2E3` | `#6A2C32` |
| manual & modalities (moss) | `#545F2E` | `#EBEEDB` | `#3E4621` |
| practice & profession (graphite) | `#434952` | `#E8EAEC` | `#31363D` |

(There is also a cross-cutting "rehab tech" teal `#2A6F77`, applied as an overlay, not a 9th specialty.)

**Type**
- Display / headlines / story titles: **Spectral** (editorial serif)
- UI / body / item titles: **IBM Plex Sans**
- Data / scores / eyebrows / source slugs: **IBM Plex Mono**
- 步频 glyphs: Noto Serif CJK SC (subset ships as `cadence-bupin.ttf`)
- Scale (px): 2xs 11 · xs 12 · sm 13 · base 15 · lg 18 · xl 21 · 2xl 26 · 3xl 33 · 4xl 44 · 5xl 58 · 6xl 76
- Eyebrows/labels: mono, medium, letter-spacing ~0.07em, often uppercased.

**Shape / spacing**
- 4px base grid. Radii are restrained: sm 6 · md 8 · lg 12 (cards gently rounded, never pill-soft).
- Separation comes from **hairline borders** (`#E4DFD1`), not heavy shadows. Editorial, airy.

**The brand mark** is a 6-bar skewed equalizer (`skewX(-22.49)`), see `reference/logo-lockup.svg`
and `reference/mark-favicon.svg`. Tallest bar center. Render it in scrubs blue on paper, or
white/blue on a dark footer block. Keep the skew and the bar proportions.

## Hard technical constraints (the render pipeline)

The card is built with **satori `^0.26` → SVG → `@resvg/resvg-js` `^2.6` → PNG**. You must
produce a script that runs in this pipeline. Constraints that come from satori specifically:

- **Flexbox only.** Every element with more than one child must set `display: 'flex'` and an
  explicit `flexDirection`. There is **no CSS grid, no float**. (The current script's `col`/
  `row`/`txt` helpers are a good pattern — reuse or improve them.)
- **Fonts must be passed as buffers** (satori can't read woff2 — the repo ships TTFs in
  `vendor/fonts-ttf/`). Available faces: IBM Plex Sans 500/600, IBM Plex Mono 400/500,
  Spectral 500 (no 600 — map 600→500, no faux bold), `cadence-bupin.ttf` for 步频.
  **Do not introduce a font weight or face that isn't in that folder** — it will fall back
  and look wrong. If you need a weight that doesn't exist, design around it.
- `backgroundImage: 'linear-gradient(...)'` works, but per the brief, **avoid gradients** —
  use flat paper. `position: 'absolute'` works if you need it. Keep box-shadows subtle or none
  (resvg renders them, but the brand is hairline-led).
- All text must fit. Headlines can be long (see sample) — keep the auto-shrink logic
  (`headSize`) and test with the longest real titles.
- Output is exactly **1080×1350**. Keep `N` (item count, default 5), `OUT`, and `SITE_URL`
  env knobs working as in the current script.

## Data contract

The script reads one edition file `briefs/daily/YYYY-MM-DD.json`. A real one is attached as
`reference/sample-edition.json`. Shape you rely on:

```
{
  "date": "2026-06-22",
  "lead": { "titleEn": "...", "titleZh": "...", "paragraphEn": "...", ... },
  "stats": { "events": 19, "specialties": 5, "sources": 3, "topScore": 90 },
  "sections": [
    { "category": "orthopedic", "label": "骨科与肌骨", "items": [
        { "title": "...", "category": "orthopedic", "curatedScore": 90,
          "journal": "...", "source": "APTA", "tags": [...] }, ... ] },
    ...
  ]
}
```

The card shows `lead.titleEn` as the headline and the top-N items by `curatedScore` across all
sections, each rendering: `curatedScore`, `category` (→ tag + color), `title`, and optionally
`journal`/`source`. **Do not invent fields or data** — only use what exists in the edition.

## What to deliver

1. **First, 2–3 distinct in-brand directions as static mockups** (HTML or inline SVG I can
   eyeball quickly) using the attached `sample-edition.json` data verbatim — no placeholder
   lorem. All must sit on warm paper, use the real type roles, the category colors, and the
   signal tiers. Make them genuinely different *layouts*, not recolors. Suggested starting
   points (pick/blend, don't just copy):
   - **Editorial index** — serif headline, hairline-ruled item list, mono scores in tier color,
     small category tag; feels like a journal contents page.
   - **Lead + stack** — one hero item (the top score) given weight, the rest as a compact
     ranked list; good when there's a clear standout.
   - **Tagged register** — each item a quiet row with a colored category keyline (left border),
     score set in the tier color; most scannable for mixed specialties.
2. **Then implement the chosen one** as a drop-in replacement for `scripts/linkedin-daily-card.js`
   (same CLI, same env, same output path, same fonts folder). Keep the header comment's intent.
3. Run it on `sample-edition.json` and show the rendered PNG. Iterate until it reads as a
   premium, editorial, unmistakably-Cadence card.

## Acceptance criteria (the bar)

- Warm paper background `#FAFAF6`; **no full-bleed blue gradient**; blue used only as accent/mark.
- Each item's specialty is color-coded via the real `--cat-*` palette.
- Score tier is visually distinguished (≥90 / 80–89 / 65–79) using the signal-tier colors.
- Spectral serif carries the headline; mono carries scores/eyebrows; Plex Sans carries titles.
- The "SIGNAL" label is not repeated on every row.
- The 6-bar mark and `Cadence 步频 · incadencept.com` lockup appear, correctly skewed and colored.
- Long real headlines and 5 full-length titles fit at 1080×1350 without clipping.
- It runs in the existing satori+resvg pipeline with only the fonts in `vendor/fonts-ttf/`.

## Attached reference files

- `reference/current-card-BEFORE.png` — the current (off-brand) output. The thing to beat.
- `reference/current-generator.js` — the script to replace (note its satori helper patterns + font loading).
- `reference/sample-edition.json` — real edition data; design against this exact content.
- `reference/brand-colors.css`, `reference/brand-typography.css` — the authoritative tokens.
- `reference/logo-lockup.svg`, `reference/mark-favicon.svg` — the brand mark geometry (skew + bars).
