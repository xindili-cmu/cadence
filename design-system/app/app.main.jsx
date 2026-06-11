// Cadence UI kit — main feed screen + composition root.
const { NewsCard, CategoryTabs, Button, Icon } = window;

// Day labels computed per render — they follow both the calendar and the
// active language (locale-formatted dates).
const cdDayLabels = () => {
  const t = window.CD_T;
  const locale = window.CD_LANG === 'zh' ? 'zh-CN' : 'en-US';
  const fmt = (offset, key) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${t(key)} — ${d.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' })}`;
  };
  return { today: fmt(0, 'today'), yesterday: fmt(1, 'yesterday'), older: t('older') };
};

function FeedToolbar({ view, count }) {
  const t = window.CD_T;
  const id = ['curated', 'all', 'daily', 'saved', 'sources'].includes(view) ? view : 'curated';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--text-3xl)', letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>{t('nav.' + id)}</h1>
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-tertiary)' }}>{t('sub.' + id)}</p>
      </div>
      <span style={{ flex: 1 }} />
      <Button variant="ghost" size="sm" iconStart="arrow-down-wide-narrow">{t('signalScore')}</Button>
    </div>
  );
}

// ── Hot topics strip (当前热点) ──────────────────────────────────────────────
// Top of Curated only. Ranked by multi-source heat (computed in the cron:
// distinct-source count × time decay). Renders nothing on quiet days, so the
// page falls back to the pure timeline. Hover the source count to see who's
// covering the story; click scrolls to the card in the feed.

