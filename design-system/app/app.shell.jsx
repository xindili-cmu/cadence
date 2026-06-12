// Cadence UI kit — app shell: header, left nav rail, right digest rail,
// plus mobile chrome (bottom tab bar + collapsible signal card).
const { Logo, Button, Input, Icon, CategoryTag, SignalScore, CATEGORIES, catShort } = window;

// ── Responsive breakpoint hook ───────────────────────────────────────────────
// Single breakpoint (≤768px = mobile) shared by the whole app. matchMedia
// listener so a tablet rotation / window resize re-lays-out live.
const CD_MOBILE_MQ = '(max-width: 768px)';
function useCdMobile() {
  const [mobile, setMobile] = React.useState(() => window.matchMedia(CD_MOBILE_MQ).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(CD_MOBILE_MQ);
    const onChange = (e) => setMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange); // Safari <14
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return mobile;
}

function AppHeader({ query, onQuery, lang, onLang, mobile }) {
  const t = window.CD_T;
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, height: 'var(--header-height)',
      display: 'flex', alignItems: 'center', gap: mobile ? 12 : 20, padding: mobile ? '0 14px' : '0 24px',
      background: 'rgba(250,250,246,0.86)', backdropFilter: 'saturate(180%) blur(12px)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <Logo variant="lockup" height={mobile ? 20 : 22} />
      {/* Masthead motto — English in both languages (Cindy 2026-06-11; the
          brief zh-motto experiment is reverted). Spectral uppercase, wide
          tracking (her option-4 pick, 2026-06-10). Centered between lockup
          and search: the empty space separates it from the 文楷 步频 so the
          two faces stop fighting in one cluster.
          Hidden on mobile — no room next to lockup + search + lang toggle. */}
      {!mobile && (
        <React.Fragment>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', marginTop: 2 }}>Keeping pace with the evidence</span>
          <span style={{ flex: 1 }} />
        </React.Fragment>
      )}
      {/* Public read-only platform — no bell / brief CTA / avatar (Cindy 2026-06-10).
          Header actions: search + language toggle only. */}
      <div style={{ flex: mobile ? 1 : 'none', width: mobile ? 'auto' : 'min(340px, 30vw)', minWidth: 0 }}>
        <Input icon="search" size="sm" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t('searchPlaceholder')} />
      </div>
      {/* 中英切换 — shows the language you'd switch TO. Device-local pref. */}
      <button type="button" onClick={onLang}
        aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', flex: 'none',
          background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)',
          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
          cursor: 'pointer', transition: 'var(--transition-colors)',
        }}>
        <Icon name="languages" size={14} style={{ color: 'var(--text-tertiary)' }} />
        {lang === 'zh' ? 'EN' : '中文'}
      </button>
    </header>
  );
}

