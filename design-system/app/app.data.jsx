// GreenStack — data loader.
// Fetches news.json (cron-written by scripts/news-refresh.js) and transforms each item
// from the canonical JSON schema into the GS_STORIES shape that app.main.jsx expects.
//
// Slug aliasing: the cron-side schema (project-greenstack-taxonomy) uses long slugs
// like "electrification-efficiency"; the UI components/feed/categories.js uses short
// slugs like "electrification". This loader translates at the boundary so news.json
// stays canonical and the UI components stay unmodified.

const CAT_ALIAS = {
  'electrification-efficiency': 'electrification',
  'industrial-decarb':          'industrial',
  'grid-tech':                  'grid',
  'robotics-physical-ai':       'robotics',
  'ag-food':                    'agriculture',
  // exact matches:  clean-power, social, governance
};

function gsDayBucket(publishedAt) {
  if (!publishedAt) return 'older';
  const now = new Date();
  const pub = new Date(publishedAt);
  const diffMs = now - pub;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return 'older';
}

function gsFmtTime(publishedAt) {
  if (!publishedAt) return '';
  return new Date(publishedAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function gsFmtDate(publishedAt) {
  if (!publishedAt) return '';
  return new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function gsTransformItem(item) {
  return {
    id:          item.id,
    day:         gsDayBucket(item.publishedAt),
    category:    CAT_ALIAS[item.category] || item.category,
    score:       item.curatedScore,
    source:      item.source,
    sourceUrl:   item.sourceUrl,
    publishedAt: item.publishedAt,  // raw ISO retained for SourcesGrid "latest" sort
    time:        gsFmtTime(item.publishedAt),
    date:        gsFmtDate(item.publishedAt),
    title:       item.title,
    summary:     item.summary,
    why:         item.curatedReason,
    tags:        item.tags || [],
  };
}

// ── Static side-rail content ────────────────────────────────────────────────
// Left-nav and "following" sources are not in news.json; they're product chrome.
// Kept here so the shell renders without extra fetches.

// Saved omitted from v1 — would need bookmark UI on NewsCard + localStorage
// persistence. Restore when account / sync story is decided.
window.GS_NAV = [
  { id: 'curated', label: 'Curated',     icon: 'sparkles' },
  { id: 'all',     label: 'All stories', icon: 'list' },
  { id: 'daily',   label: 'Daily brief', icon: 'newspaper' },
  { id: 'sources', label: 'Sources',     icon: 'rss' },
];

// GS_SOURCES removed 2026-06-09 — the Sources view auto-builds the real outlet
// directory from news.json on every render, so the hardcoded left-rail
// "Following" list (Bloomberg / Reuters / CTVC / etc.) was redundant and
// semantically wrong ("Following" implies user-curated subscriptions).
// Restore only if a real subscription / personalization story ships.

// ── Async load → render ─────────────────────────────────────────────────────
// We use a module-level promise so app.main.jsx can render after the data is
// available; this avoids a flash of empty feed.

window.GS_DATA_READY = (async () => {
  try {
    const res = await fetch('news.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`news.json HTTP ${res.status}`);
    const data = await res.json();
    window.GS_STORIES = (data.items || []).map(gsTransformItem);
    window.GS_META = data.meta || {};
  } catch (err) {
    console.error('[GreenStack] news.json load failed:', err);
    window.GS_STORIES = [];
    window.GS_META = { error: err.message };
  }
})();
