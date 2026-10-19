import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBackDismiss } from './backStack';
import { lockScroll, unlockScroll } from './scrollLock';
import { IconButton } from './IconButton';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

const EXIT_MS = 280;
const DISMISS_VELOCITY = 0.11; // px per ms; a quick flick closes regardless of distance

export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startY: number; startT: number; dy: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useBackDismiss(open, onClose);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    lockScroll();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, mounted]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button,a,input,textarea,select')) return;
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startT: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!d || e.pointerId !== d.pointerId || !panel || !backdrop) return;
    d.dy = e.clientY - d.startY;
    // Dragging up past the resting point meets increasing resistance instead of a wall.
    const offset = d.dy >= 0 ? d.dy : -Math.sqrt(-d.dy) * 2;
    panel.dataset.dragging = 'true';
    backdrop.dataset.dragging = 'true';
    panel.style.transform = `translate3d(0, ${offset}px, 0)`;
    backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, offset) / panel.offsetHeight));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (!panel || !backdrop || panel.dataset.dragging !== 'true') return;
    delete panel.dataset.dragging;
    delete backdrop.dataset.dragging;
    panel.style.transform = '';
    backdrop.style.opacity = '';
    const velocity = d.dy / Math.max(1, performance.now() - d.startT);
    if (d.dy > panel.offsetHeight * 0.25 || (d.dy > 10 && velocity > DISMISS_VELOCITY)) {
      onCloseRef.current();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-sheet">
      <div
        ref={backdropRef}
        data-visible={visible}
        onClick={onClose}
        className="sheet-backdrop absolute inset-0 bg-scrim/45"
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-visible={visible}
        className="sheet-panel absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-sheet bg-surface shadow-sheet outline-none"
      >
        <div
          className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="mx-auto mt-2 h-[5px] w-9 rounded-full bg-line-strong" aria-hidden />
          <div className="flex items-start justify-between gap-3 pb-3 pl-5 pr-2 pt-2">
            <div className="min-w-0 pt-1.5">
              <h2 id={titleId} className="text-xl font-semibold tracking-tight text-ink">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} tone="quiet">
              <X className="h-[18px] w-[18px]" strokeWidth={2} />
            </IconButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="safe-bottom shrink-0 border-t border-line bg-surface px-5 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