// NavRail v2 — pure navigation. The "Following" hardcoded outlet list was
// removed 2026-06-09 once Sources view shipped: it auto-builds the real list
// from window.CD_STORIES so a static left-rail copy was both redundant and
// semantically wrong ("Following" implies user-curated subscriptions).
function NavRail({ view, onView }) {
  return (
    <nav style={{ width: 'var(--rail-left)', flex: 'none', padding: '20px 14px', position: 'sticky', top: 'var(--header-height)', alignSelf: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {window.CD_NAV.map((item) => {
          const active = view === item.id;
          return (
            <button key={item.id} type="button" onClick={() => onView(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 'var(--radius-md)',
              border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
              fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: active ? 600 : 500,
              background: active ? 'var(--surface-active)' : 'transparent',
              color: active ? 'var(--green-800)' : 'var(--text-secondary)',
              transition: 'var(--transition-colors)',
            }}>
              <Icon name={item.icon} size={17} style={{ color: active ? 'var(--green-700)' : 'var(--text-tertiary)' }} />
              {window.CD_T('nav.' + item.id, item.label)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DigestRail({ stories, dayKey = 'today', onPick }) {
  // 为什么是这八类 — taxonomy rationale, collapsed under the pulse so the rail
  // stays scannable; copy lives in CD_DICT (whyCats / whyCatsBody).
  const [whyOpen, setWhyOpen] = React.useState(false);
  // Nothing published in the window yet (e.g. China-morning before the 05:30
  // Beijing crawl) → render nothing instead of an empty box + zeroed pulse.
  if (!stories.length) return <aside style={{ width: 'var(--rail-right)', flex: 'none' }} />;
  const top = [...stories].sort((a, b) => b.score - a.score).slice(0, 3);
  const counts = CATEGORIES.map((c) => ({ ...c, n: stories.filter((s) => s.category === c.id).length }));
  const maxN = Math.max(1, ...counts.map((c) => c.n));
  return (
    <aside style={{ width: 'var(--rail-right)', flex: 'none', padding: '20px 0 40px', position: 'sticky', top: 'var(--header-height)', alignSelf: 'flex-start' }}>
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-xs)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Icon name="sun" size={16} style={{ color: 'var(--green-700)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>{window.CD_T(dayKey === 'today' ? 'todaysSignal' : 'yesterdaySignal')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {top.map((s, i) => (
            <button key={s.id} type="button" onClick={() => onPick(s.id)} style={{ display: 'flex', gap: 10, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--green-600)', flex: 'none', width: 16 }}>{i + 1}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: 'var(--text-primary)' }}>{s.title}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SignalScore score={s.score} size="sm" />
                  <CategoryTag category={s.category} size="sm" variant="dot" />
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '0 18px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 12 }}>{window.CD_T('categoryPulse')} · {window.CD_T(dayKey)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {counts.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '999px', background: `var(--cat-${c.accent})`, flex: 'none' }} />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-secondary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catShort(c)}</span>
              <span style={{ width: 54, height: 4, borderRadius: '999px', background: 'var(--ink-100)', overflow: 'hidden', flex: 'none' }}>
                <span style={{ display: 'block', width: `${(c.n / maxN) * 100}%`, height: '100%', background: `var(--cat-${c.accent})`, opacity: 0.65, borderRadius: '999px' }} />
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', width: 12, textAlign: 'right' }}>{c.n}</span>
            </div>
          ))}
        </div>

        {/* Taxonomy rationale — quiet disclosure so curious readers learn the
            system without the rail shouting at everyone else. */}
        <button type="button" onClick={() => setWhyOpen((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-tertiary)' }}>
          <Icon name={whyOpen ? 'chevron-down' : 'circle-help'} size={13} style={{ color: 'var(--ink-300)' }} />
          <span style={{ borderBottom: '1px dotted var(--border-subtle)' }}>{window.CD_T('whyCats')}</span>
        </button>
        {whyOpen && (
          <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            {window.CD_T('whyCatsBody')}
          </p>
        )}
      </div>
    </aside>
  );
}

// ── Mobile chrome ────────────────────────────────────────────────────────────

// MobileTabBar — NavRail's mobile counterpart: fixed bottom tab bar, native-app
// style (Cindy 2026-06-11). Same CD_NAV items, short labels (navS.*) so all
// five tabs fit at 320px. safe-area padding clears the iPhone home indicator.
function MobileTabBar({ view, onView }) {
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
      display: 'flex', alignItems: 'stretch',
      background: 'rgba(250,250,246,0.92)', backdropFilter: 'saturate(180%) blur(12px)',
      borderTop: '1px solid var(--border-subtle)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {window.CD_NAV.map((item) => {
        const active = view === item.id;
        return (
          <button key={item.id} type="button"
            onClick={() => { onView(item.id); window.scrollTo({ top: 0 }); }}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 0 7px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 10.5, fontWeight: active ? 600 : 500,
              color: active ? 'var(--green-800)' : 'var(--text-tertiary)',
              transition: 'var(--transition-colors)',
            }}>
            <Icon name={item.icon} size={20} style={{ color: active ? 'var(--green-700)' : 'var(--text-tertiary)' }} />
            {window.CD_T('navS.' + item.id, item.label)}
          </button>
        );
      })}
    </nav>
  );
}

// MobileSignalCard — DigestRail's mobile counterpart, folded into the top of
// the feed as a collapsible card (Cindy 2026-06-11). Top-3 only; the category
// pulse is intentionally omitted on mobile to keep the feed close to the fold.
function MobileSignalCard({ stories, dayKey = 'today', onPick }) {
  const [open, setOpen] = React.useState(true);
  if (!stories.length) return null;
  const top = [...stories].sort((a, b) => b.score - a.score).slice(0, 3);
  return (
    <section style={{ marginBottom: 16, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xs)', overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <Icon name="sun" size={15} style={{ color: 'var(--green-700)' }} />
        <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{window.CD_T(dayKey === 'today' ? 'todaysSignal' : 'yesterdaySignal')}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} style={{ color: 'var(--text-tertiary)' }} />
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px 14px' }}>
          {top.map((s, i) => (
            <button key={s.id} type="button" onClick={() => onPick(s.id)} style={{ display: 'flex', gap: 10, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--green-600)', flex: 'none', width: 16 }}>{i + 1}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: 'var(--text-primary)' }}>{s.title}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SignalScore score={s.score} size="sm" />
                  <CategoryTag category={s.category} size="sm" variant="dot" />
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

Object.assign(window, { AppHeader, NavRail, DigestRail, MobileTabBar, MobileSignalCard, useCdMobile });
