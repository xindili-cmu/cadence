/**
 * Cadence — item embeddings (Voyage AI)
 *
 * Computes a semantic vector for each curated item and caches it on disk so we
 * embed each paper exactly once. The vectors are dual-use:
 *   1. hot-topics-embed.js clusters them into themes (replaces the old
 *      tag+source heuristic that returned 0 at current volume).
 *   2. Future semantic search / RAG over the corpus reuses the same cache.
 *
 * Why Voyage: Anthropic's recommended embedding partner; voyage-3.5 is
 * multilingual, so one vector serves both English clustering and (later)
 * Chinese queries against the corpus.
 *
 * Env vars:
 *   VOYAGE_API_KEY   — required to (re)embed; if unset, callers fall back.
 *   VOYAGE_MODEL     — optional, default 'voyage-3.5' (voyage-4 family also works)
 *   VOYAGE_DIM       — optional output_dimension, default 512 (256/1024/2048 ok)
 *
 * Cache file: embeddings.json
 *   { model, dim, updated, vectors: { <itemId>: [float, ...] } }
 *
 * CLI:
 *   VOYAGE_API_KEY=... node scripts/embed-items.js          # embed live feed
 *   VOYAGE_API_KEY=... node scripts/embed-items.js --archive # + full archive (RAG)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const ARCHIVE_DIR = path.join(ROOT, 'archive');
const CACHE_PATH = path.join(ROOT, 'embeddings.json');

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || 'voyage-3.5';
const VOYAGE_DIM = Number(process.env.VOYAGE_DIM || 512);
// Voyage is served through MongoDB Atlas now; Atlas model keys (al-…) authenticate
// against ai.mongodb.com — NOT api.voyageai.com. Override VOYAGE_BASE_URL only if
// you hold a legacy standalone Voyage key (https://api.voyageai.com/v1/embeddings).
const VOYAGE_URL = process.env.VOYAGE_BASE_URL || 'https://ai.mongodb.com/v1/embeddings';
const BATCH = 128;            // Voyage allows up to 128 inputs / request
const ROUND = 5;             // decimals kept on disk (caps embeddings.json size)

// Text we embed. Title carries the cleanest topical signal; titleZh helps later
// Chinese retrieval; sub-tags + studyDesign add grounding. Summary is left OUT
// on purpose — it carries publisher boilerplate (springer/nature/news) that
// polluted the TF-IDF prototype into junk clusters.
function embedText(it) {
  const tags = (it.tags || []).filter(t => t !== 'research' && t !== 'news').join(', ');
  return [it.title, it.titleZh, tags, it.studyDesign, it.category]
    .filter(Boolean).join('. ').slice(0, 4000);
}

function loadCache() {
  if (fs.existsSync(CACHE_PATH)) {
    try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch (_) {}
  }
  return { model: VOYAGE_MODEL, dim: VOYAGE_DIM, updated: null, vectors: {} };
}

function saveCache(cache) {
  cache.updated = new Date().toISOString();
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

function loadLiveItems() {
  const data = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  return data.items || [];
}

function loadArchiveItems() {
  const out = [];
  if (!fs.existsSync(ARCHIVE_DIR)) return out;
  for (const f of fs.readdirSync(ARCHIVE_DIR)) {
    if (!/^\d{4}-\d{2}\.json$/.test(f)) continue;
    try {
      const a = JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf8'));
      out.push(...(Array.isArray(a) ? a : a.items || []));
    } catch (_) {}
  }
  return out;
}

async function voyageEmbed(texts) {
  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: 'document',
      output_dimension: VOYAGE_DIM,
    }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  // Preserve request order (API returns an `index` per row).
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding.map(x => Math.round(x * 10 ** ROUND) / 10 ** ROUND));
}

/**
 * Ensure every item in `items` has a cached vector. Only un-cached ids hit the
 * API. Returns the (in-memory) cache object. Throws if VOYAGE_API_KEY is unset
 * AND there are items to embed — callers wrap this in try/catch to fall back.
 */
async function embedMissing(items, { verbose = false } = {}) {
  const cache = loadCache();
  // Model/dim change ⇒ old vectors aren't comparable; rebuild.
  if (cache.model !== VOYAGE_MODEL || cache.dim !== VOYAGE_DIM) {
    cache.model = VOYAGE_MODEL; cache.dim = VOYAGE_DIM; cache.vectors = {};
  }
  const todo = items.filter(it => it.id && !cache.vectors[it.id]);
  if (!todo.length) { if (verbose) console.log('   embeddings: cache hit, nothing to embed'); return cache; }
  if (!VOYAGE_API_KEY) throw new Error('VOYAGE_API_KEY not set');

  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const vecs = await voyageEmbed(slice.map(embedText));
    slice.forEach((it, k) => { cache.vectors[it.id] = vecs[k]; });
    if (verbose) console.log(`   embeddings: +${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }
  saveCache(cache);
  return cache;
}

module.exports = { embedMissing, loadCache, embedText, CACHE_PATH };

if (require.main === module) {
  (async () => {
    const items = loadLiveItems().concat(process.argv.includes('--archive') ? loadArchiveItems() : []);
    // dedup by id
    const seen = new Map();
    for (const it of items) if (it.id) seen.set(it.id, it);
    const uniq = [...seen.values()];
    console.log(`embed-items: ${uniq.length} unique items, model=${VOYAGE_MODEL} dim=${VOYAGE_DIM}`);
    const cache = await embedMissing(uniq, { verbose: true });
    console.log(`done: ${Object.keys(cache.vectors).length} vectors cached → ${path.relative(ROOT, CACHE_PATH)}`);
  })().catch(e => { console.error(e.message); process.exit(1); });
}
