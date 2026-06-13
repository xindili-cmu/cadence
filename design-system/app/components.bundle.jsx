// AUTO-GENERATED from components/** — do not edit by hand.
// Regenerate: node scripts/build-bundle.js. Exposes all components as globals.
const { useState, useRef, useEffect } = React;


/* ===== components/feed/categories.js ===== */
// Cadence feed categories — shared config consumed by CategoryTag,
// CategoryTabs and NewsCard. Colors resolve to --cat-<accent>* tokens.
// Slug authority for the whole system; scripts/news-refresh.js must match.
const CATEGORIES = [
  { id: 'orthopedic',      label: 'Orthopedic',                  labelZh: '骨科康复',   short: 'Ortho',      shortZh: '骨科', icon: 'bone',            accent: 'ortho' },
  { id: 'neurological',    label: 'Neurological',                labelZh: '神经康复',   short: 'Neuro',      shortZh: '神经', icon: 'brain',           accent: 'neuro' },
  { id: 'sports',          label: 'Sports & Athletic',           labelZh: '运动康复',   short: 'Sports',     shortZh: '运动', icon: 'activity',        accent: 'sports' },
  { id: 'pediatric',       label: 'Pediatric',                   labelZh: '儿童康复',   short: 'Pediatric',  shortZh: '儿科', icon: 'baby',            accent: 'pediatric' },
  { id: 'geriatric',       label: 'Geriatric',                   labelZh: '老年康复',   short: 'Geriatric',  shortZh: '老年', icon: 'person-standing', accent: 'geriatric' },
  { id: 'cardiopulmonary', label: 'Cardiopulmonary',             labelZh: '心肺康复',   short: 'Cardiopulm', shortZh: '心肺', icon: 'heart-pulse',     accent: 'cardiopulm' },
  { id: 'manual-modality', label: 'Manual Therapy & Modalities', labelZh: '手法与理疗', short: 'Manual',     shortZh: '手法', icon: 'hand',            accent: 'manual' },
  { id: 'practice',        label: 'Practice & Profession',       labelZh: '行业与执业', short: 'Practice',   shortZh: '执业', icon: 'briefcase',       accent: 'practice' },
];

// Language-aware label pickers — read window.CD_LANG (set by app.data.jsx) at
// render time, so a language toggle re-render flips every tag/tab in place.
function catLabel(cat) {
  return (typeof window !== 'undefined' && window.CD_LANG === 'zh' && cat.labelZh) || cat.label;
}
function catShort(cat) {
  return (typeof window !== 'undefined' && window.CD_LANG === 'zh' && cat.shortZh) || cat.short;
}

const CATEGORY_MAP = CATEGORIES.reduce((m, c) => { m[c.id] = c; return m; }, {});

function getCategory(id) {
  return CATEGORY_MAP[id] || { id, label: id, short: id, icon: 'circle', accent: 'practice' };
}

// CSS custom-property names for a category's accent trio.
function catVars(accent) {
  return {
    solid: `var(--cat-${accent})`,
    soft:  `var(--cat-${accent}-soft)`,
    ink:   `var(--cat-${accent}-ink)`,
  };
}

// ── Cross-cutting overlays (横切维度) ────────────────────────────────────────
// Not specialties: an item keeps its single clinical `category` AND may carry
// a boolean overlay flag (e.g. tech:true, set by scripts/news-refresh.js
// keyword rules). Overlays get a filter pill, a card chip and a pulse row,
// but never appear in specialty groupings (daily brief sections etc.).
const XCUTS = [
  { id: 'rehab-tech', flag: 'tech', label: 'Rehab Tech', labelZh: '康复科技', short: 'Tech', shortZh: '科技', icon: 'cpu', accent: 'tech' },
];


/* ===== components/core/Icon.jsx ===== */
/**
 * Icon — thin wrapper over Lucide (loaded globally as `window.lucide`).
 * Renders an <i data-lucide> placeholder and asks Lucide to swap it for an
 * inline SVG after mount. Inherits color via currentColor and sizes via the
 * `size` prop (px). Keep Lucide's CDN script on the host page.
 */
