// GreenStack UI kit — main feed screen + composition root.
const { NewsCard, CategoryTabs, Button, Icon } = window;

// Day labels computed from real Date so they update with the calendar.
const _fmtDayLabel = (offset, prefix) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const dow = d.toLocaleDateString('en-US', { weekday: 'long' });
  const mon = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${prefix} — ${dow}, ${mon}`;
};
const DAY_LABELS = {
  today:     _fmtDayLabel(0, 'Today'),
  yesterday: _fmtDayLabel(1, 'Yesterday'),
  older:     'Earlier this week',
};

function FeedToolbar({ view, count }) {
  const meta = {
    curated: { title: 'Curated', sub: 'AI-selected ESG signal · updated 08:10' },
    all: { title: 'All stories', sub: 'Full firehose across every source' },
    daily: { title: 'Daily brief', sub: 'Yesterday, packaged into eight sections' },
    sources: { title: 'Sources', sub: 'Outlets GreenStack monitors' },
    saved: { title: 'Saved', sub: 'Stories you bookmarked' },
  }[view] || { title: 'Curated', sub: '' };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--text-3xl)', letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>{meta.title}</h1>
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-tertiary)' }}>{meta.sub}</p>
      </div>
      <span style={{ flex: 1 }} />
      <Button variant="ghost" size="sm" iconStart="arrow-down-wide-narrow">Signal score</Button>
    </div>
  );
}

// ── Sources directory view ──────────────────────────────────────────────────
// Auto-generated from window.GS_STORIES — no auth, no static config drift.
// Layout: 2-column grid of source cards, sorted by story count desc.
// Each card shows name, count, top categories covered (max 3), latest story
// title + relative time ago.

function relativeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function SourceCard({ source, onPick }) {
  const cats = source.cats.map((c) => window.getCategory ? window.getCategory(c) : { id: c, label: c, accent: 'electric' });
  return (
    <button type="button" onClick={onPick}
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'left', cursor: 'pointer', boxShadow: 'var(--shadow-xs)', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', background: `var(--cat-${cats[0]?.accent || 'electric'}-soft)`, color: `var(--cat-${cats[0]?.accent || 'electric'}-ink)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, flex: 'none' }}>{source.name[0]}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)', flex: 'none' }}>{source.count}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {cats.slice(0, 3).map((c) => (
          <span key={c.id} style={{ padding: '2px 7px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500, background: `var(--cat-${c.accent}-soft)`, color: `var(--cat-${c.accent}-ink)`, whiteSpace: 'nowrap' }}>{c.short || c.label}</span>
        ))}
      </div>
      {source.latest && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Latest · {relativeAgo(source.latest.publishedAt)}</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.4, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{source.latest.title}</span>
        </div>
      )}
    </button>
  );
}

function SourcesGrid({ stories, category, onPickSource }) {
  const bySource = {};
  stories.forEach((s) => {
    if (!bySource[s.source]) bySource[s.source] = { name: s.source, count: 0, catSet: {}, latest: null };
    const b = bySource[s.source];
    b.count++;
    b.catSet[s.category] = (b.catSet[s.category] || 0) + 1;
    if (!b.latest || (s.publishedAt && (!b.latest.publishedAt || s.publishedAt > b.latest.publishedAt))) b.latest = s;
  });
  const all = Object.values(bySource).map((b) => ({
    ...b,
    cats: Object.entries(b.catSet).sort((a, b2) => b2[1] - a[1]).map(([k]) => k),
  }));
  const filtered = category !== 'all' ? all.filter((s) => s.cats.includes(category)) : all;
  filtered.sort((a, b) => b.count - a.count);
  if (filtered.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>
        <Icon name="rss" size={28} style={{ color: 'var(--ink-300)', margin: '0 auto 10px' }} />
        <div>No sources yet — wait for the next 7am cron.</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {filtered.map((s) => <SourceCard key={s.name} source={s} onPick={() => onPickSource && onPickSource(s.name)} />)}
    </div>
  );
}

