import React from 'react';

// PLACEHOLDER pulse-bar mark — three bars in a walking-cadence rhythm.
// Designer round 2 ships the final Cadence mark; replace STACK + Mark then.
const STACK = [
  { x: 7,  h: 9,  o: 0.6 },
  { x: 14, h: 16, o: 0.85 },
  { x: 21, h: 12, o: 1 },
];

/**
 * Logo — the Cadence mark and lockup. (Placeholder until designer round 2.)
 * `variant`: 'lockup' (mark + wordmark, default) · 'wordmark' · 'mark'.
 * `tone`: 'default' (blue tile / ink wordmark) · 'inverse' (for dark backgrounds).
 * Sizes scale from `height` (mark + wordmark cap height in px).
 */
export function Logo({ variant = 'lockup', tone = 'default', height = 28, style, ...rest }) {
  const inverse = tone === 'inverse';
  const tile = inverse ? 'var(--blue-500)' : 'var(--blue-600)';
  const tileSize = Math.round(height * 1.34);

  const Mark = (
    <svg width={tileSize} height={tileSize} viewBox="0 0 32 32" style={{ display: 'block', flex: 'none' }} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={tile} />
      {STACK.map((b, i) => (
        <rect key={i} x={b.x} y={26 - b.h} width="4" height={b.h} rx="2" fill="#FFFFFF" fillOpacity={b.o} />
      ))}
    </svg>
  );

  const Wordmark = (
    <span style={{
      fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: height,
      letterSpacing: '-0.018em', lineHeight: 1, whiteSpace: 'nowrap',
      color: inverse ? '#FFFFFF' : 'var(--ink-900)',
    }}>
      Ca<span style={{ fontWeight: 600, color: inverse ? 'var(--blue-300)' : 'var(--blue-600)' }}>dence</span>
    </span>
  );

  if (variant === 'mark') {
    return <span role="img" aria-label="Cadence" style={{ display: 'inline-flex', ...style }} {...rest}>{Mark}</span>;
  }
  if (variant === 'wordmark') {
    return <span role="img" aria-label="Cadence" style={{ display: 'inline-flex', ...style }} {...rest}>{Wordmark}</span>;
  }
  return (
    <span role="img" aria-label="Cadence" style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.42), ...style }} {...rest}>
      {Mark}{Wordmark}
    </span>
  );
}
