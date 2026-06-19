---
name: fulcrum-design
description: Use this skill to generate well-branded interfaces and assets for Fulcrum, a bilingual (中文 + English) daily physical-therapy news brand, either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, logo assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

Fulcrum is an independent, free, bilingual clinical-PT news digest — "PT signal, not noise." Editorial, warm, evidence-graded. Oxblood + deep teal on warm paper; Spectral display serif, IBM Plex Sans UI, IBM Plex Mono for data, Noto Serif/Sans SC for Chinese. Single named editor (Cindy Lips); AI is described as a tool ("AI-curated · human-edited"), never a personality. Never patient-facing.

If creating visual artifacts (slides, mocks, throwaway prototypes, social cards), copy assets out and create static HTML files for the user to view, linking `styles.css` for tokens. If working on production code, copy assets and read the rules here to become an expert in designing with this brand.

Key files:
- `styles.css` — single entry point; `@import`s all tokens + fonts.
- `tokens/` — colors, typography, spacing, fonts, base utilities.
- `assets/logo/` — wordmark, mark, favicon (SVG).
- `components/core/` + `components/editorial/` — Button, Tag, EvidenceBadge, NewsCard, Byline (`.jsx` + `.d.ts` + `.prompt.md`).
- `ui_kits/fulcrum-news/` — homepage news feed (desktop + mobile).
- `social/` — 公众号 + 小红书 templates.
- `guidelines/cards/` — foundation specimens.

Honor the brand's exclusions: no medical hospital blue, no eco green, no startup orange/red, no gradients, no hero images, no stock photos, no anatomical illustration, no exercise/stretch-band cliché, no emoji, no team-facade copy, no paywall treatment.

If the user invokes this skill without other guidance, ask what they want to build, ask a few focused questions, then act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
