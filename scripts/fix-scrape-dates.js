#!/usr/bin/env node
/**
 * fix-scrape-dates.js — one-off data repair (2026-08-11 APTA backlog dump).
 *
 * The scrape leg used to stamp publishedDate = discovery time. On 2026-08-10
 * the APTA listing exposed 36 never-ledgered links; 13 passed curation carrying
 * a fabricated "today" — the oldest was a 2025-11 article shown as the day's
 * lead. news-refresh.js now derives the date from the article itself; this
 * script holds history to the same ruler.
 *
 * For every item whose `source` is a scrape-leg roster source (sources.json
 * entry with a `scrape` array — associations/regulators, never journals):
 *   1. Parse the real date from the sourceUrl path (dateFromUrlPath, imported
 *      from news-refresh — one definition, history and new data by the same
 *      ruler). Differs from stored publishedAt by >24h → rewrite.
 *   2. Still unresolved AND publishedAt is on the same day as firstSeen (the
 *      fabrication tell): fetch the article page and read its published meta
 *      (dateFromArticlePage). Needs network; failures are per-item and
 *      non-fatal, the item is just reported as unresolved — rerun on a
 *      machine with network to finish. Idempotent either way.
 *
 * Scores are NOT touched (pinned by design — see the 85↔90 churn note in
 * news-refresh). firstSeen is NOT touched (it's true: we DID first see them
 * on 8-10). Only the lie — publishedAt — is corrected.
 *
 * Fixes news.json + every archive/YYYY-MM.json, then rebuilds
 * archive/index.json (its first/lastPublished derive from publishedAt).
 *
 *   node scripts/fix-scrape-dates.js          # apply
 *   DRY_RUN=true node scripts/fix-scrape-dates.js
 */

const fs = require('fs');
const path = require('path');

const DRY = process.env.DRY_RUN === 'true';
const ROOT = path.join(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'archive');

const { dateFromUrlPath, dateFromArticlePage } = require('./news-refresh');

// Scrape-leg sources only. Journal/RSS/PubMed rows always had real dates;
// an RSS item legitimately shares publishedAt≈firstSeen, so scoping by source
// (not by the date pattern alone) keeps them out of reach.
const srcCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));
const srcArr = Array.isArray(srcCfg) ? srcCfg : srcCfg.sources || [];
const SCRAPE_SOURCES = new Set(srcArr.filter((s) => (s.scrape || []).length).map((s) => s.name));
console.log(`scrape-leg sources: ${[...SCRAPE_SOURCES].join(', ') || '(none)'}`);

const DAY = 86400000;
const sameDay = (a, b) => (a || '').slice(0, 10) === (b || '').slice(0, 10);

let fixed = 0;
const unresolved = []; // needs network or has no discoverable date

async function repair(items, label) {
  for (const it of items) {
    if (!SCRAPE_SOURCES.has(it.source)) continue;
    if (!it.sourceUrl || !it.publishedAt) continue;

    const apply = (iso, how) => {
      console.log(`  date  [${label}] ${(it.titleZh || it.title || '').slice(0, 40)}`);
      console.log(`     ${it.publishedAt.slice(0, 10)} → ${iso.slice(0, 10)} (${how})`);
      it.publishedAt = iso;
      fixed++;
    };

    // 1. URL path — free, offline, covers apta.org's /YYYY/MM/DD/ pattern.
    const fromUrl = dateFromUrlPath(it.sourceUrl);
    if (fromUrl) {
      if (Math.abs(new Date(fromUrl) - new Date(it.publishedAt)) > DAY) apply(fromUrl, 'url');
      continue; // URL date is authoritative; nothing more to do either way
    }

    // 2. Fabrication tell (publishedAt ≈ firstSeen) + no URL date → page meta.
    if (!sameDay(it.publishedAt, it.firstSeen)) continue; // date looks organic; leave it
    let fromPage = null;
    try { fromPage = await dateFromArticlePage(it.sourceUrl); } catch { /* offline */ }
    if (fromPage && Math.abs(new Date(fromPage) - new Date(it.publishedAt)) > DAY) {
      apply(fromPage, 'page meta');
    } else if (!fromPage) {
      unresolved.push(`[${label}] ${it.source} ${it.sourceUrl}`);
    }
  }
}

(async () => {
  const newsPath = path.join(ROOT, 'news.json');
  const news = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  await repair(news.items || [], 'news.json');

  const months = fs.readdirSync(ARCHIVE_DIR)
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .sort();
  const monthData = {};
  for (const f of months) {
    const p = path.join(ARCHIVE_DIR, f);
    monthData[f] = JSON.parse(fs.readFileSync(p, 'utf8'));
    await repair(monthData[f].items || [], f);
  }

  console.log(`\nDates fixed: ${fixed}; unresolved (need network / no date found): ${unresolved.length}${DRY ? ' (dry run — nothing written)' : ''}`);
  for (const u of unresolved) console.log(`  unresolved ${u}`);
  if (DRY) return;

  fs.writeFileSync(newsPath, JSON.stringify(news, null, 2));
  for (const f of months) fs.writeFileSync(path.join(ARCHIVE_DIR, f), JSON.stringify(monthData[f], null, 2));

  // Rebuild archive/index.json — same shape news-refresh and
  // fix-title-artifacts write; first/lastPublished just changed.
  const manifest = months.slice().reverse().map((f) => {
    const items = monthData[f].items || [];
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
})();
