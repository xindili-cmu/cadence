// GreenStack UI kit — app shell: header, left nav rail, right digest rail.
const { Logo, Button, Input, Icon, CategoryTag, SignalScore, CATEGORIES } = window;

function AppHeader({ query, onQuery }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, height: 'var(--header-height)',
      display: 'flex', alignItems: 'center', gap: 20, padding: '0 24px',
      background: 'rgba(250,250,246,0.86)', backdropFilter: 'saturate(180%) blur(12px)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <Logo variant="lockup" height={22} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-pill)', padding: '2px 8px', whiteSpace: 'nowrap' }}>ESG · Climate · Hard tech</span>
      <div style={{ flex: 1, maxWidth: 420, marginLeft: 'auto' }}>
        <Input icon="search" size="sm" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search stories, sources, companies…" />
      </div>
      <button type="button" title="Notifications" style={iconBtn}><Icon name="bell" size={18} style={{ color: 'var(--text-secondary)' }} /></button>
      <Button variant="primary" size="sm" iconStart="sun">8AM Brief</Button>
      <span style={{ width: 30, height: 30, borderRadius: '999px', background: 'var(--green-700)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>JD</span>
    </header>
  );
}

const iconBtn = {
  width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--radius-md)', cursor: 'pointer',
};

// NavRail v2 — pure navigation. The "Following" hardcoded outlet list was
// removed 2026-06-09 once Sources view shipped: it auto-builds the real list
// from window.GS_STORIES so a static left-rail copy was both redundant and
// semantically wrong ("Following" implies user-curated subscriptions).
function NavRail({ view, onView }) {
  return (
    <nav style={{ width: 'var(--rail-left)', flex: 'none', padding: '20px 14px', position: 'sticky', top: 'var(--header-height)', alignSelf: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {window.GS_NAV.map((item) => {
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
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DigestRail({ stories, onPick }) {
  const top = [...stories].sort((a, b) => b.score - a.score).slice(0, 3);
  const counts = CATEGORIES.map((c) => ({ ...c, n: stories.filter((s) => s.category === c.id).length }));
  const maxN = Math.max(1, ...counts.map((c) => c.n));
  return (
    <aside style={{ width: 'var(--rail-right)', flex: 'none', padding: '20px 0 40px', position: 'sticky', top: 'var(--header-height)', alignSelf: 'flex-start' }}>
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-xs)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Icon name="sun" size={16} style={{ color: 'var(--green-700)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>Today's Signal</span>
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
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 12 }}>Category pulse · today</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {counts.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '999px', background: `var(--cat-${c.accent})`, flex: 'none' }} />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-secondary)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.short}</span>
              <span style={{ width: 54, height: 4, borderRadius: '999px', background: 'var(--ink-100)', overflow: 'hidden', flex: 'none' }}>
                <span style={{ display: 'block', width: `${(c.n / maxN) * 100}%`, height: '100%', background: `var(--cat-${c.accent})`, opacity: 0.65, borderRadius: '999px' }} />
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', width: 12, textAlign: 'right' }}>{c.n}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { AppHeader, NavRail, DigestRail });
