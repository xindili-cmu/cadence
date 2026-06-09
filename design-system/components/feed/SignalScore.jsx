import React from 'react';

/**
 * SignalScore — GreenStack's selection score (0–100). The higher the score,
 * the stronger the editorial signal that a story matters to practitioners.
 * Echoes the "精选 NN" badge from the AIHOT reference, restyled as a calm
 * mono chip. `variant`: 'chip' (default) · 'bar' (chip + strength meter).
 */
export function SignalScore({ score = 0, variant = 'chip', size = 'md', style, ...rest }) {
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
