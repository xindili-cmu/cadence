import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * Input — single-line text / search field with optional leading icon.
 * Use `icon="search"` for the feed search box.
 */
export function Input({
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
