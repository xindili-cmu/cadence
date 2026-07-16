// Cadence UI kit — main feed screen + composition root.
const { NewsCard, CategoryTabs, Button, Icon } = window;

// Day labels for the curated feed groups - static relative words (no dates) so
// they never disagree with the viewer's clock. Grouping is by INGESTION day
// (firstSeen, bucketed in Beijing - see cdDayBucket); the edition's one absolute
// date lives in the header. Cards still show their real publish date.
const cdDayLabels = () => {
  const zh = window.CD_LANG === 'zh';
  return {
    today: zh ? '今日收录' : "Today's Research",
    yesterday: zh ? '昨日收录' : 'Added yesterday',
    older: zh ? '更早收录' : 'Added earlier',
  };
};

function FeedToolbar({ view, count, sortBy = 'signal', onSort }) {
  const t = window.CD_T;
  const id = ['curated', 'all', 'daily', 'sources', 'about', 'feedback'].includes(view) ? view : 'curated';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--text-3xl)', letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>{t('nav.' + id)}</h1>
        {id !== 'daily' && (
          <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--text-tertiary)' }}>{t('sub.' + id)}</p>
        )}
      </div>
      <span style={{ flex: 1 }} />
      {(id === 'curated' || id === 'all') && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {/* Real sort toggle: Signal score ⇄ Most recent. (Was a dead button
              styled like a control but wired to nothing — 2026-07-16 review.)
              The SIGNAL explainer 'i' lives only on the score slider below now,
              so it isn't duplicated here. */}
          {['signal', 'recent'].map((k) => {
            const on = sortBy === k;
            return (
              <Button key={k} variant={on ? 'soft' : 'ghost'} size="sm"
                iconStart={k === 'signal' ? 'arrow-down-wide-narrow' : 'clock'}
                aria-pressed={on}
                onClick={() => onSort && onSort(k)}
                style={on ? undefined : { color: 'var(--text-tertiary)' }}>
                {t(k === 'signal' ? 'sort.signal' : 'sort.recent')}
              </Button>
            );
          })}
        </span>
      )}
    </div>
  );
}

// ── Content-type filter bar (内容类型) ───────────────────────────────────────
// The front filter axis: research / news / guideline / policy (tags[0]). Only 5
// values, so it never wraps. Specialty moved to the left rail (desktop) / the
// SpecialtySelect dropdown (mobile).
function TypeTabs({ value = 'all', onChange = () => {}, pool = [], className, style }) {
  const zh = (typeof window !== 'undefined' && window.CD_LANG === 'zh');
  // Counts from the CURRENT view's pool (curated = live feed, all = +archive),
  // by tags[0]. Content types are sparse by nature — guideline/news/policy can
  // be empty in the live feed after the US-industry-news source cull. An empty
  // tab that still looks clickable is the same "dead promise" as an empty
  // specialty tab, so zero-count types are hidden here (same honesty rule as
  // the specialty rail counts + sparse-specialty notice). 'all'/'research' are
  // the product's spine and always show; the selected tab always shows so a
  // ?type= deep-link stays visible and dismissable even when its pool is empty.
  const counts = {};
  for (const s of pool) { const k = (s.tags || [])[0]; if (k) counts[k] = (counts[k] || 0) + 1; }
  const defs = [
    ['all', zh ? '全部' : 'All', pool.length, true],
    ['research', zh ? '研究论文' : 'Research', counts.research || 0, true],
    ['news', zh ? '新闻' : 'News', counts.news || 0, false],
    ['guideline', zh ? '指南' : 'Guidelines', counts.guideline || 0, false],
    ['policy', zh ? '政策' : 'Policy', counts.policy || 0, false],
  ];
  const types = defs.filter(([id,, n, always]) => always || n > 0 || value === id);
  return (
    <div role="tablist" className={className} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', ...style }}>
      {types.map(([id, label, n]) => {
        const on = value === id;
        return (
          <button key={id} type="button" role="tab" aria-selected={on} onClick={() => onChange(id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 13px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap', cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: on ? 600 : 500,
            border: `1px solid ${on ? 'transparent' : 'var(--border-subtle)'}`,
            background: on ? 'var(--ink-900)' : 'var(--surface-card)',
            color: on ? 'var(--paper)' : 'var(--text-secondary)',
            transition: 'var(--transition-colors)',
          }}>
            {label}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
              color: on ? 'rgba(255,255,255,0.6)' : 'var(--ink-300)' }}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

// Mobile specialty picker — the left-rail specialty list has no home on small
// screens, so it folds into a native <select> (8 specialties + tech overlay).
function SpecialtySelect({ value = 'all', onChange = () => {} }) {
  const zh = (typeof window !== 'undefined' && window.CD_LANG === 'zh');
  const cats = window.CATEGORIES || [];
  const xcuts = window.XCUTS || [];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={zh ? '专科' : 'Specialty'} style={{
      flex: 'none', maxWidth: '48%', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-secondary)',
      padding: '7px 10px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-subtle)',
      background: 'var(--surface-card)', cursor: 'pointer',
    }}>
      <option value="all">{zh ? '全部专科' : 'All specialties'}</option>
      {/* Counts mirror the desktop NavRail — expectation-setting on mobile too. */}
      {cats.map((c, i) => {
        const n = (window.CD_STORIES || []).filter((s) => s.category === c.id).length;
        return <option key={c.id} value={c.id}>{String(i + 1).padStart(2, '0')} {window.catShort(c)} · {n}</option>;
      })}
      {xcuts.map((x) => {
        const n = (window.CD_STORIES || []).filter((s) => s[x.flag]).length;
        return <option key={x.id} value={x.id}>✦ {window.catShort(x)} · {n}</option>;
      })}
    </select>
  );
}

// ── Hot topics strip (当前热点) ──────────────────────────────────────────────
// Top of Curated only. Ranked by multi-source heat (computed in the cron:
// distinct-source count × time decay). Renders nothing on quiet days, so the
// page falls back to the pure timeline. Hover the source count to see who's
// covering the story; click scrolls to the card in the feed.

function HotTopicsStrip({ topics, onPick, mobile = false }) {
  const tr = window.CD_T; // `t` is taken by the topic loop variable below
  if (!topics || !topics.length) return null;
  return (
    <section style={{ marginBottom: 20, padding: mobile ? '14px 14px 10px' : '14px 18px 10px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--green-700)' }}>{tr('hotNow')}</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{tr('hotSub')}</span>
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {topics.map((t, i) => {
          const cat = window.getCategory ? window.getCategory(t.category) : null;
          // 'theme' = different papers sharing a sub-tag; 'story' = the same
          // story corroborated by ≥2 outlets. Old payloads lack `kind`, so
          // fall back to the presence of `tag` (theme topics always have one).
          const isTheme = (t.kind || (t.tag ? 'theme' : 'story')) === 'theme';
          const tip = isTheme && (t.members || []).length
            ? t.members.map((m) => `${m.source} — ${window.CD_LANG === 'zh' ? (m.titleZh || m.title) : (m.titleEn || m.title)}`).join('\n')
            : (t.sources || []).join(' · ');
          const idxEl = (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: i === 0 ? 'var(--green-700)' : 'var(--text-tertiary)', flex: 'none', width: 14 }}>{i + 1}</span>
          );
          // Theme phrase first (cron-generated themeZh/themeEn, 2026-07-08) —
          // a theme should read as a topic, not a truncated paper title.
          // Older payloads lack the phrase and fall back to the rep title.
          const titleEl = (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{window.CD_LANG === 'zh' ? (t.themeZh || t.titleZh || t.title) : (t.themeEn || t.titleEn || t.title)}</span>
          );
          const catEl = cat && (
            <span style={{ flex: 'none', padding: '1px 7px', borderRadius: 'var(--radius-sm)', fontSize: 10.5, fontWeight: 500, background: `var(--cat-${cat.accent}-soft)`, color: `var(--cat-${cat.accent}-ink)`, whiteSpace: 'nowrap' }}>{cat.short || cat.label}</span>
          );
          const metaEl = (
            <span title={tip}
              style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px dotted var(--border-strong, var(--border-subtle))', cursor: 'help' }}>
              {`${tr('themeHeat')}${t.tag ? ` · ${t.tag}` : ''} · ${t.sourceCount} ${tr('nOutlets')}`}
            </span>
          );
          return (
            <li key={t.id} style={{ borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
              {mobile ? (
                // Narrow screens: title gets the full width on line 1; the tag +
                // heat meta drop to a second, indented line so nothing truncates
                // against the right edge.
                <button type="button" onClick={() => onPick && onPick(t.id)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%', padding: '9px 2px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>{idxEl}{titleEl}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 24 }}>{catEl}{metaEl}</span>
                </button>
              ) : (
                <button type="button" onClick={() => onPick && onPick(t.id)}
                  style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', padding: '8px 2px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                  {idxEl}{titleEl}{catEl}{metaEl}
                </button>
              )}
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
// directory of monitored outlets; live counts / latest story from CD_STORIES
// are merged on top via wallSource (journal-attributed name). The wall shows
// the curated roster ONLY — one-off domains Exa surfaces still appear on
// their NewsCards, just not in this directory.

function relativeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Real outlet favicon, SELF-HOSTED under design-system/assets/favicons/<host>.png
// (fetched once by scripts/fetch-favicons.js — re-run it after adding sources).
// No runtime third-party request: google.com/s2 is unreachable for readers in
// China, who are a primary audience. Letter-avatar fallback when the local
// icon is missing or fails to load.
function SourceFavicon({ source, accent }) {
  const [failed, setFailed] = React.useState(false);
  const host = (source.domain || '').split('/')[0];
  if (failed || !host) {
    return (
      <span style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', background: `var(--cat-${accent}-soft)`, color: `var(--cat-${accent}-ink)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, flex: 'none' }}>{source.name[0]}</span>
    );
  }
  return (
    <img src={`design-system/assets/favicons/${host}.png`} alt="" width={22} height={22}
      onError={() => setFailed(true)}
      style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', background: 'var(--surface-page)', border: '1px solid var(--border-subtle)', objectFit: 'contain', flex: 'none', alignSelf: 'center' }} />
  );
}

// How each outlet is actually wired into the crawl (scripts/news-refresh.js):
// rss array → RSS poll · scrape array → page scrape · kind journal → PubMed
// leg (roster-filtered via journals.json) · kind database → the PubMed
// E-utilities API itself · everything else → daily domain-constrained Exa sweep.
function sourceChannel(src) {
  if (src.rss && src.rss.length) return 'rss';
  if (src.scrape && src.scrape.length) return 'scrape';
  if (src.kind === 'database') return 'api';
  if (src.kind === 'journal') return 'pubmed';
  return 'exa';
}

function SourceCard({ source }) {
  const t = window.CD_T;
  const cats = source.cats.map((c) => window.getCategory ? window.getCategory(c) : { id: c, label: c, accent: 'electric' });
  const ch = sourceChannel(source);
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'left', cursor: 'pointer', boxShadow: 'var(--shadow-xs)', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <SourceFavicon source={source} accent={cats[0]?.accent || 'practice'} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.name}</span>
        {/* Count = all-time archived stories (live + archive); '—' = none yet, title explains */}
        <span title={source.count > 0 ? `${source.count} · ${t('src.countTip')}` : t('src.noneYet')}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)', flex: 'none' }}>{source.count > 0 ? source.count : '—'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)' }}>
        <span style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>{window.CD_T('kindL.' + source.kind, KIND_LABEL[source.kind] || 'Source')}</span>
        {/* Ingestion-channel badge — how this outlet is wired (tooltip has the detail) */}
        <span title={t('src.chTip.' + ch)}
          style={{ padding: '1px 5px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--surface-page)', letterSpacing: '0.04em', flex: 'none' }}>{t('src.ch.' + ch)}</span>
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
// Feedback form shares the same Formspree project as source suggestions —
// zero extra setup. Submissions are told apart by their _subject line in the
// inbox. To split them into a dedicated inbox later, create a second Formspree
// form and point CD_FEEDBACK_ENDPOINT at its /f/<id> URL.
const CD_FEEDBACK_ENDPOINT = 'https://formspree.io/f/mlgkwdja';

function SuggestSourceForm() {
  const t = window.CD_T;
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
        {t('src.suggest.btn')}
      </button>
    );
  }

  if (status === 'sent') {
    return (
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
        {t('src.suggest.sent')}
      </div>
    );
  }

  return (
    <form onSubmit={submit}
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-xs)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{t('src.suggest.title')}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{t('src.suggest.review')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('src.suggest.name')} *</span>
          <Input size="sm" value={form.name} onChange={set('name')} placeholder={t('src.suggest.namePh')} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('src.suggest.url')} *</span>
          <Input size="sm" type="url" value={form.url} onChange={set('url')} placeholder="https://…" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('src.suggest.email')}</span>
          <Input size="sm" type="email" value={form.email} onChange={set('email')} placeholder={t('src.suggest.emailPh')} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={label}>{t('src.suggest.why')}</span>
        <Input size="sm" value={form.note} onChange={set('note')} placeholder={t('src.suggest.whyPh')} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button type="submit" size="sm" disabled={!valid || status === 'sending'}>
          {status === 'sending' ? t('src.suggest.sending') : t('src.suggest.send')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setStatus('idle'); }}>{t('src.suggest.cancel')}</Button>
        {status === 'error' && (
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--signal-down)' }}>{t('fb.error')}</span>
        )}
      </div>
    </form>
  );
}

