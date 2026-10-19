import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/format';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  tone?: 'plain' | 'quiet';
}

// 44px hit area; the visible circle is 36px so it sits quietly in headers.
export function IconButton({ label, children, tone = 'plain', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx('pressable group grid h-11 w-11 shrink-0 place-items-center rounded-full', className)}
      {...rest}
    >
      <span
        className={cx(
          'grid h-9 w-9 place-items-center rounded-full text-ink-2 transition-colors duration-150',
          tone === 'quiet' ? 'bg-surface-2' : 'group-hover:bg-surface-2'
        )}
      >
        {children}
      </span>
    </button>
  );
}
