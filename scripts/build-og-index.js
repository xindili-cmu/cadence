// build-og-index.js — per-item share-card metadata, sharded for the edge worker.
//
// Why (2026-11-15): worker.js used to answer /?item=<id> by JSON-parsing
// news.json and then every archive month (~4 MB total) until it found the id.
// Cloudflare free tier caps a Worker at 10 ms CPU per request; Googlebot
// crawling the ~1,750 ?item= permalinks in sitemap.xml tripped that cap 100+
// times a day (error 1102 → crawler sees an error page instead of the story).
//
// Fix: precompute exactly what the worker needs (title + ≤200-char description,
// EN and ZH) into og/<shard>.json, ~64 small files. The worker fetches ONE shard
// (a few KB) per request.
//
// Who runs it: .github/workflows/deploy.yml, right before `wrangler deploy`.
// og/ is a deploy-time build product — gitignored, never committed, so it can't
// drift from news.json/archive (every content change triggers a deploy).
//
// ogShard() is duplicated in worker.js (the worker can't require CJS);
// pipeline-gates.test.js AC 段 asserts the two agree on every live id.

const fs = require('fs');
const path = require('path');

const SHARDS = 64;

// FNV-1a 32-bit over UTF-16 code units → 2 hex chars. Keep byte-identical
// with ogShard() in worker.js.
function ogShard(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % SHARDS).toString(16).padStart(2, '0');
}

// Moved verbatim from worker.js (was storyMeta there).
// en guard (2026-07-04): the pipeline occasionally wrote a Chinese summary
// into `summary` — an EN share card must never carry a Chinese description.
// Fall back to curatedReasonEn (English by construction), else empty.
const CJK_RE = /[一-鿿]/;
function storyMeta(story, lang) {
  const en = lang === 'en';
  const title = (en ? (story.titleEn || story.title) : (story.titleZh || story.title)) || '';
  const enDesc = !CJK_RE.test(story.summary || '')
    ? (story.summary || story.curatedReasonEn || '')
    : (story.curatedReasonEn || '');
  const rawDesc = (en ? enDesc : (story.summaryZh || story.summary)) || '';
  const desc = rawDesc.length > 200 ? rawDesc.slice(0, 199) + '…' : rawDesc;
  return { title, desc };
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// Same precedence as the old worker lookup: live feed wins, then archive
// months newest first.
function collectItems(root) {
  const byId = new Map();
  const add = (items) => {
    for (const s of items || []) if (s && s.id && !byId.has(s.id)) byId.set(s.id, s);
  };
  const live = readJson(path.join(root, 'news.json'));
  if (!live) throw new Error('build-og-index: news.json unreadable');
  add(live.items);
  const idx = readJson(path.join(root, 'archive', 'index.json'));
  const files = ((idx && idx.months) || []).map((m) => m.file).filter(Boolean).sort().reverse();
  for (const f of files) {
    const month = readJson(path.join(root, 'archive', f));
    if (month) add(month.items);
  }
  return byId;
}

function buildShards(root) {
  const shards = {};
  for (const [id, s] of collectItems(root)) {
    const e = storyMeta(s, 'en');
    const z = storyMeta(s, 'zh');
    if (!e.title && !z.title) continue;
    const k = ogShard(id);
    (shards[k] = shards[k] || {})[id] = { e: [e.title, e.desc], z: [z.title, z.desc] };
  }
  return shards;
}

function buildOgIndex(root, outDir) {
  const shards = buildShards(root);
  fs.mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const [k, m] of Object.entries(shards)) {
    fs.writeFileSync(path.join(outDir, `${k}.json`), JSON.stringify(m));
    n += Object.keys(m).length;
  }
  return { items: n, shards: Object.keys(shards).length };
}

module.exports = { ogShard, storyMeta, collectItems, buildShards, buildOgIndex, SHARDS };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const r = buildOgIndex(root, path.join(root, 'og'));
  console.log(`og index: ${r.items} items → ${r.shards} shards in og/`);
}
