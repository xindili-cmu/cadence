#!/usr/bin/env node
/**
 * fix-correspondence-rows.js — one-off data repair (2026-08-29 audit).
 *
 * Drops journal correspondence & errata that shipped as if they were studies:
 * letters ("On \"…\"" with a full citation + DOI in the title — one ranked #3
 * in the 08-28 LinkedIn top-3 at 65), "Comment on …", "Correction: …" (×3),
 * "Letter to the editor: …". 7 rows at the 2026-08-29 dry run.
 *
 * Deliberately NOT dropped: bracket-tagged front matter ("[Comment] …") — that
 * tag is SOFT by design (a [Editorial] ABOUT rehab is legitimate content,
 * handled by studyDesign + the non-evidence top-slot guard), and the two
 * off-topic June rows are ingestion-gated going forward by JOURNAL_FRONT_MATTER.
 *
 * The shape gate now lives at ingestion (isCorrespondenceItem in
 * news-refresh.js, imported here — NOT re-implemented, per the drift lesson in
 * fix-title-artifacts.js) and the carry path self-heals the live feed on the
 * next cron. This pass cleans what ingestion can no longer reach: the archive
 * months (All view + search read them forever).
 *
 * briefs/daily/*.json editions are NOT touched — editions are immutable
 * snapshots by design (see daily-brief.js), and the site's edition renderer
 * already demotes by lane/score at render time.
 *
 * No LLM, no network. Idempotent — a second pass finds nothing.
 * Run it LOCALLY, not in the sandbox: news.json / archive/ are cron-owned, so
 * commit the result promptly or the next cron run will conflict.
 *
 *   DRY_RUN=true node scripts/fix-correspondence-rows.js   # report only
 *   node scripts/fix-correspondence-rows.js                # apply
 */

const fs = require('fs');
const path = require('path');
const { isCorrespondenceItem } = require('./news-refresh');

const DRY = process.env.DRY_RUN === 'true';
const ROOT = path.join(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'archive');

function main() {
  const files = [path.join(ROOT, 'news.json')];
  for (const f of fs.readdirSync(ARCHIVE_DIR)) {
    if (/^\d{4}-\d{2}\.json$/.test(f)) files.push(path.join(ARCHIVE_DIR, f));
  }

  let total = 0;
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    const items = doc.items || [];
    const keep = [];
    for (const it of items) {
      if (!isCorrespondenceItem(it)) { keep.push(it); continue; }
      total++;
      console.log(`  ✂️  ${path.basename(f)} [correspondence] ${it.curatedScore} · ${(it.title || '').slice(0, 58)}`);
    }
    if (keep.length === items.length) continue;
    doc.items = keep;
    // 掉行之后 meta.totalItems 就不再等于 items.length（news-refresh 每次 run
    // 会重算，但漂移期间站点侧栏显示旧数 —— 同 fix-nonarticle-rows 的教训）。
    if (doc.meta && typeof doc.meta.totalItems === 'number') doc.meta.totalItems = doc.items.length;
    if (!DRY) fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n');
  }

  console.log(total
    ? `\n${DRY ? '[DRY RUN] would drop' : 'Dropped'} ${total} correspondence row(s).`
    : '\nNothing to drop — already clean (idempotent re-run).');

  // archive/index.json caches per-month counts — rebuild so the archive page
  // doesn't quote stale numbers (same shape news-refresh writes).
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
}

main();
