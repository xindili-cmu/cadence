import React from 'react';

/**
 * Icon — thin wrapper over Lucide (loaded globally as `window.lucide`).
 * Renders an <i data-lucide> placeholder and asks Lucide to swap it for an
 * inline SVG after mount. Inherits color via currentColor and sizes via the
 * `size` prop (px). Keep Lucide's CDN script on the host page.
 */
export function Icon({ name, size = 18, strokeWidth = 1.75, style, className, ...rest }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
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
