import * as React from 'react';

/**
 * CategoryTabs — the 8-category filter bar above the feed (with an "All" pill).
 *
 * @startingPoint section="Feed" subtitle="8 ESG category filter + All" viewport="760x120"
 */
export interface CategoryTabsProps {
  /** Active category id, or "all". @default "all" */
  value?: string;
  /** Called with the clicked category id. */
  onChange?: (id: string) => void;
  /** Show the leading "All" pill. @default true */
  includeAll?: boolean;
  style?: React.CSSProperties;
}

export function CategoryTabs(props: CategoryTabsProps): JSX.Element;
