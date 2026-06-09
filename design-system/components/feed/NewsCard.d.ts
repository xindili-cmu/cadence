import * as React from 'react';

/**
 * NewsCard — the core GreenStack feed unit: a single ESG story with title,
 * source, date, category, SignalScore and the signature "why it matters" note.
 *
 * @startingPoint section="Feed" subtitle="Story card · default / hover / selected / lead" viewport="720x320"
 */
export interface NewsCardProps {
  title: string;
  summary?: string;
  source: string;
  sourceUrl?: string;
  /** Short clock time, e.g. "08:10". */
  time?: string;
  /** Human date, e.g. "Jun 8". */
  date?: string;
  /** Category id (see CategoryTag). */
  category: string;
  /** 0–100 selection score. Omit to hide the SignalScore. */
  score?: number;
  /** The AI "why this matters to you" note — GreenStack's signature device. */
  whyItMatters?: string;
  /** @default "default" */
  variant?: 'default' | 'compact' | 'lead';
  /** Selected/active state — green rail + tint. */
  selected?: boolean;
  onClick?: () => void;
  /** Override the "Read original" action (defaults to opening sourceUrl). */
  onOpen?: () => void;
  style?: React.CSSProperties;
}

export function NewsCard(props: NewsCardProps): JSX.Element;
