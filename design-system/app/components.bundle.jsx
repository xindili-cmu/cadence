// AUTO-GENERATED from components/** — do not edit by hand.
// Regenerate by re-running the concat script. Exposes all components as globals.
const { useState, useRef, useEffect } = React;


/* ===== components/feed/categories.js ===== */
// GreenStack feed categories — shared config consumed by CategoryTag,
// CategoryTabs and NewsCard. Colors resolve to --cat-<accent>* tokens.
const CATEGORIES = [
  { id: 'clean-power',     label: 'Clean Power',                 short: 'Clean Power',     icon: 'sun',              accent: 'power' },
  { id: 'electrification', label: 'Electrification & Efficiency', short: 'Electrification', icon: 'battery-charging', accent: 'electric' },
  { id: 'industrial',      label: 'Industrial Decarbonization',  short: 'Industrial',      icon: 'factory',          accent: 'industrial' },
  { id: 'grid',            label: 'Grid Tech',                   short: 'Grid Tech',       icon: 'waypoints',        accent: 'grid' },
  { id: 'robotics',        label: 'Robotics & Physical AI',      short: 'Robotics',        icon: 'bot',              accent: 'robotics' },
  { id: 'agriculture',     label: 'Agriculture & Food',          short: 'Agriculture',     icon: 'sprout',           accent: 'agri' },
  { id: 'social',          label: 'Social',                      short: 'Social',          icon: 'users',            accent: 'social' },
  { id: 'governance',      label: 'Governance',                  short: 'Governance',      icon: 'scale',            accent: 'governance' },
];

const CATEGORY_MAP = CATEGORIES.reduce((m, c) => { m[c.id] = c; return m; }, {});

function getCategory(id) {
  return CATEGORY_MAP[id] || { id, label: id, short: id, icon: 'circle', accent: 'electric' };
}

// CSS custom-property names for a category's accent trio.
function catVars(accent) {
  return {
    solid: `var(--cat-${accent})`,
    soft:  `var(--cat-${accent}-soft)`,
    ink:   `var(--cat-${accent}-ink)`,
  };
}


/* ===== components/core/Icon.jsx ===== */

/**
 * Icon — thin wrapper over Lucide (loaded globally as `window.lucide`).
 * Renders an <i data-lucide> placeholder and asks Lucide to swap it for an
 * inline SVG after mount. Inherits color via currentColor and sizes via the
 * `size` prop (px). Keep Lucide's CDN script on the host page.
 */
function Icon({ name, size = 18, strokeWidth = 1.75, style, className, ...rest }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const host = ref.current;
    if (!host || !window.lucide) return;
    host.innerHTML = '';
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    host.appendChild(i);
    try { window.lucide.createIcons({ nameAttr: 'data-lucide', root: host }); } catch (e) { /* noop */ }
    const svg = host.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('stroke-width', strokeWidth);
    }
  }, [name, size, strokeWidth]);

  return (
    <span
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ display: 'inline-flex', width: size, height: size, lineHeight: 0, flex: 'none', ...style }}
      {...rest}
    />
  );
}


/* ===== components/brand/Logo.jsx ===== */

const STACK = [
  { x: 6,  y: 20.5, o: 0.62 },
  { x: 9,  y: 14.2, o: 0.82 },
  { x: 12, y: 7.9,  o: 1 },
];

/**
 * Logo — the GreenStack mark and lockup.
 * `variant`: 'lockup' (mark + wordmark, default) · 'wordmark' · 'mark'.
 * `tone`: 'default' (green tile / ink wordmark) · 'inverse' (for dark backgrounds).
 * Sizes scale from `height` (mark + wordmark cap height in px).
 */
