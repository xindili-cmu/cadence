// Cadence — data loader.
// Fetches news.json (cron-written by scripts/news-refresh.js) and transforms each item
// from the canonical JSON schema into the CD_STORIES shape that app.main.jsx expects.
//
// No slug aliasing needed: this is a fresh fork — scripts/news-refresh.js and
// components/feed/categories.js were built against the same 8 PT slugs.

// ── i18n ─────────────────────────────────────────────────────────────────────
// UI-chrome dictionary. Content fields (titleZh/summaryZh/curatedReasonEn) come
// from news.json per item; missing fields fall back to the original language.
// CD_LANG is read at render time by every component, so FeedApp's setLang
// re-render flips the whole tree in place. Persisted choice wins over the
// browser-language default.
window.CD_DICT = {
  en: {
    'nav.curated': 'Curated', 'nav.all': 'All stories', 'nav.daily': 'Daily brief', 'nav.saved': 'Saved', 'nav.sources': 'Sources',
    // Short labels for the mobile bottom tab bar (≤8 chars so 5 tabs fit at 320px)
    'navS.curated': 'Curated', 'navS.all': 'All', 'navS.daily': 'Daily', 'navS.saved': 'Saved', 'navS.sources': 'Sources',
    'sub.curated': 'AI-selected PT signal · updated daily', 'sub.all': 'Full firehose across every source',
    'sub.daily': 'Yesterday, packaged into eight sections', 'sub.saved': 'Bookmarked stories · stored in this browser only',
    'sub.sources': 'Outlets Cadence monitors',
    searchPlaceholder: 'Search stories, sources, companies…',
    signalScore: 'Signal score',
    hotNow: 'Hot now', hotSub: 'Multi-source coverage · heat decays over time', nSources: 'sources',
    alsoCovered: 'Also covered by',
    whyMatters: 'Why it matters', readOriginal: 'Read original',
    save: 'Save story', unsave: 'Remove bookmark', saveHint: 'Save story (stored in this browser)',
    savedNote: "Bookmarks are stored locally in this browser — no account needed. They won't follow you to another device or browser, and clearing site data removes them.",
    today: 'Today', yesterday: 'Yesterday', older: 'Earlier this week',
    storyOne: 'story', storyMany: 'stories',
    emptySearch: 'No stories match', emptySaved: 'Nothing saved yet — tap the bookmark icon on any story.',
    emptyDaily: 'No stories from yesterday yet — check back after the 7am cron.', emptyNone: 'No stories yet.',
    yesterdaySignal: "Yesterday's signal", todaysSignal: "Today's Signal", categoryPulse: 'Category pulse',
    dailyLeadA: 'PT stories across', dailyLeadB: 'specialties yesterday. Top signal:',
    'kind.journals': 'Journals & Research', 'kind.assoc': 'Associations & Regulators', 'kind.industry': 'Industry News & Platforms',
    'kindL.journal': 'Journal', 'kindL.database': 'Database', 'kindL.preprint': 'Preprint', 'kindL.association': 'Association',
    'kindL.regulator': 'Regulator', 'kindL.news': 'News', 'kindL.platform': 'Platform',
    latest: 'Latest',
    errTitle: "Couldn't load the feed",
    errBody: "The news data didn't come through — this is usually a flaky connection rather than anything on our end.",
    tryAgain: 'Try again',
  },
  zh: {
    'nav.curated': '精选', 'nav.all': '全部', 'nav.daily': '每日简报', 'nav.saved': '收藏', 'nav.sources': '信源',
    'navS.curated': '精选', 'navS.all': '全部', 'navS.daily': '简报', 'navS.saved': '收藏', 'navS.sources': '信源',
    'sub.curated': 'AI 精选 PT 信号 · 每日更新', 'sub.all': '全部信源的完整信息流',
    'sub.daily': '昨日要闻，按八个专科打包', 'sub.saved': '已收藏 · 仅存于当前浏览器',
    'sub.sources': 'Cadence 监测的信源',
    searchPlaceholder: '搜索文章、信源、机构…',
    signalScore: '信号分',
    hotNow: '当前热点', hotSub: '多源报道 · 热度随时间衰减', nSources: '个来源',
    alsoCovered: '同题报道',
    whyMatters: '为什么重要', readOriginal: '阅读原文',
    save: '收藏', unsave: '取消收藏', saveHint: '收藏（仅存于当前浏览器）',
    savedNote: '收藏保存在当前浏览器本地，无需账号——但不会同步到其他设备或浏览器，清除站点数据后会丢失。',
    today: '今天', yesterday: '昨天', older: '本周早些时候',
    storyOne: '条', storyMany: '条',
    emptySearch: '没有匹配的文章：', emptySaved: '还没有收藏——点击任意卡片上的书签图标。',
    emptyDaily: '昨天还没有文章——每日抓取（北京时间 15 点）后再来看看。', emptyNone: '暂无文章。',
    yesterdaySignal: '昨日信号', todaysSignal: '今日信号', categoryPulse: '分类脉搏',
    dailyLeadA: '条 PT 资讯，覆盖', dailyLeadB: '个专科。最高信号：',
    'kind.journals': '期刊与研究', 'kind.assoc': '学会与监管', 'kind.industry': '行业新闻与平台',
    'kindL.journal': '期刊', 'kindL.database': '数据库', 'kindL.preprint': '预印本', 'kindL.association': '学会',
    'kindL.regulator': '监管', 'kindL.news': '新闻', 'kindL.platform': '平台',
    latest: '最新',
    errTitle: '加载失败',
    errBody: '新闻数据没有加载成功——通常是网络抖动，不是站点的问题。',
    tryAgain: '重试',
  },
};

window.CD_LANG = (() => {
  try {
    const v = localStorage.getItem('cd-lang');
    if (v === 'en' || v === 'zh') return v;
  } catch (e) { /* noop */ }
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
})();

window.CD_T = (key, fallback) =>
  (window.CD_DICT[window.CD_LANG] && window.CD_DICT[window.CD_LANG][key]) || window.CD_DICT.en[key] || fallback || key;

window.CD_SET_LANG = (lang) => {
  window.CD_LANG = lang;
  try { localStorage.setItem('cd-lang', lang); } catch (e) { /* noop */ }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
};

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
    // Bilingual content fields (cron-generated; may be absent on older items —
    // the display layer falls back to the original-language field).
    titleZh:     item.titleZh,
    summaryZh:   item.summaryZh,
    whyEn:       item.curatedReasonEn,
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
    const cdById = {};
    window.CD_STORIES.forEach((s) => { cdById[s.id] = s; });
    window.CD_HOT = (data.hotTopics || [])
      .map((t) => ({
        ...t,
        titleZh: t.titleZh || (cdById[t.id] && cdById[t.id].titleZh), // zh title via the representative story
        heat: t.sourceCount * Math.pow(0.5, Math.max(0, (Date.now() - new Date(t.publishedAt)) / 86400000) / 2),
      }))
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
