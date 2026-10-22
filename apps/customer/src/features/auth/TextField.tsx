import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cx } from '../../lib/format';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  help?: ReactNode;
  /** Shown inside the field before the text, like the +91 country code. */
  prefix?: string;
}

/** A labelled input with help text that turns into the error message, wired for screen readers. */
export function TextField({ label, value, onChange, error, help, prefix, type = 'text', className, ...rest }: TextFieldProps) {
  const id = useId();
  const noteId = useId();
  const [reveal, setReveal] = useState(false);
  const password = type === 'password';
  const note = error || help;
  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={cx(
          'flex h-12 items-center rounded-field bg-surface ring-1 ring-inset transition-[box-shadow] duration-150 focus-within:ring-2',
          error ? 'ring-danger/60 focus-within:ring-danger/60' : 'ring-line-strong focus-within:ring-ink/70'
        )}
      >
        {prefix && (
          <span className="pl-3.5 pr-1 text-md font-medium text-ink-3" aria-hidden>
            {prefix}
          </span>
        )}
        <input
          id={id}
          type={password && reveal ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={note ? noteId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-md text-ink outline-none placeholder:text-ink-3"
          {...rest}
        />
        {password && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            aria-pressed={reveal}
            className="pressable grid h-11 w-11 shrink-0 place-items-center text-ink-3 hover:text-ink"
          >
            {reveal ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          </button>
        )}
      </div>
      {note && (
        <p id={noteId} role={error ? 'alert' : undefined} className={cx('text-sm', error ? 'text-danger' : 'text-ink-3')}>
          {note}
        </p>
      )}
    </div>
  );
}
