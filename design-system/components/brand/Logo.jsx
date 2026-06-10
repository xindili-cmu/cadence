import React from 'react';

// Cadence mark — four bars in a walking-cadence rhythm (rise · peak · settle),
// echoing steps-per-minute, the gait metric PTs measure. Final mark, designer round 2.
const STACK = [
  { x: 4,  h: 9,  o: 0.55 },
  { x: 11, h: 15, o: 0.78 },
  { x: 18, h: 19, o: 1 },
  { x: 25, h: 13, o: 0.7 },
];

/**
 * Logo — the Cadence mark and lockup.
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
