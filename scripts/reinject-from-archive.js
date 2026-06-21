#!/usr/bin/env node
/**
 * One-time reinjection: pull recent guideline / policy / news items back from
 * archive into the live feed (news.json).
 *
 * Why: the Research/News/Guidelines/Policy front tabs read the live feed only.
 * Static guideline/policy/news items aged out into archive under the old 7-day
 * window, leaving those tabs empty. After the differentiated carry window
 * (news-refresh.js) and the expanded roster, those items are once again valid —
 * this script seeds them back so the tabs populate immediately instead of
 * waiting for the next scrape to re-find them.
 *
 * Gates (must pass ALL — same as a normal refresh):
 *   - tags[0] ∈ {news, guideline, policy}
 *   - firstSeen within the carry window (news 30d, guideline/policy 90d)
 *   - source still in the roster (matchSource) — else it'd be purged next run
 *   - isRehabRelevant (now incl. the journal front-matter / retraction filter)
 *   - not already in the live feed (dedup by canonical URL)
 *
 * Idempotent. Caps the feed at MAX_ITEMS by curatedScore, like a refresh does.
 *
 * Usage:
 *   DRY_RUN=true node scripts/reinject-from-archive.js   — print only
 *   node scripts/reinject-from-archive.js                — write news.json
 */

const fs   = require('fs');
const path = require('path');

const DRY_RUN   = process.env.DRY_RUN === 'true';
const ROOT      = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const MAX_ITEMS = 75;
const WINDOW    = { news: 30, guideline: 90, policy: 90 }; // days, on firstSeen

const { isRehabRelevant } = require('./news-refresh.js');
const SOURCES = require(path.join(ROOT, 'sources.json'));

function matchSource(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    for (const s of SOURCES) {
      const [dom, ...pp] = s.domain.split('/');
      if ((h === dom || h.endsWith('.' + dom)) && (!pp.length || u.pathname.startsWith('/' + pp.join('/')))) return s.name;
    }
    return null;
  } catch { return null; }
}
const canon = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/$/, ''); } catch { return u; } };

// Load live feed + every archive file.
const feed = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
const live = feed.items || [];
const liveUrls = new Set(live.map((i) => canon(i.sourceUrl)));

const archDir = path.join(ROOT, 'archive');
let archive = [];
for (const f of fs.readdirSync(archDir)) {
  if (!/^\d{4}-\d{2}\.json$/.test(f)) continue;
  try { archive = archive.concat(JSON.parse(fs.readFileSync(path.join(archDir, f), 'utf8')).items || []); } catch {}
}

const now = Date.now();
const seen = new Set();
const picks = [];
for (const it of archive) {
  const type = (it.tags || [])[0];
  if (!WINDOW[type]) continue;
  const u = canon(it.sourceUrl);
  if (liveUrls.has(u) || seen.has(u)) continue;
  const within = new Date(it.firstSeen || it.publishedAt).getTime() > now - WINDOW[type] * 86400000;
  if (!within) continue;
  const src = matchSource(it.sourceUrl);
  if (!src) continue;                 // would be purged on next refresh
  if (!isRehabRelevant(it)) continue; // off-topic / front-matter / retraction
  seen.add(u);
  // Relabel source to the roster name + guarantee firstSeen, exactly as the
  // refresh carry-over does, so display is consistent immediately.
  picks.push({ ...it, source: src, firstSeen: it.firstSeen || it.publishedAt });
}

// Report.
const tally = {};
for (const p of picks) tally[(p.tags || [])[0]] = (tally[(p.tags || [])[0]] || 0) + 1;
console.log(`\n${DRY_RUN ? 'DRY RUN — no write' : 'WRITE MODE'}`);
console.log(`live feed: ${live.length}  |  reinjecting: ${picks.length}  ${JSON.stringify(tally)}`);
for (const p of picks.sort((a, b) => (b.curatedScore || 0) - (a.curatedScore || 0))) {
  console.log(`  ${String((p.tags || [])[0]).padEnd(9)} [${String(p.curatedScore || '-').padStart(3)}] ${p.source.padEnd(18)} ${(p.titleZh || p.title || '').slice(0, 40)}`);
}

if (!DRY_RUN && picks.length) {
  const merged = [...live, ...picks].sort((a, b) => (b.curatedScore || 0) - (a.curatedScore || 0)).slice(0, MAX_ITEMS);
  feed.items = merged;
  fs.writeFileSync(NEWS_PATH, JSON.stringify(feed, null, 2) + '\n');
  console.log(`\nnews.json: ${live.length} → ${merged.length} items (cap ${MAX_ITEMS})`);
}
