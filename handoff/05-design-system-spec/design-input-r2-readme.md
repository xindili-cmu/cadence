# Cadence — Design System

> **Cadence** — curated physical-therapy / rehab news for clinicians (practicing + academic), across the US, China & Australia. AI-curated, human-edited, bilingual, free, not patient-facing. *PT · Rehab · Evidence.*

This project is the Cadence design system: brand, tokens, components, the news-feed UI kit, social templates, and specimen cards. It is **aligned to the live codebase** (see Sources) so it can serve as the source of truth a developer syncs from.

---

## 1. What Cadence is

A public PT news brand — an AI-curated digest of clinical rehab news, research highlights, regulatory updates and practice trends, modeled on the AIHOT daily-digest pattern adapted to physical therapy. Single-creator brand (Cindy Lips, named editor; the AI is a tool, "AI-curated · human-edited"). Public, free, anonymous. Bilingual: English for titles, source names, category labels and research attribution; **Chinese for the "why it matters" (推荐理由) note** that tells a clinician what to *do* with a finding.

**Audience:** clinicians only (never patient-facing), two equal camps — practicing PTs/PTAs/clinic owners wanting a 30-second "what changed for Monday," and academic/research clinicians + DPT students wanting evidence with context. **Markets:** US + China + Australia.

**Surfaces:** website (the design starting point), agent Skill, RSS feeds.

### Brand decisions of record
- **Name: `Cadence`** (chosen from round-1 candidates Fulcrum / Kinetics / Cadence). Gait *cadence* is a real clinical metric (steps per minute) × the daily-publishing rhythm — dual-meaning, warm, bilingual-safe.
- **Primary color: Scrubs Blue `#3D74B8`** — the team's round-1 pick, "the clinical uniform blue." ⚠️ **Open flag:** the original brief excluded "medical hospital blue"; `#3D74B8` sits in that family. It's kept here because it's what shipped, but see §6 — an oxblood alternative is one swap away if you want to honor the original exclusion.
- **Accent / links:** kept in the blue family; **terracotta `#B4552D`** reserved for caution/regulatory signal.
- **Logo (round 2, final):** the **4-bar gait-cadence mark** — four rounded bars in a rise·peak·settle rhythm (steps-per-minute), in a blue rounded tile; wordmark "Ca**dence**" with the second half in blue. Motion/rhythm with no literal exercise or anatomy. Holds 24px→800px.

### Sources (informed this work — reader not assumed to have access)
- **Live site:** `https://cadence.cindylips2001.workers.dev/`
- **Codebase (source of truth):** `https://github.com/xindili-cmu/cadence` — Cloudflare Worker, no build step, React + Babel-standalone + CSS variables. `index.html` loads `design-system/` (these files) + `news.json` (cron-written by `scripts/news-refresh.js`). Forked from the GreenStack/AIHOT cloud-deploy pattern; this design pass replaced the placeholder green tokens and placeholder logo.
- **Reference look-and-feel:** AIHOT (form factor), JOSPT (clinical restraint), Heatmap News (technical-reader news design), The Athletic (declarative headlines + opinion), Bloomberg Green (institutional credibility, sparingly).

---

## 2. Content fundamentals — how Cadence writes

**Voice:** a senior clinician-editor who respects your time. Authoritative, evidence-graded, readable. Signal, not noise.

**Bilingual split (load-bearing):**
- **English** carries facts: story titles, journal/source names, specialty labels, dates, regions. (Many titles are themselves Chinese when the source is Chinese — the system renders mixed runs cleanly.)
- **中文** carries judgment: the `curatedReason` / "Why it matters" note is written in Chinese and tells the clinician how to apply the finding ("可直接用于康复计划制定", "了解上游评估流程能帮助你更好协作").

**Titles** are declarative and specific — the finding, not the topic. Sentence case. **SignalScore (0–100)** grades editorial importance (≥85 strong, ≥65 mid). The "Why it matters" note is the signature device, shown in a soft blue panel labeled in mono.

**Casing & texture:** sentence case for titles; UPPERCASE mono with wide tracking for eyebrows, labels, and the "PT · REHAB · EVIDENCE" tagline. Mono (`IBM Plex Mono`) for anything numeric, dated, scored, or citational. **No emoji.** Lucide line icons only.

