#!/usr/bin/env node
/**
 * fix-title-artifacts.js — one-off data repair (2026-07-15 adversarial review).
 *
 * Deterministic fixes over news.json + archive/YYYY-MM.json:
 *
 * 1. Re-run news-refresh's normalizeTitle over every stored title, so history
 *    matches exactly what the pipeline now produces: scraped link-text
 *    prefixes ("Read more about X"), leading publish dates, SHOUTY CAPS,
 *    wrapping quotes, and publisher tails / prefixes (" | Journal of
 *    NeuroEngineering and Rehabilitation", "Frontiers | …"). Imported, not
 *    re-implemented — the copy that used to live here had already drifted.
 *
 * 1b. Backfill `journal` from the source roster for journal-kind sources.
 *    RSS/Exa rows only carried the roster short name in `source`, so the
 *    IF/JCR badge, hotTopics' 刊数 and the per-journal cap couldn't see them.
 *
 * ORDER: run scripts/fix-source-attribution.js FIRST. It drops junk rows and
 * repairs mislabelled Springer attributions; running this script first would
 * write journal names onto rows whose `source` is still wrong.
 *
 * 2. Remove cross-month archive duplicates: a story that entered June's file
 *    and survived in the feed into July was appended to July's file again
 *    (the append guard only checked the current month — fixed in
 *    news-refresh.js the same day). Keep the EARLIEST month's copy; identity
 *    is sourceUrl (primary), id (secondary) — same keys the frontend uses.
 *
 * Rebuilds archive/index.json afterwards (same shape news-refresh writes).
 * No LLM, no network. Idempotent — safe to re-run.
 *
 *   node scripts/fix-title-artifacts.js          # apply
 *   DRY_RUN=true node scripts/fix-title-artifacts.js
 */

const fs = require('fs');
const path = require('path');

const DRY = process.env.DRY_RUN === 'true';
const ROOT = path.join(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'archive');

// 2026-07-28: this file used to carry a hand-copied re-implementation of
// news-refresh's prefix rules. It drifted — the pipeline gained a ' | 刊名'
// tail stripper that history never got, so 70 archive rows and 8 live rows kept
// "… | Journal of NeuroEngineering and Rehabilitation" in the headline. Import
// the real function instead: one definition, history and new data by the same
// ruler (the same argument fix-source-attribution.js makes for its gates).
const { normalizeTitle, ROSTER_JOURNAL_BY_NAME } = require('./news-refresh');

let titlesFixed = 0;
const fixTitles = (items, label) => {
  for (const it of items) {
    if (!it.title || typeof it.title !== 'string') continue;
    const t = normalizeTitle(it.title, { source: it.source, journal: it.journal });
    if (t !== it.title) {
      console.log(`  title  [${label}] ${String(it.title).slice(0, 60)}…`);
      console.log(`      →  ${t.slice(0, 60)}…`);
      it.title = t;
      titlesFixed++;
    }
  }
};

// journal 回补：RSS/Exa 抓的 roster 刊只写了 source 短名（"J NeuroEng Rehabil"），
// journal 一直是空 —— IF/JCR 徽章、hotTopics 的「N 刊」、以及按刊计数的单刊上限
// 都只看得见 PubMed 那条腿。管线侧已在落库时回补，这里把历史数据对齐。
let journalsFilled = 0;
const fillJournals = (items, label) => {
  for (const it of items) {
    if (it.journal) continue;
    const j = ROSTER_JOURNAL_BY_NAME.get(it.source);
    if (!j) continue;                       // 非期刊源（CMS / APTA / medRxiv…）不给徽章
    console.log(`  journal[${label}] ${it.source} → ${j}`);
    it.journal = j;
    journalsFilled++;
  }
};

// ── news.json ────────────────────────────────────────────────────────────────
const newsPath = path.join(ROOT, 'news.json');
const news = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
fixTitles(news.items || [], 'news.json');
fillJournals(news.items || [], 'news.json');

// ── archive months: titles + cross-month dedupe ─────────────────────────────
const months = fs.readdirSync(ARCHIVE_DIR)
  .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
  .sort(); // ascending — earliest month wins
const seenUrl = new Set();
const seenId = new Set();
let dupsRemoved = 0;
const monthData = {};

for (const f of months) {
  const p = path.join(ARCHIVE_DIR, f);
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const items = data.items || [];
  fixTitles(items, f);
  fillJournals(items, f);
  const kept = [];
  for (const it of items) {
    const url = it.sourceUrl || '';
    const dup = (url && seenUrl.has(url)) || (it.id && seenId.has(it.id));
    if (dup) {
      console.log(`  dedupe [${f}] ${it.id} ${(it.title || '').slice(0, 60)}`);
      dupsRemoved++;
      continue;
    }
    if (url) seenUrl.add(url);
    if (it.id) seenId.add(it.id);
    kept.push(it);
  }
  monthData[f] = { ...data, items: kept, removed: items.length - kept.length };
}

console.log(`\nTitles fixed: ${titlesFixed}; journals filled: ${journalsFilled}; cross-month duplicates removed: ${dupsRemoved}${DRY ? ' (dry run — nothing written)' : ''}`);
if (DRY) process.exit(0);

fs.writeFileSync(newsPath, JSON.stringify(news, null, 2));
for (const f of months) {
  const { removed, ...data } = monthData[f];
  fs.writeFileSync(path.join(ARCHIVE_DIR, f), JSON.stringify(data, null, 2));
}

// ── rebuild archive/index.json (same shape as news-refresh.js writes) ───────
const manifest = months.slice().reverse().map((f) => {
  const items = monthData[f].items;
  const scores = items.map((i) => i.curatedScore || 0);
  const dates = items.map((i) => i.publishedAt).filter(Boolean).sort();
  return {
    month: f.replace('.json', ''),
    file: f,
    count: items.length,
    maxScore: scores.length ? Math.max(...scores) : 0,
    minScore: scores.length ? Math.min(...scores) : 0,
    firstPublished: dates[0] || null,
    lastPublished: dates[dates.length - 1] || null
  };
});
fs.writeFileSync(path.join(ARCHIVE_DIR, 'index.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalItems: manifest.reduce((s, m) => s + m.count, 0),
  months: manifest
}, null, 2));
console.log('archive/index.json rebuilt.');