function HotTopicsStrip({ topics, onPick }) {
  const tr = window.CD_T; // `t` is taken by the topic loop variable below
  if (!topics || !topics.length) return null;
  return (
    <section style={{ marginBottom: 20, padding: '14px 18px 10px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--green-700)' }}>{tr('hotNow')}</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{tr('hotSub')}</span>
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {topics.map((t, i) => {
          const cat = window.getCategory ? window.getCategory(t.category) : null;
          return (
            <li key={t.id} style={{ borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
              <button type="button" onClick={() => onPick && onPick(t.id)}
                style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', padding: '8px 2px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: i === 0 ? 'var(--green-700)' : 'var(--text-tertiary)', flex: 'none', width: 14 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{window.CD_LANG === 'zh' ? (t.titleZh || t.title) : t.title}</span>
                {cat && <span style={{ flex: 'none', padding: '1px 7px', borderRadius: 'var(--radius-sm)', fontSize: 10.5, fontWeight: 500, background: `var(--cat-${cat.accent}-soft)`, color: `var(--cat-${cat.accent}-ink)`, whiteSpace: 'nowrap' }}>{cat.short || cat.label}</span>}
                <span title={(t.sources || []).join(' · ')}
                  style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px dotted var(--border-strong, var(--border-subtle))', cursor: 'help' }}>
                  {t.sourceCount} {tr('nSources')}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── Related coverage row (关联讨论) ──────────────────────────────────────────
// Other outlets reporting the same story — folded under the main card instead
// of appearing as duplicate cards. Hover a name to see that outlet's headline.

function RelatedRow({ related }) {
  if (!related || !related.length) return null;
  return (
    <div style={{ margin: '6px 6px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
      <span style={{ letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10 }}>{window.CD_T('alsoCovered')}</span>
      {related.map((r) => (
        <a key={r.source + r.sourceUrl} href={r.sourceUrl} target="_blank" rel="noopener noreferrer" title={r.title}
          onClick={(e) => e.stopPropagation()}
          style={{ color: 'var(--text-secondary)', textDecoration: 'none', borderBottom: '1px dotted var(--border-subtle)' }}>{r.source}</a>
      ))}
    </div>
  );
}

// ── Sources directory view ──────────────────────────────────────────────────
// Standing source wall: window.CD_SOURCES (app.data.jsx) is the canonical
// directory of monitored outlets; live counts / categories / latest story
// from CD_STORIES are merged on top by name. Outlets seen in the feed but
// not yet listed in the wall are appended so nothing is hidden.

function relativeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Real outlet favicon (Google s2 service) with letter-avatar fallback when the
// icon fails to load (offline, blocked, or no favicon published).
function SourceFavicon({ source, accent }) {
  const [failed, setFailed] = React.useState(false);
  const host = (source.domain || '').split('/')[0];
  if (failed || !host) {
    return (
      <span style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', background: `var(--cat-${accent}-soft)`, color: `var(--cat-${accent}-ink)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, flex: 'none' }}>{source.name[0]}</span>
    );
  }
  return (
    <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" width={22} height={22}
      onError={() => setFailed(true)}
      style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', background: 'var(--surface-page)', border: '1px solid var(--border-subtle)', objectFit: 'contain', flex: 'none', alignSelf: 'center' }} />
  );
}

function SourceCard({ source }) {
  const cats = source.cats.map((c) => window.getCategory ? window.getCategory(c) : { id: c, label: c, accent: 'electric' });
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'left', cursor: 'pointer', boxShadow: 'var(--shadow-xs)', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <SourceFavicon source={source} accent={cats[0]?.accent || 'practice'} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)', flex: 'none' }}>{source.count || '—'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)' }}>
        <span style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>{window.CD_T('kindL.' + source.kind, KIND_LABEL[source.kind] || 'Source')}</span>
        {source.regions && source.regions.length > 0 && <span>· {source.regions.join(' / ')}</span>}
        {source.domain && <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{source.domain}</span>}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {cats.slice(0, 3).map((c) => (
          <span key={c.id} style={{ padding: '2px 7px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500, background: `var(--cat-${c.accent}-soft)`, color: `var(--cat-${c.accent}-ink)`, whiteSpace: 'nowrap' }}>{c.short || c.label}</span>
        ))}
      </div>
      {source.latest && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{window.CD_T('latest')} · {relativeAgo(source.latest.publishedAt)}</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.4, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{source.latest.title}</span>
        </div>
      )}
    </a>
  );
}

// ── Suggest-a-source form ───────────────────────────────────────────────────
// Reader-submitted source suggestions, delivered to Cindy's inbox via
// Formspree (static site — no backend of our own). Vetted manually before
// being added to CD_SOURCES; the form promises review, not auto-listing.
const CD_SUGGEST_ENDPOINT = 'https://formspree.io/f/mlgkwdja';

function SuggestSourceForm() {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState('idle'); // idle | sending | sent | error
  const [form, setForm] = React.useState({ name: '', url: '', note: '', email: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim() && /^https?:\/\/.+\..+/.test(form.url.trim());

  async function submit(e) {
    e.preventDefault();
    if (!valid || status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch(CD_SUGGEST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ _subject: `Cadence source suggestion: ${form.name.trim()}`, ...form }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
    } catch (err) {
      console.error('[Cadence] suggestion submit failed:', err);
      setStatus('error');
    }
  }

  const label = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)' };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ border: '1px dashed var(--border-default)', background: 'transparent', borderRadius: 'var(--radius-lg)', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
        + Suggest a source · 推荐信源
      </button>
    );
  }

  if (status === 'sent') {
    return (
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
        Thanks — your suggestion was sent. We review every submission before adding it to the wall. 已收到，确认后会加入信源墙。
      </div>
    );
  }

  return (
    <form onSubmit={submit}
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-xs)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>Suggest a source</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>reviewed before listing · 审核后添加</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Source name *</span>
          <Input size="sm" value={form.name} onChange={set('name')} placeholder="e.g. JOSPT, 丁香园" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Official URL *</span>
          <Input size="sm" type="url" value={form.url} onChange={set('url')} placeholder="https://…" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Your email (optional)</span>
          <Input size="sm" type="email" value={form.email} onChange={set('email')} placeholder="for follow-up" />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={label}>Why it belongs here (optional)</span>
        <Input size="sm" value={form.note} onChange={set('note')} placeholder="What does it cover? Why is it credible?" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button type="submit" size="sm" disabled={!valid || status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Submit suggestion'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setStatus('idle'); }}>Cancel</Button>
        {status === 'error' && (
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--signal-down)' }}>Could not send — please try again.</span>
        )}
      </div>
    </form>
  );
}

function SourcesGrid({ stories }) {
  // Live stats keyed by extractDomain name
  const live = {};
  stories.forEach((s) => {
    if (!live[s.source]) live[s.source] = { count: 0, catSet: {}, latest: null };
    const b = live[s.source];
    b.count++;
    b.catSet[s.category] = (b.catSet[s.category] || 0) + 1;
    if (!b.latest || (s.publishedAt && (!b.latest.publishedAt || s.publishedAt > b.latest.publishedAt))) b.latest = s;
  });
  const liveCats = (b) => Object.entries(b.catSet).sort((a, b2) => b2[1] - a[1]).map(([k]) => k);

  // The wall: curated directory only, live stats merged on. One-off domains
  // Exa surfaces still appear on their NewsCards, just not in this directory.
  const wall = (window.CD_SOURCES || []).map((src) => {
    const b = live[src.name];
    return {
      ...src,
      count: b ? b.count : 0,
      cats: b ? liveCats(b) : (src.cats || []),
      latest: b ? b.latest : null,
    };
  });

  // Group by outlet kind — the natural axis for a source wall
  const sections = KIND_SECTIONS
    .map((sec) => ({
      ...sec,
      items: wall.filter((s) => sec.kinds.includes(s.kind))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }))
    .filter((sec) => sec.items.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {sections.map((sec) => (
        <section key={sec.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 10px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{window.CD_T('kind.' + sec.key, sec.label)}</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{sec.items.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {sec.items.map((s) => <SourceCard key={s.name} source={s} />)}
          </div>
        </section>
      ))}
      <SuggestSourceForm />
    </div>
  );
}

const KIND_SECTIONS = [
  { key: 'journals', label: 'Journals & Research', kinds: ['journal', 'database', 'preprint'] },
  { key: 'assoc', label: 'Associations & Regulators', kinds: ['association', 'regulator'] },
  { key: 'industry', label: 'Industry News & Platforms', kinds: ['news', 'platform'] },
];

const KIND_LABEL = {
  journal: 'Journal', database: 'Database', preprint: 'Preprint',
  association: 'Association', regulator: 'Regulator', news: 'News',
  platform: 'Platform',
};

function FeedApp() {
  const [view, setView] = React.useState('curated');
  const [category, setCategory] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(null);

  // Saved stories — full snapshots keyed by id, persisted to localStorage so
  // bookmarks survive reloads AND survive the story rotating out of news.json.
  // localStorage can throw (private browsing / disabled), so every touch is wrapped.
  const [savedMap, setSavedMap] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('cd-saved-v1') || '{}'); }
    catch (e) { return {}; }
  });
  const toggleSave = React.useCallback((story) => {
    setSavedMap((prev) => {
      const next = { ...prev };
      if (next[story.id]) delete next[story.id]; else next[story.id] = story;
      try { localStorage.setItem('cd-saved-v1', JSON.stringify(next)); } catch (e) { /* noop */ }
      return next;
    });
  }, []);

  // 中英切换 — setLang re-renders the tree; every component reads
  // CD_LANG / CD_T at render time, so the flip is instant and complete.
  const [lang, setLang] = React.useState(window.CD_LANG);
  const toggleLang = React.useCallback(() => {
    const next = window.CD_LANG === 'zh' ? 'en' : 'zh';
    window.CD_SET_LANG(next);
    setLang(next);
  }, []);
  const zh = lang === 'zh';
  const t = window.CD_T;

  // Localized display copy of a story — full separation (Cindy 2026-06-11,
  // final call after trying mixed): zh mode is all-Chinese (titleZh/summaryZh/
  // 中文 reason), en mode is all-English (title/summary/curatedReasonEn).
  // Missing bilingual fields fall back to the original language.
  const L = React.useCallback((s) => (zh
    ? { ...s, title: s.titleZh || s.title, summary: s.summaryZh || s.summary }
    : { ...s, why: s.whyEn || s.why }), [zh]);

  const DAY_LABELS = cdDayLabels();

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
  const matchesFilter = (s) => {
    if (category !== 'all' && s.category !== category) return false;
    // Search across both languages regardless of display language.
    if (q && !(`${s.title} ${s.titleZh || ''} ${s.source} ${s.summary || ''} ${s.summaryZh || ''}`.toLowerCase().includes(q))) return false;
    return true;
  };
  let stories = window.CD_STORIES.filter(matchesFilter);

  // Saved view = bookmarked stories. Entries still in the live feed render
  // fresh; bookmarks that have rotated out of news.json render from their
  // localStorage snapshot, bucketed under 'older'.
  if (view === 'saved') {
    const live = stories.filter((s) => savedMap[s.id]);
    const liveIds = new Set(window.CD_STORIES.map((s) => s.id));
    const ghosts = Object.values(savedMap)
      .filter((s) => !liveIds.has(s.id) && matchesFilter(s))
      .map((s) => ({ ...s, day: 'older' }));
    stories = [...live, ...ghosts];
  }

  // Daily brief = yesterday's edition. Excludes today (today still flows on
  // Curated). Falls back to "older" if no yesterday items present.
  if (isDaily) {
    const ydayItems = stories.filter((s) => s.day === 'yesterday');
    stories = ydayItems.length ? ydayItems : stories.filter((s) => s.day === 'older' || s.day === 'yesterday');
  }

  // Curated / All grouping = by day (today / yesterday / older).
  // Daily brief grouping  = by category (one section per PT cat in CATEGORIES order),
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
  const leadId = (!compact && !isDaily && view !== 'saved' && grouped.length && grouped[0].items.length)
    ? [...grouped[0].items].sort((a, b) => b.score - a.score)[0].id : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
      <AppHeader query={query} onQuery={setQuery} lang={lang} onLang={toggleLang} />
      <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 24, padding: '0 24px' }}>
        <NavRail view={view} onView={setView} />

        <main style={{ flex: 1, minWidth: 0, maxWidth: 'var(--feed-column)', padding: '24px 0 64px' }}>
          <FeedToolbar view={view} count={isSources ? null : stories.length} />

          {/* Sources directory branch — short-circuits feed rendering.
              No specialty tabs here: the wall groups by outlet kind instead. */}
          {isSources && (
            <SourcesGrid stories={window.CD_STORIES || []} />
          )}

          {/* Device-local storage disclosure — bookmarks live in this browser's
              localStorage: no account, no server, no sync. Shown on every visit
              to Saved so the boundary is never a surprise. */}
          {!isSources && view === 'saved' && (
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 16, padding: '10px 14px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              <Icon name="monitor-smartphone" size={15} style={{ color: 'var(--ink-300)', marginTop: 1, flex: 'none' }} />
              <span>{t('savedNote')}</span>
            </div>
          )}

          {/* Hot topics — Curated only, unfiltered view. Empty array = hidden. */}
          {!isSources && view === 'curated' && !q && category === 'all' && (
            <HotTopicsStrip topics={window.CD_HOT || []} onPick={scrollToStory} />
          )}

          {/* Daily brief editorial lead — fixed copy until Critic generates one per cron */}
          {!isSources && isDaily && grouped.length > 0 && (
            <div style={{ marginBottom: 24, padding: '18px 22px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--green-700)', marginBottom: 8 }}>{t('yesterdaySignal')}</div>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                {stories.length} {t('dailyLeadA')} {grouped.length} {t('dailyLeadB')} <em>{stories.length ? L([...stories].sort((a, b) => b.score - a.score)[0]).title : ''}</em>.
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
              <div>{q ? `${t('emptySearch')} “${query}”` : (view === 'saved' ? t('emptySaved') : isDaily ? t('emptyDaily') : t('emptyNone'))}</div>
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{g.items.length} {t(g.items.length === 1 ? 'storyOne' : 'storyMany')}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {g.items.map((raw) => {
                  // Render localized copy; bookmark the RAW story so the
                  // snapshot keeps both languages for later toggles.
                  const s = L(raw);
                  return (
                    <div key={s.id} id={`gs-card-${s.id}`} style={{ scrollMarginTop: 'calc(var(--header-height) + 16px)' }}>
                      <NewsCard
                        variant={s.id === leadId ? 'lead' : (compact ? 'compact' : 'default')}
                        category={s.category} score={s.score} source={s.source} sourceUrl={s.sourceUrl} time={s.time} date={s.date}
                        title={s.title} summary={s.summary} whyItMatters={compact ? null : s.why}
                        selected={selected === s.id}
                        saved={!!savedMap[s.id]} onToggleSave={() => toggleSave(raw)}
                        onClick={() => setSelected(selected === s.id ? null : s.id)} />
                      {!compact && <RelatedRow related={s.related} />}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </main>

        {!isSources && (() => {
          // Rail day: Daily-brief view pins yesterday; other views prefer today
          // but fall back to yesterday when today is still empty (e.g. before
          // the 15:00 Beijing crawl) so the rail never renders a hollow box.
          const todayRail = window.CD_STORIES.filter((s) => s.day === 'today');
          const railDay = (isDaily || !todayRail.length) ? 'yesterday' : 'today';
          const railStories = (railDay === 'today' ? todayRail : window.CD_STORIES.filter((s) => s.day === 'yesterday')).map(L);
          return <DigestRail stories={railStories} dayKey={railDay} onPick={scrollToStory} />;
        })()}
      </div>
    </div>
  );
}

// Data-load failure screen — rendered instead of FeedApp when app.data.jsx
// couldn't fetch news.json (CD_META.error set in its catch block). Retry is a
// plain reload: the site is static, so re-running the page IS the refetch
// (fetches already use cache:'no-store').
function LoadErrorScreen({ message }) {
  const t = window.CD_T;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-page)', padding: 24 }}>
      <div style={{ maxWidth: 380, textAlign: 'center' }}>
        <Icon name="cloud-off" size={32} style={{ color: 'var(--ink-300)', margin: '0 auto 14px' }} />
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          {t('errTitle')}
        </div>
        <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          {t('errBody')}
        </p>
        {message && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 18 }}>{message}</div>
        )}
        <Button iconStart="rotate-cw" onClick={() => window.location.reload()}>{t('tryAgain')}</Button>
      </div>
    </div>
  );
}

// Wait for news.json to load (via app.data.jsx's CD_DATA_READY promise) before
// first render so the feed doesn't flash empty. If app.data.jsx didn't expose a
// promise (older revisions), render immediately as a graceful fallback.
// Failure branch (CD_META.error) renders LoadErrorScreen instead of a feed that
// silently sits on the "Loading Cadence…" skeleton.
const _gsRender = () => ReactDOM.createRoot(document.getElementById('root')).render(
  window.CD_META && window.CD_META.error
    ? <LoadErrorScreen message={window.CD_META.error} />
    : <FeedApp />
);
if (window.CD_DATA_READY && typeof window.CD_DATA_READY.then === 'function') {
  window.CD_DATA_READY.then(_gsRender);
} else {
  _gsRender();
}