function FeedApp() {
  const [view, setView] = React.useState('curated');
  const [category, setCategory] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(null);

  const compact = view === 'all';
  const isDaily = view === 'daily';
  const isSources = view === 'sources';
  const q = query.trim().toLowerCase();

  // DigestRail "Today's Signal" handler — set selected state + smooth-scroll
  // the main feed to that card. Wrapper divs around NewsCard carry the id.
  const scrollToStory = React.useCallback((id) => {
    setSelected(id);
    // give React one tick to flush selected-state class onto the card
    requestAnimationFrame(() => {
      const el = document.getElementById(`gs-card-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  // Source-of-truth filter — search + category narrowing applies to every view.
  let stories = window.GS_STORIES.filter((s) => {
    if (category !== 'all' && s.category !== category) return false;
    if (q && !(s.title.toLowerCase().includes(q) || s.source.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q))) return false;
    return true;
  });

  // Daily brief = yesterday's edition. Excludes today (today still flows on
  // Curated). Falls back to "older" if no yesterday items present.
  if (isDaily) {
    const ydayItems = stories.filter((s) => s.day === 'yesterday');
    stories = ydayItems.length ? ydayItems : stories.filter((s) => s.day === 'older' || s.day === 'yesterday');
  }

  // Curated / All grouping = by day (today / yesterday / older).
  // Daily brief grouping  = by category (one section per ESG cat in CATEGORIES order),
  //                         within each section sorted by score desc, capped to 5.
  const dayBuckets = ['today', 'yesterday', 'older'];
  const groupedByDay = dayBuckets
    .map((d) => ({ key: d, label: DAY_LABELS[d], items: stories.filter((s) => s.day === d) }))
    .filter((g) => g.items.length);

  const CATS = window.CATEGORIES || [];
  const groupedByCat = CATS
    .map((c) => ({
      key: c.id,
      label: c.label,
      icon: c.icon,
      accent: c.accent,
      items: [...stories.filter((s) => s.category === c.id)]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
    }))
    .filter((g) => g.items.length);

  const grouped = isDaily ? groupedByCat : groupedByDay;

  // Lead story = top-scoring in the first day-group, only on Curated view.
  // Daily brief intentionally has no lead — every section gets equal weight.
  const leadId = (!compact && !isDaily && grouped.length && grouped[0].items.length)
    ? [...grouped[0].items].sort((a, b) => b.score - a.score)[0].id : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
      <AppHeader query={query} onQuery={setQuery} />
      <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 24, padding: '0 24px' }}>
        <NavRail view={view} onView={setView} />

        <main style={{ flex: 1, minWidth: 0, maxWidth: 'var(--feed-column)', padding: '24px 0 64px' }}>
          <FeedToolbar view={view} count={isSources ? null : stories.length} />

          {/* Sources directory branch — short-circuits feed rendering */}
          {isSources && (
            <>
              <div style={{ position: 'sticky', top: 'var(--header-height)', zIndex: 10, padding: '10px 0', margin: '0 0 12px',
                background: 'linear-gradient(var(--surface-page) 72%, transparent)' }}>
                <CategoryTabs value={category} onChange={setCategory} />
              </div>
              <SourcesGrid stories={window.GS_STORIES || []} category={category} onPickSource={(name) => { setView('all'); setQuery(name); }} />
            </>
          )}

          {/* Daily brief editorial lead — fixed copy until Critic generates one per cron */}
          {!isSources && isDaily && grouped.length > 0 && (
            <div style={{ marginBottom: 24, padding: '18px 22px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--green-700)', marginBottom: 8 }}>Yesterday's signal</div>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                {stories.length} ESG stories across {grouped.length} sectors yesterday. Top signal: <em>{stories.length && [...stories].sort((a, b) => b.score - a.score)[0].title}</em>.
              </p>
            </div>
          )}

          {!isSources && (
            <div style={{ position: 'sticky', top: 'var(--header-height)', zIndex: 10, padding: '10px 0', margin: '0 0 8px',
              background: 'linear-gradient(var(--surface-page) 72%, transparent)' }}>
              <CategoryTabs value={category} onChange={setCategory} />
            </div>
          )}

          {!isSources && grouped.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>
              <Icon name="search-x" size={28} style={{ color: 'var(--ink-300)', margin: '0 auto 10px' }} />
              <div>{q ? `No stories match “${query}”.` : (isDaily ? 'No stories from yesterday yet — check back after the 7am cron.' : 'No stories yet.')}</div>
            </div>
          )}

          {!isSources && grouped.map((g) => (
            <section key={g.key} style={{ marginBottom: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px' }}>
                {isDaily && g.accent && (
                  <span style={{ width: 8, height: 8, borderRadius: '999px', background: `var(--cat-${g.accent})`, flex: 'none' }} />
                )}
                {isDaily ? (
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{g.label}</span>
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{g.label}</span>
                )}
                <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{g.items.length} {g.items.length === 1 ? 'story' : 'stories'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {g.items.map((s) => (
                  <div key={s.id} id={`gs-card-${s.id}`} style={{ scrollMarginTop: 'calc(var(--header-height) + 16px)' }}>
                    <NewsCard
                      variant={s.id === leadId ? 'lead' : (compact ? 'compact' : 'default')}
                      category={s.category} score={s.score} source={s.source} time={s.time} date={s.date}
                      title={s.title} summary={s.summary} whyItMatters={compact ? null : s.why}
                      selected={selected === s.id}
                      onClick={() => setSelected(s.id)} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </main>

        {!isSources && (
          <DigestRail
            stories={window.GS_STORIES.filter((s) => s.day === (isDaily ? 'yesterday' : 'today'))}
            onPick={scrollToStory} />
        )}
      </div>
    </div>
  );
}

// Wait for news.json to load (via app.data.jsx's GS_DATA_READY promise) before
// first render so the feed doesn't flash empty. If app.data.jsx didn't expose a
// promise (older revisions), render immediately as a graceful fallback.
const _gsRender = () => ReactDOM.createRoot(document.getElementById('root')).render(<FeedApp />);
if (window.GS_DATA_READY && typeof window.GS_DATA_READY.then === 'function') {
  window.GS_DATA_READY.then(_gsRender);
} else {
  _gsRender();
}
