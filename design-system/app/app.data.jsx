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
  };
}

// ── Static side-rail content ────────────────────────────────────────────────
// Left-nav is not in news.json; it's product chrome.

window.CD_NAV = [
  { id: 'curated', label: 'Curated',     icon: 'sparkles' },
  { id: 'all',     label: 'All stories', icon: 'list' },
  { id: 'daily',   label: 'Daily brief', icon: 'newspaper' },
  { id: 'sources', label: 'Sources',     icon: 'rss' },
];

// ── Async load → render ─────────────────────────────────────────────────────
// Module-level promise so app.main.jsx can render after the data is available;
// avoids a flash of empty feed.

window.CD_DATA_READY = (async () => {
  try {
    const res = await fetch('news.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`news.json HTTP ${res.status}`);
    const data = await res.json();
    window.CD_STORIES = (data.items || []).map(cdTransformItem);
    window.CD_META = data.meta || {};
  } catch (err) {
    console.error('[Cadence] news.json load failed:', err);
    window.CD_STORIES = [];
    window.CD_META = { error: err.message };
  }
})();

// ── Source wall ──────────────────────────────────────────────────────────────
// The canonical directory of outlets Cadence monitors — rendered by the
// Sources view as a standing wall, enriched with live counts from CD_STORIES.
// `name` must match scripts/news-refresh.js extractDomain output exactly,
// otherwise live stats won't merge onto the card.

window.CD_SOURCES = [
  // Journals & research
  { name: 'JOSPT',             domain: 'jospt.org',            url: 'https://www.jospt.org',                kind: 'journal',     regions: ['US'],  cats: ['orthopedic', 'sports'] },
  { name: 'PTJ',               domain: 'academic.oup.com/ptj', url: 'https://academic.oup.com/ptj',         kind: 'journal',     regions: ['US'],  cats: ['practice'] },
  { name: 'The Lancet',        domain: 'thelancet.com',        url: 'https://www.thelancet.com',            kind: 'journal',     regions: ['Global'], cats: ['neurological'] },
  { name: 'BMJ',               domain: 'bmj.com',              url: 'https://www.bmj.com',                  kind: 'journal',     regions: ['Global'], cats: ['orthopedic'] },
  { name: 'JAMA',              domain: 'jamanetwork.com',      url: 'https://jamanetwork.com',              kind: 'journal',     regions: ['US'],  cats: ['geriatric'] },
  { name: 'PubMed',            domain: 'pubmed.ncbi.nlm.nih.gov', url: 'https://pubmed.ncbi.nlm.nih.gov',   kind: 'database',    regions: ['Global'], cats: ['orthopedic', 'neurological'] },
  { name: 'medRxiv',           domain: 'medrxiv.org',          url: 'https://www.medrxiv.org',              kind: 'preprint',    regions: ['Global'], cats: ['cardiopulmonary'] },
  // Associations & regulators
  { name: 'APTA',              domain: 'apta.org',             url: 'https://www.apta.org',                 kind: 'association', regions: ['US'],  cats: ['practice'] },
  { name: 'APA (AU)',          domain: 'physiotherapy.asn.au', url: 'https://australian.physio',            kind: 'association', regions: ['AU'],  cats: ['practice'] },
  { name: 'AHPRA',             domain: 'ahpra.gov.au',         url: 'https://www.ahpra.gov.au',             kind: 'regulator',   regions: ['AU'],  cats: ['practice'] },
  { name: 'CMS',               domain: 'cms.gov',              url: 'https://www.cms.gov',                  kind: 'regulator',   regions: ['US'],  cats: ['practice'] },
  { name: '国家卫健委',         domain: 'nhc.gov.cn',           url: 'http://www.nhc.gov.cn',                kind: 'regulator',   regions: ['CN'],  cats: ['practice'] },
  // Industry news & platforms
  { name: 'STAT',              domain: 'statnews.com',         url: 'https://www.statnews.com',             kind: 'news',        regions: ['US'],  cats: ['practice'] },
  { name: 'Modern Healthcare', domain: 'modernhealthcare.com', url: 'https://www.modernhealthcare.com',     kind: 'news',        regions: ['US'],  cats: ['practice'] },
  { name: 'Reuters',           domain: 'reuters.com',          url: 'https://www.reuters.com',              kind: 'news',        regions: ['Global'], cats: ['practice'] },
  { name: 'Physiopedia',       domain: 'physio-pedia.com',     url: 'https://www.physio-pedia.com',         kind: 'platform',    regions: ['Global'], cats: ['manual-modality'] },
  { name: 'WebPT',             domain: 'webpt.com',            url: 'https://www.webpt.com',                kind: 'news',        regions: ['US'],  cats: ['practice'] },
  // Chinese clinical media
  { name: '丁香园',             domain: 'dxy.cn',               url: 'https://www.dxy.cn',                   kind: 'platform',    regions: ['CN'],  cats: ['neurological'] },
  { name: '健康界',             domain: 'cnhealthcare.com',     url: 'https://www.cnhealthcare.com',         kind: 'news',        regions: ['CN'],  cats: ['practice'] },
];
