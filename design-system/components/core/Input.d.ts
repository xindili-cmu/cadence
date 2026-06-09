import * as React from 'react';

/** Input — single-line text / search field with optional leading Lucide icon. */
export interface InputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** Lucide icon name shown at the start (e.g. "search"). */
  icon?: string;
  type?: string;
  /** @default "md" */
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** @default true */
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export function Input(props: InputProps): JSX.Element;
