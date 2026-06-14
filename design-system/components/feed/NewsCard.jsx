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
  mobile = false, // narrow-screen layout: lead card drops its left SIGNAL gutter
  journalMeta, // { if, quartile, year } from journals.json — IF/JCR badge, research items only
  tech = false, // cross-cutting 康复科技 overlay (AI/VR/robotics/telerehab…)
  onClick, onOpen, style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  // i18n — CD_T is defined by app.data.jsx; fall back to the English literal
  // so the component still works standalone (e.g. in the design-system preview).
  const t = (typeof window !== 'undefined' && window.CD_T) || ((k, fb) => fb);
  const cat = getCategory(category);
  const isLead = variant === 'lead';
  const isCompact = variant === 'compact';

  const borderColor = selected ? 'var(--green-600)'
    : hover ? 'var(--green-300)' : 'var(--border-subtle)';

  const titleSize = isLead ? (mobile ? 'var(--text-xl)' : 'var(--text-2xl)') : isCompact ? 'var(--text-base)' : 'var(--text-lg)';

  // ── shared sub-elements (reused by both the default and lead layouts) ──
  const techChip = tech && (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: isCompact ? '2px 7px' : '3px 9px', borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-sans)', fontSize: isCompact ? 11 : 12, fontWeight: 500,
      background: 'var(--cat-tech-soft)', color: 'var(--cat-tech-ink)', whiteSpace: 'nowrap',
    }}>
      <Icon name="cpu" size={isCompact ? 10 : 11} strokeWidth={2} />
      {(typeof window !== 'undefined' && window.CD_LANG === 'zh') ? '科技' : 'Tech'}
    </span>
  );

  const timeEl = (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
      {time}
    </span>
  );

  const titleEl = (
    <h3 style={{
      margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600,
      fontSize: titleSize, lineHeight: isLead ? 1.22 : 1.3,
      letterSpacing: '-0.01em',
    }}>
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          color: 'var(--text-primary)',
          textDecoration: hover ? 'underline' : 'none', textDecorationColor: 'var(--green-300)',
          textUnderlineOffset: '3px',
        }}>{title}</a>
    </h3>
  );

  const summaryEl = summary && (
    <p style={{
      margin: isCompact ? '6px 0 0' : '8px 0 0',
      fontFamily: 'var(--font-sans)',
      fontSize: isCompact ? 13 : 'var(--text-base)',
      lineHeight: 1.5, color: 'var(--text-secondary)',
      ...(selected ? {} : { display: '-webkit-box', WebkitLineClamp: isLead ? 4 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
    }}>{summary}</p>
  );

  // why it matters — always shown for default/lead; compact shows it only
  // when the card is selected (expanded state).
  const whyEl = whyItMatters && (!isCompact || selected) && (
    <aside style={{
      position: 'relative', display: 'flex', gap: isLead ? 12 : 10, marginTop: 14,
      padding: isLead ? '14px 16px 14px 16px' : '12px 14px 12px 14px',
      background: 'var(--blue-50)', border: '1px solid var(--blue-100)',
      borderLeft: '3px solid var(--blue-600)', borderRadius: 'var(--radius-md)',
    }}>
      <span style={{ flex: 'none', marginTop: 1, color: 'var(--blue-600)' }}>
        <Icon name="stethoscope" size={isLead ? 18 : 16} strokeWidth={2} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: isLead ? 13 : 12, fontWeight: 700, color: 'var(--blue-800)', letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>{t('whyMatters', 'Why it matters')}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--blue-500)', whiteSpace: 'nowrap' }}>
            {(typeof window !== 'undefined' && window.CD_LANG === 'zh') ? 'Why it matters' : 'Cadence take'}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: isLead ? 14.5 : 13.5, lineHeight: 1.6, color: 'var(--ink-700)' }}>{whyItMatters}</div>
      </div>
    </aside>
  );

  const footerEl = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: isCompact ? 8 : 14 }}>
      <SourceMonogram source={source} accent={cat.accent} />
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{source}</span>
      {journalMeta && (
        <span
          title={`${journalMeta.name} — ${t('ifTip', 'Journal impact factor')} · ${journalMeta.year} JCR`}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
            padding: '1px 6px', borderRadius: 'var(--radius-xs)', cursor: 'default',
            background: 'var(--green-50)', border: '1px solid var(--green-100)', color: 'var(--green-700)',
          }}>
          IF {journalMeta.if} · {journalMeta.quartile}
        </span>
      )}
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
        {t('readOriginal', 'Read original')} <Icon name="arrow-up-right" size={15} strokeWidth={2} />
      </button>
    </div>
  );

  const articleProps = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    onClick,
    style: {
      position: 'relative', boxSizing: 'border-box',
      background: selected ? 'var(--surface-active)' : 'var(--surface-card)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-lg)',
      padding: isCompact ? '14px 16px' : isLead ? (mobile ? '18px 16px' : '22px 24px') : (mobile ? '16px 16px' : '18px 20px'),
      boxShadow: hover && !selected ? 'var(--shadow-card-hover)' : 'var(--shadow-xs)',
      transform: hover && !selected ? 'translateY(-1px)' : 'none',
      transition: 'var(--transition-card)', cursor: onClick ? 'pointer' : 'default',
      ...style,
    },
    ...rest,
  };

  const selectedSpine = selected && (
    <span style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--green-600)' }} />
  );

  // ── mobile lead: the desktop left-gutter layout collapses badly on narrow
  //    screens (tall empty left column + a cramped right measure), so drop the
  //    gutter entirely — SIGNAL rides the top meta row as a badge and the
  //    headline runs full-width, same skeleton as the default card. ──
  if (isLead && mobile) {
    return (
      <article {...articleProps}>
        {selectedSpine}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11, flexWrap: 'wrap' }}>
          {typeof score === 'number' && <SignalScore score={score} variant="badge" />}
          <CategoryTag category={category} size="md" useShort withIndex />
          {techChip}
          <span style={{ flex: 1 }} />
          {timeEl}
        </div>
        {titleEl}
        {summaryEl}
        {whyEl}
        {footerEl}
      </article>
    );
  }

  // ── lead variant: pull the SIGNAL score into a left gutter so the top story
  //    reads as the day's headline data point. ──
  if (isLead) {
    return (
      <article {...articleProps}>
        {selectedSpine}
        <div style={{ display: 'flex', gap: 22 }}>
          {typeof score === 'number' && (
            <div style={{ flex: 'none', width: 116, paddingTop: 2, borderRight: '1px solid var(--border-subtle)', paddingRight: 20 }}>
              <SignalScore score={score} variant="block" />
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11, flexWrap: 'wrap' }}>
              <CategoryTag category={category} size="md" useShort={false} withIndex />
              {techChip}
              <span style={{ flex: 1 }} />
              {timeEl}
            </div>
            {titleEl}
            {summaryEl}
            {whyEl}
            {footerEl}
          </div>
        </div>
      </article>
    );
  }

  // ── default / compact ──
  return (
    <article {...articleProps}>
      {selectedSpine}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isCompact ? 8 : 11 }}>
        {typeof score === 'number' && <SignalScore score={score} variant={isCompact ? 'chip' : 'badge'} />}
        <CategoryTag category={category} size={isCompact ? 'sm' : 'md'} useShort withIndex />
        {techChip}
        <span style={{ flex: 1 }} />
        {timeEl}
      </div>
      {titleEl}
      {summaryEl}
      {whyEl}
      {footerEl}
    </article>
  );
}