**Single-creator:** named editor, no team copy, no "our editorial team."

---

## 3. Visual foundations

**Vibe:** a calm, cool-paper clinical broadsheet. Editorial restraint (JOSPT) with opinionated "why it matters" (The Athletic). Separation comes mostly from **hairline borders**; shadow appears on hover/raise only.

**Color**
- **Primary — Scrubs Blue** `--blue-600 #3D74B8` (hover 700 `#2C5A96`, press 800, soft 100/50). Drives primary buttons, links, active nav, SignalScore, selected card rail.
- **Neutrals are blue-cooled charcoal → cool paper:** ink `#16202B`→`#64717F`, page `--paper #F7F9FB`, card white, hairlines `--ink-200/300`. (Cooler than a warm editorial — matches the blue primary.)
- **8 specialty accents** (muted, deep — slate, violet, sienna, ochre, pine, garnet, moss, graphite), each a **solid / soft / ink** trio (`--cat-<name>`, `-soft`, `-ink`). They color category tags, the selected-card dot, source monograms, and the category-pulse meter — never large fills.
- **Signals:** improvement `#1E8E5E`, caution/terracotta `#B4552D`, warn `#C8861E`.

**Type** (Google Fonts / open-source)
- **Display — Spectral** (serif): story titles, section heads, the big "3" hooks. Semibold 600, tracking −0.015em.
- **UI/body — IBM Plex Sans** (+ Noto Sans SC): feed text, controls, labels, summaries, the wordmark.
- **Data — IBM Plex Mono:** SignalScore, timestamps, dates, source slugs, eyebrows. `tabular-nums`.
- **Chinese — Noto Serif SC / Noto Sans SC:** bilingual companions stacked in each family.
- Scale runs feed-tight: `--text-2xs 11` → `--text-6xl 76`; semantic roles `--type-display/headline/title/body/label/eyebrow/meta`.

**Spacing & layout:** 4px grid (`--space-*`). App frame: `--content-max 1180`, `--feed-column 720`, `--rail-left 232`, `--rail-right 300`, `--header-height 60`. Sticky header + sticky category tabs over the feed.

**Radii:** restrained — `xs 3 · sm 6 · md 8 · lg 12`; pill reserved for dots, avatars, and the category tabs. Cards are `lg (12)`.

**Elevation:** soft, low, blue-cooled shadows (`rgba(13,32,27,…)`). `--shadow-xs` at rest, `--shadow-card-hover` on hover (lift 1px + blue-tinted border). No heavy dashboard drop shadows.

**Motion:** quick, no bounce. 120–260ms; `--ease-standard` for color, `--ease-out` for transform. Hover lifts a card 1px and underlines its title in blue; press has no flash.

**Cards:** white, 1px hairline, 12px radius, xs shadow. Hover → blue-300 border + card-hover shadow + title underline. Selected → `surface-active` tint + 3px blue left rail. The "Why it matters" note is an inset blue-50 panel with a `sparkles` icon and a mono label.

**Backgrounds:** flat cool paper. No hero images, gradients, or photography. The only full-bleed color is the 小红书 social cover (scrubs-blue) with an 8% logo watermark.

**Transparency/blur:** the sticky header is `paper @86%` with a saturate+blur backdrop. Everything else opaque.

---

## 4. Iconography

Cadence uses **Lucide** (line icons, ~1.75–2px stroke, `currentColor`) as its one icon system — loaded globally from the Lucide CDN (`window.lucide`) and rendered through the `Icon` component (`<Icon name="heart-pulse" size={18} />`).

- **Specialty icons** (from `categories.js`): orthopedic `bone` · neurological `brain` · sports `activity` · pediatric `baby` · geriatric `person-standing` · cardiopulmonary `heart-pulse` · manual-modality `hand` · practice `briefcase`.
- **App chrome:** `search`, `bell`, `sun` (the 8AM brief), `sparkles` (curated / why-it-matters), `list`, `newspaper`, `rss`, `arrow-up-right`, `arrow-down-wide-narrow`, `search-x`.
- **Brand mark** is the only bespoke SVG (`assets/logo-*.svg`): the 4-bar cadence mark. Mono variant uses `currentColor`.
- **No emoji.** Region tags (US/CN/AU) are mono text, not flags. Source monograms are the outlet's first letter in a tinted square.

