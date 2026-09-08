#!/usr/bin/env node
/**
 * fix-front-matter-rows.js — one-off data repair (2026-09-08 audit).
 *
 * Drops rows that the ingestion gates now refuse but that already live in
 * history: journal front matter shipped as articles ("Masthead", "Ed Board
 * page", "Table of Contents" — Archives of PM&R RSS, 2026-09-07, scored 40,
 * 3 of the 7 stories in the 09-08 daily edition) and anything under the
 * deterministic score floor (SCORE_FLOOR = 65 — the "只保留 >= 65" rule had
 * only ever lived in the prompt).
 *
 * Both predicates are IMPORTED from news-refresh.js (isJunkItem, isBelowFloor),
 * not re-implemented — the drift lesson from fix-title-artifacts.js. The carry
 * path self-heals news.json on the next cron; this pass cleans what ingestion
 * can no longer reach: the archive months (All view + search read them forever).
 *
 * briefs/daily/*.json editions are NOT touched — editions are immutable
 * snapshots by design (see daily-brief.js).
 *
 * No LLM, no network. Idempotent — a second pass finds nothing.
 * Run it LOCALLY, not in the sandbox: news.json / archive/ are cron-owned, so
 * commit the result promptly or the next cron run will conflict.
 *
 *   DRY_RUN=true node scripts/fix-front-matter-rows.js   # report only
 *   node scripts/fix-front-matter-rows.js                # apply
 */

const fs = require('fs');
const path = require('path');
const { isJunkItem, isBelowFloor, SCORE_FLOOR } = require('./news-refresh');

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
      const why = isJunkItem(it) ? 'junk' : isBelowFloor(it) ? `score ${it.curatedScore} < ${SCORE_FLOOR}` : null;
      if (!why) { keep.push(it); continue; }
      total++;
      console.log(`  ✂️  ${path.basename(f)} [${why}] ${(it.firstSeen || '').slice(0, 10)} · ${(it.title || '').slice(0, 58)}`);
    }
    if (keep.length === items.length) continue;
    doc.items = keep;
    // 掉行之后 meta.totalItems 就不再等于 items.length（news-refresh 每次 run
    // 会重算，但漂移期间站点侧栏显示旧数 —— 同 fix-nonarticle-rows 的教训）。
    if (doc.meta && typeof doc.meta.totalItems === 'number') doc.meta.totalItems = doc.items.length;
    if (!DRY) fs.writeFileSync(f, JSON.stringify(doc, null, 2) + '\n');
  }

  console.log(total
    ? `\n${DRY ? '[DRY RUN] would drop' : 'Dropped'} ${total} row(s).`
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