function Logo({ variant = 'lockup', tone = 'default', height = 28, style, ...rest }) {
  const inverse = tone === 'inverse';
  const tile = inverse ? 'var(--green-600)' : 'var(--green-700)';
  const tileSize = Math.round(height * 1.34);

  const Mark = (
    <svg width={tileSize} height={tileSize} viewBox="0 0 32 32" style={{ display: 'block', flex: 'none' }} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={tile} />
      {STACK.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width="15" height="3.6" rx="1.8" fill="#FFFFFF" fillOpacity={b.o} />
      ))}
    </svg>
  );

  const Wordmark = (
    <span style={{
      fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: height,
      letterSpacing: '-0.018em', lineHeight: 1, whiteSpace: 'nowrap',
      color: inverse ? '#FFFFFF' : 'var(--ink-900)',
    }}>
      Green<span style={{ fontWeight: 600, color: inverse ? 'var(--green-300)' : 'var(--green-700)' }}>Stack</span>
    </span>
  );

  if (variant === 'mark') {
    return <span role="img" aria-label="GreenStack" style={{ display: 'inline-flex', ...style }} {...rest}>{Mark}</span>;
  }
  if (variant === 'wordmark') {
    return <span role="img" aria-label="GreenStack" style={{ display: 'inline-flex', ...style }} {...rest}>{Wordmark}</span>;
  }
  return (
    <span role="img" aria-label="GreenStack" style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.42), ...style }} {...rest}>
      {Mark}{Wordmark}
    </span>
  );
}


/* ===== components/core/Button.jsx ===== */

const SIZES = {
  sm: { height: 30, padding: '0 12px', font: 13, gap: 6, icon: 15 },
  md: { height: 38, padding: '0 16px', font: 14, gap: 7, icon: 17 },
  lg: { height: 46, padding: '0 22px', font: 15, gap: 8, icon: 19 },
};

function variantStyle(variant, disabled) {
  const base = {
    primary: {
      background: disabled ? 'var(--ink-200)' : 'var(--color-primary)',
      color: disabled ? 'var(--text-disabled)' : 'var(--on-primary)',
      border: '1px solid transparent',
    },
    secondary: {
      background: 'var(--surface-card)',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
      border: '1px solid var(--border-default)',
    },
    ghost: {
      background: 'transparent',
      color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
      border: '1px solid transparent',
    },
    quiet: {
      background: 'transparent',
      color: disabled ? 'var(--text-disabled)' : 'var(--color-primary)',
      border: '1px solid transparent',
    },
  };
  return base[variant] || base.primary;
}

/**
 * Button — primary actions, filters, and toolbar controls.
 * variants: primary | secondary | ghost | quiet · sizes: sm | md | lg.
 */
function Button({
  children, variant = 'primary', size = 'md', iconStart, iconEnd,
  disabled = false, fullWidth = false, onClick, type = 'button', style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const vs = variantStyle(variant, disabled);

  const hoverStyle = (!disabled && hover) ? {
    primary:   { background: 'var(--color-primary-hover)' },
    secondary: { background: 'var(--surface-hover)', borderColor: 'var(--border-strong)' },
    ghost:     { background: 'var(--surface-hover)', color: 'var(--text-primary)' },
    quiet:     { background: 'var(--color-primary-soft)' },
  }[variant] : null;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: s.gap, height: s.height, padding: s.padding, width: fullWidth ? '100%' : 'auto',
        fontFamily: 'var(--font-sans)', fontSize: s.font, fontWeight: 600,
        letterSpacing: '-0.005em', borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        transition: 'var(--transition-colors)', ...vs, ...hoverStyle, ...style,
      }}
      {...rest}
    >
      {iconStart && <Icon name={iconStart} size={s.icon} />}
      {children}
      {iconEnd && <Icon name={iconEnd} size={s.icon} />}
    </button>
  );
}


/* ===== components/core/Input.jsx ===== */

/**
 * Input — single-line text / search field with optional leading icon.
 * Use `icon="search"` for the feed search box.
 */
