// lane.js — single source of truth (script side) for the evidence/intel lane split.
//
// tags[0] is the pipeline's content-type tag (research / news / guideline /
// policy). news/policy → 'intel': industry, payment and regulator updates.
// Intel items keep a curatedScore for INTERNAL triage only (keep/drop, feed
// budget) — the site renders them in an unscored "Industry & policy" strip and
// every selection layer (daily lead, LinkedIn top-N, weekly picks) draws its
// scored slots from the evidence lane exclusively.
//
// Born 2026-08-29 (first-principles audit): the rubric's 90+ tier included
// "重大监管/报销变化", so an AHPRA enforcement story and two CMS payment items
// scored 90 and outranked every RCT on the Curated first screen — while the
// About page promises "SIGNAL measures evidential strength, not news heat".
//
// Mirrors window.cdLaneOf in design-system/app/app.data.jsx — keep in sync.
// Derive, don't store: lane is computed from tags[0] everywhere, so there is
// no second field that can drift when tags are backfilled.

const INTEL_TYPES = new Set(['news', 'policy']);

const laneOf = (item) => (INTEL_TYPES.has(((item && item.tags) || [])[0]) ? 'intel' : 'evidence');
const isIntel = (item) => laneOf(item) === 'intel';
const isEvidence = (item) => laneOf(item) === 'evidence';

// Hard ceiling for intel triage scores, enforced deterministically in
// news-refresh AFTER curation — keeps future intel out of the 80+ tiers even
// if the prompt regresses. 79 = top of "worth knowing", one under the 80 tier.
// Historical items (pinned scores) are exempt: display no longer reads them.
const INTEL_SCORE_CAP = 79;

module.exports = { laneOf, isIntel, isEvidence, INTEL_SCORE_CAP, INTEL_TYPES };
