#!/usr/bin/env node
/**
 * fix-nonarticle-rows.js — one-off data repair (2026-08-15 practice-vertical audit).
 *
 * Clears the rows that the two gates shipped the same day would now reject at
 * ingestion. The gates only bind NEW items, so without this pass the existing
 * pollution keeps ranking: the CMS row is tagged `policy`, and CARRY_DAYS.policy
 * is 90 days — it would hold the lead slot into November.
 *
 * What it drops, and why each one is not an article:
 *
 * 1. Non-article URLs (isJunkUrl, imported — not re-implemented, per the drift
 *    lesson in fix-title-artifacts.js). Covers the webinar signup and the
 *    call-for-papers page found at 75 / 70.
 *
 * 2. An explicit URL denylist of evergreen hub/nav pages found in the audit.
 *    Enumerated, not inferred — see the REJECTED HEURISTIC note below.
 *
 * Clock-stamped rows are REPORTED, NOT DROPPED. The first draft of this script
 * dropped any row sharing a publishedAt to the millisecond with another row, on
 * the theory that only the old `|| new Date().toISOString()` fallback produces
 * that. The dry run said 44 rows — including the CY2027 Medicare Physician Fee
 * Schedule Proposed Rule (85), the FY2027 IRF PPS final rule (90), and the
 * nationwide joint-replacement expansion (90). Those are the most valuable
 * policy rows in the corpus, and CMS really does publish a batch of fact sheets
 * at one timestamp.
 *
 * The lesson is worth keeping: clock-stamped ≠ not an article. Clock-stamping
 * is a DATE defect and repairable (fix-scrape-dates.js, which needs network to
 * read page meta); being a nav page is a CONTENT defect and only dropping fixes
 * it. Offline, no date signal separates "clock-stamped real article" from
 * "clock-stamped nav page" — the difference is whether an event occurred, which
 * is semantic. So history gets an enumerated list, and the heuristic that stops
 * the NEXT one runs at ingestion instead (verifyExaDates in news-refresh.js).
 *
 * Scope note: dropping is right for what remains. These are not articles that
 * went stale, they are pages that were never articles — there is no correct
 * date to repair them to.
 *
 * No LLM, no network. Idempotent — safe to re-run (a second pass finds nothing).
 * Run it LOCALLY, not in the sandbox: news.json / archive/ are cron-owned, so
 * commit the result promptly or the next cron run will conflict.
 *
 *   DRY_RUN=true node scripts/fix-nonarticle-rows.js   # report only
 *   node scripts/fix-nonarticle-rows.js                # apply
 */

const fs = require('fs');
const path = require('path');
const { isJunkUrl } = require('./news-refresh');

const DRY = process.env.DRY_RUN === 'true';
const ROOT = path.join(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'archive');

// Known evergreen hub/nav pages that shipped as stories. Exact canonical paths,
// so a future real article under the same section is unaffected — note AHPRA's
// genuine news lives under /News/2026-07-22-… and is untouched by this list.
const EVERGREEN_URLS = new Set([
  // Led the feed at 85 on 2026-08-14 — the page this whole audit started from.
  'https://www.cms.gov/medicare/payment/fee-schedules',
  // CMS innovation-model pages: nav chrome, the shape already flagged in
  // news-refresh's junk-gate comment (2026-07-26) but never gated on.
  'https://www.cms.gov/priorities/innovation/asm-ambulatory-specialty-model-frequently-asked-questions',
  'https://www.cms.gov/priorities/innovation/innovation-models/access',
  // AHPRA regulator nav, all 70-75, all stamped 2026-06-21T10:08:03.657Z.
  'https://www.ahpra.gov.au/Notifications',
  'https://www.ahpra.gov.au/Notifications/Concerned-about-a-health-practitioner',
  'https://www.ahpra.gov.au/Notifications/Has-a-concern-been-raised-about-you',
  'https://www.ahpra.gov.au/Notifications/How-we-manage-concerns/Assessment',
  'https://www.ahpra.gov.au/Notifications/Further-information',
  'https://www.ahpra.gov.au/Registration/Registration-Standards',
  'https://www.ahpra.gov.au/Registration/Applying-for-registration',
  'https://www.ahpra.gov.au/Registration/Registers-of-Practitioners',
  'https://www.ahpra.gov.au/Registration/Monitoring-and-compliance',
  'https://www.ahpra.gov.au/About-Ahpra/What-We-Do/Data-access-and-research',
]);

