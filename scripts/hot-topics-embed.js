/**
 * Cadence — embedding-based hot topics
 *
 * Drop-in replacement signal for computeHotTopics(). The old version grouped by
 * an exact shared sub-tag across ≥2 distinct sources within a 4-day window — too
 * strict at current volume, so hotTopics sat at 0. This clusters items by
 * semantic similarity over their Voyage vectors instead, which catches a theme
 * even when papers don't share an identical tag.
 *
 * Output is the SAME object shape the old function emitted, so the site
 * (app.data.jsx) and wechat-brief.js render it with zero changes:
 *   { id, title, sourceUrl, category, publishedAt, sourceCount, sources,
 *     tag, kind:'theme', members:[{source,title,titleZh}], heat }
 *
 * Contract notes (verified against consumers):
 *  - The client RECOMPUTES heat = sourceCount × 0.5^(days/2) and hides < 1.2,
 *    so a topic must have ≥2 distinct sources to ever show. We mirror that
 *    filter here so we never emit a topic the client would silently drop.
 *  - `id` must be a representative item that is present in the live feed, so
 *    wechat-brief.js can resolve it back to a full item (titleZh, summary).
 *  - kind:'theme' + research-only intake preserves the brand rule that "theme
 *    heat" signals an active *research* area (editorials/news don't inflate it).
 *
 * Env:
 *   HOT_SIM_THRESHOLD — min avg (mean-centered) cosine to merge two clusters
 *                       (default 0.10). RAISE → more/smaller themes; LOWER →
 *                       fewer/broader. Tune with --dry.
 *   HOT_WINDOW_DAYS   — recency window (default 14)
 *   HOT_MIN_SIZE      — min papers per theme (default 3)
 *
 * CLI (dry run, prints clusters, writes nothing):
 *   node scripts/hot-topics-embed.js --dry
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const { loadCache } = require('./embed-items');

// Mirrors news-refresh.js (kept local so this module is standalone).
const byCuratedScore = (a, b) => (b.curatedScore || 0) - (a.curatedScore || 0);
const GENERIC_TAGS = new Set(['research', 'news', 'guideline', 'policy', 'rehabilitation',
  'physical-therapy', 'pt', 'rehab', 'therapy', 'clinical']);

function normalize(v) {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return v.map(x => x / n);
}
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

// Subtract the pool mean from each vector and renormalize. Removes the shared
// single-domain component so cosine regains dynamic range (see computeHotTopicsEmbed).
function meanCenter(vecs) {
  const n = vecs.length;
  if (!n) return vecs;
  const d = vecs[0].length;
  const mean = new Array(d).fill(0);
  for (const v of vecs) for (let i = 0; i < d; i++) mean[i] += v[i];
  for (let i = 0; i < d; i++) mean[i] /= n;
  return vecs.map(v => normalize(v.map((x, i) => x - mean[i])));
}

// Average-linkage agglomerative clustering: repeatedly merge the two clusters
// with the highest mean pairwise cosine until none exceed `minMergeSim`.
// Deterministic (no random init), O(n²·iters) — trivial at feed scale. Returns
// arrays of indices into `vecs`.
function agglomerate(vecs, minMergeSim) {
  const n = vecs.length;
  if (n === 0) return [];
  const sim = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : dot(vecs[i], vecs[j]))));
  let groups = vecs.map((_, i) => [i]);
  const avgSim = (A, B) => {
    let s = 0;
    for (const a of A) for (const b of B) s += sim[a][b];
    return s / (A.length * B.length);
  };
  while (groups.length > 1) {
    let bi = -1, bj = -1, best = minMergeSim;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const s = avgSim(groups[i], groups[j]);
        if (s > best) { best = s; bi = i; bj = j; }
      }
    if (bi < 0) break;
    groups[bi] = groups[bi].concat(groups[bj]);
    groups.splice(bj, 1);
  }
  return groups;
}

function computeHotTopicsEmbed(items, cache, opts = {}) {
  const now = opts.now || Date.now();
  const windowDays = opts.windowDays ?? Number(process.env.HOT_WINDOW_DAYS || 14);
  const threshold = opts.threshold ?? Number(process.env.HOT_SIM_THRESHOLD || 0.10);
  const minSize = opts.minSize ?? Number(process.env.HOT_MIN_SIZE || 3);
  const vectors = (cache && cache.vectors) || {};
  const decay = (p) => Math.pow(0.5, Math.max(0, (now - new Date(p).getTime()) / 86400000) / 2);

  // Pool: research items, in-window, with a cached vector. Sorted by curated
  // score so the strongest paper seeds each cluster (and becomes its rep).
  const pool = items
    .filter(i => (i.tags || [])[0] === 'research'
      && i.id && vectors[i.id]
      && (now - new Date(i.publishedAt).getTime()) / 86400000 <= windowDays)
    .sort(byCuratedScore);

  // Mean-center, then average-linkage agglomerate. Centering is essential: every
  // item is a rehab-literature title in one domain, so raw cosine sits in a
  // narrow 0.57–0.92 band that no absolute threshold can split (everything
  // collapses into one blob). Subtracting the pool mean removes the shared
  // "rehab" component and restores contrast, after which themes separate cleanly.
  const centered = meanCenter(pool.map(it => normalize(vectors[it.id])));
  const groups = agglomerate(centered, threshold);
  const clusters = groups.map(g => g.map(idx => pool[idx]));

  const topics = clusters.filter(members => members.length >= minSize).map(members => {
    const top = [...members].sort(byCuratedScore)[0];
    const newest = members.reduce((a, b) => (new Date(a.publishedAt) > new Date(b.publishedAt) ? a : b));
    // Heat is driven by distinct JOURNALS, not fetch-sources: PubMed is a single
    // "source" that swallows ~20 journals, so source-count badly understates a
    // theme. "Covered across N journals" is the honest hotness signal for a
    // literature feed. Fall back to the fetch source when journal is missing.
    const journals = new Set(members.map(m => m.journal || m.source).filter(Boolean));
    // Sub-tags ranked by frequency → the `tag` field the UI shows as the theme
    // label. Keep the full ranking so duplicate labels can be broken below.
    const tagCount = {};
    for (const m of members) for (const t of (m.tags || []).slice(1)) {
      if (!GENERIC_TAGS.has(t)) tagCount[t] = (tagCount[t] || 0) + 1;
    }
    const tagRanked = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const tag = tagRanked[0] || top.category;
    return {
      id: top.id, title: top.title, sourceUrl: top.sourceUrl, category: top.category,
      publishedAt: newest.publishedAt,
      // sourceCount/sources now carry JOURNALS (client recomputes heat =
      // sourceCount × decay; wechat-brief lists them as "X 家期刊在报").
      sourceCount: journals.size, sources: [...journals],
      tag, kind: 'theme', _tagRanked: tagRanked,
      members: members.map(m => ({ source: m.source, journal: m.journal, title: m.title, titleZh: m.titleZh })),
      heat: Math.round(journals.size * decay(newest.publishedAt) * 100) / 100,
    };
  });

  const seen = new Set();
  const top = topics
    .filter(t => t.heat >= 1.2)                 // mirror the client-side hide rule
    .sort((a, b) => b.heat - a.heat)
    .filter(t => (seen.has(t.id) ? false : seen.add(t.id)))
    .slice(0, 5);

  // Distinct labels: when two themes share a dominant sub-tag (e.g. two stroke
  // clusters), the higher-heat one keeps it and the next takes its most common
  // *unused* sub-tag — so the strip never shows the same tag twice. Strip the
  // temporary ranking field so it never reaches news.json.
  const usedTags = new Set();
  for (const t of top) {
    const pick = (t._tagRanked || []).find(tg => !usedTags.has(tg)) || t.tag;
    t.tag = pick;
    usedTags.add(pick);
    delete t._tagRanked;
  }
  return top;
}

module.exports = { computeHotTopicsEmbed };

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  const cache = loadCache();
  const n = Object.keys(cache.vectors || {}).length;
  if (!n) { console.error('No embeddings.json cache yet — run embed-items.js first.'); process.exit(1); }
  const topics = computeHotTopicsEmbed(data.items || [], cache, { now: Date.now() });
  console.log(`cache=${n} vectors | threshold=${process.env.HOT_SIM_THRESHOLD || 0.10} | topics=${topics.length}\n`);
  topics.forEach((t, i) => {
    console.log(`#${i + 1} heat=${t.heat} journals=${t.sourceCount} tag=${t.tag} (${t.members.length} papers)`);
    console.log(`   rep: ${t.titleZh || t.title}`);
    t.members.slice(0, 6).forEach(m => console.log(`     - [${m.source}] ${(m.titleZh || m.title).slice(0, 46)}`));
  });
  if (!topics.length) console.log('(no themes cleared heat≥1.2 — lower HOT_SIM_THRESHOLD or widen HOT_WINDOW_DAYS)');
}
