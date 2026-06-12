/**
 * Backfill the 康复科技 (tech) cross-cutting flag over existing data.
 *
 * Applies the same isTech() keyword rules news-refresh.js uses for new items
 * to news.json + every archive/YYYY-MM.json, in place. Idempotent: reruns
 * recompute the flag from scratch (also REMOVES it where rules no longer
 * match), so tuning TECH_PATTERNS / TECH_ZH and rerunning is safe.
 *
 * Usage:
 *   node scripts/backfill-tech.js           — write + print hit list
 *   DRY_RUN=true node scripts/backfill-tech.js — print only
 */

const fs = require('fs');
const path = require('path');
const { isTech } = require('./news-refresh.js');

const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.env.DRY_RUN === 'true';

function processFile(p) {
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const items = data.items || [];
  let flagged = 0, cleared = 0;
  const hits = [];
  for (const it of items) {
    const want = isTech(it);
    if (want && !it.tech) { it.tech = true; flagged++; }
    if (!want && it.tech) { delete it.tech; cleared++; }
    if (want) hits.push(it);
  }
  if (!DRY_RUN && (flagged || cleared)) fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  return { items: items.length, flagged, cleared, hits };
}

const files = [path.join(ROOT, 'news.json')];
const archDir = path.join(ROOT, 'archive');
if (fs.existsSync(archDir)) {
  for (const f of fs.readdirSync(archDir)) {
    if (/^\d{4}-\d{2}\.json$/.test(f)) files.push(path.join(archDir, f));
  }
}

console.log(`\n🔬 康复科技 backfill${DRY_RUN ? ' (DRY RUN)' : ''}`);
const seen = new Set();
const allHits = [];
for (const p of files) {
  const r = processFile(p);
  console.log(`  ${path.relative(ROOT, p)}: ${r.items} items → +${r.flagged} flagged, -${r.cleared} cleared`);
  for (const h of r.hits) {
    const k = h.sourceUrl || h.title;
    if (seen.has(k)) continue;
    seen.add(k);
    allHits.push(h);
  }
}
console.log(`\n  Tech stories (unique): ${allHits.length}`);
for (const h of allHits.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))) {
  console.log(`  [${h.curatedScore}] ${(h.publishedAt || '').slice(0, 10)} ${(h.titleZh || h.title || '').slice(0, 60)}`);
}