function Input({
  value, defaultValue, onChange, placeholder, icon, type = 'text',
  size = 'md', disabled = false, fullWidth = true, onKeyDown, style, ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const dims = size === 'sm'
    ? { height: 34, font: 13, pad: 10, icon: 15 }
    : { height: 40, font: 14, pad: 12, icon: 17 };

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      width: fullWidth ? '100%' : 'auto', height: dims.height,
      padding: `0 ${dims.pad}px`, boxSizing: 'border-box',
      background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
      border: `1px solid ${focus ? 'var(--border-focus)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: focus ? 'var(--focus-ring)' : 'none',
      transition: 'var(--transition-colors), box-shadow var(--duration-fast) var(--ease-standard)',
      ...style,
    }}>
      {icon && <Icon name={icon} size={dims.icon} style={{ color: 'var(--text-tertiary)' }} />}
      <input
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontFamily: 'var(--font-sans)', fontSize: dims.font, color: 'var(--text-primary)',
        }}
        {...rest}
      />
    </div>
  );
}


/* ===== components/feed/SignalScore.jsx ===== */

/**
 * SignalScore — GreenStack's selection score (0–100). The higher the score,
 * the stronger the editorial signal that a story matters to practitioners.
 * Echoes the "精选 NN" badge from the AIHOT reference, restyled as a calm
 * mono chip. `variant`: 'chip' (default) · 'bar' (chip + strength meter).
 */
function SignalScore({ score = 0, variant = 'chip', size = 'md', style, ...rest }) {
  const v = Math.max(0, Math.min(100, Math.round(score)));
  const tier = v >= 85 ? 'high' : v >= 65 ? 'mid' : 'low';
  const color = tier === 'high' ? 'var(--green-700)' : tier === 'mid' ? 'var(--green-600)' : 'var(--ink-500)';
  const bg = tier === 'high' ? 'var(--green-100)' : tier === 'mid' ? 'var(--green-50)' : 'var(--ink-100)';
  const dims = size === 'sm' ? { font: 11, pad: '2px 7px', label: 9 } : { font: 12, pad: '3px 9px', label: 10 };

  const chip = (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5, padding: dims.pad,
      background: bg, color, borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: dims.font, letterSpacing: '0.02em',
    }}>
      <span style={{ fontSize: dims.label, fontWeight: 500, opacity: 0.7, letterSpacing: '0.08em' }}>SIGNAL</span>
      {v}
    </span>
  );

  if (variant === 'bar') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }} {...rest}>
        {chip}
        <span style={{ width: 48, height: 4, borderRadius: '999px', background: 'var(--ink-200)', overflow: 'hidden', flex: 'none' }}>
          <span style={{ display: 'block', width: `${v}%`, height: '100%', background: color, borderRadius: '999px' }} />
        </span>
      </span>
    );
  }
  return <span style={style} {...rest}>{chip}</span>;
}


/* ===== components/feed/CategoryTag.jsx ===== */

/**
 * CategoryTag — the colored label that classifies a story by ESG category.
 * `variant`: 'soft' (tinted pill, default) · 'solid' · 'outline' · 'dot' (text + color dot).
 */
function CategoryTag({
  category, variant = 'soft', size = 'md', withIcon = true, useShort = false, style, ...rest
}) {
  const cat = getCategory(category);
  const solid = `var(--cat-${cat.accent})`;
  const soft = `var(--cat-${cat.accent}-soft)`;
  const ink = `var(--cat-${cat.accent}-ink)`;
  const label = useShort ? cat.short : cat.label;

  const dims = size === 'sm'
    ? { font: 11, pad: '2px 7px', gap: 4, icon: 12, radius: 'var(--radius-sm)' }
    : { font: 12, pad: '3px 9px', gap: 5, icon: 13, radius: 'var(--radius-sm)' };

  const skins = {
    soft:    { background: soft, color: ink, border: '1px solid transparent' },
    solid:   { background: solid, color: '#fff', border: '1px solid transparent' },
    outline: { background: 'transparent', color: ink, border: `1px solid ${solid}` },
    dot:     { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent', padding: 0 },
  };
  const skin = skins[variant] || skins.soft;

  if (variant === 'dot') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: dims.font, fontWeight: 500, color: 'var(--text-secondary)', ...style }} {...rest}>
        <span style={{ width: 8, height: 8, borderRadius: '999px', background: solid, flex: 'none' }} />
        {label}
      </span>
    );
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: dims.gap,
      padding: dims.pad, borderRadius: dims.radius,
      fontFamily: 'var(--font-sans)', fontSize: dims.font, fontWeight: 500,
      letterSpacing: '0.005em', lineHeight: 1.3, whiteSpace: 'nowrap', ...skin, ...style,
    }} {...rest}>
      {withIcon && <Icon name={cat.icon} size={dims.icon} strokeWidth={2} />}
      {label}
    </span>
  );
}


/* ===== components/feed/CategoryTabs.jsx ===== */

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
function CategoryTabs({ value = 'all', onChange = () => {}, includeAll = true, style, ...rest }) {
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


/* ===== components/feed/NewsCard.jsx ===== */

function SourceMonogram({ source, accent }) {
  const letter = (source || '?').trim().charAt(0).toUpperCase();
  return (
    <span style={{
      width: 18, height: 18, borderRadius: 'var(--radius-xs)', flex: 'none',
      background: `var(--cat-${accent}-soft)`, color: `var(--cat-${accent}-ink)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
    }}>{letter}</span>
  );
}

