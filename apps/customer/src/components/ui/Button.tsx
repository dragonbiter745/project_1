import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/format';

type Variant = 'ink' | 'tint' | 'quiet' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  ink: 'bg-ink text-white disabled:bg-ink/35',
  tint: 'bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line',
  quiet: 'bg-surface-2 text-ink',
  outline: 'bg-surface text-ink ring-1 ring-inset ring-line-strong',
  ghost: 'text-ink-2 hover-surface',
  danger: 'text-danger hover-surface',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-4 text-base gap-2',
  lg: 'h-[52px] px-6 text-md gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'ink',
  size = 'md',
  loading = false,
  block = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'pressable relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition-colors duration-150 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className
      )}
      {...rest}
    >
      <span
        className={cx(
          'inline-flex items-center gap-[inherit] whitespace-nowrap transition-[opacity,filter] duration-200',
          loading && 'opacity-0 blur-[2px]'
        )}
      >
        {icon}
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className="spinner block h-5 w-5 rounded-full border-2 border-current border-r-transparent" />
        </span>
      )}
    </button>
  );
}
