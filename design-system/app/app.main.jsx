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
        <Button variant="ghost" size="sm" iconStart="arrow-down-wide-narrow">{t('signalScore')}</Button>
      )}
    </div>
  );
}

// ── Content-type filter bar (内容类型) ───────────────────────────────────────
// The front filter axis: research / news / guideline / policy (tags[0]). Only 5
// values, so it never wraps. Specialty moved to the left rail (desktop) / the
// SpecialtySelect dropdown (mobile).
function TypeTabs({ value = 'all', onChange = () => {}, className, style }) {
  const zh = (typeof window !== 'undefined' && window.CD_LANG === 'zh');
  const types = [
    ['all', zh ? '全部' : 'All'],
    ['research', zh ? '研究论文' : 'Research'],
    ['news', zh ? '新闻' : 'News'],
    ['guideline', zh ? '指南' : 'Guidelines'],
    ['policy', zh ? '政策' : 'Policy'],
  ];
  return (
    <div role="tablist" className={className} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', ...style }}>
      {types.map(([id, label]) => {
        const on = value === id;
        return (
          <button key={id} type="button" role="tab" aria-selected={on} onClick={() => onChange(id)} style={{
            padding: '7px 13px', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap', cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: on ? 600 : 500,
            border: `1px solid ${on ? 'transparent' : 'var(--border-subtle)'}`,
            background: on ? 'var(--ink-900)' : 'var(--surface-card)',
            color: on ? 'var(--paper)' : 'var(--text-secondary)',
            transition: 'var(--transition-colors)',
          }}>{label}</button>
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
      {cats.map((c, i) => <option key={c.id} value={c.id}>{String(i + 1).padStart(2, '0')} {window.catShort(c)}</option>)}
      {xcuts.map((x) => <option key={x.id} value={x.id}>✦ {window.catShort(x)}</option>)}
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
            ? t.members.map((m) => `${m.source} — ${window.CD_LANG === 'zh' ? (m.titleZh || m.title) : m.title}`).join('\n')
            : (t.sources || []).join(' · ');
          const idxEl = (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: i === 0 ? 'var(--green-700)' : 'var(--text-tertiary)', flex: 'none', width: 14 }}>{i + 1}</span>
          );
          const titleEl = (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{window.CD_LANG === 'zh' ? (t.titleZh || t.title) : t.title}</span>
          );
          const catEl = cat && (
            <span style={{ flex: 'none', padding: '1px 7px', borderRadius: 'var(--radius-sm)', fontSize: 10.5, fontWeight: 500, background: `var(--cat-${cat.accent}-soft)`, color: `var(--cat-${cat.accent}-ink)`, whiteSpace: 'nowrap' }}>{cat.short || cat.label}</span>
          );
          const metaEl = (
            <span title={tip}
              style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', borderBottom: '1px dotted var(--border-strong, var(--border-subtle))', cursor: 'help' }}>
              {isTheme
                ? `${tr('themeHeat')}${t.tag ? ` · ${t.tag}` : ''} · ${t.sourceCount} ${tr('nOutlets')}`
                : `${t.sourceCount} ${tr('nSources')}`}
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
          <Input size="sm" value={form.name} onChange={set('name')} placeholder="e.g. JOSPT, 丁香园" />
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
function AboutView({ onView, mobile }) {
  const t = window.CD_T;
  const zh = window.CD_LANG === 'zh';
  const srcCount = (window.CD_SOURCES || []).length || 20;

  const h2 = { margin: '0 0 22px', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' };
  const para = { margin: '0 0 16px', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', lineHeight: 1.85, color: 'var(--text-secondary)' };

  const stats = [
    { v: String(srcCount), l: zh ? '专业信源' : 'sources' },
    { v: '8', l: zh ? '临床专科' : 'specialties' },
    { v: '05:30', l: zh ? '每日更新' : 'daily refresh' },
    { v: '中·EN', l: zh ? '双语' : 'bilingual' },
  ];
  const steps = ['1', '2', '3'];
  const actions = [
    { title: t('about.sources.title'), body: t('about.sources.body'), cta: t('about.sources.cta'), view: 'sources' },
    { title: t('about.contact.title'), body: t('about.contact.body'), cta: t('about.contact.cta'), view: 'feedback' },
  ];

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: mobile ? 36 : 44 }}>
      {/* Header unit — magazine-feature hero + stat row kept together */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Hero — wordmark title, hairline rule, serif lead, supporting line */}
        <section>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: mobile ? 'var(--text-2xl)' : 'var(--text-3xl)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: 16 }}>{zh ? '步频 · Cadence' : 'Cadence · 步频'}</div>
          <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 20 }} />
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: mobile ? 'var(--text-lg)' : 'var(--text-xl)', lineHeight: 1.7, fontWeight: 500, color: 'var(--text-primary)' }}>{t('about.brand')}</p>
        </section>

        {/* Stats — hairline-bounded row, no cards */}
        <div style={{ display: 'flex', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
          {stats.map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '18px 4px', borderLeft: i ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 600, color: 'var(--blue-600)', lineHeight: 1 }}>{s.v}</div>
              <div style={{ marginTop: 6, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works — editorial numbered list */}
      <section>
        <h2 style={h2}><Icon name="workflow" size={19} style={{ color: 'var(--blue-600)' }} />{t('about.how.title')}</h2>
        <div>
          {steps.map((k, i) => (
            <div key={k} style={{ display: 'flex', gap: 18, alignItems: 'baseline', paddingBottom: 18, marginBottom: 18, borderBottom: i < steps.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--blue-600)', flex: 'none', width: 28 }}>{'0' + k}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', lineHeight: 1.7, color: 'var(--text-secondary)' }}>{t('about.how.' + k)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Founder story — plain prose, signed off */}
      <section>
        <h2 style={h2}><Icon name="heart" size={19} style={{ color: 'var(--blue-600)' }} />{t('about.why.title')}</h2>
        {['p1', 'p2', 'p3'].map((k) => (
          <p key={k} style={para}>{t('about.why.' + k)}</p>
        ))}
        <div style={{ marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontStyle: 'italic', color: 'var(--text-tertiary)' }}>{zh ? '— 步频团队' : '— The Cadence team'}</div>
      </section>

      {/* Next steps — text link rows, no cards */}
      <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {actions.map((a) => (
          <button key={a.view} type="button" onClick={() => onView(a.view)}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', padding: '18px 2px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{a.title}</span>
              <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--text-tertiary)' }}>{a.body}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--blue-600)' }}>{!mobile && a.cta}<Icon name="arrow-right" size={16} /></span>
          </button>
        ))}
      </div>

      {/* Follow us — QR codes for RedNote (XHS) + WeChat official account */}
      <section>
        <h2 style={h2}><Icon name="qr-code" size={19} style={{ color: 'var(--blue-600)' }} />{zh ? '关注我们' : 'Follow us'}</h2>
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

      {/* Disclaimer — quiet footnote */}
      <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
        <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{t('about.disclaimer.title')}. </span>{t('about.disclaimer.body')}
      </p>
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

function DailyMasthead({ edition, zh }) {
  const t = window.CD_T;
  const locale = zh ? 'zh-CN' : 'en-US';
  const d = new Date(edition.date + 'T12:00:00Z');
  // No VOL./mono masthead line — Cindy 2026-06-12: reads as AI-generated.
  // The story count lives quietly on the date line instead.
  return (
    <header style={{ textAlign: 'center', padding: '0 0 22px', borderBottom: '3px double var(--border-strong, var(--border-default))', marginBottom: 20 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
        {zh ? 'PTcadence日报' : 'PTcadence Daily'}
      </h2>
      <div style={{ marginTop: 8, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-secondary)' }}>
        {d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' })}
        <span> · {zh ? `今日 ${edition.stats.events} 篇` : `${edition.stats.events} stories today`}</span>
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
        style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '14px 16px', marginBottom: 16, background: current === latest.date ? 'var(--surface-active)' : 'var(--surface-card)', border: '1.5px solid var(--green-600)', borderRadius: 'var(--radius-lg)', fontFamily: 'var(--font-sans)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green-800, var(--text-primary))' }}>{t('daily.latestIssue')}</div>
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
                  style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', cursor: on ? 'default' : 'pointer', padding: '9px 12px', background: on ? 'var(--surface-active)' : 'none', border: 'none', borderTop: i ? '1px solid var(--border-subtle)' : 'none', fontFamily: 'var(--font-sans)' }}>
                  <span style={{ flex: 'none', width: 38, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: on ? 'var(--green-700)' : 'var(--text-tertiary)', paddingTop: 1 }}>
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
  // clinical take; tier 2 = practice-changing (score ≥ 80); tier 3 = compact
  // expandable rows. Driven entirely by curatedScore — no extra LLM call.
  const allItems = edition.sections.flatMap((sec) => sec.items).map(window.cdTransformItem);
  const ranked = [...allItems].sort((a, b) => b.score - a.score);
  const leadStory = ranked.length ? L(ranked[0]) : null;
  const tier2 = ranked.slice(1).filter((s) => s.score >= 80).map(L);
  const tier3 = ranked.slice(1).filter((s) => s.score < 80).map(L);
  const top3 = ranked.slice(0, 3).map(L);
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
      <DailyPulse items={allItems} />

      {/* Editor's-note lead paragraph removed (Cindy 2026-06-14): the LLM prose
          read as machine-generated, restated the DailyPulse counts above it, and
          could miscount. The masthead + pulse + tier-1 lead carry the page. */}

      {/* Tier 1 — the one story worth 5 minutes, with its clinical take */}
      {leadStory && (
        <section style={{ marginBottom: 26 }}>
          <div style={{ ...kicker, color: 'var(--green-700)', marginBottom: 8 }}>{t('daily.read5')}</div>
          <div style={{ padding: '20px 22px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--green-600)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, lineHeight: 1.45, color: 'var(--text-primary)' }}>{leadStory.title}</h3>
            {leadStory.summary && <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.75, color: 'var(--text-secondary)' }}>{leadStory.summary}</p>}
            {leadStory.why && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--green-100, var(--surface-active))', borderRadius: 'var(--radius-md)' }}>
                <div style={{ ...kicker, fontSize: 10, color: 'var(--green-700)', marginBottom: 4 }}>{t('daily.take')}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, color: 'var(--green-900, var(--text-primary))' }}>{leadStory.why}</div>
                {leadStory.limitation && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--green-300, var(--border-subtle))' }}>
                    <span style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginTop: 2 }}>{zh ? '局限' : 'Limit'}</span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{leadStory.limitation}</span>
                  </div>
                )}
              </div>
            )}
            {srcLine(leadStory)}
            <RelatedRow related={leadStory.related} />
          </div>
        </section>
      )}

      {/* Tier 2 — practice-changing: title + take */}
      {tier2.length > 0 && (
        <section style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ ...kicker, color: 'var(--text-secondary)' }}>{t('daily.tier2')}</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{tier2.length} {t('storyMany')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tier2.map((s) => (
              <div key={s.id || s.sourceUrl} style={{ padding: '14px 18px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--green-400)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)' }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: 'var(--text-primary)' }}>{s.title}</div>
                {(s.why || s.summary) && <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)' }}>{s.why || s.summary}</p>}
                {srcLine(s)}
                <RelatedRow related={s.related} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tier 3 — worth knowing: compact rows, click to expand the summary */}
      {tier3.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ ...kicker, color: 'var(--text-secondary)' }}>{t('daily.tier3')}</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{tier3.length} {t('storyMany')}</span>
          </div>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {tier3.map((s, i) => {
              const key = s.id || s.sourceUrl;
              const open = selected === key;
              const cat = window.getCategory ? window.getCategory(s.category) : null;
              return (
                <div key={key} onClick={() => setSelected(open ? null : key)}
                  style={{ padding: '11px 16px', cursor: 'pointer', borderTop: i ? '1px solid var(--border-subtle)' : 'none', background: open ? 'var(--surface-active)' : 'none' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-primary)' }}>{s.title}</span>
                    <span style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{cat && window.catLabel ? window.catLabel(cat) : ''} · {s.score}</span>
                  </div>
                  {open && (
                    <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                      {s.summary} <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text-secondary)' }}>{t('readOriginal')} ↗</a>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 6, textAlign: 'right', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--text-tertiary)' }}>{t('daily.expand')}</div>
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
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>{zh ? (f.titleZh || f.title) : f.title}</span>
                  <span style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{f.source}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Handoff share card (交接班卡) — built to be screenshotted or copied
          into a WeChat group; brand name is the full 「Cadence步频」. */}
      {top3.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <div style={{ ...kicker, color: 'var(--text-tertiary)', marginBottom: 10 }}>{t('daily.share')}</div>
          <div style={{ maxWidth: 340, margin: '0 auto', padding: '16px 18px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
              <span>Cadence步频 · {dShort} {t('daily.shift')}</span><span>{top3.length} {t('storyMany')} / 90s</span>
            </div>
            {top3.map((s, n) => (
              <div key={s.id || n} style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.55, marginBottom: 8 }}>
                <b style={{ color: 'var(--green-700)' }}>{n + 1}</b> {s.title}
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--text-tertiary)' }}>{t('daily.shareFoot')}</div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <Button size="sm" variant="ghost" iconStart="copy" onClick={copyShare}>{t('daily.copy')}</Button>
            {copied && <span style={{ marginLeft: 8, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--green-700)' }}>{t('daily.copied')}</span>}
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
  return { view, category: cat, query: q, dailyDate: date, ctype: type };
}

function cdWriteHash(view, category, query, dailyDate, ctype) {
  let h = view;
  if (view === 'daily' && dailyDate) h += '/' + dailyDate;
  else if (category && category !== 'all') h += '/' + category;
  const params = [];
  if (query) params.push('q=' + encodeURIComponent(query));
  if (ctype && ctype !== 'all') params.push('type=' + ctype);
  if (params.length) h += '?' + params.join('&');
  if (h !== (location.hash || '').replace(/^#/, ''))
    history.replaceState(null, '', '#' + h);
}

function FeedApp() {
  // ≤768px: NavRail → bottom tab bar, DigestRail → collapsible feed-top card,
  // category tabs wrap → horizontal scroll (Cindy 2026-06-11).
  const isMobile = window.useCdMobile();

  // State initialised from hash so bookmarked URLs restore the right view.
  const _h0 = cdParseHash();
  const [view, setView] = React.useState(_h0.view);
  const [category, setCategory] = React.useState(_h0.category);
  const [ctype, setCtype] = React.useState(_h0.ctype);
  const [query, setQuery] = React.useState(_h0.query);
  const [selected, setSelected] = React.useState(null);
  // Daily-edition date — lifted here so DailyBriefView and the right-rail
  // archive (DailyArchiveRail) share one source of truth. null = latest.
  const [dailyDate, setDailyDate] = React.useState(_h0.dailyDate);

  // Write hash when state changes; read hash on browser back/forward.
  const _hashBusy = React.useRef(false);
  React.useEffect(() => {
    if (_hashBusy.current) return;
    cdWriteHash(view, category, query, dailyDate, ctype);
  }, [view, category, query, dailyDate, ctype]);
  React.useEffect(() => {
    const onHash = () => {
      _hashBusy.current = true;
      const h = cdParseHash();
      setView(h.view); setCategory(h.category); setQuery(h.query); setDailyDate(h.dailyDate); setCtype(h.ctype);
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
  React.useEffect(() => { setVisibleDays(ALL_PAGE_SIZE); }, [category, query, ctype]);

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
    : { ...s, why: s.whyEn || s.why, limitation: s.limitationEn || s.limitation }), [zh]);

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
  const matchesFilter = (s) => {
    if (xcut) { if (!s[xcut.flag]) return false; }
    else if (category !== 'all' && s.category !== category) return false;
    // Content-type axis (research / news / guideline / policy) = tags[0].
    if (ctype !== 'all' && (s.tags || [])[0] !== ctype) return false;
    // Search across both languages regardless of display language.
    if (q && !(`${s.title} ${s.titleZh || ''} ${s.source} ${s.wallSource || ''} ${s.summary || ''} ${s.summaryZh || ''}`.toLowerCase().includes(q))) return false;
    return true;
  };
  // All view draws from the merged pool (live feed + archive-only stories);
  // every other view sees exactly the live feed, unchanged.
  const pool = view === 'all'
    ? window.CD_STORIES.concat(archiveStories || [])
    : window.CD_STORIES;
  let stories = pool.filter(matchesFilter);

  // Daily brief view renders pre-built editions (briefs/daily/*.json) via
  // DailyBriefView below — it short-circuits the feed like Sources/Feedback,
  // so no daily-specific story filtering happens here anymore.

  // Curated / All grouping = by day (today / yesterday / older).
  const dayBuckets = ['today', 'yesterday', 'older'];
  const groupedByDay = dayBuckets
    .map((d) => ({ key: d, label: DAY_LABELS[d], items: stories.filter((s) => s.day === d) }))
    .filter((g) => g.items.length);

  // All view spans weeks of archive — today/yesterday/older would dump nearly
  // everything into one "older" heap. Group by calendar date instead (aihot
  // pattern), newest day first, within a day sorted by score desc.
  const groupedByDate = (() => {
    if (view !== 'all') return [];
    const locale = window.CD_LANG === 'zh' ? 'zh-CN' : 'en-US';
    const map = new Map();
    stories.forEach((s) => {
      const k = (s.publishedAt || '').slice(0, 10) || '0000-00-00';
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
        items: items.sort((a, b) => b.score - a.score),
      }));
  })();

  const grouped = view === 'all' ? groupedByDate : groupedByDay;
  // For the All view, slice to visibleDays groups so we never render the full
  // archive at once. Other views are small enough (today/yesterday/older) to render whole.
  const visibleGroups = view === 'all' ? grouped.slice(0, visibleDays) : grouped;
  const hasMoreDays = view === 'all' && grouped.length > visibleDays;

  // Lead story = top-scoring in the first day-group, only on Curated view.
  const leadId = (!compact && !isDaily && grouped.length && grouped[0].items.length)
    ? [...grouped[0].items].sort((a, b) => b.score - a.score)[0].id : null;

  // Rail day: Daily-brief view pins yesterday; other views prefer today but
  // fall back to yesterday when today is still empty (e.g. before the 15:00
  // Beijing crawl) so the rail never renders a hollow box. Computed here so
  // desktop DigestRail and MobileSignalCard share one source of truth.
  const todayRail = window.CD_STORIES.filter((s) => s.day === 'today');
  const railDay = (isDaily || !todayRail.length) ? 'yesterday' : 'today';
  const railStories = (railDay === 'today' ? todayRail : window.CD_STORIES.filter((s) => s.day === 'yesterday')).map(L);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
      <AppHeader query={query} onQuery={setQuery} lang={lang} onLang={toggleLang} mobile={isMobile} />
      <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: isMobile ? 0 : 24, padding: isMobile ? '0 14px' : '0 24px' }}>
        {!isMobile && <NavRail view={view} onView={setView} category={category}
          onCategory={(c) => { setCategory(c); if (view !== 'curated' && view !== 'all') setView('curated'); }} />}

        <main style={{ flex: 1, minWidth: 0, maxWidth: isMobile ? 'none' : (isAbout ? 'none' : 'var(--feed-column)'), padding: isMobile ? '18px 0 calc(76px + env(safe-area-inset-bottom))' : '24px 0 64px' }}>
          {/* Daily view has its own masthead — no page toolbar (Cindy 2026-06-13) */}
          {!isDaily && !isAbout && <FeedToolbar view={view} count={isSources || isFeedback ? null : stories.length} />}

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
          {!isSources && view === 'curated' && !q && category === 'all' && ctype === 'all' && (
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
                <TypeTabs value={ctype} onChange={setCtype}
                  className={isMobile ? 'cd-hscroll' : undefined}
                  style={isMobile ? { flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2, flex: 1, minWidth: 0 } : undefined} />
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
                        journalMeta={s.journalMeta} tech={s.tech}
                        title={s.title} summary={s.summary} whyItMatters={s.why} limitation={s.limitation}
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
        </main>

        {!isSources && !isFeedback && !isAbout && !isMobile && (isDaily
          ? <DailyArchiveRail current={dailyDate} onPick={setDailyDate} />
          : <DigestRail stories={railStories} dayKey={railDay} onPick={scrollToStory} />
        )}
      </div>

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