// ── Feedback view ────────────────────────────────────────────────────────────
// Reader feedback, delivered via Formspree (CD_FEEDBACK_ENDPOINT). Cadence-native
// design — deliberately unlike the plain aihot box: a typed-note selector (pill
// chips in the NavRail active-state language) sets the _subject, then the detail
// box and an inline optional reply address. The char count is a quiet hint that
// only appears near the cap, not an always-on counter.
const CD_FEEDBACK_MAX = 2000;
const FB_KINDS = [
  { id: 'bug',     icon: 'bug' },
  { id: 'feature', icon: 'lightbulb' },
  { id: 'content', icon: 'book-open' },
  { id: 'other',   icon: 'smile' },
];

// ── SubscribeCard (订阅) ─────────────────────────────────────────────────────
// The retention surface: capture an email. Posts to the same Formspree inbox
// as feedback (kind:'subscribe') — no new backend. Channel links ride along
// for readers who live in WeChat/XHS instead of email.
// `compact` (2026-07-08 adversarial-review fix): a stacked, channels-row-free
// variant for the desktop right rail and the About page, where the full card's
// width/channel links don't fit. The feed-bottom card alone was buried under
// 75 cards — the one email入口 needs to live above the fold too.
function SubscribeCard({ onAbout, mobile, compact }) {
  const t = window.CD_T;
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState('idle'); // idle | sending | sent | error
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit(e) {
    e.preventDefault();
    if (!valid || status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch(CD_FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: 'Cadence subscribe',
          kind: 'subscribe',
          email: email.trim(),
          lang: window.CD_LANG,
          pageUrl: window.location.href,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
    } catch (err) {
      console.error('[Cadence] subscribe submit failed:', err);
      setStatus('error');
    }
  }

  // Compact: vertical stack sized for a ~300px column, no channels row
  // (the contexts it renders in already carry the channel links / QR codes).
  if (compact) {
    return (
      <section style={{ margin: '16px 0 0', padding: '16px 18px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--green-600)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <Icon name="radio" size={15} style={{ color: 'var(--green-600)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)' }}>{t('sub.title')}</span>
        </div>
        {status === 'sent' ? (
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--green-700)' }}>{t('sub.sent')}</p>
        ) : (
          <>
            <p style={{ margin: '0 0 10px', fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{t('sub.body')}</p>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input size="sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('sub.placeholder')} aria-label="Email" maxLength={200} />
              <Button type="submit" size="sm" iconStart="send" disabled={!valid || status === 'sending'}>
                {status === 'sending' ? t('sub.sending') : t('sub.cta')}
              </Button>
            </form>
            {status === 'error' && (
              <p style={{ margin: '8px 0 0', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--signal-down)' }}>{t('sub.error')}</p>
            )}
            {/* Privacy note — collecting clinician emails needs plain use/opt-out
                wording (2026-07-15 adversarial review). */}
            <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>{t('sub.privacy')}</p>
          </>
        )}
      </section>
    );
  }

  const chLink = { display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer' };
  return (
    <section style={{ margin: '10px 0 26px', padding: mobile ? '18px 16px' : '22px 24px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--green-600)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="radio" size={17} style={{ color: 'var(--green-600)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{t('sub.title')}</span>
      </div>
      {status === 'sent' ? (
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--green-700)' }}>{t('sub.sent')}</p>
      ) : (
        <>
          <p style={{ margin: '0 0 14px', fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{t('sub.body')}</p>
          <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 200px', minWidth: 180 }}>
              <Input size="sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('sub.placeholder')} aria-label="Email" maxLength={200} />
            </div>
            <Button type="submit" size="sm" iconStart="send" disabled={!valid || status === 'sending'}>
              {status === 'sending' ? t('sub.sending') : t('sub.cta')}
            </Button>
          </form>
          {status === 'error' && (
            <p style={{ margin: '8px 0 0', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--signal-down)' }}>{t('sub.error')}</p>
          )}
          {/* Privacy note — plain use/opt-out wording (2026-07-15 adversarial review). */}
          <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 11.5, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>{t('sub.privacy')}</p>
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{t('sub.channels')}</span>
        <button type="button" onClick={onAbout} style={chLink}>
          <Icon name="message-circle" size={13} /> {t('sub.wechat')}
        </button>
        <a href="https://xhslink.com/m/8LpaT1OLeDw" target="_blank" rel="noopener noreferrer" style={chLink}>
          <Icon name="book-open" size={13} /> {t('sub.xhs')}
        </a>
        <a href="/rss.xml" target="_blank" rel="noopener noreferrer" style={chLink}>
          <Icon name="rss" size={13} /> RSS
        </a>
      </div>
    </section>
  );
}

function FeedbackView() {
  const t = window.CD_T;
  const zh = window.CD_LANG === 'zh';
  const [kind, setKind] = React.useState(null);
  const [content, setContent] = React.useState('');
  const [contact, setContact] = React.useState('');
  const [status, setStatus] = React.useState('idle'); // idle | sending | sent | error
  const valid = content.trim().length > 0;
  const remaining = CD_FEEDBACK_MAX - content.length;

  async function submit(e) {
    e.preventDefault();
    if (!valid || status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch(CD_FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: kind ? `Cadence feedback · ${kind}` : 'Cadence feedback',
          kind: kind || null,
          content: content.trim(),
          contact: contact.trim() || null,
          pageUrl: window.location.href,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
    } catch (err) {
      console.error('[Cadence] feedback submit failed:', err);
      setStatus('error');
    }
  }

  const label = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)' };

  // Success — a "signal received" acknowledgement that leans on Cadence's own
  // signal vocabulary, with a left accent rule rather than a centered checkmark.
  if (status === 'sent') {
    return (
      <div style={{ maxWidth: 640, display: 'flex', gap: 16, alignItems: 'flex-start', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--green-600)', borderRadius: 'var(--radius-lg)', padding: '22px 24px', boxShadow: 'var(--shadow-xs)' }}>
        <Icon name="radio" size={22} style={{ color: 'var(--green-600)', flex: 'none', marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, lineHeight: 1.5, color: 'var(--text-primary)' }}>{t('fb.sent')}</p>
          <div style={{ marginTop: 14 }}>
            <Button size="sm" variant="ghost" iconStart="rotate-cw"
              onClick={() => { setContent(''); setContact(''); setKind(null); setStatus('idle'); }}>{t('fb.again')}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Typed-note selector — pill chips reuse the NavRail active-state look. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={label}>{t('fb.kindLabel')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FB_KINDS.map((k) => {
            const on = kind === k.id;
            return (
              <button key={k.id} type="button" onClick={() => setKind(on ? null : k.id)} aria-pressed={on}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px',
                  borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: on ? 600 : 500,
                  background: on ? 'var(--surface-active)' : 'var(--surface-card)',
                  border: `1px solid ${on ? 'var(--green-400)' : 'var(--border-default)'}`,
                  color: on ? 'var(--green-800)' : 'var(--text-secondary)',
                  transition: 'var(--transition-colors)',
                }}>
                <Icon name={k.icon} size={15} style={{ color: on ? 'var(--green-700)' : 'var(--text-tertiary)' }} />
                {t('fb.kind.' + k.id)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Details — a larger card-surfaced box; quiet char hint only near the cap. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>{t('fb.contentLabel')}</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={CD_FEEDBACK_MAX}
          rows={6}
          placeholder={t('fb.contentPlaceholder')}
          style={{
            width: '100%', resize: 'vertical', minHeight: 150, padding: '14px 15px',
            fontFamily: 'var(--font-sans)', fontSize: 14.5, lineHeight: 1.6, color: 'var(--text-primary)',
            background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
            outline: 'none', boxSizing: 'border-box', boxShadow: 'var(--shadow-xs)',
          }} />
        {remaining <= 200 && (
          <span style={{ alignSelf: 'flex-end', fontFamily: 'var(--font-mono)', fontSize: 11, color: remaining < 0 ? 'var(--signal-down)' : 'var(--text-tertiary)' }}>
            {zh ? `还可输入 ${remaining} 字` : `${remaining} characters left`}
          </span>
        )}
      </div>

      {/* Optional reply address + submit on one baseline-aligned row. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={label}>{t('fb.contactLabel')} <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-300)' }}>· {t('fb.optional')}</span></span>
          <Input size="sm" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t('fb.contactPlaceholder')} maxLength={200} />
        </div>
        <Button type="submit" iconStart="send" disabled={!valid || status === 'sending'}>
          {status === 'sending' ? t('fb.sending') : t('fb.send')}
        </Button>
      </div>
      {status === 'error' && (
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--signal-down)' }}>{t('fb.error')}</span>
      )}
    </form>
  );
}

// About view — static brand / mission / founder page. All copy lives in
// CD_DICT (about.*), so en/zh stay fully separated per the language-toggle
// rule. CTAs call onView() to hop to Sources / Feedback (which also rewrites
// the hash, keeping deep links intact).
// ── /about helpers ───────────────────────────────────────────────────────────
// Brand-mark motif (six skewed strokes) — a faint oversized texture.
function MetronomeMotif({ height = 320, color = 'var(--blue-600)', opacity = 0.06, style }) {
  const rects = [[664.6, 410, 40.5, 92], [745.6, 343, 42.5, 159], [832.5, 277, 42.6, 225], [930.0, 121, 46.7, 474], [1035.4, 344, 46.9, 158], [1128.9, 415, 39.9, 87]];
  const w = Math.round(height * 580 / 508);
  return (
    <svg width={w} height={height} viewBox="446 107 580 508" aria-hidden="true" style={{ display: 'block', opacity, ...style }}>
      <g transform="skewX(-22.490)" fill={color}>
        {rects.map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} />)}
      </g>
    </svg>
  );
}

// Section head — small blue eyebrow + large serif headline (editorial, no § rule).
function SectionHead({ eyebrow, headline, mobile }) {
  return (
    <div style={{ marginBottom: headline ? 40 : 24 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--blue-600)', marginBottom: headline ? 18 : 0 }}>{eyebrow}</div>
      {headline && (
        <h2 style={{ margin: 0, maxWidth: 880, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: mobile ? 'var(--text-2xl)' : 'var(--text-4xl)', lineHeight: 1.12, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{headline}</h2>
      )}
    </div>
  );
}

function AboutView({ onView, mobile }) {
  const t = window.CD_T;
  const zh = window.CD_LANG === 'zh';
  const srcCount = (window.CD_SOURCES || []).length || 40;
  const tt = (a, b) => (zh ? a : b);

  const para = { margin: '0 0 16px', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', lineHeight: 1.85, color: 'var(--text-secondary)' };
  const secTitle = { margin: '0 0 18px', fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 600, color: 'var(--text-primary)' };
  const h2 = { margin: '0 0 22px', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' };
  const stats = [
    { v: '50', l: tt('证据来源', 'Sources') },
    { v: '8', l: tt('临床专科', 'Specialties') },
    { v: tt('3 档', '3 tiers'), l: tt('SIGNAL 信号档', 'SIGNAL rating') },
    { v: tt('每日', 'Daily'), l: tt('更新', 'Updated') },
  ];

  // §02 step demos
  const stepDemo = (which) => {
    if (which === 'sources') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {window.ABOUT.sources.slice(0, 6).map((s) => (
            <span key={s.name} title={s.name} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <img src={'design-system/assets/favicons/' + s.favicon} alt="" width="22" height="22" style={{ borderRadius: 4 }} />
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)' }}>+ {tt('30 余种', '30 more')}</span>
        </div>
      );
    }
    if (which === 'signal') {
      const tiers = [['≥ 85', tt('强信号', 'Strong signal'), 'var(--signal-high)'], ['75–84', tt('值得关注', 'Worth knowing'), 'var(--signal-mid)'], ['65–74', tt('参考', 'For reference'), 'var(--signal-low)']];
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          {/* Demo score matches the real ceiling of the current distribution
              (85) — a 90s demo would promise a tier the feed never shows. */}
          <window.SignalScore score={85} variant="block" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tiers.map(([r, label, c]) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 4, height: 14, borderRadius: 2, background: c, flex: 'none' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600, color: c, minWidth: 50 }}>{r}</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <window.CategoryTag category="orthopedic" withIndex />
          <window.CategoryTag category="neurological" withIndex />
          <window.CategoryTag category="sports" withIndex />
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '14px 16px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--blue-600)', borderRadius: 'var(--radius-md)' }}>
          <Icon name="stethoscope" size={18} style={{ color: 'var(--blue-600)', marginTop: 2 }} />
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', fontWeight: 600, letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--blue-600)', marginBottom: 4 }}>{tt('为什么重要', 'Why it matters')}</div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-primary)', maxWidth: 340 }}>{tt('优先采用渐进式负荷训练，而非被动疗法。', 'Prioritise progressive loading over passive modalities.')}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: mobile ? 'var(--space-14, 56px)' : 'var(--space-24)' }}>
      <style>{`
        .cd-about-cols{display:grid;grid-template-columns:1fr 1fr;gap:40px}
        .cd-about-step{display:grid;grid-template-columns:300px 1fr;gap:48px;align-items:center;padding:40px 0;border-top:1px solid var(--border-subtle)}
        .cd-about-tax{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
        .cd-about-srcwrap{display:grid;grid-template-columns:1.4fr 1fr;gap:56px}
        .cd-about-srcgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
        .cd-about-aud{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--border-subtle);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden}
        @media (max-width:860px){.cd-about-cols{grid-template-columns:1fr;gap:18px}.cd-about-step{grid-template-columns:1fr;gap:18px;align-items:flex-start}.cd-about-srcwrap{grid-template-columns:1fr;gap:32px}}
      `}</style>

      {/* Hero — masthead rule + big headline + lead + instrument stats */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingTop: mobile ? 4 : 8, paddingBottom: 'var(--space-5, 20px)', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
          <span style={{ color: 'var(--blue-600)', fontWeight: 600 }}>{tt('关于 · 步频', 'About · Cadence')}</span>
          <span>{tt('临床证据情报 · 每日更新', 'Clinical evidence intelligence · daily')}</span>
        </div>
        <section style={{ position: 'relative', overflow: 'hidden', paddingTop: mobile ? 'var(--space-10)' : 'var(--space-16)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', top: 0, right: -120, pointerEvents: 'none' }}>
            <MetronomeMotif height={460} opacity={0.05} />
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 500, letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{tt('我们是谁 / 为什么', 'Who we are / why')}</div>
            <h1 style={{ margin: '20px 0 0', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'clamp(32px, 5.5vw, 56px)', lineHeight: 1.12, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
              {zh
                ? <span>打破认知断代，<br />跟上全球证据的<span style={{ color: 'var(--blue-600)' }}>步频</span>。</span>
                : <span>Close the knowledge gap.<br />Keep pace with <span style={{ color: 'var(--blue-600)' }}>global evidence.</span></span>}
            </h1>
            <div style={{ margin: '28px 0 0', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: mobile ? 'var(--text-md)' : 'var(--text-lg)', lineHeight: 'var(--leading-relaxed)', color: 'var(--text-secondary)' }}>
                {tt('今天，国际上的康复医学正在以周为单位快速进化。然而在国内，我们教材上的理论、临床上的手段，很多还停留在 10 年、甚至 20 年前的框架里。我们不是不想追最新的技术，而是隔着信息差的壁垒，根本不知道外面已经进化到了哪里。',
                  'Worldwide, rehabilitation medicine now evolves by the week. Yet much of the textbook theory and clinical practice we rely on is still framed by ideas from 10 or even 20 years ago. It isn’t that we don’t want the latest; the information gap leaves us unsure how far the field has already moved.')}
              </p>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: mobile ? 'var(--text-lg)' : 'var(--text-xl)', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                {tt('知识的断代，最终由患者的疗效买单。', 'A knowledge gap is ultimately paid for in patient outcomes.')}
              </p>
              <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: mobile ? 'var(--text-md)' : 'var(--text-lg)', lineHeight: 'var(--leading-relaxed)', color: 'var(--text-secondary)' }}>
                {tt('每天，步频从全球 50 个顶级信源中，高频筛选最新的康复研究与临床技术。我们用 AI 为每项发现打出 SIGNAL 评分，并归入八大专科。',
                  'Every day, Cadence high-frequency-screens the newest rehab research and clinical techniques from 50 top sources worldwide, scores each finding with an AI SIGNAL rating, and files it into eight specialties.')}
              </p>
              <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: mobile ? 'var(--text-md)' : 'var(--text-lg)', lineHeight: 'var(--leading-relaxed)', color: 'var(--text-secondary)' }}>
                {tt('每天 5 分钟，把全球最新的临床证据，变成你推开诊室大门、面对患者时最硬核的知识武装。',
                  'Five minutes a day turns the world’s newest clinical evidence into the knowledge you carry through the clinic door, in front of your patient.')}
              </p>
            </div>
          </div>
        </section>
        <div style={{ marginTop: mobile ? 'var(--space-10)' : 'var(--space-16)', display: 'flex', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
          {stats.map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '24px 4px', borderLeft: i ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)', fontWeight: 600, color: 'var(--blue-600)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* §01 缘起 — hook + founder story (kept), signed off */}
      <section>
        <SectionHead mobile={mobile} eyebrow={tt('缘起', 'Why Cadence')} />
        <blockquote style={{ margin: '0 0 40px', maxWidth: 760, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'clamp(28px, 3.6vw, 44px)', lineHeight: 1.32, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
          {zh ? (
            <React.Fragment>全球每周数百篇康复研究，<br />没人能全部读完——<br /><span style={{ color: 'var(--text-tertiary)' }}>但不读，技术就停在过去。</span></React.Fragment>
          ) : (
            <React.Fragment>Hundreds of rehab studies, worldwide,<br />more than anyone can read —<br /><span style={{ color: 'var(--text-tertiary)' }}>read none, and you stay in the past.</span></React.Fragment>
          )}
        </blockquote>
        <div style={{ maxWidth: 680 }}>
          <p style={{ ...para }}>{t('about.why.p1')}</p>
          <p style={{ ...para }}>{t('about.why.p2')}</p>
          <p style={{ ...para, marginBottom: 0 }}>{t('about.why.p3')}</p>
        </div>
        <div style={{ marginTop: 14, fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontStyle: 'italic', color: 'var(--text-tertiary)' }}>{zh ? '— 步频团队' : '— The Cadence team'}</div>
      </section>

      {/* §02 方法 — three steps with live demos (incl. SIGNAL legend) */}
      <section>
        <SectionHead mobile={mobile} eyebrow={tt('方法', 'How it works')} headline={tt('从噪声里，捞出信号。', 'Signal, pulled from the noise.')} />
        <div>
          {window.ABOUT.steps.map((s, i) => (
            <div key={s.idx} className="cd-about-step" style={i === 0 ? { borderTop: 'none', paddingTop: 0 } : undefined}>
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 'var(--text-3xl)', color: 'var(--blue-300)', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.idx}</span>
                <h3 style={{ margin: '12px 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)' }}>{tt(s.zh, s.en)}</h3>
                <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.7, color: 'var(--text-secondary)' }}>{tt(s.bodyZh, s.bodyEn)}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', minHeight: 110 }}>{stepDemo(s.demo)}</div>
            </div>
          ))}
        </div>

        {/* 评分方法与局限 — the honest fine print a skeptical clinician looks
            for before trusting a number (adversarial-review fix #3, 2026-07-01). */}
        <div style={{ marginTop: 36, maxWidth: 760, padding: '18px 20px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--blue-600)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', fontWeight: 600, letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--blue-600)', marginBottom: 10 }}>
            {tt('评分方法与局限', 'How scoring works — and its limits')}
          </div>
          <p style={{ margin: '0 0 10px', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
            {tt('SIGNAL 由 AI 阅读文献标题与摘要后，按固定维度评出：研究设计、样本量、效应量、期刊影响力。评估结果落在三个档位：85+ 强信号 · 75–84 值得关注 · 65–74 参考——档位是结论，数字只是档内的粗略位置，并非百分制精度。网站信息流为自动更新；每日对外推送（公众号 / 小红书 / LinkedIn）发布前由人工把关。',
              'SIGNAL is scored by AI from each paper’s title and abstract against fixed dimensions — study design, sample size, effect size, journal impact. Ratings land in three tiers: 85+ strong signal · 75–84 worth knowing · 65–74 for reference — the tier is the conclusion; the number is a rough position within it, not percent-scale precision. The site feed updates automatically; the daily posts we publish (WeChat / RedNote / LinkedIn) are human-checked before going out.')}
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
            {tt('两点局限请知悉：评分基于摘要而非全文，研究细节与局限以原文为准；分数不是研究质量认证，也不构成临床建议——请结合你的临床判断与患者的具体情况使用。',
              'Two limits to know: scoring reads the abstract, not the full text — details and limitations defer to the original paper; and a score is neither a quality certification nor a clinical recommendation — pair it with your own judgment and your patient’s context.')}
          </p>
        </div>

        {/* Privacy — collecting clinician emails needs a plain statement of use,
            processors, and opt-out (2026-07-15 adversarial review). */}
        <div style={{ marginTop: 16, maxWidth: 760, padding: '18px 20px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--border-strong, var(--border-default))', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', fontWeight: 600, letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
            {tt('隐私', 'Privacy')}
          </div>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
            {tt('订阅邮箱仅用于发送周报，经表单服务 Formspree 提交、由 Resend 发送，不用于其他用途、不出售或共享给广告方；退订即停。反馈内容仅用于改进 Cadence。联系：hello@incadencept.com',
              'Subscriber emails are used only to send the weekly digest — submitted via Formspree, delivered via Resend, never sold or shared with advertisers; unsubscribing stops everything. Feedback is used only to improve Cadence. Contact: hello@incadencept.com')}
          </p>
        </div>
      </section>

      {/* §03 专科体系 — one-line clinical scope per specialty */}
      <section>
        <SectionHead mobile={mobile} eyebrow={tt('专科体系', 'The taxonomy')} headline={tt('八个专科，各归其位。', 'Eight specialties, each in its place.')} />
        <p style={{ margin: '0 0 22px', maxWidth: 620, ...para, marginBottom: 22 }}>{tt('我们不做泛泛的「康复」标签。每项研究都归入一个具体专科，让你只读与自己相关的内容。', 'We don’t use a vague “rehab” label. Every study is filed into a specific specialty, so you read only what’s relevant to you.')}</p>
        <div className="cd-about-tax">
          {window.CATEGORIES.map((c, i) => {
            const solid = `var(--cat-${c.accent})`, soft = `var(--cat-${c.accent}-soft)`;
            const sc = window.ABOUT.scopes[c.id] || {};
            return (
              <div key={c.id} style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-xs)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 20, padding: '0 6px', background: solid, color: '#fff', borderRadius: 'var(--radius-xs)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-md)', background: soft }}>
                    <Icon name={c.icon} size={17} strokeWidth={2} style={{ color: solid }} />
                  </span>
                </div>
                <div style={{ margin: '16px 0 0', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>{zh ? (c.labelZh || c.label) : c.label}</div>
                <p style={{ margin: '8px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{tt(sc.zh, sc.en)}</p>
              </div>
            );
          })}
        </div>
        {(window.XCUTS || []).slice(0, 1).map((x) => {
          const sc = window.ABOUT.scopes['rehab-tech'] || {};
          return (
            <div key={x.id} style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'flex-start', background: 'var(--cat-tech-soft)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-md)', background: '#fff', flex: 'none' }}>
                <Icon name={x.icon} size={17} strokeWidth={2} style={{ color: 'var(--cat-tech)' }} />
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--text-lg)', color: 'var(--cat-tech-ink)' }}>✦ {zh ? (x.labelZh || x.label) : x.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--cat-tech)' }}>{tt('横切维度', 'Cross-cutting overlay')}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--cat-tech-ink)' }}>{tt(sc.zh, sc.en)}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* §04 来源与原则 */}
      <section>
        <SectionHead mobile={mobile} eyebrow={tt('来源与原则', 'Sources & principles')} headline={tt('可信的来源，透明的标准。', 'Credible sources, transparent standards.')} />
        <div className="cd-about-srcwrap">
          <div>
            <h3 style={secTitle}>{tt('我们读什么', 'What we read')}</h3>
            <div className="cd-about-srcgrid">
              {window.ABOUT.sources.map((s) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                  <img src={'design-system/assets/favicons/' + s.favicon} alt="" width="28" height="28" style={{ borderRadius: 6, flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{tt(s.zh, s.en)}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 14px', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>+ 40+</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>{tt('更多来源', 'more')}</span>
              </div>
            </div>
          </div>
          <div>
            <h3 style={secTitle}>{tt('我们的原则', 'Our principles')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {window.ABOUT.principles.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Icon name="check" size={18} strokeWidth={2.25} style={{ color: 'var(--blue-600)', marginTop: 2, flex: 'none' }} />
                  <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{tt(p.zh, p.en)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 适合谁 — audience strip */}
      <section>
        <SectionHead mobile={mobile} eyebrow={tt('适合谁', 'Who it’s for')} headline={zh
          ? <span>为<span style={{ color: 'var(--blue-600)' }}>现在、或将要</span>站在床旁的人而做。</span>
          : <span>Built for those at the bedside — <span style={{ color: 'var(--blue-600)' }}>now or one day</span>.</span>} />
        <div className="cd-about-aud">
          {window.ABOUT.audience.map((a, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 20px', background: 'var(--surface-card)' }}>
              <Icon name={a.icon} size={22} style={{ color: 'var(--blue-600)' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>{tt(a.zh, a.en)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA — the one dark surface */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--surface-inverse)', borderRadius: 'var(--radius-2xl)', padding: mobile ? '32px 24px' : '56px 56px' }}>
        <div aria-hidden="true" style={{ position: 'absolute', right: -60, bottom: -120, pointerEvents: 'none' }}><MetronomeMotif height={320} color="#FFFFFF" opacity={0.06} /></div>
        <div style={{ position: 'relative', maxWidth: 560 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-on-inverse)', fontSize: mobile ? 'var(--text-2xl)' : 'var(--text-3xl)', lineHeight: 1.15, letterSpacing: '-0.01em' }}>{tt('每天 5 分钟，跟上你专科的全部重要证据。', 'Five minutes a day. The evidence that matters, in your specialty.')}</h2>
          <div style={{ marginTop: 24, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => onView('curated')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: 'var(--blue-600)', color: '#fff', border: 'none', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 600, cursor: 'pointer' }}>
              {tt('开始阅读今日摘要', "Read today’s digest")} <Icon name="arrow-right" size={16} />
            </button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'rgba(250,250,246,0.55)' }}>{tt('中英双语 · 随时切换', 'Bilingual · switch anytime')}</span>
          </div>
        </div>
      </div>

      {/* Follow us — email first (2026-07-08 adversarial-review fix: this page
          previously offered EN visitors only WeChat/XHS QR codes — zero email
          capture on the About surface), then QR codes for RedNote + WeChat. */}
      <section>
        <h2 style={h2}><Icon name="qr-code" size={19} style={{ color: 'var(--blue-600)' }} />{zh ? '关注我们' : 'Follow us'}</h2>
        <div style={{ maxWidth: 420, margin: '0 0 26px' }}>
          <SubscribeCard compact />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 20 : 32 }}>
          {[
            { img: 'design-system/assets/social/xhs-qr.png', plat: zh ? '小红书' : 'RedNote', handle: 'in_cadence', href: 'https://xhslink.com/m/8LpaT1OLeDw', tip: zh ? '点击或扫码访问主页' : 'Tap or scan to open the profile' },
            { img: 'design-system/assets/social/wechat-qr.png', plat: zh ? '微信公众号' : 'WeChat', handle: 'Cadence 步频', tip: zh ? '微信扫码关注' : 'Scan in WeChat to follow' },
          ].map((q) => {
            const img = (
              <img src={q.img} alt={`${q.plat} QR`} width={148} height={148}
                style={{ width: 148, height: 148, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', background: '#fff', padding: 8, boxShadow: 'var(--shadow-xs)' }} />
            );
            return (
              <div key={q.plat} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: '1 1 160px', maxWidth: 210 }}>
                {q.href
                  ? <a href={q.href} target="_blank" rel="noopener noreferrer" style={{ lineHeight: 0 }}>{img}</a>
                  : img}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {q.href
                      ? <a href={q.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{q.plat}</a>
                      : q.plat}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>{q.handle}</div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', lineHeight: 1.5, color: 'var(--text-tertiary)', marginTop: 4 }}>{q.tip}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer — logo + tagline · contact · disclaimer fine print · copyright */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: mobile ? 28 : 40, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 340 }}>
            <window.Logo variant="lockup" height={22} />
            <p style={{ margin: '14px 0 0', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', letterSpacing: '0.02em', color: 'var(--text-tertiary)' }}>{tt('与证据保持同步', 'Keeping pace with the evidence')}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', fontWeight: 600, letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{tt('联系', 'Contact')}</span>
            <a href="mailto:hello@incadencept.com" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textDecoration: 'none' }}>hello@incadencept.com</a>
            <button type="button" onClick={() => onView('curated')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{tt('今日摘要', 'Today’s digest')}</button>
          </div>
        </div>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
          <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('about.disclaimer.title')}. </span>{t('about.disclaimer.body')}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingTop: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
          <span>© 2026 Cadence 步频</span>
          <span>incadencept.com</span>
        </div>
      </footer>
    </div>
  );
}

function SourcesGrid({ stories }) {
  const [srcSearch, setSrcSearch] = React.useState('');
  const [srcKind, setSrcKind] = React.useState('all');

  // Live stats keyed by wallSource — journal-attributed name from app.data.jsx
  // (PubMed-pipeline stories credit their journal's card, not "PubMed";
  // unmatched stories fall back to s.source).
  const live = {};
  stories.forEach((s) => {
    const key = s.wallSource || s.source;
    if (!live[key]) live[key] = { count: 0, catSet: {}, latest: null };
    const b = live[key];
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
      // Curated cats are the editorial truth — live cats only fill in when the
      // roster entry has none (a handful of live stories shouldn't redefine an
      // outlet's specialty positioning).
      cats: (src.cats && src.cats.length) ? src.cats : (b ? liveCats(b) : []),
      latest: b ? b.latest : null,
    };
  });

  // Apply search + kind filter before grouping
  const filteredWall = wall.filter((s) => {
    if (srcSearch) {
      const q = srcSearch.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.domain || '').toLowerCase().includes(q)) return false;
    }
    if (srcKind !== 'all') {
      const sec = KIND_SECTIONS.find((k) => k.key === srcKind);
      if (!sec || !sec.kinds.includes(s.kind)) return false;
    }
    return true;
  });

  // Group by outlet kind — the natural axis for a source wall
  const sections = KIND_SECTIONS
    .map((sec) => ({
      ...sec,
      items: filteredWall.filter((s) => sec.kinds.includes(s.kind))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }))
    .filter((sec) => sec.items.length);

  const kindPills = [
    { key: 'all', label: window.CD_T ? window.CD_T('kindFilter.all', 'All') : 'All' },
    ...KIND_SECTIONS.map((s) => ({ key: s.key, label: window.CD_T ? window.CD_T('kind.' + s.key, s.label) : s.label })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {/* Search input */}
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 140, maxWidth: 280 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none', lineHeight: 1 }}>
            <Icon name="search" size={13} />
          </span>
          <input
            type="search"
            placeholder={window.CD_T ? window.CD_T('sources.search', 'Search sources…') : 'Search sources…'}
            value={srcSearch}
            onChange={(e) => setSrcSearch(e.target.value)}
            style={{
              width: '100%', paddingLeft: 30, paddingRight: 10, height: 32,
              border: '1px solid var(--border-subtle)', borderRadius: 6,
              background: 'var(--surface-card)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>
        {/* Kind pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {kindPills.map((p) => (
            <button key={p.key} onClick={() => setSrcKind(p.key)} style={{
              padding: '4px 10px', borderRadius: 20, border: '1px solid',
              borderColor: srcKind === p.key ? 'var(--green-600)' : 'var(--border-subtle)',
              background: srcKind === p.key ? 'var(--green-50)' : 'transparent',
              color: srcKind === p.key ? 'var(--green-700)' : 'var(--text-secondary)',
              fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono)',
              fontWeight: srcKind === p.key ? 600 : 400, letterSpacing: '0.03em',
            }}>
              {p.label}
            </button>
          ))}
        </div>
        {/* Result count */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {filteredWall.length}
        </span>
      </div>

      {sections.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          {window.CD_T ? window.CD_T('sources.noMatch', 'No sources match') : 'No sources match'}
        </div>
      )}

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

// ── Daily edition view (网页日报) ────────────────────────────────────────────
// AIHOT-style fixed daily slices: one immutable edition per day written by
// scripts/daily-brief.js (briefs/daily/*.json), with an LLM editor's lead,
// category sections, flashes, footer stats, prev/next + archive navigation.
// Items are raw news.json snapshots → cdTransformItem → NewsCard, so editions
// keep rendering after the live feed rotates.

// ── Daily view editorial palette + helpers (ported 1:1 from the 2026-06 bundle)
// Two specialty palettes: card/row dots (saturated, on white) use the bundle
// `c` map; masthead dots (on navy) use a lighter set. Labels: full (cards/rows)
// vs short (masthead). scoreColor is the bundle's 3-tier ramp. Local to the
// daily view — the rest of the site keeps its token colors.
const DAILY_CARD_COLOR = { orthopedic: '#3D74B8', neurological: '#6B5BB5', sports: '#2E8B6E', 'manual-modality': '#C77D3A', cardiopulmonary: '#C2553F', pediatric: '#C75D8E', geriatric: '#7A8290', 'rehab-tech': '#7A8290', practice: '#7A8290' };
const DAILY_DOT_COLOR = { orthopedic: '#5E8FC4', neurological: '#9C8FD0', sports: '#5FA98C', 'manual-modality': '#D6A56B', cardiopulmonary: '#D2796A', pediatric: '#C99BD0', geriatric: '#9AA0A8', 'rehab-tech': '#9AA0A8', practice: '#9AA0A8' };
const DAILY_CAT_LABEL = { orthopedic: '骨科康复', neurological: '神经康复', sports: '运动康复', 'manual-modality': '手法与理疗', cardiopulmonary: '心肺康复', pediatric: '儿童康复', geriatric: '老年康复', 'rehab-tech': '康复科技', practice: '行业与执业' };
const DAILY_CAT_SHORT = { orthopedic: '骨科', neurological: '神经', sports: '运动', 'manual-modality': '手法', cardiopulmonary: '心肺', pediatric: '儿童', geriatric: '老年', 'rehab-tech': '科技', practice: '执业' };
const dailyCardColor = (c) => DAILY_CARD_COLOR[c] || '#7A8290';
const dailyDotColor = (c) => DAILY_DOT_COLOR[c] || '#9AA0A8';
// Bilingual: zh keeps the daily-specific wording above; en reuses the canonical
// labels from categories.js (window.getCategory) so the EN daily view never
// shows Chinese. getCategory returns the raw id for unknown ids (e.g. the
// rehab-tech overlay, which never appears as a daily section), so we fall back
// to the local map in that case rather than printing the id.
const dailyCatLabel = (c) => {
  if (window.CD_LANG !== 'zh' && window.getCategory) {
    const cat = window.getCategory(c);
    if (cat && cat.label && cat.label !== c) return cat.label;
  }
  return DAILY_CAT_LABEL[c] || c;
};
const dailyCatShort = (c) => {
  if (window.CD_LANG !== 'zh' && window.getCategory) {
    const cat = window.getCategory(c);
    if (cat && cat.short && cat.short !== c) return cat.short;
  }
  return DAILY_CAT_SHORT[c] || c;
};
const dailyScoreColor = (s) => (s >= 85 ? '#2A5894' : s >= 75 ? '#1B1E23' : '#9098A0');

// Meta line on every daily card: ● specialty / 信号分 score / SOURCE.
// `highlight` = the lead card's emphasised variant (brand-blue specialty, larger).
function DailyMeta({ s, zh, highlight }) {
  const sep = highlight ? '#CFCBBE' : '#D8D4C8';
  const catC = highlight ? '#3D74B8' : '#5A6068';
  const dotC = highlight ? '#3D74B8' : dailyCardColor(s.category);
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: highlight ? 11 : 9, fontFamily: 'var(--font-mono)', fontSize: highlight ? 13 : 12, letterSpacing: highlight ? '0.02em' : '0', color: highlight ? '#6A7078' : '#8A8F98', marginBottom: highlight ? 18 : 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: catC, whiteSpace: 'nowrap' }}>
        <span style={{ width: 7, height: 7, borderRadius: 2, background: dotC }} />{dailyCatLabel(s.category)}
      </span>
      <span style={{ color: sep }}>/</span>
      <span style={{ whiteSpace: 'nowrap' }}>{zh ? '信号分' : 'Signal'} <b style={{ fontWeight: 600, color: dailyScoreColor(s.score) }}>{s.score}</b></span>
      {highlight && s.studyDesign && (
        <React.Fragment>
          <span style={{ color: sep }}>/</span>
          <span style={{ whiteSpace: 'nowrap' }}>{zh ? s.studyDesign : (DAILY_STUDY_EN[s.studyDesign] || s.studyDesign)}</span>
        </React.Fragment>
      )}
      <span style={{ color: sep }}>/</span>
      <span style={{ textTransform: 'uppercase', letterSpacing: highlight ? '0.08em' : '0.06em', whiteSpace: 'nowrap' }}>{s.wallSource || s.source}</span>
    </div>
  );
}

// 临床底线 · Take — clinical bottom-line (curatedReason) + limitation line.
function DailyTake({ why, limitation, zh }) {
  if (!why) return null;
  return (
    <div style={{ marginTop: 24, background: '#F7F9FC', border: '1px solid #E8EDF4', borderRadius: 13, padding: '20px 22px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#2A5894', marginBottom: 11 }}>{zh ? '临床底线 · Take' : 'Clinical Take'}</div>
      <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.8, color: '#2B3138' }}>{why}</p>
      {limitation && (
        <React.Fragment>
          <div style={{ height: 1, background: '#E3E9F1', margin: '16px 0' }} />
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#6A7078' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', color: '#9AA0A8', marginRight: 8 }}>{zh ? '局限' : 'LIMIT'}</span>{limitation}
          </p>
        </React.Fragment>
      )}
    </div>
  );
}

// Section header — title (h3 or mono kicker) + optional English kicker +
// hairline rule + optional right-aligned "N 条" count. mb = margin-bottom.
function DailySectionHead({ title, engKicker, count, mono, mb = 14, zh }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: mb }}>
      {mono
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#3D74B8' }}>{title}</span>
        : <h3 style={{ margin: 0, fontWeight: 600, fontSize: 19, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{title}</h3>}
      {engKicker && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.05em', color: '#9AA0A8' }}>{engKicker}</span>}
      <span style={{ flex: 1, height: 1, background: '#E6E3D9' }} />
      {count != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#6A7078' }}>{count}{zh ? ' 条' : ''}</span>}
    </div>
  );
}

// Study-design controlled vocab → EN label for the meta line (zh shown as-is).
// The evidence tier (e.g. 系统综述) now lives in the featured card's meta row
// instead of a separate "为何上榜" line — no free-text reason field exists and
// we never fabricate one.
// Shared ZH→EN study-design map lives in app.data.jsx (window.CD_STUDY_EN);
// this alias keeps the daily brief's existing call sites unchanged.
const DAILY_STUDY_EN = window.CD_STUDY_EN || { '系统综述': 'Systematic review', '观察研究': 'Observational', '综述': 'Review', '述评': 'Editorial', 'RCT': 'RCT' };

function DailyMasthead({ edition, zh }) {
  const d = new Date(edition.date + 'T12:00:00Z');
  const dateStr = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
  const weekday = d.toLocaleDateString(zh ? 'zh-CN' : 'en-US', { weekday: 'short', timeZone: 'UTC' });
  const ORDER = { orthopedic: 0, neurological: 1, 'manual-modality': 2, cardiopulmonary: 3, sports: 4, pediatric: 5, geriatric: 6, 'rehab-tech': 7 };
  const dots = edition.sections
    .map((sec) => ({ cat: sec.category, label: dailyCatShort(sec.category), n: sec.items.length, color: dailyDotColor(sec.category) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => (ORDER[a.cat] ?? 99) - (ORDER[b.cat] ?? 99)); // fixed display order 骨科/神经/手法/心肺 (not a data change)
  return (
    <header style={{ position: 'relative', background: '#16314F', borderRadius: 18, padding: 'clamp(30px,5vw,48px)', marginBottom: 'clamp(40px,6vw,60px)', overflow: 'hidden' }}>
      <svg width="170" height="148" viewBox="446 107 580 508" aria-hidden="true" style={{ position: 'absolute', right: -20, bottom: -30, opacity: 0.12, pointerEvents: 'none' }}>
        <g transform="skewX(-22.490)" fill="#FFFFFF">
          <rect x="664.6" y="410" width="40.5" height="92" /><rect x="745.6" y="343" width="42.5" height="159" /><rect x="832.5" y="277" width="42.6" height="225" /><rect x="930.0" y="121" width="46.7" height="474" /><rect x="1035.4" y="344" width="46.9" height="158" /><rect x="1128.9" y="415" width="39.9" height="87" />
        </g>
      </svg>
      <div style={{ position: 'relative' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#8FB0D6', marginBottom: 18 }}>{zh ? '每日简报 · Daily Briefing' : 'Daily Briefing'}</div>
        <h2 style={{ margin: 0, fontFamily: "'Noto Serif SC', var(--font-display)", fontWeight: 900, fontSize: 'clamp(34px,6vw,56px)', lineHeight: 1.04, letterSpacing: '0.01em', color: '#FFFFFF' }}>{zh ? '今日康复信号' : "Today's Rehab Signal"}</h2>
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px 24px', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 13.5, color: '#AFC4DC' }}>
          {/* "本期/this edition", not "今日/today" — the edition is a relay
              window minus already-published dedup, so its count legitimately
              differs from the rail's calendar-day count (23 vs 19 confusion,
              2026-07-08 adversarial-review fix #9). */}
          <span style={{ whiteSpace: 'nowrap' }}>{dateStr}　{weekday}　· {zh ? '本期 ' : ''}<b style={{ color: '#fff', fontWeight: 600 }}>{edition.stats.events}</b>{zh ? ' 篇' : ' stories this edition'}</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {dots.map((x) => (
              <span key={x.cat} style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: x.color }} />{x.label} <b style={{ color: '#fff', fontWeight: 600 }}>{x.n}</b>
              </span>
            ))}
          </span>
        </div>
      </div>
    </header>
  );
}

// Specialty pulse — one quiet centered line of counts under the masthead
// (absorbed from the "signal terminal" direction; replaces the 4-cell stats grid).
function DailyPulse({ items }) {
  const counts = {};
  items.forEach((s) => { counts[s.category] = (counts[s.category] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center', marginBottom: 24, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)' }}>
      {entries.map(([c, n], i) => {
        const cat = window.getCategory ? window.getCategory(c) : null;
        const label = cat ? (window.CD_LANG === 'zh' ? (cat.short || cat.label) : (cat.shortEn || cat.short || cat.label)) : c;
        return (
          <React.Fragment key={c}>
            {i > 0 && <span style={{ color: 'var(--border-default)' }}>·</span>}
            <span>{cat && window.catLabel ? window.catLabel(cat) : label} <b style={{ color: 'var(--text-primary)' }}>{n}</b></span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DailyArchiveList({ editions, current, onPick }) {
  const t = window.CD_T;
  const zh = window.CD_LANG === 'zh';
  const locale = zh ? 'zh-CN' : 'en-US';
  return (
    <div style={{ marginTop: 14, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{t('daily.archiveTitle')}</div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {editions.map((e, i) => {
          const on = e.date === current;
          const d = new Date(e.date + 'T12:00:00Z');
          return (
            <li key={e.date} style={{ borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
              <button type="button" onClick={() => onPick(e.date)} disabled={on}
                style={{ display: 'flex', alignItems: 'baseline', gap: 12, width: '100%', padding: '10px 16px', background: on ? 'var(--surface-active)' : 'none', border: 'none', cursor: on ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                <span style={{ flex: 'none', width: 86, fontFamily: 'var(--font-mono)', fontSize: 12, color: on ? 'var(--green-800)' : 'var(--text-secondary)' }}>
                  {d.toLocaleDateString(locale, { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' })}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: on ? 600 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {zh ? (e.leadTitleZh || e.leadTitle) : (e.leadTitle || e.leadTitleZh)}
                </span>
                <span style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{e.events} {t('daily.eventsN')}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Right-rail edition archive (replaces 昨日信号/分类脉搏 on the daily view —
// Cindy 2026-06-12, AIHOT-archive style): a "latest edition" box on top, then
// past editions grouped by month, date + lead title per row.
function DailyArchiveRail({ current, onPick }) {
  const t = window.CD_T;
  const zh = window.CD_LANG === 'zh';
  const [editions, setEditions] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    window.CD_LOAD_DAILY_INDEX().then((eds) => { if (alive) setEditions(eds); });
    return () => { alive = false; };
  }, []);
  if (!editions || !editions.length) return <aside style={{ width: 'var(--rail-right)', flex: 'none' }} />;

  const latest = editions[0];
  const months = [];
  editions.forEach((e) => {
    const key = e.date.slice(0, 7);
    let m = months[months.length - 1];
    if (!m || m.key !== key) { m = { key, items: [] }; months.push(m); }
    m.items.push(e);
  });
  const monthLabel = (key) => zh
    ? `${key.slice(0, 4)} 年 ${+key.slice(5)} 月`
    : new Date(key + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const leadOf = (e) => (zh ? (e.leadTitleZh || e.leadTitle) : (e.leadTitle || e.leadTitleZh)) || '';

  return (
    <aside style={{ width: 'var(--rail-right)', flex: 'none', padding: '20px 0 40px 22px', position: 'sticky', top: 'var(--header-height)', alignSelf: 'flex-start', minHeight: 'calc(100vh - var(--header-height))', maxHeight: 'calc(100vh - var(--header-height))', overflowY: 'auto', borderLeft: '1px solid var(--border-subtle)' }}>
      <button type="button" onClick={() => onPick(latest.date)}
        style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '14px 16px', marginBottom: 16, background: current === latest.date ? '#EEF3FA' : 'var(--surface-card)', border: '1.5px solid #3D74B8', borderRadius: 'var(--radius-lg)', fontFamily: 'var(--font-sans)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#16314F' }}>{t('daily.latestIssue')}</div>
        <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{latest.date}</div>
      </button>

      {months.map((m) => (
        <div key={m.key} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{monthLabel(m.key)}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{m.items.length}</span>
          </div>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {m.items.map((e, i) => {
              const on = e.date === current;
              return (
                <button key={e.date} type="button" onClick={() => onPick(e.date)}
                  style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', cursor: on ? 'default' : 'pointer', padding: '9px 12px', background: on ? '#EEF3FA' : 'none', border: 'none', borderTop: i ? '1px solid var(--border-subtle)' : 'none', fontFamily: 'var(--font-sans)' }}>
                  <span style={{ flex: 'none', width: 38, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: on ? '#3D74B8' : 'var(--text-tertiary)', paddingTop: 1 }}>
                    {zh ? `${+e.date.slice(8)} 日` : e.date.slice(8)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, fontWeight: on ? 600 : 400, color: 'var(--text-primary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{leadOf(e)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

function DailyBriefView({ L, date, onDate, mobile }) {
  const t = window.CD_T;
  const zh = window.CD_LANG === 'zh';
  const [editions, setEditions] = React.useState(null); // null = manifest loading
  const [edition, setEdition] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [showArchive, setShowArchive] = React.useState(false);
  const [selected, setSelected] = React.useState(null); // expanded tier-3 row
  const [copied, setCopied] = React.useState(false);

  // Date state lives in FeedApp so the right-rail archive (DailyArchiveRail)
  // and this view stay in sync; default to the latest edition once the
  // manifest arrives.
  React.useEffect(() => {
    let alive = true;
    window.CD_LOAD_DAILY_INDEX().then((eds) => {
      if (!alive) return;
      setEditions(eds);
      if (eds.length) { if (!date) onDate(eds[0].date); } else setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    if (!date) return;
    let alive = true;
    setLoading(true);
    window.CD_LOAD_DAILY(date).then((ed) => {
      if (!alive) return;
      setEdition(ed);
      setLoading(false);
      window.scrollTo({ top: 0 });
    });
    return () => { alive = false; };
  }, [date]);

  // Manifest empty → no editions generated yet (pre-first-cron state).
  if (editions !== null && !editions.length) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>
        <Icon name="newspaper" size={28} style={{ color: 'var(--ink-300)', margin: '0 auto 10px' }} />
        <div>{t('daily.empty')}</div>
      </div>
    );
  }

  if (loading || !edition) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
        <Icon name="loader-circle" size={13} style={{ color: 'var(--ink-300)' }} />
        <span>{t('daily.loading')}</span>
      </div>
    );
  }

  const pos = editions ? editions.findIndex((e) => e.date === date) : -1;
  const prevEd = pos >= 0 && pos < editions.length - 1 ? editions[pos + 1] : null;
  const nextEd = pos > 0 ? editions[pos - 1] : null;

  // 晨间查房 tiering (Cindy 2026-06-12): organized by evidence/actionability,
  // not specialty — the axis AIHOT doesn't have. Tier 1 = top signal with its
  // clinical take; tier 2 = worth-knowing & up (score ≥ 75); tier 3 = compact
  // expandable rows. Driven entirely by curatedScore — no extra LLM call.
  const allItems = edition.sections.flatMap((sec) => sec.items).map(window.cdTransformItem);
  const ranked = [...allItems].sort((a, b) => b.score - a.score);
  // Lead = highest-scored PRIMARY EVIDENCE (or synthesis). Editorials /
  // commentaries / protocols keep their tier-2/3 spots but can't headline
  // "Only 5 minutes? Read this" (2026-07-08 adversarial-review fix).
  const leadRaw = ranked.find((s) => !window.cdIsNonEvidence(s.studyDesign)) || ranked[0] || null;
  const leadStory = leadRaw ? L(leadRaw) : null;
  const rest = ranked.filter((s) => s !== leadRaw);
  const tier2 = rest.filter((s) => s.score >= 75).map(L);
  const tier3 = rest.filter((s) => s.score < 75).map(L);
  const top3 = (leadRaw ? [leadRaw, ...rest] : rest).slice(0, 3).map(L);
  const [mm, dd] = edition.date.slice(5).split('-');
  const dShort = `${+mm}.${+dd}`;

  const copyShare = () => {
    const txt = `【Cadence步频 · ${dShort} 早班】${top3.length} 条 / 90 秒\n`
      + top3.map((s, n) => `${n + 1}. ${s.title}`).join('\n')
      + '\n全文与参考 → 公众号「Cadence步频」（小红书同名）';
    try {
      navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    } catch (e) { /* clipboard unavailable — noop */ }
  };

  const kicker = { fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' };
  const srcLine = (s) => (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
      {s.wallSource || s.source} · {t('signalScore')} {s.score} · <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)' }}>{t('readOriginal')} ↗</a>
    </div>
  );

  return (
    <div>
      <DailyMasthead edition={edition} zh={zh} />

      {/* Tier 1 — the one story worth 5 minutes, with its clinical take */}
      {leadStory && (
        <section style={{ marginBottom: 'clamp(48px,7vw,72px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#3D74B8', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3D74B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {zh ? '只有 5 分钟？读这条' : 'Only 5 minutes? Read this'}
            </span>
            <span style={{ flex: 1, height: 1, background: '#E6E3D9' }} />
          </div>
          <article style={{ background: '#FFFFFF', border: '1px solid #E6E3D9', borderRadius: 18, padding: 'clamp(24px,4.2vw,40px)', boxShadow: '0 1px 2px rgba(27,30,35,0.03), 0 18px 40px -28px rgba(27,30,35,0.22)' }}>
            <a href={leadStory.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <DailyMeta s={leadStory} zh={zh} highlight />
              <h3 style={{ margin: 0, fontWeight: 600, fontSize: 'clamp(22px,3.4vw,30px)', lineHeight: 1.28, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{leadStory.title}</h3>
              {leadStory.summary && <p style={{ margin: '16px 0 0', fontSize: 16.5, lineHeight: 1.78, color: '#43474E' }}>{leadStory.summary}</p>}
              <DailyTake why={leadStory.why} limitation={leadStory.limitation} zh={zh} />
            </a>
            <RelatedRow related={leadStory.related} />
          </article>
        </section>
      )}

      {/* Tier 2 — worth a closer read (score ≥ 75): 2-col cards with a
          left specialty color-bar (mixed in from the "信号墙" concept, 2026-06-22).
          Collapses to a single column on mobile. */}
      {tier2.length > 0 && (
        <section style={{ marginBottom: 'clamp(48px,7vw,72px)' }}>
          <DailySectionHead title={zh ? '值得细读' : 'Worth a closer read'} count={tier2.length} mb={22} zh={zh} />
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
            {tier2.map((s) => (
              <a key={s.id || s.sourceUrl} href={s.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ position: 'relative', display: 'block', textDecoration: 'none', color: 'inherit', background: '#FFFFFF', border: '1px solid #E6E3D9', borderRadius: 14, padding: '24px 24px 24px 26px', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: dailyCardColor(s.category) }} />
                <DailyMeta s={s} zh={zh} />
                <h4 style={{ margin: 0, fontWeight: 600, fontSize: 'clamp(17px,2.4vw,20px)', lineHeight: 1.4, letterSpacing: '-0.005em', color: 'var(--text-primary)' }}>{s.title}</h4>
                {s.summary && <p style={{ margin: '11px 0 0', fontSize: 15, lineHeight: 1.74, color: '#5A6068' }}>{s.summary}</p>}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Tier 3 — worth knowing: dense 2-col grid of compact cards (mixed in from
          the "信号墙" concept, 2026-06-22). score · specialty dot · 2-line title.
          Collapses to a single column on mobile. */}
      {tier3.length > 0 && (
        <section style={{ marginBottom: 'clamp(48px,7vw,72px)' }}>
          <DailySectionHead title={zh ? '了解即可' : 'Worth knowing'} count={tier3.length} mb={14} zh={zh} />
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            {tier3.map((s) => (
              <a key={s.id || s.sourceUrl} href={s.sourceUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#FFFFFF', border: '1px solid #ECE9DF', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
                <span style={{ flexShrink: 0, width: 28, fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: dailyScoreColor(s.score) }}>{s.score}</span>
                <span title={dailyCatLabel(s.category)} style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 2, background: dailyCardColor(s.category) }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 1.5, color: '#262A30', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Flashes — overflow + uncategorized, one line each */}
      {edition.flashes && edition.flashes.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 10px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{t('daily.flashes')}</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {edition.flashes.map((f, i) => (
              <li key={f.sourceUrl || i} style={{ borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 14px', textDecoration: 'none', fontFamily: 'var(--font-sans)' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>{zh ? (f.titleZh || f.title) : (f.titleEn || f.title)}</span>
                  {/* Journal name over pipeline name — "PubMed" is not a journal
                      (2026-07-08 adversarial-review fix #10; old editions lack
                      journal and fall back to source). */}
                  <span style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{f.journal || f.source}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Handoff share card (交接班卡) — built to be screenshotted or copied
          into a WeChat group; brand name is the full 「Cadence步频」.
          ZH-only (2026-07-08 adversarial-review fix): it's an internal WeChat
          workflow surface — EN readers were being pointed at WeChat/XHS they
          can't open. The EN daily now ends with the SubscribeCard instead. */}
      {zh && top3.length > 0 && (
        <section style={{ marginBottom: 'clamp(48px,7vw,72px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9AA0A8' }}>{zh ? '交接班卡' : 'Handoff card'}</span>
            <span style={{ flex: 1, height: 1, background: '#E6E3D9' }} />
          </div>
          <div style={{ position: 'relative', background: '#1E3A5F', borderRadius: 18, padding: 'clamp(26px,4.6vw,40px)', color: '#EAF1FA', overflow: 'hidden' }}>
            <svg width="120" height="105" viewBox="446 107 580 508" aria-hidden="true" style={{ position: 'absolute', right: -14, top: -10, opacity: 0.10, pointerEvents: 'none' }}>
              <g transform="skewX(-22.490)" fill="#FFFFFF"><rect x="664.6" y="410" width="40.5" height="92" /><rect x="745.6" y="343" width="42.5" height="159" /><rect x="832.5" y="277" width="42.6" height="225" /><rect x="930.0" y="121" width="46.7" height="474" /><rect x="1035.4" y="344" width="46.9" height="158" /><rect x="1128.9" y="415" width="39.9" height="87" /></g>
            </svg>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 15, color: '#fff' }}>Cadence<span style={{ fontFamily: "'LXGW WenKai Light', var(--font-sans)", color: '#7FA5D0', marginLeft: 6 }}>步频</span></span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#AFC4DC' }}>{dShort} {t('daily.shift')} · {top3.length} {t('storyMany')}/90s</span>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.14)', margin: '20px 0 4px' }} />
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {top3.map((s, n) => (
                  <li key={s.id || n} style={{ display: 'flex', gap: 14, padding: '15px 0', borderBottom: n < top3.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                    <span style={{ flexShrink: 0, width: 18, fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#7FA5D0' }}>{n + 1}</span>
                    <span style={{ fontSize: 15, lineHeight: 1.55, color: '#E6EEF8' }}>{s.title}</span>
                  </li>
                ))}
              </ol>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.14)', margin: '4px 0 18px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.5, color: '#9FB6D4' }}>{t('daily.shareFoot')}</span>
                <button type="button" onClick={copyShare} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', color: '#CFE0F2', border: '1px solid rgba(255,255,255,0.28)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, padding: '10px 18px', borderRadius: 999 }}>
                  {copied ? (zh ? '已复制 ✓' : 'Copied ✓') : (zh ? '复制为微信文字' : 'Copy for WeChat')}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Prev / next navigation. The in-page archive toggle only renders on
          mobile — desktop has the right-rail edition archive instead. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {prevEd && <Button size="sm" variant="ghost" onClick={() => onDate(prevEd.date)}>{t('daily.prev')}</Button>}
        {mobile && <Button size="sm" variant="ghost" iconStart="archive" onClick={() => setShowArchive((v) => !v)}>{t('daily.archive')}</Button>}
        {nextEd && <Button size="sm" variant="ghost" onClick={() => onDate(nextEd.date)}>{t('daily.next')}</Button>}
        {pos > 0 && <Button size="sm" variant="ghost" onClick={() => onDate(editions[0].date)}>{t('daily.latest')}</Button>}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)' }}>{t('daily.autoNote')}</span>
      </div>
      {mobile && showArchive && editions && (
        <DailyArchiveList editions={editions} current={date} onPick={(d) => { setShowArchive(false); onDate(d); }} />
      )}
    </div>
  );
}

// ── Hash-based deep linking ──────────────────────────────────────────────────
// Format: #view/category?q=query  (daily uses #daily/YYYY-MM-DD)
// Examples: #curated  #all/neurological  #curated?q=balance  #daily/2026-06-12
const CD_VIEWS = ['curated', 'all', 'daily', 'sources', 'about', 'feedback'];
const CD_CATS  = ['all', 'orthopedic', 'neurological', 'sports', 'pediatric',
                  'geriatric', 'cardiopulmonary', 'manual-modality', 'practice', 'rehab-tech'];
// Content type (tags[0] in news.json) — second filter axis, surfaced as the top
// bar. 'all' = no filter. Carried in the hash as ?type= so it deep-links.
const CD_CTYPES = ['all', 'research', 'news', 'guideline', 'policy'];

function cdParseHash() {
  const raw = (location.hash || '').replace(/^#/, '') || 'curated';
  const [pathPart, qs] = raw.split('?');
  const segs = pathPart.split('/');
  const params = new URLSearchParams(qs || '');
  const view = CD_VIEWS.includes(segs[0]) ? segs[0] : 'curated';
  const cat  = (view !== 'daily' && CD_CATS.includes(segs[1])) ? segs[1] : 'all';
  const date = (view === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(segs[1])) ? segs[1] : null;
  const q    = params.get('q') || '';
  const type = CD_CTYPES.includes(params.get('type')) ? params.get('type') : 'all';
  const _min = parseInt(params.get('min'), 10);
  const min  = (_min >= 65 && _min <= 85) ? Math.round(_min / 5) * 5 : 0;
  // Sort axis: 'signal' (default, evidence strength) or 'recent' (firstSeen).
  const sort = params.get('sort') === 'recent' ? 'recent' : 'signal';
  return { view, category: cat, query: q, dailyDate: date, ctype: type, minScore: min, sort };
}

function cdWriteHash(view, category, query, dailyDate, ctype, minScore, sort) {
  let h = view;
  if (view === 'daily' && dailyDate) h += '/' + dailyDate;
  else if (category && category !== 'all') h += '/' + category;
  const params = [];
  if (query) params.push('q=' + encodeURIComponent(query));
  if (ctype && ctype !== 'all') params.push('type=' + ctype);
  if (minScore) params.push('min=' + minScore);
  if (sort === 'recent') params.push('sort=recent');
  if (params.length) h += '?' + params.join('&');
  if (h !== (location.hash || '').replace(/^#/, ''))
    history.replaceState(null, '', '#' + h);
}

// ── Per-item permalink (?item=<id>) ─────────────────────────────────────────
// Real query-param URLs (not hash) so each story is a distinct, indexable URL:
// https://incadencept.com/?item=news-… . Path stays "/" so relative asset /
// fetch paths keep resolving — no <base> tag, no wrangler SPA-fallback change.
// Item ids are stable across cron runs since the archive-identity fix
// (news-refresh.js reuses the archived id per canonical URL, 2026-06-29).
function cdItemParam() {
  try { return new URLSearchParams(location.search).get('item') || null; }
  catch { return null; }
}
function cdItemUrl(id) { return '/?item=' + encodeURIComponent(id); }

/**
 * StoryDetailOverlay — the landing surface for a shared/deep-linked story.
 * Resolves the id against the live feed first, then lazily against the
 * archive (CD_LOAD_ARCHIVE), so permalinks keep working after a story rotates
 * out of news.json. While open it sets document.title + canonical + Article
 * JSON-LD for crawlers (Googlebot renders this app fully — GSC verified).
 */
function StoryDetailOverlay({ id, L, onClose, mobile }) {
  const t = window.CD_T;
  const findLive = () => (window.CD_STORIES || []).find((s) => s.id === id) || null;
  const [story, setStory] = React.useState(findLive);
  const [missing, setMissing] = React.useState(false);

  // Not in the live feed → search the archive (cached promise, one load/session).
  React.useEffect(() => {
    if (story) return;
    let alive = true;
    window.CD_LOAD_ARCHIVE().then((items) => {
      if (!alive) return;
      const hit = findLive() || (items || []).find((s) => s.id === id) || null;
      if (hit) setStory(hit); else setMissing(true);
    });
    return () => { alive = false; };
  }, [id]);

  // Lock body scroll + close on Escape while the overlay is up.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // SEO head state for this URL: title / canonical / Article JSON-LD.
  // Cleaned up on close so the SPA's default head is restored.
  React.useEffect(() => {
    if (!story) return;
    const s = L(story);
    const prevTitle = document.title;
    // Suffix follows the edition (worker.js does the same for crawlers):
    // EN readers shouldn't get a Chinese-branded tab title.
    document.title = `${s.title} — ${window.CD_LANG === 'en' ? 'Cadence' : 'Cadence 步频'}`;
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = location.origin + cdItemUrl(story.id);
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: s.title,
      description: s.summary || undefined,
      datePublished: story.publishedAt || undefined,
      url: location.origin + cdItemUrl(story.id),
      isBasedOn: story.sourceUrl || undefined,
      publisher: { '@id': 'https://incadencept.com/#organization' },
    });
    document.head.appendChild(link);
    document.head.appendChild(ld);
    return () => { document.title = prevTitle; link.remove(); ld.remove(); };
  }, [story, L]);

  const [copied, setCopied] = React.useState(false);
  const copyHere = () => {
    // Mirror the card's copy-link behavior: en readers share &lang=en links.
    const u = new URL(cdItemUrl(id), location.origin);
    if (window.CD_LANG === 'en') u.searchParams.set('lang', 'en');
    cdCopyText(u.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const s = story ? L(story) : null;
  const panelStyle = {
    width: mobile ? '100%' : 'min(680px, calc(100vw - 48px))',
    maxHeight: mobile ? '92vh' : '86vh', overflowY: 'auto',
    background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
    borderRadius: mobile ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md, 0 20px 50px -12px rgba(27,30,35,0.35))',
    padding: mobile ? '20px 18px calc(20px + env(safe-area-inset-bottom))' : '26px 28px',
  };
  return (
    <div role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(27,30,35,0.45)',
        display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center',
      }}>
      <div style={panelStyle}>
        {/* header row: category + score · close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {s && <CategoryTag category={story.category} size="sm" />}
          {s && <SignalScore score={story.score} size="sm" lang={window.CD_LANG} />}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ display: 'inline-flex', padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {!s && !missing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '28px 0', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>
            <Icon name="loader-circle" size={14} /> {t('item.loading')}
          </div>
        )}

        {missing && (
          <div style={{ textAlign: 'center', padding: '28px 0 12px' }}>
            <Icon name="search-x" size={26} style={{ color: 'var(--ink-300)', margin: '0 auto 10px' }} />
            <p style={{ margin: '0 0 18px', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)' }}>{t('item.notFound')}</p>
            <Button onClick={onClose}>{t('item.backToFeed')}</Button>
          </div>
        )}

        {s && (
          <>
            <h2 style={{ margin: '0 0 10px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: mobile ? 20 : 24, lineHeight: 1.25, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
              {s.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 500 }}>{story.wallSource || story.source}</span>
              {story.journalMeta && story.journalMeta.if != null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 'var(--radius-xs)', background: 'var(--green-50)', border: '1px solid var(--green-100)', color: 'var(--green-700)' }}>
                  IF {story.journalMeta.if} · {story.journalMeta.quartile}
                </span>
              )}
              <span style={{ color: 'var(--ink-300)' }}>·</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{story.date}</span>
            </div>
            {s.summary && (
              <p style={{ margin: '0 0 16px', fontFamily: 'var(--font-sans)', fontSize: 15, lineHeight: 1.65, color: 'var(--text-secondary)' }}>{s.summary}</p>
            )}
            {s.why && (
              <aside style={{
                display: 'flex', gap: 10, padding: '12px 14px', marginBottom: 14,
                background: 'var(--blue-50)', border: '1px solid var(--blue-100)',
                borderLeft: '3px solid var(--blue-600)', borderRadius: 'var(--radius-md)',
              }}>
                <span style={{ flex: 'none', marginTop: 1, color: 'var(--blue-600)' }}><Icon name="stethoscope" size={16} strokeWidth={2} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, color: 'var(--blue-800)', marginBottom: 4 }}>{t('whyMatters')}</div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-700)' }}>{s.why}</div>
                </div>
              </aside>
            )}
            {s.limitation && (
              <p style={{ margin: '0 0 18px', fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
                <strong style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{t('item.limitTitle')}:</strong> {s.limitation}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Button iconEnd="arrow-up-right" onClick={() => window.open(story.sourceUrl, '_blank', 'noopener')}>
                {t('readOriginal')}
              </Button>
              <button type="button" onClick={copyHere}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: copied ? 'var(--green-700)' : 'var(--text-tertiary)' }}>
                <Icon name={copied ? 'check' : 'link'} size={14} strokeWidth={2} />
                {copied ? t('linkCopied') : t('copyLink')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FeedApp() {
  // ≤768px: NavRail → bottom tab bar, DigestRail → collapsible feed-top card,
  // category tabs wrap → horizontal scroll (Cindy 2026-06-11).
  const isMobile = window.useCdMobile();

  // State initialised from hash so bookmarked URLs restore the right view.
  // Real-URL daily permalink (?daily=YYYY-MM-DD) — the crawler-visible twin of
  // #daily/<date>: worker.js rewrites its <head> meta, build-sitemap.js lists
  // it (2026-07-15 adversarial review — hash routes aren't indexable). Consume
  // once at boot: translate to the hash route and strip the param so later
  // hash navigation isn't pinned back to the daily view.
  const _h0 = React.useMemo(() => {
    const h = cdParseHash();
    try {
      const qs = new URLSearchParams(location.search);
      const dq = qs.get('daily');
      if (dq && /^\d{4}-\d{2}-\d{2}$/.test(dq)) {
        qs.delete('daily');
        const rest = qs.toString();
        history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + '#daily/' + dq);
        return { ...h, view: 'daily', dailyDate: dq };
      }
    } catch {}
    return h;
  }, []);
  const [view, setView] = React.useState(_h0.view);
  const [category, setCategory] = React.useState(_h0.category);
  const [ctype, setCtype] = React.useState(_h0.ctype);
  const [minScore, setMinScore] = React.useState(_h0.minScore);
  const [sortBy, setSortBy] = React.useState(_h0.sort); // 'signal' | 'recent'
  const [sigHelpOpen, setSigHelpOpen] = React.useState(false);
  const sigHelpRef = React.useRef(null);
  const [query, setQuery] = React.useState(_h0.query);
  const [selected, setSelected] = React.useState(null);
  // Deep-linked story (?item=<id> in the real query string, not the hash).
  // pushState on close so browser Back returns to the story; popstate syncs.
  const [itemId, setItemId] = React.useState(cdItemParam());
  const closeItem = React.useCallback(() => {
    setItemId(null);
    // Strip only ?item= — other params (utm_* etc.) survive the close.
    const qs = new URLSearchParams(location.search);
    qs.delete('item');
    const rest = qs.toString();
    history.pushState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  }, []);
  // End/Home page-jump keys (2026-07-08 adversarial-review fix: they were
  // dead in the feed, and the subscribe card lives at the bottom). Skips
  // inputs/textareas and open dialogs so typing/overlay behavior is untouched.
  React.useEffect(() => {
    const onEndHome = (e) => {
      if (e.key !== 'End' && e.key !== 'Home') return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (document.body.style.overflow === 'hidden') return; // story overlay open
      e.preventDefault();
      window.scrollTo({ top: e.key === 'End' ? document.documentElement.scrollHeight : 0 });
    };
    window.addEventListener('keydown', onEndHome);
    return () => window.removeEventListener('keydown', onEndHome);
  }, []);
  React.useEffect(() => {
    const onPop = () => setItemId(cdItemParam());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Daily-edition date — lifted here so DailyBriefView and the right-rail
  // archive (DailyArchiveRail) share one source of truth. null = latest.
  const [dailyDate, setDailyDate] = React.useState(_h0.dailyDate);

  // Write hash when state changes; read hash on browser back/forward.
  const _hashBusy = React.useRef(false);
  React.useEffect(() => {
    if (_hashBusy.current) return;
    cdWriteHash(view, category, query, dailyDate, ctype, minScore, sortBy);
  }, [view, category, query, dailyDate, ctype, minScore, sortBy]);
  React.useEffect(() => {
    const onHash = () => {
      _hashBusy.current = true;
      const h = cdParseHash();
      setView(h.view); setCategory(h.category); setQuery(h.query); setDailyDate(h.dailyDate); setCtype(h.ctype); setMinScore(h.minScore); setSortBy(h.sort);
      requestAnimationFrame(() => { _hashBusy.current = false; });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // All-stories archive — lazy-loaded the first time the user opens the All
  // view (aihot-style: Curated = top-30 live feed, All = permanent superset
  // from archive/*.json). null = not requested yet; [] = loaded-but-empty or
  // load failed (feed still renders); array = archive-only stories.
  const [archiveStories, setArchiveStories] = React.useState(null);
  // {loaded, total} — updated per-month as files resolve; null = not started.
  const [archiveProgress, setArchiveProgress] = React.useState(null);
  const archiveLoading = view === 'all' && archiveStories === null;
  React.useEffect(() => {
    // Sources view also wants the archive: wall counts are all-time (live feed
    // caps at 30 items — against a 50-outlet roster, live-only counts left most
    // cards permanently at zero). Same cached promise, so no extra cost.
    if ((view !== 'all' && view !== 'sources') || archiveStories !== null) return;
    let alive = true;
    const onProgress = (loaded, total) => {
      if (alive) setArchiveProgress({ loaded, total });
    };
    window.CD_LOAD_ARCHIVE(onProgress).then((items) => {
      if (alive) { setArchiveStories(items); setArchiveProgress(null); }
    });
    return () => { alive = false; };
  }, [view, archiveStories]);

  // All-view pagination: show N date-groups at a time so we never dump
  // hundreds of cards into the DOM at once. Reset when the filter changes.
  const ALL_PAGE_SIZE = 7;
  const [visibleDays, setVisibleDays] = React.useState(ALL_PAGE_SIZE);
  React.useEffect(() => { setVisibleDays(ALL_PAGE_SIZE); }, [category, query, ctype, minScore]);

  // Slider's SIGNAL-score explainer popover: close on outside-click / Escape.
  React.useEffect(() => {
    if (!sigHelpOpen) return;
    const onDoc = (e) => { if (sigHelpRef.current && !sigHelpRef.current.contains(e.target)) setSigHelpOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setSigHelpOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [sigHelpOpen]);

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
  //
  // en-mode guard (2026-07-04): the pipeline occasionally wrote a CHINESE
  // summary into `summary` (~30% of PubMed items before the repair pass).
  // Rendering that in en mode breaks the English experience, so a CJK summary
  // is suppressed — the card still shows the English title + Cadence take.
  // Backfill (scripts/backfill-summary-en.js) rewrites the data itself.
  const L = React.useCallback((s) => (zh
    ? { ...s, title: s.titleZh || s.title, summary: s.summaryZh || s.summary }
    // titleEn covers non-English-source items (e.g. 中文 source): their `title`
    // is the original (Chinese), so en mode needs an explicit English title.
    : { ...s, title: s.titleEn || s.title, summary: /[一-鿿]/.test(s.summary || '') ? '' : s.summary, why: s.whyEn || s.why, limitation: s.limitationEn || s.limitation }), [zh]);

  const DAY_LABELS = cdDayLabels();

  const compact = view === 'all';
  const isDaily = view === 'daily';
  const isSources = view === 'sources';
  const isFeedback = view === 'feedback';
  const isAbout = view === 'about';
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
  // Cross-cutting pills (XCUTS, e.g. 康复科技) filter on their overlay flag
  // instead of the category field, so a neuro VR trial matches both 神经 and 科技.
  const xcut = (window.XCUTS || []).find((x) => x.id === category);
  // Everything EXCEPT the content-type axis — reused for TypeTabs counts so
  // each type's tally reflects the current specialty/search/score selection
  // (a type with 0 hits under the active filters is hidden, not shown empty).
  const matchesExceptType = (s) => {
    if (xcut) { if (!s[xcut.flag]) return false; }
    else if (category !== 'all' && s.category !== category) return false;
    // Signal-score floor (opt-in, ?min=80) — only items at/above the threshold.
    if (minScore && s.score < minScore) return false;
    // Search across both languages regardless of display language.
    if (q && !(`${s.title} ${s.titleZh || ''} ${s.titleEn || ''} ${s.source} ${s.wallSource || ''} ${s.summary || ''} ${s.summaryZh || ''}`.toLowerCase().includes(q))) return false;
    return true;
  };
  const matchesFilter = (s) => {
    if (!matchesExceptType(s)) return false;
    // Content-type axis (research / news / guideline / policy) = tags[0].
    if (ctype !== 'all' && (s.tags || [])[0] !== ctype) return false;
    return true;
  };
  // All view draws from the merged pool (live feed + archive-only stories);
  // every other view sees exactly the live feed, unchanged.
  const pool = view === 'all'
    ? window.CD_STORIES.concat(archiveStories || [])
    : window.CD_STORIES;
  let stories = pool.filter(matchesFilter);
  // Pool for the type-tab counts: same view, all filters applied except type.
  const typeCountPool = pool.filter(matchesExceptType);

  // Daily brief view renders pre-built editions (briefs/daily/*.json) via
  // DailyBriefView below — it short-circuits the feed like Sources/Feedback,
  // so no daily-specific story filtering happens here anymore.

  // Single ranking rule used by every group/lead sort below so the feed's
  // "按证据强度精选" promise holds uniformly: SIGNAL desc, ties → newer first.
  // (One definition avoids the day/All views drifting apart — Cindy 2026-06-25.)
  // Tiebreak is firstSeen (ms-precision ingestion time), not publishedAt: scores
  // cluster on 5-point marks so ties are common, and publishedAt is day-grained
  // (all T00:00:00Z) — it left same-day同分 items in unstable array order, which
  // read as "no ranking" among the three 85s on the homepage (2026-07-15
  // adversarial review). publishedAt stays as a final fallback.
  // id is the final, purely-deterministic tiebreak: a handful of items share a
  // firstSeen to the ms (same crawl batch), and without a stable last key their
  // relative order can flip between renders. id is unique + stable.
  const bySignal = (a, b) =>
    (b.score - a.score) ||
    ((b.firstSeen || '').localeCompare(a.firstSeen || '')) ||
    ((b.publishedAt || '').localeCompare(a.publishedAt || '')) ||
    ((b.id || '').localeCompare(a.id || ''));
  // 'Most recent' axis (sortBy === 'recent'): newest ingestion first. firstSeen
  // is ms-precision; score then id keep it deterministic (2026-07-16 review —
  // the "Signal score" control was a dead label, now a real signal/recent toggle).
  const byRecent = (a, b) =>
    ((b.firstSeen || '').localeCompare(a.firstSeen || '')) ||
    (b.score - a.score) ||
    ((b.id || '').localeCompare(a.id || ''));
  const activeSort = sortBy === 'recent' ? byRecent : bySignal;

  // Curated / All grouping = by day (today / yesterday / older).
  const dayBuckets = ['today', 'yesterday', 'older'];
  const groupedByDay = dayBuckets
    .map((d) => ({ key: d, label: DAY_LABELS[d],
      items: stories.filter((s) => s.day === d).sort(activeSort) }))
    .filter((g) => g.items.length);

  // All view spans weeks of archive — today/yesterday/older would dump nearly
  // everything into one "older" heap. Group by calendar date instead (aihot
  // pattern), newest day first, within a day sorted by the active axis.
  // Grouping key follows the sort: by publishedAt for 'signal', by firstSeen for
  // 'recent' — so "most recent" genuinely surfaces recently-ingested items
  // (incl. backfilled older papers that carry a 新收录 chip), not publish date.
  const groupedByDate = (() => {
    if (view !== 'all') return [];
    const locale = window.CD_LANG === 'zh' ? 'zh-CN' : 'en-US';
    const dateOf = (s) => ((sortBy === 'recent' ? s.firstSeen : s.publishedAt) || '').slice(0, 10) || '0000-00-00';
    const map = new Map();
    stories.forEach((s) => {
      const k = dateOf(s);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    });
    return [...map.entries()]
      .sort((a, b) => {
        // Unknown-date bucket always sinks to the bottom regardless of sort order.
        if (a[0] === '0000-00-00') return 1;
        if (b[0] === '0000-00-00') return -1;
        return b[0].localeCompare(a[0]);
      })
      .map(([k, items]) => ({
        key: k,
        label: k === '0000-00-00'
          ? t('unknownDate')
          : new Date(k + 'T12:00:00Z').toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' }),
        items: items.sort(activeSort),
      }));
  })();

  const grouped = view === 'all' ? groupedByDate : groupedByDay;
  // For the All view, slice to visibleDays groups so we never render the full
  // archive at once. Other views are small enough (today/yesterday/older) to render whole.
  const visibleGroups = view === 'all' ? grouped.slice(0, visibleDays) : grouped;
  const hasMoreDays = view === 'all' && grouped.length > visibleDays;

  // Lead story = first item of the first group under the active sort, Curated
  // only (highest signal, or most recently ingested when sorted by recent).
  const leadId = (!compact && !isDaily && grouped.length && grouped[0].items.length)
    ? [...grouped[0].items].sort(activeSort)[0].id : null;

  // Rail day: Daily-brief view pins yesterday; other views prefer today but
  // fall back to yesterday when today is still empty (e.g. before the 15:00
  // Beijing crawl) so the rail never renders a hollow box. Computed here so
  // desktop DigestRail and MobileSignalCard share one source of truth.
  const todayRail = window.CD_STORIES.filter((s) => s.day === 'today');
  const railDay = (isDaily || !todayRail.length) ? 'yesterday' : 'today';
  const railStories = (railDay === 'today' ? todayRail : window.CD_STORIES.filter((s) => s.day === 'yesterday')).map(L);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
      {/* Typing in the header search while on a view that doesn't consume the
          query (daily/sources/about/feedback) used to write ?q= into the hash
          and change nothing on screen — a silent no-op (2026-07-15 adversarial
          review #3). Jump to All stories so results always appear. */}
      <AppHeader query={query} onQuery={(v) => { setQuery(v); if (v && view !== 'curated' && view !== 'all') setView('all'); }} lang={lang} onLang={toggleLang} mobile={isMobile} />
      <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: isMobile ? 0 : 24, padding: isMobile ? '0 14px' : '0 24px' }}>
        {!isMobile && <NavRail view={view} onView={setView} category={category}
          onCategory={(c) => { setCategory(c); if (view !== 'curated' && view !== 'all') setView('curated'); }} />}

        <main style={{ flex: 1, minWidth: 0, maxWidth: isMobile ? 'none' : (isAbout ? 'none' : 'var(--feed-column)'), padding: isMobile ? '18px 0 calc(76px + env(safe-area-inset-bottom))' : '24px 0 64px' }}>
          {/* Daily view has its own masthead — no page toolbar (Cindy 2026-06-13) */}
          {!isDaily && !isAbout && <FeedToolbar view={view} count={isSources || isFeedback ? null : stories.length} sortBy={sortBy} onSort={setSortBy} />}

          {/* Mobile: Today's Signal folded into the feed top — Curated & Daily
              only, and only when unfiltered, mirroring the desktop rail's role
              as ambient context rather than a search result. */}
          {isMobile && !isSources && view === 'curated' && !q && category === 'all' && ctype === 'all' && (
            <MobileSignalCard stories={railStories} dayKey={railDay} onPick={scrollToStory} />
          )}

          {/* Sources directory branch — short-circuits feed rendering.
              No specialty tabs here: the wall groups by outlet kind instead. */}
          {isSources && (
            <SourcesGrid stories={(window.CD_STORIES || []).concat(archiveStories || [])} />
          )}

          {/* Feedback branch — also short-circuits the feed: a single form,
              no category tabs / signal rail / story list. */}
          {isFeedback && (
            <FeedbackView />
          )}

          {/* About branch — static brand / mission / founder page;
              short-circuits the feed like Feedback. CTAs hop to other views. */}
          {isAbout && (
            <AboutView onView={setView} mobile={isMobile} />
          )}

          {/* Daily edition branch — AIHOT-style fixed daily slices with their
              own lead / sections / archive navigation; short-circuits the feed. */}
          {isDaily && (
            <DailyBriefView L={L}
              date={dailyDate} onDate={setDailyDate} mobile={isMobile} />
          )}

          {/* Hot topics — Curated only, unfiltered view. Empty array = hidden. */}
          {!isSources && view === 'curated' && !q && category === 'all' && ctype === 'all' && !minScore && (
            <HotTopicsStrip topics={window.CD_HOT || []} onPick={scrollToStory} mobile={isMobile} />
          )}

          {!isSources && !isFeedback && !isDaily && !isAbout && (
            <div style={{ position: 'sticky', top: 'var(--header-height)', zIndex: 10, padding: '10px 0', margin: '0 0 8px',
              background: 'linear-gradient(var(--surface-page) 72%, transparent)' }}>
              {/* Top axis = content type. Specialty lives in the left rail on
                  desktop; on mobile it folds into the dropdown beside this bar.
                  .cd-hscroll hides the scrollbar (defined in index.html). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isMobile && <SpecialtySelect value={category} onChange={setCategory} />}
                <TypeTabs value={ctype} onChange={setCtype} pool={typeCountPool}
                  className={isMobile ? 'cd-hscroll' : undefined}
                  style={isMobile ? { flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2, flex: 1, minWidth: 0 } : undefined} />
                {/* Signal-score filter — drag the slider to set a minimum score.
                    Far left (≤60) = all; drag right raises the floor (data spans 60–85). */}
                <span style={{ flex: 'none', width: 1, alignSelf: 'stretch', minHeight: 20, background: 'var(--border-subtle)', margin: '0 2px' }} />
                <div style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title={zh ? '拖动设置信号分下限' : 'Drag to set a minimum Signal score'}>
                  <input type="range" min={60} max={85} step={5} value={minScore || 60}
                    onChange={(e) => { const v = +e.target.value; setMinScore(v <= 60 ? 0 : v); }}
                    aria-label={zh ? '信号分下限' : 'Minimum Signal score'}
                    style={{ width: 104, accentColor: 'var(--signal-mid)', cursor: 'pointer' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 66,
                    color: minScore ? 'var(--signal-mid)' : 'var(--text-tertiary)' }}>
                    {minScore ? (zh ? `信号 ≥ ${minScore}` : `Signal ≥ ${minScore}`) : (zh ? '信号·全部' : 'Signal: all')}</span>
                  <span ref={sigHelpRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <button type="button" onClick={() => setSigHelpOpen((v) => !v)} aria-label={t('signalScore')} aria-expanded={sigHelpOpen}
                      style={{ display: 'inline-flex', alignItems: 'center', padding: 2, background: 'none', border: 'none', cursor: 'pointer',
                        color: sigHelpOpen ? 'var(--green-700, var(--text-secondary))' : 'var(--text-tertiary)' }}>
                      <Icon name="info" size={14} />
                    </button>
                    {sigHelpOpen && (
                      <div role="tooltip" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50, width: 'min(300px, 78vw)', padding: '12px 14px', background: 'var(--surface-card, #fff)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md, 0 10px 30px -12px rgba(27,30,35,0.25))', fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.65, color: 'var(--text-secondary)', textAlign: 'left' }}>
                        {t('signalScore.help')}
                      </div>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Archive still in flight — feed items already render above; this
              strip just signals that older stories are on their way. Shows
              per-month progress (e.g. "3 / 8") once the manifest is loaded. */}
          {!isSources && archiveLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
              <Icon name="loader-circle" size={13} style={{ color: 'var(--ink-300)' }} />
              <span>{t('loadingArchive')}</span>
              {archiveProgress && archiveProgress.total > 0 && (
                <>
                  <span style={{ flex: 1 }} />
                  <span>{archiveProgress.loaded} / {archiveProgress.total}</span>
                  {/* progress bar */}
                  <span style={{ width: 60, height: 3, borderRadius: 999, background: 'var(--border-subtle)', overflow: 'hidden', flex: 'none' }}>
                    <span style={{ display: 'block', height: '100%', borderRadius: 999, background: 'var(--green-500)', width: `${Math.round(archiveProgress.loaded / archiveProgress.total * 100)}%`, transition: 'width 0.2s ease' }} />
                  </span>
                </>
              )}
            </div>
          )}

          {!isSources && !isFeedback && !isDaily && !isAbout && grouped.length === 0 && !archiveLoading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>
              <Icon name="search-x" size={28} style={{ color: 'var(--ink-300)', margin: '0 auto 10px' }} />
              <div>{q ? `${t('emptySearch')} “${query}”` : (isDaily ? t('emptyDaily') : t('emptyNone'))}</div>
            </div>
          )}

          {/* Sparse-specialty honesty note — a filtered Curated view with < 3
              hits states the coverage gap instead of letting the near-empty
              feed do the talking (adversarial-review fix #4, 2026-07-01). */}
          {view === 'curated' && !isSources && !isFeedback && !isDaily && !isAbout && category !== 'all' && !q && ctype === 'all' && !minScore && stories.length > 0 && stories.length < 3 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 14px', padding: '12px 14px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <Icon name="info" size={15} style={{ color: 'var(--text-tertiary)', flex: 'none', marginTop: 2 }} />
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {t('sparse.note')}{' '}
                <button type="button" onClick={() => setView('all')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 600, color: 'var(--green-700)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {t('sparse.cta')}
                </button>
              </div>
            </div>
          )}

          {!isSources && !isFeedback && !isDaily && !isAbout && visibleGroups.map((g) => (
            <section key={g.key} style={{ marginBottom: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{g.label}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{g.items.length} {t(g.items.length === 1 ? 'storyOne' : 'storyMany')}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {g.items.map((raw) => {
                  // Render localized copy (title/summary/why per active language).
                  const s = L(raw);
                  return (
                    <div key={s.id} id={`gs-card-${s.id}`} style={{ scrollMarginTop: 'calc(var(--header-height) + 16px)' }}>
                      {/* source = wallSource: journal-attributed name (PubMed-pipeline items
                          show their journal, e.g. IJSPT, not the pipeline); raw source as fallback */}
                      <NewsCard
                        variant={s.id === leadId ? 'lead' : (compact ? 'compact' : 'default')}
                        mobile={isMobile}
                        category={s.category} score={s.score} source={s.wallSource || s.source} sourceUrl={s.sourceUrl} time={s.time} date={s.date}
                        journalMeta={s.journalMeta} studyDesign={s.studyDesign} tech={s.tech} surfaced={s.surfaced}
                        title={s.title} summary={s.summary} whyItMatters={s.why} limitation={s.limitation}
                        permalink={cdItemUrl(s.id)}
                        selected={selected === s.id}
                        onClick={() => setSelected(selected === s.id ? null : s.id)} />
                      {!compact && <RelatedRow related={s.related} />}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Load more — only in All view when there are more date-groups to show */}
          {!isSources && !isFeedback && !isDaily && !isAbout && hasMoreDays && !archiveLoading && (
            <div style={{ textAlign: 'center', padding: '8px 0 24px' }}>
              <Button variant="secondary" size="sm"
                onClick={() => setVisibleDays((v) => v + ALL_PAGE_SIZE)}>
                {zh ? `再加载 ${ALL_PAGE_SIZE} 天` : `Load ${ALL_PAGE_SIZE} more days`}
                <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                  ({grouped.length - visibleDays} {zh ? '天剩余' : 'remaining'})
                </span>
              </Button>
            </div>
          )}

          {/* Subscribe — the retention surface, at the natural end-of-reading
              point on the feed views AND the daily brief (2026-07-08: the EN
              daily page previously ended with the ZH-only handoff card). */}
          {!isSources && !isFeedback && !isAbout && (isDaily || grouped.length > 0) && (
            <SubscribeCard mobile={isMobile} onAbout={() => setView('about')} />
          )}
        </main>

        {!isSources && !isFeedback && !isAbout && !isMobile && (isDaily
          ? <DailyArchiveRail current={dailyDate} onPick={setDailyDate} />
          : (
            <DigestRail stories={railStories} dayKey={railDay} onPick={scrollToStory}>
              {/* Persistent above-the-fold email入口 (adversarial-review fix,
                  2026-07-08) — the feed-bottom card sits under 75 cards. */}
              <SubscribeCard compact onAbout={() => setView('about')} />
            </DigestRail>
          )
        )}
      </div>

      {/* Deep-linked story (?item=<id>) — the permalink landing surface.
          key={itemId} remounts on id change so stale story/missing state can
          never render under a different id's URL (audit P2-3). */}
      {itemId && <StoryDetailOverlay key={itemId} id={itemId} L={L} onClose={closeItem} mobile={isMobile} />}

      {isMobile && <MobileTabBar view={view} onView={setView} />}
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
