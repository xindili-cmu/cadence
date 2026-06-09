import * as React from 'react';

/**
 * Button — primary actions, filters and toolbar controls.
 *
 * @startingPoint section="Core" subtitle="Primary / secondary / ghost / quiet" viewport="520x80"
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** @default "primary" */
  variant?: 'primary' | 'secondary' | 'ghost' | 'quiet';
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Lucide icon name rendered before the label. */
  iconStart?: string;
  /** Lucide icon name rendered after the label. */
  iconEnd?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}

export function Button(props: ButtonProps): JSX.Element;
