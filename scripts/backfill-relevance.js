/**
 * Backfill the PT-relevance gate over existing data.
 *
 * Applies the same isRehabRelevant() rules news-refresh.js uses for new items
 * to news.json + every archive/YYYY-MM.json, REMOVING off-topic medical
 * leakage (drug trials / organ disease with no rehab signal, e.g. a
 * finerenone/CKD trial mis-tagged cardiopulmonary). Recomputes hotTopics on
 * news.json afterward so dropped items don't linger in the hot-topics strip.
 *
 * Unlike backfill-tech (which only toggles a flag), this DELETES items, so it
 * defaults to a dry run — pass WRITE=true to actually rewrite the files.
 *
 * Usage:
 *   node scripts/backfill-relevance.js            — dry run, print drop list
 *   WRITE=true node scripts/backfill-relevance.js — rewrite files
 */

const fs = require('fs');
const path = require('path');
const { isRehabRelevant, computeHotTopics } = require('./news-refresh.js');

const ROOT = path.join(__dirname, '..');
const WRITE = process.env.WRITE === 'true';

function processFile(p, isLive) {
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const before = (data.items || []).length;
  const dropped = [];
  data.items = (data.items || []).filter((it) => {
    if (isRehabRelevant(it)) return true;
    dropped.push(it);
    return false;
  });
  if (isLive && data.hotTopics) data.hotTopics = computeHotTopics(data.items);
  if (isLive && data.meta && typeof data.meta.totalItems === 'number') data.meta.totalItems = data.items.length;
  if (WRITE && dropped.length) fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  return { before, after: data.items.length, dropped };
}

const files = [{ p: path.join(ROOT, 'news.json'), live: true }];
const archDir = path.join(ROOT, 'archive');
if (fs.existsSync(archDir)) {
  for (const f of fs.readdirSync(archDir)) {
    if (/^\d{4}-\d{2}\.json$/.test(f)) files.push({ p: path.join(archDir, f), live: false });
  }
}

console.log(`\n🩺 PT-relevance backfill${WRITE ? '' : ' (DRY RUN — pass WRITE=true to apply)'}`);
const seen = new Set();
const allDropped = [];
for (const { p, live } of files) {
  const r = processFile(p, live);
  console.log(`  ${path.relative(ROOT, p)}: ${r.before} → ${r.after} (-${r.dropped.length})`);
  for (const d of r.dropped) {
    const k = d.sourceUrl || d.title;
    if (seen.has(k)) continue;
    seen.add(k);
    allDropped.push(d);
  }
}
console.log(`\n  Off-topic dropped (unique): ${allDropped.length}`);
for (const d of allDropped.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))) {
  console.log(`  [${d.source} · ${(d.tags || []).join(',')}] ${(d.title || '').slice(0, 72)}`);
}
