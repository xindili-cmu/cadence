import React from 'react';

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
export function Logo({ variant = 'lockup', tone = 'default', height = 28, style, ...rest }) {
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
