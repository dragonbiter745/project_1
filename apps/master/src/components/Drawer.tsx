import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@foodcourt/ui';

/** A panel that slides in from the right over the console, for editing one thing at a time. */
export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCloseRef.current();
      };
      window.addEventListener('keydown', onKey);
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
        window.removeEventListener('keydown', onKey);
      };
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (visible) panelRef.current?.focus({ preventScroll: true });
  }, [visible]);

  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-sheet">
      <div onClick={onClose} aria-hidden className={cx('absolute inset-0 bg-scrim/40 transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
        className={cx(
          'absolute inset-y-0 right-0 flex w-full flex-col bg-bg shadow-sheet outline-none transition-transform duration-300 ease-drawer',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line bg-surface px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2">
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="border-t border-line bg-surface px-6 py-4">{footer}</footer>}
      </aside>
    </div>
  );
}
