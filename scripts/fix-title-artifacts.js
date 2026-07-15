#!/usr/bin/env node
/**
 * fix-title-artifacts.js — one-off data repair (2026-07-15 adversarial review).
 *
 * Two deterministic fixes over news.json + archive/YYYY-MM.json:
 *
 * 1. Strip scraped link-text prefixes from titles ("Read more about X",
 *    "Read more: X") — newsroom listing pages (cms.gov) use anchor text as
 *    the headline. Mirrors the normalizeTitle fix in news-refresh.js so
 *    history matches what the pipeline now produces.
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

const stripPrefix = (title) => {
  if (!title || typeof title !== 'string') return title;
  const m = title.match(/^read more(?: about)?[:\s]+(.{15,})$/i);
  if (!m) return title;
  return m[1].charAt(0).toUpperCase() + m[1].slice(1);
};

let titlesFixed = 0;
const fixTitles = (items, label) => {
  for (const it of items) {
    const t = stripPrefix(it.title);
    if (t !== it.title) {
      console.log(`  title  [${label}] ${String(it.title).slice(0, 60)}…`);
      console.log(`      →  ${t.slice(0, 60)}…`);
      it.title = t;
      titlesFixed++;
    }
  }
};

// ── news.json ────────────────────────────────────────────────────────────────
const newsPath = path.join(ROOT, 'news.json');
const news = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
fixTitles(news.items || [], 'news.json');

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

console.log(`\nTitles fixed: ${titlesFixed}; cross-month duplicates removed: ${dupsRemoved}${DRY ? ' (dry run — nothing written)' : ''}`);
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
