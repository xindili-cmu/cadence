import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { getCategory } from './categories.js';

/**
 * CategoryTag — the colored label that classifies a story by ESG category.
 * `variant`: 'soft' (tinted pill, default) · 'solid' · 'outline' · 'dot' (text + color dot).
 */
export function CategoryTag({
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
