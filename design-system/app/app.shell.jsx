// Cadence UI kit — app shell: header, left nav rail, right digest rail,
// plus mobile chrome (bottom tab bar + collapsible signal card).
const { Logo, Button, Input, Icon, CategoryTag, SignalScore, CATEGORIES, catShort, catLabel } = window;

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
  const zh = lang === 'zh';
  // Today's date — bilingual, auto-updates. zh: 2026年6月13日 周六 · en: Sat, Jun 13, 2026
  const _now = new Date();
  const dateStr = zh
    ? `${_now.getFullYear()}年${_now.getMonth() + 1}月${_now.getDate()}日 ${'周日周一周二周三周四周五周六'.slice(_now.getDay() * 2, _now.getDay() * 2 + 2)}`
    : _now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, height: 'var(--header-height)',
      background: 'rgba(250,250,246,0.86)', backdropFilter: 'saturate(180%) blur(12px)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      {/* Inner wrapper shares the body's content-max + padding so the logo
          column lines up exactly with the nav rail below it. */}
      <div style={{
        maxWidth: 'var(--content-max)', margin: '0 auto', height: '100%',
        display: 'flex', alignItems: 'center', gap: mobile ? 12 : 20,
        padding: mobile ? '0 14px' : '0 24px',
      }}>
        {/* Desktop: logo sits in the sidebar column (width = --rail-left),
            full-height hairline divider on its right edge, aligned with NavRail.
            Mobile: plain inline lockup (no rail, so no column/divider). */}
        {mobile ? (
          <Logo variant="lockup" height={20} />
        ) : (
          <div style={{ width: 'var(--rail-left)', flex: 'none', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, borderRight: '1px solid var(--border-subtle)' }}>
            <Logo variant="lockup" height={22} />
            {/* Brand tagline — lives under the wordmark (English in both langs). */}
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Keeping pace with the evidence</span>
          </div>
        )}
        {/* Context title + today's date — sits just past the logo divider, in
            the content area. Brand-level line (not the page heading, which the
            FeedToolbar still renders). Hidden on mobile (no room next to search). */}
        {!mobile && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, lineHeight: 1.15, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{zh ? '今日康复信号' : "Today's rehab signal"}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', marginTop: 2 }}>{dateStr}</span>
          </div>
        )}
        {/* Public read-only platform — header actions: search + language toggle.
            Search sits directly right of the title; EN is pushed to the far right. */}
        <div style={{ flex: mobile ? 1 : 'none', width: mobile ? 'auto' : 'min(420px, 38vw)', minWidth: 0 }}>
          <Input icon="search" size="sm" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t('searchPlaceholder')} />
        </div>
        {!mobile && <span style={{ flex: 1 }} />}
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
      </div>
    </header>
  );
}

// NavRail v2 — pure navigation. The "Following" hardcoded outlet list was
// removed 2026-06-09 once Sources view shipped: it auto-builds the real list
// from window.CD_STORIES so a static left-rail copy was both redundant and
// semantically wrong ("Following" implies user-curated subscriptions).
// SpecBtn — one specialty row in the left rail's 专科 section. Index (01–08 or
// ✦ for the tech overlay) + accent dot + label; active state mirrors the nav.
function SpecBtn({ id, label, dot, idx, active, onClick }) {
  return (
    <button type="button" onClick={() => onClick(id)} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 'var(--radius-md)',
      border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
      fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: active ? 600 : 500,
      background: active ? 'var(--surface-active)' : 'transparent',
      color: active ? 'var(--green-800)' : 'var(--text-secondary)',
      transition: 'var(--transition-colors)',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, width: 14, flex: 'none', textAlign: idx === '✦' ? 'center' : 'left', color: active ? 'var(--green-600)' : 'var(--ink-400)' }}>{idx || ''}</span>
      <span style={{ width: 7, height: 7, borderRadius: '999px', flex: 'none', background: dot || 'transparent' }} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  );
}

// NavBtn — one view row in the left rail. `small` marks the demoted secondary
// links (about / feedback) that sink to the rail bottom.
function NavBtn({ item, active, onView, small }) {
  return (
    <button type="button" onClick={() => onView(item.id)} style={{
      display: 'flex', alignItems: 'center', gap: small ? 9 : 11, padding: small ? '7px 12px' : '9px 12px', borderRadius: 'var(--radius-md)',
      border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
      fontFamily: 'var(--font-sans)', fontSize: small ? 13 : 14, fontWeight: active ? 600 : 500,
      background: active ? 'var(--surface-active)' : 'transparent',
      color: active ? 'var(--green-800)' : (small ? 'var(--text-tertiary)' : 'var(--text-secondary)'),
      transition: 'var(--transition-colors)',
    }}>
      <Icon name={item.icon} size={small ? 16 : 17} style={{ color: active ? 'var(--green-700)' : 'var(--text-tertiary)' }} />
      {window.CD_T('nav.' + item.id, item.label)}
    </button>
  );
}

