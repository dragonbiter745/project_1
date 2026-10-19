import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@foodcourt/ui';

interface PopoverProps {
  label: string;
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
  triggerClass?: string;
}

/** Click-to-open panel anchored under its trigger; closes on outside click and Escape. */
export function Popover({ label, trigger, children, align = 'right', width = 'w-[300px]', triggerClass }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={triggerClass}>
        {trigger(open)}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cx('glass-strong spotlight absolute top-[calc(100%+10px)] z-30 rounded-[22px] p-3', width, align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left')}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string; disabled?: boolean }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-surface-2/80 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-8 flex-1 rounded-full px-3 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-200 disabled:opacity-40',
            o.value === value ? 'bg-white text-ink shadow-thumb' : 'text-ink-3 hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
