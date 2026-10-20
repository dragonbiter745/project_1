import { cx } from '@foodcourt/ui';

/** Small pill switch for choosing what a chart shows. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ key: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cx(
            'h-8 rounded-full px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200',
            value === o.key ? 'bg-surface text-ink shadow-thumb' : 'text-ink-3 hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
