import * as React from 'react';

/**
 * The GreenStack logo — mark, wordmark, or full lockup.
 *
 * @startingPoint section="Brand" subtitle="Mark · wordmark · lockup" viewport="360x120"
 */
export interface LogoProps {
  /** Which form to render. @default "lockup" */
  variant?: 'lockup' | 'wordmark' | 'mark';
  /** Color treatment — use "inverse" on dark surfaces. @default "default" */
  tone?: 'default' | 'inverse';
  /** Cap height in px; mark and gap scale from this. @default 28 */
  height?: number;
  style?: React.CSSProperties;
}

export function Logo(props: LogoProps): JSX.Element;
