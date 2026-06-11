// Cadence — data loader.
// Fetches news.json (cron-written by scripts/news-refresh.js) and transforms each item
// from the canonical JSON schema into the CD_STORIES shape that app.main.jsx expects.
//
// No slug aliasing needed: this is a fresh fork — scripts/news-refresh.js and
// components/feed/categories.js were built against the same 8 PT slugs.

function cdDayBucket(publishedAt) {
  if (!publishedAt) return 'older';
  const now = new Date();
  const pub = new Date(publishedAt);
  const diffMs = now - pub;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return 'older';
}

function cdFmtTime(publishedAt) {
  if (!publishedAt) return '';
  return new Date(publishedAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function cdFmtDate(publishedAt) {
  if (!publishedAt) return '';
  return new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function cdTransformItem(item) {
  return {
    id:          item.id,
    day:         cdDayBucket(item.publishedAt),
    category:    item.category,
    score:       item.curatedScore,
    source:      item.source,
    sourceUrl:   item.sourceUrl,
    publishedAt: item.publishedAt,  // raw ISO retained for SourcesGrid "latest" sort
    time:        cdFmtTime(item.publishedAt),
    date:        cdFmtDate(item.publishedAt),
    title:       item.title,
    summary:     item.summary,
    why:         item.curatedReason,
    tags:        item.tags || [],
    related:     item.related || [],  // other outlets covering the same story (关联讨论)
  };
}

// ── Static side-rail content ────────────────────────────────────────────────
// Left-nav is not in news.json; it's product chrome.

window.CD_NAV = [
  { id: 'curated', label: 'Curated',     icon: 'sparkles' },
  { id: 'all',     label: 'All stories', icon: 'list' },
  { id: 'daily',   label: 'Daily brief', icon: 'newspaper' },
  { id: 'saved',   label: 'Saved',       icon: 'bookmark' },
  { id: 'sources', label: 'Sources',     icon: 'rss' },
];

// ── Async load → render ─────────────────────────────────────────────────────
// Module-level promise so app.main.jsx can render after the data is available;
// avoids a flash of empty feed.

window.CD_DATA_READY = (async () => {
  try {
    const [newsRes, srcRes] = await Promise.all([
      fetch('news.json', { cache: 'no-store' }),
      fetch('sources.json', { cache: 'no-store' }),
    ]);
    if (!newsRes.ok) throw new Error(`news.json HTTP ${newsRes.status}`);
    const data = await newsRes.json();
    window.CD_STORIES = (data.items || []).map(cdTransformItem);
    window.CD_META = data.meta || {};
    // Multi-source hot topics; empty = strip hidden. Heat is recomputed
    // client-side (same formula as the cron: sources × 0.5^(days/2)) because
    // quiet-hour runs skip the news.json write — without this, decay freezes
    // and a stale topic could stay pinned for days.
    window.CD_HOT = (data.hotTopics || [])
      .map((t) => ({ ...t, heat: t.sourceCount * Math.pow(0.5, Math.max(0, (Date.now() - new Date(t.publishedAt)) / 86400000) / 2) }))
      .filter((t) => t.heat >= 1.2)
      .sort((a, b) => b.heat - a.heat);
    window.CD_SOURCES = srcRes.ok ? await srcRes.json() : [];
  } catch (err) {
    console.error('[Cadence] data load failed:', err);
    window.CD_STORIES = [];
    window.CD_META = { error: err.message };
    window.CD_HOT = [];
    window.CD_SOURCES = window.CD_SOURCES || [];
  }
})();

// ── Source wall ──────────────────────────────────────────────────────────────
// Canonical roster lives in sources.json (single source of truth, shared with
// scripts/news-refresh.js which constrains Exa to these domains). Loaded into
// window.CD_SOURCES inside CD_DATA_READY above. Add a source: edit sources.json.
