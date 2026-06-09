import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { CATEGORIES, getCategory } from './categories.js';

function Tab({ id, label, icon, accent, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  const solid = accent ? `var(--cat-${accent})` : 'var(--green-700)';
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 13px', borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: active ? 600 : 500,
        whiteSpace: 'nowrap', cursor: 'pointer', transition: 'var(--transition-colors)',
        border: `1px solid ${active ? 'transparent' : (hover ? 'var(--border-default)' : 'var(--border-subtle)')}`,
        background: active ? 'var(--ink-900)' : (hover ? 'var(--surface-hover)' : 'var(--surface-card)'),
        color: active ? 'var(--paper)' : 'var(--text-secondary)',
      }}
    >
      {icon && (
        <span style={{ width: 8, height: 8, borderRadius: '999px', background: active ? solid : solid, flex: 'none', opacity: active ? 1 : 0.85 }} />
      )}
      {label}
    </button>
  );
}

/**
 * CategoryTabs — the 8-category filter bar that sits above the feed, plus an
 * "All" pill. Controlled via `value` / `onChange`. Active tab is the ink pill;
 * each category keeps its accent dot so the row stays color-legible.
 */
export function CategoryTabs({ value = 'all', onChange = () => {}, includeAll = true, style, ...rest }) {
  return (
    <div
      role="tablist"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', ...style }}
      {...rest}
    >
      {includeAll && (
        <Tab id="all" label="All" icon={null} accent={null} active={value === 'all'} onClick={onChange} />
      )}
      {CATEGORIES.map((c) => (
        <Tab key={c.id} id={c.id} label={c.short} icon={c.icon} accent={c.accent} active={value === c.id} onClick={onChange} />
      ))}
    </div>
  );
}
