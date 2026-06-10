import React from 'react';

// Cadence mark — five staggered beat-bars + the stride slash, ALL parallel
// at the same 18° lean (the bars are short strokes of the same gesture;
// the slash is simply the long one). Favicon = simplified 3-bar cut.
const BARS = [
  { x: 1,    y: 21.5, h: 5.5 },
  { x: 6,    y: 16.9, h: 9.5 },
  { x: 11,   y: 12.3, h: 13.5 },
  { x: 21,   y: 12.6, h: 12 },
  { x: 26,   y: 19,   h: 5 },
];

function Mark({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 32" style={{ display: 'block', flex: 'none' }} aria-hidden="true">
      <g transform="translate(8.5 0) skewX(-18.13)">
        {BARS.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width="2.6" height={b.h} fill={color} />
        ))}
      </g>
      <line x1="15.8" y1="30.5" x2="25.3" y2="1.5" stroke={color} strokeWidth="3" strokeLinecap="butt" />
    </svg>
  );
}

/**
 * Logo — the Cadence mark and lockup.
 * `variant`: 'lockup' (mark + wordmark, default) · 'wordmark' · 'mark'.
 * `tone`: 'default' (blue mark / ink wordmark) · 'inverse' (for dark backgrounds).
 * Sizes scale from `height` (mark + wordmark cap height in px).
 */
export function Logo({ variant = 'lockup', tone = 'default', height = 28, style, ...rest }) {
  const inverse = tone === 'inverse';
  const markColor = inverse ? '#FFFFFF' : 'var(--blue-600)';
  const markSize = Math.round(height * 1.3);

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
    return <span role="img" aria-label="Cadence" style={{ display: 'inline-flex', ...style }} {...rest}><Mark size={markSize} color={markColor} /></span>;
  }
  if (variant === 'wordmark') {
    return <span role="img" aria-label="Cadence" style={{ display: 'inline-flex', ...style }} {...rest}>{Wordmark}</span>;
  }
  return (
    <span role="img" aria-label="Cadence" style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.36), ...style }} {...rest}>
      <Mark size={markSize} color={markColor} />{Wordmark}
    </span>
  );
}
