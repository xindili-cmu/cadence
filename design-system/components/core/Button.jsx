import React from 'react';
import { Icon } from './Icon.jsx';

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
export function Button({
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
