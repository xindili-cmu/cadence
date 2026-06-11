import React from 'react';

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
export function Logo({ variant = 'lockup', tone = 'default', height = 28, withZh = true, style, ...rest }) {
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