function Icon({ name, size = 18, strokeWidth = 1.75, style, className, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
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
// Cadence mark — measured 1:1 from Cindy's chosen generation
// (b9354305*.png): six parallel strokes at 22.49°, flat horizontal cuts,
// bar bottoms on one flat baseline, per-stroke measured widths.
// Geometry verified programmatically against the source image (≤7px @1536px).
const RECTS = [
  [664.6, 410, 40.5, 92],
  [745.6, 343, 42.5, 159],
  [832.5, 277, 42.6, 225],
  [930.0, 121, 46.7, 474],
  [1035.4, 344, 46.9, 158],
  [1128.9, 415, 39.9, 87],
];

function Mark({ height, color }) {
  const w = Math.round(height * 580 / 508);
  return (
    <svg width={w} height={height} viewBox="446 107 580 508" style={{ display: 'block', flex: 'none' }} aria-hidden="true">
      <g transform="skewX(-22.490)" fill={color}>
        {RECTS.map(([x, y, rw, rh], i) => <rect key={i} x={x} y={y} width={rw} height={rh} />)}
      </g>
    </svg>
  );
}

/**
 * Logo — the Cadence mark and lockup.
 * `variant`: 'lockup' (mark + wordmark, default) · 'wordmark' · 'mark'.
 * `tone`: 'default' (blue mark / ink wordmark) · 'inverse' (for dark backgrounds).
 * `withZh`: lockup shows the Chinese name 步频 after the wordmark (default true).
 * Sizes scale from `height` (mark + wordmark cap height in px).
 */
function Logo({ variant = 'lockup', tone = 'default', height = 28, withZh = true, style, ...rest }) {
  const inverse = tone === 'inverse';
  const markColor = inverse ? '#FFFFFF' : 'var(--blue-600)';
  const markSize = Math.round(height * 1.25);

  const Wordmark = (
    <span style={{
      fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: height,
      letterSpacing: '-0.018em', lineHeight: 1, whiteSpace: 'nowrap',
      color: inverse ? '#FFFFFF' : 'var(--ink-900)',
    }}>
      Ca<span style={{ color: inverse ? 'var(--blue-300)' : 'var(--blue-600)' }}>dence</span>
    </span>
  );

  if (variant === 'mark') {
    return <span role="img" aria-label="Cadence" style={{ display: 'inline-flex', ...style }} {...rest}><Mark height={markSize} color={markColor} /></span>;
  }
  if (variant === 'wordmark') {
    return <span role="img" aria-label="Cadence" style={{ display: 'inline-flex', ...style }} {...rest}>{Wordmark}</span>;
  }
  return (
    <span role="img" aria-label="Cadence 步频" style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.36), ...style }} {...rest}>
      <Mark height={markSize} color={markColor} />{Wordmark}
      {withZh && (
        // 中文名「步频」— set in 霞鹜文楷 Light (LXGW WenKai Light, brush-kaiti),
        // demoted to a quiet companion: a hairline rule separates it, deep-ink
        // (ink-800) so the light strokes still hold, sized ~0.82× the cap height.
        // The earlier inline Noto-Sans-SC version read heavier than the wordmark.
        // (Designer handoff, Fulcrum round 1.)
        <>
          <span aria-hidden="true" style={{
            width: 1, height: Math.round(height * 0.82), flex: 'none',
            background: inverse ? 'rgba(255,255,255,0.4)' : 'var(--ink-300)',
          }} />
          <span style={{
            fontFamily: "'LXGW WenKai Light', var(--font-sans)",
            fontSize: Math.round(height * 0.82), lineHeight: 1, whiteSpace: 'nowrap',
            color: inverse ? '#FFFFFF' : 'var(--ink-800)',
          }}>步频</span>
        </>
      )}
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
  const [hover, setHover] = useState(false);
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
  const [focus, setFocus] = useState(false);
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
  const label = useShort ? catShort(cat) : catLabel(cat);

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
  const [hover, setHover] = useState(false);
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
        <Tab id="all" label={(typeof window !== 'undefined' && window.CD_LANG === 'zh') ? '全部' : 'All'} icon={null} accent={null} active={value === 'all'} onClick={onChange} />
      )}
      {CATEGORIES.map((c) => (
        <Tab key={c.id} id={c.id} label={catShort(c)} icon={c.icon} accent={c.accent} active={value === c.id} onClick={onChange} />
      ))}
      {/* Cross-cutting overlays (e.g. 康复科技) — same pill UI, but selecting
          one filters on the overlay flag, not the category field. */}
      {XCUTS.map((c) => (
        <Tab key={c.id} id={c.id} label={catShort(c)} icon={c.icon} accent={c.accent} active={value === c.id} onClick={onChange} />
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
  journalMeta, // { if, quartile, year } from journals.json — IF/JCR badge, research items only
  tech = false, // cross-cutting 康复科技 overlay (AI/VR/robotics/telerehab…)
  onClick, onOpen, style, ...rest
}) {
  const [hover, setHover] = useState(false);
  // i18n — CD_T is defined by app.data.jsx; fall back to the English literal
  // so the component still works standalone (e.g. in the design-system preview).
  const t = (typeof window !== 'undefined' && window.CD_T) || ((k, fb) => fb);
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
        {tech && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: isCompact ? '2px 7px' : '3px 9px', borderRadius: 'var(--radius-pill)',
            fontFamily: 'var(--font-sans)', fontSize: isCompact ? 11 : 12, fontWeight: 500,
            background: 'var(--cat-tech-soft)', color: 'var(--cat-tech-ink)', whiteSpace: 'nowrap',
          }}>
            <Icon name="cpu" size={isCompact ? 10 : 11} strokeWidth={2} />
            {(typeof window !== 'undefined' && window.CD_LANG === 'zh') ? '科技' : 'Tech'}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {time}
        </span>
      </div>

      {/* title — a real link to the original article (the hover underline
          promises "link"; honor it). Card-body clicks select/expand instead. */}
      <h3 style={{
        margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600,
        fontSize: titleSize, lineHeight: isLead ? 1.22 : 1.3,
        letterSpacing: '-0.01em',
      }}>
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: 'var(--text-primary)',
            textDecoration: hover ? 'underline' : 'none', textDecorationColor: 'var(--green-300)',
            textUnderlineOffset: '3px',
          }}>{title}</a>
      </h3>

      {/* summary — compact: always shown as a 2-line teaser; expands to full
          when selected. Default/lead: same expand-on-select behaviour (2 or 4
          lines clamped, full when selected). */}
      {summary && (
        <p style={{
          margin: isCompact ? '6px 0 0' : '8px 0 0',
          fontFamily: 'var(--font-sans)',
          fontSize: isCompact ? 13 : 'var(--text-base)',
          lineHeight: 1.5, color: 'var(--text-secondary)',
          ...(selected ? {} : { display: '-webkit-box', WebkitLineClamp: isLead ? 4 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
        }}>{summary}</p>
      )}

      {/* why it matters — always shown for default/lead; compact shows it only
          when the card is selected (expanded state). */}
      {whyItMatters && (!isCompact || selected) && (
        <div style={{
          display: 'flex', gap: 9, marginTop: 14, padding: '11px 13px',
          background: 'var(--green-50)', border: '1px solid var(--green-100)',
          borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ color: 'var(--green-600)', marginTop: 1 }}><Icon name="sparkles" size={15} strokeWidth={2} /></span>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green-700)', marginBottom: 3 }}>{t('whyMatters', 'Why it matters')}</div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-700)' }}>{whyItMatters}</div>
          </div>
        </div>
      )}

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: isCompact ? 8 : 14 }}>
        <SourceMonogram source={source} accent={cat.accent} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{source}</span>
        {journalMeta && (
          <span
            title={`${journalMeta.name} — ${t('ifTip', 'Journal impact factor')} · ${journalMeta.year} JCR`}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
              padding: '1px 6px', borderRadius: 'var(--radius-xs)', cursor: 'default',
              background: 'var(--green-50)', border: '1px solid var(--green-100)', color: 'var(--green-700)',
            }}>
            IF {journalMeta.if} · {journalMeta.quartile}
          </span>
        )}
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
          {t('readOriginal', 'Read original')} <Icon name="arrow-up-right" size={15} strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}


Object.assign(window, { Logo, Button, Input, Icon, CategoryTag, CategoryTabs, SignalScore, NewsCard, CATEGORIES, CATEGORY_MAP, getCategory, catVars, catLabel, catShort, XCUTS });
