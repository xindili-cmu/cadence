import * as React from 'react';

/**
 * CategoryTag — colored label classifying a story into one of the 8 ESG categories.
 *
 * @startingPoint section="Feed" subtitle="8 category accents · soft / solid / outline / dot" viewport="560x120"
 */
export interface CategoryTagProps {
  /** Category id: clean-power | electrification | industrial | grid | robotics | agriculture | social | governance */
  category: string;
  /** @default "soft" */
  variant?: 'soft' | 'solid' | 'outline' | 'dot';
  /** @default "md" */
  size?: 'sm' | 'md';
  /** Show the category's Lucide icon. @default true */
  withIcon?: boolean;
  /** Use the short label (e.g. "Electrification" vs full). @default false */
  useShort?: boolean;
  style?: React.CSSProperties;
}

export function CategoryTag(props: CategoryTagProps): JSX.Element;