const norm = (u) => String(u || '').replace(/[?#].*$/, '').replace(/\/$/, '');

// Advisory only — see the header. Ms-precision publishedAt shared by ≥2 rows.
function clockStamped(allRows) {
  const byStamp = {};
  for (const r of allRows) {
    const p = r.publishedAt || '';
    if (!/\.\d{3}Z$/.test(p) || p.endsWith('.000Z')) continue;
    (byStamp[p] = byStamp[p] || []).push(r);
  }
  return Object.entries(byStamp).filter(([, v]) => v.length > 1);
}

function reasonToDrop(row) {
  if (EVERGREEN_URLS.has(norm(row.sourceUrl))) return 'evergreen hub page';
  if (isJunkUrl(row.sourceUrl || '')) return 'non-article URL';
  return null;
}

function main() {
  const files = [path.join(ROOT, 'news.json')];
  for (const f of fs.readdirSync(ARCHIVE_DIR)) {
    if (/^\d{4}-\d{2}\.json$/.test(f)) files.push(path.join(ARCHIVE_DIR, f));
  }

  const loaded = files.map((f) => ({ f, doc: JSON.parse(fs.readFileSync(f, 'utf8')) }));

  let total = 0;
  for (const { f, doc } of loaded) {
    const items = doc.items || [];
    const keep = [];
    for (const it of items) {
      const why = reasonToDrop(it);
      if (!why) { keep.push(it); continue; }
      total++;
      console.log(`  ✂️  ${path.basename(f)} [${why}] ${it.curatedScore} · ${(it.title || '').slice(0, 58)}`);
    }
    if (keep.length === items.length) continue;
    doc.items = keep;
    if (!DRY) fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n');
  }

  console.log(total
    ? `\n${DRY ? '[DRY RUN] would drop' : 'Dropped'} ${total} non-article row(s).`
    : '\nNothing to drop — already clean (idempotent re-run).');

  // archive/index.json caches per-month count / score range / date span, so
  // dropping rows without rebuilding it leaves the archive page quoting counts
  // that no longer match the files (2026-06 would still claim 312). Same shape
  // news-refresh writes, rebuilt from disk — cheap and self-healing.
  if (total && !DRY) {
    const months = fs.readdirSync(ARCHIVE_DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort().reverse();
    const manifest = months.map((f) => {
      const items = JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf8')).items || [];
      const scores = items.map((i) => i.curatedScore || 0);
      const dates = items.map((i) => i.publishedAt).filter(Boolean).sort();
      return {
        month: f.replace('.json', ''), file: f, count: items.length,
        maxScore: scores.length ? Math.max(...scores) : 0,
        minScore: scores.length ? Math.min(...scores) : 0,
        firstPublished: dates[0] || null,
        lastPublished: dates[dates.length - 1] || null,
      };
    });
    fs.writeFileSync(path.join(ARCHIVE_DIR, 'index.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalItems: manifest.reduce((s, m) => s + m.count, 0),
      months: manifest,
    }, null, 2));
    console.log(`Rebuilt archive/index.json (${manifest.reduce((s, m) => s + m.count, 0)} items).`);
    console.log('Commit before the next cron run, or the rebuild will conflict.');
  }

  // Advisory: date defect, not a content defect. Left in place deliberately.
  const stamps = clockStamped(loaded.flatMap(({ doc }) => doc.items || []));
  const n = stamps.reduce((a, [, v]) => a + v.length, 0);
  if (n) {
    console.log(`\nℹ️  ${n} row(s) in ${stamps.length} cluster(s) still carry a clock-stamped publishedAt.`);
    console.log('   NOT dropped — these are real articles with a wrong date (the old Exa clock');
    console.log('   fallback). Repair dates with fix-scrape-dates.js; do not delete them.');
  }
}

main();
