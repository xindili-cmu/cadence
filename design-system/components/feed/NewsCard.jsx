import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { CategoryTag } from './CategoryTag.jsx';
import { SignalScore } from './SignalScore.jsx';
import { getCategory } from './categories.js';

function SourceMonogram({ source, accent }) {
  const letter = (source || '?').trim().charAt(0).toUpperCase();
  return (
    <span style={{
      width: 18, height: 18, borderRadius: 'var(--radius-xs)', flex: 'none',
      background: `var(--cat-${accent}-soft)`, color: `var(--cat-${accent}-ink)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
    }}>{letter}</span>
  );
}

/**
 * NewsCard — the core feed unit. A story = title + source + date + category +
 * SignalScore, plus GreenStack's signature "why it matters" note (the AIHOT
 * 推荐理由 device). States: default · hover (lift + green border) · selected
 * (green rail + tint). `variant`: 'default' | 'compact' | 'lead'.
 */
export function NewsCard({
  title, summary, source, sourceUrl = '#', time, date, category,
  score, whyItMatters, variant = 'default', selected = false,
  onClick, onOpen, style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const cat = getCategory(category);
  const isLead = variant === 'lead';
  const isCompact = variant === 'compact';

  const borderColor = selected ? 'var(--green-600)'
    : hover ? 'var(--green-300)' : 'var(--border-subtle)';

  const titleSize = isLead ? 'var(--text-2xl)' : isCompact ? 'var(--text-base)' : 'var(--text-lg)';

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        position: 'relative', boxSizing: 'border-box',
        background: selected ? 'var(--surface-active)' : 'var(--surface-card)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-lg)',
        padding: isCompact ? '14px 16px' : isLead ? '24px 26px' : '18px 20px',
        boxShadow: hover && !selected ? 'var(--shadow-card-hover)' : 'var(--shadow-xs)',
        transform: hover && !selected ? 'translateY(-1px)' : 'none',
        transition: 'var(--transition-card)', cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      {...rest}
    >
      {selected && (
        <span style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--green-600)' }} />
      )}

      {/* meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isCompact ? 8 : 11 }}>
        {typeof score === 'number' && <SignalScore score={score} size={isCompact ? 'sm' : 'md'} />}
        <CategoryTag category={category} size={isCompact ? 'sm' : 'md'} useShort={isLead ? false : true} />
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {time}
        </span>
      </div>

      {/* title */}
      <h3 style={{
        margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600,
        fontSize: titleSize, lineHeight: isLead ? 1.22 : 1.3,
        letterSpacing: '-0.01em', color: 'var(--text-primary)',
        textDecoration: hover ? 'underline' : 'none', textDecorationColor: 'var(--green-300)',
        textUnderlineOffset: '3px',
      }}>{title}</h3>

      {/* summary */}
      {summary && !isCompact && (
        <p style={{
          margin: '8px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
          lineHeight: 1.5, color: 'var(--text-secondary)',
          display: '-webkit-box', WebkitLineClamp: isLead ? 4 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{summary}</p>
      )}

      {/* why it matters */}
      {whyItMatters && !isCompact && (
        <div style={{
          display: 'flex', gap: 9, marginTop: 14, padding: '11px 13px',
          background: 'var(--green-50)', border: '1px solid var(--green-100)',
          borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ color: 'var(--green-600)', marginTop: 1 }}><Icon name="sparkles" size={15} strokeWidth={2} /></span>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green-700)', marginBottom: 3 }}>Why it matters</div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-700)' }}>{whyItMatters}</div>
          </div>
        </div>
      )}

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: isCompact ? 8 : 14 }}>
        <SourceMonogram source={source} accent={cat.accent} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{source}</span>
        <span style={{ color: 'var(--ink-300)' }}>·</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{date}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen ? onOpen() : window.open(sourceUrl, '_blank'); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            color: hover ? 'var(--green-700)' : 'var(--text-tertiary)', transition: 'var(--transition-colors)',
          }}
        >
          Read original <Icon name="arrow-up-right" size={15} strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}