Keep the Lucide CDN script on any host page that renders components.

---

## 5. Index — what's in this system

**Global entry:** `styles.css` → `@import`s `fonts.css` + `tokens/{colors,typography,spacing,effects}.css`.
- `fonts.css` (root) — Google Fonts: Spectral, IBM Plex Sans/Mono, Noto Serif/Sans SC.
- `tokens/colors.css` — scrubs-blue scale (+ `--green-*` back-compat aliases used by feed components), blue-cooled ink/paper, 8 specialty trios, signals, semantic aliases.
- `tokens/typography.css`, `spacing.css`, `effects.css`.

**Assets:** `assets/logo-mark.svg`, `logo-mark-mono.svg`, `logo-lockup.svg`, `wordmark.svg`.

**Components** (`window.FulcrumDesignSystem_5f55f7.*` — internal namespace id):
- `components/core/` — **Button**, **Input**, **Icon** (Lucide wrapper).
- `components/brand/` — **Logo** (mark / wordmark / lockup; final round-2 mark).
- `components/feed/` — **NewsCard** (the signature story card: SignalScore + CategoryTag + Chinese why-it-matters; variants default/compact/lead/selected), **CategoryTag** (soft/solid/outline/dot), **CategoryTabs**, **SignalScore** (chip/bar), plus `categories.js` (8-slug authority).
- Each has a `.d.ts`; key ones have `.prompt.md`; each dir has a `@dsCard` specimen.

**App bundle:** `app/components.bundle.jsx` (hand-bundled globals for the no-build site) + `app.data.jsx` (loads `news.json` → `CD_STORIES`, defines `CD_NAV`/`CD_SOURCES`) + `app.shell.jsx` (AppHeader, NavRail, DigestRail) + `app.main.jsx` (FeedApp). `news.json` is sample feed data. *(The DS compiler concatenates every `.jsx`/`.js` into `_ds_bundle.js`, including these; their data-load + `createRoot` side effects are therefore gated behind `if (window.__CADENCE_APP__)` so they only run on the real app page — the UI kit sets that flag before loading them. Specimen cards never set it, so the app never hijacks their `#root`.)*

**UI kit:** `ui_kits/cadence-app/index.html` — the full shipped product (header · nav rail · curated feed with lead story · digest rail · sources wall), running on a date-refreshed copy of `news.json`.

**Social templates:** `social/wechat-hero.html` (公众号 900×500), `social/xiaohongshu-cover.html` (小红书 1080×1440).

**Specimen cards:** `guidelines/cards/*.html` — Colors, Type, Spacing.

**Skill:** `SKILL.md` (downloadable Agent Skill).

---

## 6. Open decisions for Cindy

1. **Color — the one real fork.** Scrubs-blue `#3D74B8` is shipped and kept here, but it's in the "hospital blue" family your brief excluded. If you want to honor that exclusion, I can swap the `--blue-*` ramp for the round-1 **oxblood** (warm, editorial, more "independent creator") in one token file — every component re-tints automatically. **Tell me: keep scrubs-blue, or switch to oxblood?**
2. **Logo mark** — is the 4-bar cadence rhythm the final mark, or do you want me to explore 1–2 alternates (e.g. a metronome pivot, or a purely typographic mark)?
3. **Tagline** — currently "PT · Rehab · Evidence." Alternatives: "PT signal, not noise" / "Where rehab reads first."
4. **Fonts** — loaded via Google Fonts `@import`; swap to self-hosted `.woff2` for production/offline.
5. **Sync direction** — these files mirror `design-system/` in the repo. When you're happy, copy `tokens/`, `fonts.css`, `styles.css`, `assets/`, `components/`, and the updated app runtime (new logo) back into the repo. The `window.__CADENCE_APP__` guard in `app.data/app.main` is harmless in production (the live `index.html` can set it, or you can drop the guard there since the repo doesn't compile a DS bundle).
