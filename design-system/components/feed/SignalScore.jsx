import React from 'react';

// SIGNAL tiers — PRESENTATION bands aligned to the actual score distribution
// (decision 2026-07-01, do NOT re-unify with the cron rubric: the rubric tops
// out near 90, so a ≥90 "practice-changing" display band was permanently
// empty — ~2/387 items ever. Display ≠ rubric.)
// ≥85 strong signal · 75–84 worth knowing · 65–74 reference.
function signalTier(v) {
  if (v >= 85) return { key: 'high', color: 'var(--signal-high)', soft: 'var(--signal-high-soft)', zh: '强信号', en: 'Strong signal' };
  if (v >= 75) return { key: 'mid', color: 'var(--signal-mid)', soft: 'var(--signal-mid-soft)', zh: '值得关注', en: 'Worth knowing' };
  return { key: 'low', color: 'var(--signal-low)', soft: 'var(--signal-low-soft)', zh: '参考', en: 'For reference' };
}

// Hover explainer — what the score means + the tier cutoffs.
function signalTip(lang) {
  return (lang || (typeof window !== 'undefined' && window.CD_LANG) || 'zh') === 'zh'
    ? 'SIGNAL：AI 对临床实践影响的评分（0–100）。85+ 强信号 · 75+ 值得关注 · 65+ 参考'
    : 'SIGNAL: AI rating of clinical impact (0–100). 85+ strong signal · 75+ worth knowing · 65+ reference';
}

function signalTierLabel(t, lang) {
  return (lang || (typeof window !== 'undefined' && window.CD_LANG) || 'zh') === 'zh' ? t.zh : t.en;
}

// Strength meter — N segments, filled = round(value/100 * segs).
function SignalMeter({ value, color, segs = 10, w = 7, h = 5, gap = 2.5 }) {
  const filled = Math.round((value / 100) * segs);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap }}>
      {Array.from({ length: segs }).map((_, i) => (
        <span key={i} style={{ width: w, height: h, borderRadius: 1, flex: 'none', background: i < filled ? color : 'var(--ink-200)' }} />
      ))}
    </span>
  );
}

/**
 * SignalScore — Cadence's editorial selection score (0–100), rendered as a real
 * data point rather than a flat label. Higher = stronger signal a story matters.
 *  · variant 'badge' — boxed data point for the feed card meta row (default).
 *  · variant 'chip'  — compact inline pill for the rail / dense rows.
 *  · variant 'block' — hero gutter block (big numeral + /100 + tier + meter).
 * Back-compat: legacy `size="sm"` callers map to the compact chip.
 */
export function SignalScore({ score = 0, variant, size = 'md', lang, style, ...rest }) {
  const v = Math.max(0, Math.min(100, Math.round(score)));
  const t = signalTier(v);
  const vr = variant || (size === 'sm' ? 'chip' : 'badge');
  const tip = signalTip(lang);

  if (vr === 'chip') {
    return (
      <span title={tip} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px 2px 6px',
        background: t.soft, borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap', ...style,
      }} {...rest}>
        <span style={{ width: 4, height: 12, borderRadius: 1, background: t.color, flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', color: t.color, opacity: 0.85 }}>SIGNAL</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: t.color }}>{v}</span>
      </span>
    );
  }

  if (vr === 'block') {
    return (
      <span title={tip} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7, ...style }} {...rest}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: '999px', background: t.color }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--text-tertiary)' }}>SIGNAL</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 46, fontWeight: 600, lineHeight: 0.9, color: t.color, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: 'var(--text-tertiary)' }}>/100</span>
        </span>
        <SignalMeter value={v} color={t.color} w={8} h={6} gap={3} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: t.color, letterSpacing: '-0.005em' }}>{signalTierLabel(t, lang)}</span>
      </span>
    );
  }

  // 'badge' — the default card-meta data point.
  return (
    <span title={tip} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 9px 4px 7px',
      background: t.soft, border: `1px solid ${t.color}22`, borderRadius: 'var(--radius-sm)',
      whiteSpace: 'nowrap', ...style,
    }} {...rest}>
      <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: t.color }} />
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1, gap: 2 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 600, letterSpacing: '0.16em', color: 'var(--text-tertiary)' }}>SIGNAL</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600, color: t.color, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
      </span>
      <SignalMeter value={v} color={t.color} segs={5} w={4} h={9} gap={2} />
    </span>
  );
}