function NavRail({ view, onView, category, onCategory }) {
  const zh = (typeof window !== 'undefined' && window.CD_LANG === 'zh');
  const eyebrow = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '0 12px', margin: '0 0 7px' };
  // 关于 / 反馈 are low-frequency meta links → sunk to the rail bottom, leaving
  // the content views (curated / all / daily / sources) as the primary group.
  const SECONDARY = ['about', 'feedback'];
  const primaryNav = window.CD_NAV.filter((i) => !SECONDARY.includes(i.id));
  const secondaryNav = window.CD_NAV.filter((i) => SECONDARY.includes(i.id));
  return (
    <nav style={{ width: 'var(--rail-left)', flex: 'none', padding: '20px 14px', position: 'sticky', top: 'var(--header-height)', alignSelf: 'flex-start', height: 'calc(100vh - var(--header-height))', overflowY: 'auto', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-subtle)' }}>
      <div style={eyebrow}>{zh ? '浏览' : 'Browse'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {primaryNav.map((item) => (
          <NavBtn key={item.id} item={item} active={view === item.id} onView={onView} />
        ))}
      </div>

      {/* Specialty filter — moved here from the old top tab bar. Selecting one
          jumps to a feed view (handled by onCategory in app.main). */}
      {typeof onCategory === 'function' && (
        <>
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '16px 8px 14px' }} />
          <div style={eyebrow}>{zh ? '专科' : 'Specialty'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <SpecBtn id="all" label={zh ? '全部' : 'All'} dot={null} idx={null} active={category === 'all'} onClick={onCategory} />
            {CATEGORIES.map((c, i) => (
              <SpecBtn key={c.id} id={c.id} label={catLabel(c)} dot={`var(--cat-${c.accent})`} idx={String(i + 1).padStart(2, '0')} active={category === c.id} onClick={onCategory} />
            ))}
            {(window.XCUTS || []).map((x) => (
              <SpecBtn key={x.id} id={x.id} label={catLabel(x)} dot={`var(--cat-${x.accent})`} idx={'✦'} active={category === x.id} onClick={onCategory} />
            ))}
          </div>
        </>
      )}

      {/* Secondary / meta links — sunk to the rail bottom, smaller + muted. */}
      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {secondaryNav.map((item) => (
            <NavBtn key={item.id} item={item} active={view === item.id} onView={onView} small />
          ))}
        </div>
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
  // Ranked distribution: keep each specialty's taxonomy index (01–08) but sort
  // rows by today's volume so the most-covered area reads first.
  const counts = CATEGORIES
    .map((c, i) => ({ ...c, idx: i + 1, n: stories.filter((s) => s.category === c.id).length }))
    .sort((a, b) => b.n - a.n);
  const maxN = Math.max(1, ...counts.map((c) => c.n));
  const activeCats = counts.filter((c) => c.n > 0).length;
  const pulseZh = (typeof window !== 'undefined' && window.CD_LANG === 'zh');
  // AI 速读 — a grounded one-line digest. Counts + top signal are COMPUTED from
  // the AI-scored data (no generative prose, so nothing to hallucinate); the
  // top story's own title carries the "strongest signal". Retraction/flag lines
  // are intentionally omitted until the data carries a real marker for them.
  const briefTop = top[0];
  const brief = pulseZh
    ? `今日共 ${stories.length} 篇，覆盖 ${activeCats} 个专科。最强信号：${briefTop.title}（SIGNAL ${briefTop.score}）。`
    : `${stories.length} ${stories.length === 1 ? 'item' : 'items'} today across ${activeCats} ${activeCats === 1 ? 'specialty' : 'specialties'}. Top signal: ${briefTop.title} (SIGNAL ${briefTop.score}).`;
  // 本周信号榜 — quiet-day rescue (Cindy 2026-06-14). When today is thin (≤2),
  // surface the last 7 days' highest-SIGNAL items so the rail isn't a near-empty
  // box. Ranked by score, ties broken newest-first; today's already-shown items
  // are removed so the board never repeats the Today's Signal list. Draws from
  // the canonical CD_STORIES pool (all dates), not `stories` (today only).
  const quietDay = stories.length <= 2;
  const shownIds = new Set(top.map((s) => s.id));
  const nowMs = Date.now();
  const weekly = quietDay
    ? (window.CD_STORIES || [])
        .filter((s) => {
          if (!s.publishedAt) return false;
          const age = nowMs - new Date(s.publishedAt).getTime();
          return age >= 0 && age <= 7 * 864e5 && !shownIds.has(s.id);
        })
        .sort((a, b) => (b.score - a.score) || (new Date(b.publishedAt) - new Date(a.publishedAt)))
        .slice(0, 5)
    : [];
  return (
    <aside style={{ width: 'var(--rail-right)', flex: 'none', padding: '20px 0 40px 22px', position: 'sticky', top: 'var(--header-height)', alignSelf: 'flex-start', minHeight: 'calc(100vh - var(--header-height))', borderLeft: '1px solid var(--border-subtle)' }}>
      {/* AI 速读 — the one dark surface in the chrome (deliberate focal contrast). */}
      <div style={{ background: 'var(--ink-900)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 16, boxShadow: 'var(--shadow-xs)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
          <Icon name="sparkles" size={15} style={{ color: 'var(--blue-300)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-300)' }}>{pulseZh ? 'AI 速读' : 'AI briefing'}</span>
        </div>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-on-inverse)' }}>{brief}</p>
      </div>
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

      {/* 本周信号榜 — only on quiet days; mirrors Today's Signal row styling so the
          two cards read as siblings, differentiated by the trophy + 7-day kicker. */}
      {weekly.length > 0 && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-xs)', marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <Icon name="trophy" size={16} style={{ color: 'var(--green-700)' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>{window.CD_T('weeklyTop')}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 14, paddingLeft: 24 }}>{window.CD_T('weeklyTopSub')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {weekly.map((s, i) => (
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
      )}

      <div style={{ marginTop: 16, padding: '0 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{window.CD_T('categoryPulse')} · {window.CD_T(dayKey)}</span>
          <span style={{ flex: 1 }} />
          {/* 分类是怎么定的 — taxonomy rationale toggle, sits beside the pulse
              header (Cindy 2026-06-12); explanation expands above the bars. */}
          <button type="button" onClick={() => setWhyOpen((v) => !v)}
            title={window.CD_T('whyCats')} aria-expanded={whyOpen}
            style={{ display: 'inline-flex', alignItems: 'center', padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name={whyOpen ? 'chevron-up' : 'circle-help'} size={14} style={{ color: whyOpen ? 'var(--text-secondary)' : 'var(--ink-300)' }} />
          </button>
        </div>
        {/* header stat — total volume + how many specialties it spans today */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 13 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 21, fontWeight: 600, color: 'var(--blue-600)' }}>{stories.length}</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-tertiary)' }}>
            {pulseZh ? `篇 · 横跨 ${activeCats} 个专科` : `stories · ${activeCats} ${activeCats === 1 ? 'specialty' : 'specialties'}`}
          </span>
        </div>
        {whyOpen && (
          <p style={{ margin: '0 0 14px', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            {window.CD_T('whyCatsBody')}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {/* Only specialties with stories today — keeps the pulse from reading
              as a wall of zeros on light days. The rest collapse to one line. */}
          {counts.filter((c) => c.n > 0).map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-400)', width: 16, flex: 'none' }}>{String(c.idx).padStart(2, '0')}</span>
              <span style={{ width: 8, height: 8, borderRadius: '999px', background: `var(--cat-${c.accent})`, flex: 'none' }} />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-secondary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel(c)}</span>
              <span style={{ width: 54, height: 4, borderRadius: '999px', background: 'var(--ink-100)', overflow: 'hidden', flex: 'none' }}>
                <span style={{ display: 'block', width: `${(c.n / maxN) * 100}%`, height: '100%', background: `var(--cat-${c.accent})`, opacity: 0.65, borderRadius: '999px' }} />
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', width: 12, textAlign: 'right' }}>{c.n}</span>
            </div>
          ))}
          {/* Remaining specialties with nothing today — one quiet line. */}
          {(counts.length - activeCats) > 0 && (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--text-tertiary)', paddingTop: activeCats ? 2 : 0 }}>
              {pulseZh
                ? `其余 ${counts.length - activeCats} 个专科今日无更新`
                : `${counts.length - activeCats} more ${counts.length - activeCats === 1 ? 'specialty' : 'specialties'} quiet today`}
            </div>
          )}
          {/* Cross-cutting overlay (e.g. 康复科技) — only when it has items today;
              separated by a hairline because it counts across the specialties. */}
          {(window.XCUTS || []).map((x) => {
            const n = stories.filter((s) => s[x.flag]).length;
            if (!n) return null;
            return (
              <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 9 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-400)', width: 16, flex: 'none', textAlign: 'center' }}>✦</span>
                <span style={{ width: 8, height: 8, borderRadius: '999px', background: `var(--cat-${x.accent})`, flex: 'none' }} />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-secondary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel(x)}</span>
                <span style={{ width: 54, height: 4, borderRadius: '999px', background: 'var(--ink-100)', overflow: 'hidden', flex: 'none' }}>
                  <span style={{ display: 'block', width: `${Math.min(100, (n / Math.max(1, stories.length)) * 100)}%`, height: '100%', background: `var(--cat-${x.accent})`, opacity: 0.65, borderRadius: '999px' }} />
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', width: 12, textAlign: 'right' }}>{n}</span>
              </div>
            );
          })}
        </div>

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
