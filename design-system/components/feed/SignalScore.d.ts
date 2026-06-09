import * as React from 'react';

/**
 * SignalScore — GreenStack's 0–100 editorial selection score, shown as a calm mono chip.
 */
export interface SignalScoreProps {
  /** Score 0–100. ≥85 reads as a strong signal, ≥65 mid, else muted. */
  score: number;
  /** @default "chip" */
  variant?: 'chip' | 'bar';
  /** @default "md" */
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export function SignalScore(props: SignalScoreProps): JSX.Element;