/**
 * NewsCard — the core feed unit. A story = title + source + date + category +
 * SignalScore, plus GreenStack's signature "why it matters" note (the AIHOT
 * 推荐理由 device). States: default · hover (lift + green border) · selected
 * (green rail + tint). `variant`: 'default' | 'compact' | 'lead'.
 */
function NewsCard({
  title, summary, source, sourceUrl = '#', time, date, category,
  score, whyItMatters, variant = 'default', selected = false,
  onClick, onOpen, style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const cat = getCategory(category);
  const isLead = variant === 'lead';
  const isCompact = variant === 'compact';

  const borderColor = selected ? 'var(--green-600)'
    : hover ? 'var(--green-300)' : 'var(--border-subtle)';

  const titleSize = isLead ? 'var(--text-2xl)' : isCompact ? 'var(--text-base)' : 'var(--text-lg)';

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        position: 'relative', boxSizing: 'border-box',
        background: selected ? 'var(--surface-active)' : 'var(--surface-card)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-lg)',
        padding: isCompact ? '14px 16px' : isLead ? '24px 26px' : '18px 20px',
        boxShadow: hover && !selected ? 'var(--shadow-card-hover)' : 'var(--shadow-xs)',
        transform: hover && !selected ? 'translateY(-1px)' : 'none',
        transition: 'var(--transition-card)', cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      {...rest}
    >
      {selected && (
        <span style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--green-600)' }} />
      )}

      {/* meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isCompact ? 8 : 11 }}>
        {typeof score === 'number' && <SignalScore score={score} size={isCompact ? 'sm' : 'md'} />}
        <CategoryTag category={category} size={isCompact ? 'sm' : 'md'} useShort={isLead ? false : true} />
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {time}
        </span>
      </div>

      {/* title */}
      <h3 style={{
        margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600,
        fontSize: titleSize, lineHeight: isLead ? 1.22 : 1.3,
        letterSpacing: '-0.01em', color: 'var(--text-primary)',
        textDecoration: hover ? 'underline' : 'none', textDecorationColor: 'var(--green-300)',
        textUnderlineOffset: '3px',
      }}>{title}</h3>

      {/* summary */}
      {summary && !isCompact && (
        <p style={{
          margin: '8px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
          lineHeight: 1.5, color: 'var(--text-secondary)',
          display: '-webkit-box', WebkitLineClamp: isLead ? 4 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{summary}</p>
      )}

      {/* why it matters */}
      {whyItMatters && !isCompact && (
        <div style={{
          display: 'flex', gap: 9, marginTop: 14, padding: '11px 13px',
          background: 'var(--green-50)', border: '1px solid var(--green-100)',
          borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ color: 'var(--green-600)', marginTop: 1 }}><Icon name="sparkles" size={15} strokeWidth={2} /></span>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green-700)', marginBottom: 3 }}>Why it matters</div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-700)' }}>{whyItMatters}</div>
          </div>
        </div>
      )}

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: isCompact ? 8 : 14 }}>
        <SourceMonogram source={source} accent={cat.accent} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{source}</span>
        <span style={{ color: 'var(--ink-300)' }}>·</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{date}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen ? onOpen() : window.open(sourceUrl, '_blank'); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            color: hover ? 'var(--green-700)' : 'var(--text-tertiary)', transition: 'var(--transition-colors)',
          }}
        >
          Read original <Icon name="arrow-up-right" size={15} strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}


Object.assign(window, { Logo, Button, Input, Icon, CategoryTag, CategoryTabs, SignalScore, NewsCard, CATEGORIES, CATEGORY_MAP, getCategory, catVars });
