import { cx } from '@foodcourt/ui';
import { PRESETS, presetRange, type Range } from '../lib/range';

/** Period control: quick presets plus an exact from–to, all in IST days. */
export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const today = presetRange('today').to;
  const input =
    'h-9 rounded-full bg-surface px-3 text-sm tabular-nums text-ink outline-none ring-1 ring-inset ring-line focus:ring-2 focus:ring-accent/50';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Period" className="no-scrollbar flex max-w-full overflow-x-auto rounded-full bg-surface-2 p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={value.preset === p.key}
            onClick={() => onChange(presetRange(p.key))}
            className={cx(
              'h-8 shrink-0 rounded-full px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200',
              value.preset === p.key ? 'bg-surface text-ink shadow-thumb' : 'text-ink-3 hover:text-ink'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="range-from">
        From
      </label>
      <input
        id="range-from"
        type="date"
        value={value.from}
        max={value.to}
        onChange={(e) => e.target.value && onChange({ preset: 'custom', from: e.target.value, to: value.to })}
        className={input}
      />
      <span className="text-sm text-ink-3">to</span>
      <label className="sr-only" htmlFor="range-to">
        To
      </label>
      <input
        id="range-to"
        type="date"
        value={value.to}
        min={value.from}
        max={today}
        onChange={(e) => e.target.value && onChange({ preset: 'custom', from: value.from, to: e.target.value })}
        className={input}
      />
    </div>
  );
}
