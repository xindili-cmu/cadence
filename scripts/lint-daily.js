#!/usr/bin/env node
/**
 * lint-daily.js — pre-publish validator for ONE daily edition.
 *
 * Validates the current edition (newest by default, or a YYYY-MM-DD arg).
 * Forward-only by design: it never re-lints archives, because editions are
 * immutable and older ones predate fields like limitation / studyDesign.
 *
 * Reports only — it never edits or "fixes" anything. Missing content (e.g. a
 * blank curatedReasonEn) must be regenerated/backfilled, not synthesized here.
 * Exit code is 1 if any check FAILS, so it can gate a publish step. Warnings
 * are printed but do not change the exit code.
 *
 * Checks:
 *   1. topScore === max(curatedScore) over section items
 *   2. field completeness:
 *        - always required (non-empty): title, titleZh, summary, summaryZh,
 *          curatedReason, curatedReasonEn   ← catches the 06-16 missing En
 *        - pairing invariant: limitation and limitationEn are both non-empty or
 *          both blank/absent (no half-translated limitation). limitation is
 *          intentionally blank for news/guideline/policy/述评 per news-refresh.js
 *          (:559), so it is NOT required — only paired.
 *        - warn (not fail): a research item (studyDesign set, not 述评) with a
 *          blank limitation — the generator says these should usually have one.
 *   3. stats match content: events, specialties, sources
 *   4. every curatedScore is a number in [0, 100]
 *   5. lead paragraphs' study-type words are supported by some item's
 *      studyDesign (inclusion check; items without studyDesign are skipped).
 *      This is a regression NET, not a precise label checker — the real guard
 *      against mislabels is feeding studyDesign into the lead prompt.
 *
 * Usage:
 *   node scripts/lint-daily.js               — lint newest edition
 *   node scripts/lint-daily.js 2026-06-16    — lint a specific edition
 */
const fs   = require('fs');
const path = require('path');

const DAILY_DIR = path.join(__dirname, '..', 'briefs', 'daily');
const isEdition = f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f);

const fails = [];
const warns = [];
const fail  = m => fails.push(m);
const warn  = m => warns.push(m);
const present = v => v != null && v !== '';

// Study-type label -> keywords acceptable in the lead for that design.
// Bare English "review" is deliberately omitted (it matches "systematic
// review"); the Chinese 综述 uses a negative lookbehind so it doesn't fire on
// "系统综述".
const TYPE_KEYWORDS = {
  'RCT':      [/\bRCT\b/i, /randomi[sz]ed/i, /随机/],
  '系统综述': [/systematic\s+review/i, /meta[\s-]?analysis/i, /系统综述/, /系统评价/, /荟萃/],
  '综述':     [/narrative\s+review/i, /scoping\s+review/i, /literature\s+review/i, /integrative\s+review/i, /(?<![系])综述/],
  '述评':     [/\beditorial\b/i, /\bcommentary\b/i, /\bperspective\b/i, /\bviewpoint\b/i, /述评/],
  '观察研究': [/\bcohort\b/i, /cross[\s-]?sectional/i, /case[\s-]?control/i, /retrospective/i, /prospective/i, /队列/, /观察研究/, /回顾性/, /前瞻性/],
};

function resolveDate(arg) {
  if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;
  const files = fs.readdirSync(DAILY_DIR).filter(isEdition).sort();
  if (!files.length) { console.error('No editions found in', DAILY_DIR); process.exit(2); }
  return files[files.length - 1].replace('.json', '');
}

function main() {
  const date = resolveDate(process.argv[2]);
  const fp   = path.join(DAILY_DIR, `${date}.json`);
  if (!fs.existsSync(fp)) { console.error(`Edition not found: ${fp}`); process.exit(2); }
  const ed = JSON.parse(fs.readFileSync(fp, 'utf8'));

  const sections = ed.sections || [];
  const items    = sections.flatMap(s => s.items || []);
  const flashes  = ed.flashes || [];
  const stats    = ed.stats || {};

  // 1. topScore
  const wantTop = items.length ? Math.max(...items.map(i => i.curatedScore)) : null;
  if (stats.topScore !== wantTop)
    fail(`topScore=${stats.topScore} but max(curatedScore)=${wantTop}`);

  // 2. field completeness
  const ALWAYS = ['title', 'titleZh', 'summary', 'summaryZh', 'curatedReason', 'curatedReasonEn'];
  items.forEach((it, n) => {
    const id = it.id || `#${n}`;
    for (const k of ALWAYS) if (!present(it[k])) fail(`item[${id}] missing ${k}`);

    // limitation pairing invariant
    const hasL = present(it.limitation), hasLEn = present(it.limitationEn);
    if (hasL !== hasLEn)
      fail(`item[${id}] limitation/limitationEn half-filled (limitation=${hasL}, limitationEn=${hasLEn})`);

    // soft: research item should usually carry a limitation
    const isResearch = (it.tags || [])[0] === 'research' && present(it.studyDesign) && it.studyDesign !== '述评';
    if (isResearch && !hasL)
      warn(`item[${id}] research (${it.studyDesign}) has blank limitation`);
  });

  // 3. stats vs content (mirror daily-brief.js definitions)
  if (stats.events !== items.length + flashes.length)
    fail(`stats.events=${stats.events} but section+flash items=${items.length + flashes.length}`);
  if (stats.specialties !== sections.length)
    fail(`stats.specialties=${stats.specialties} but sections=${sections.length}`);
  const srcSet = new Set([...items, ...flashes].map(x => x.source).filter(Boolean));
  if (stats.sources !== srcSet.size)
    fail(`stats.sources=${stats.sources} but unique sources=${srcSet.size}`);

  // 4. score range
  items.forEach((it, n) => {
    const s = it.curatedScore;
    if (typeof s !== 'number' || s < 0 || s > 100)
      fail(`item[${it.id || `#${n}`}] curatedScore out of range: ${s}`);
  });

  // 5. lead study-type inclusion (paragraphs only; titles legitimately quote
  // article study types). Skip items without studyDesign.
  const leadText = [ed.lead && ed.lead.paragraphZh, ed.lead && ed.lead.paragraphEn]
    .filter(Boolean).join('\n');
  const presentDesigns = new Set(items.map(i => i.studyDesign).filter(Boolean));
  if (leadText && presentDesigns.size) {
    for (const [design, res] of Object.entries(TYPE_KEYWORDS)) {
      const mentioned = res.some(re => re.test(leadText));
      if (mentioned && !presentDesigns.has(design))
        fail(`lead mentions "${design}" but no item has that studyDesign (present: ${[...presentDesigns].join(', ')})`);
    }
  }

  // Report
  warns.forEach(w => console.warn(`  ⚠ ${w}`));
  if (fails.length) {
    console.error(`✗ lint-daily ${date}: ${fails.length} error(s), ${warns.length} warning(s)`);
    fails.forEach(f => console.error(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log(`✓ lint-daily ${date}: ${items.length} items, ${sections.length} sections, ${warns.length} warning(s) — all checks pass`);
}

main();
