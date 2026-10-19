import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatDailyCustomerNo } from '@foodcourt/shared';
import { Button } from '../../components/ui/Button';
import { useBackDismiss } from '../../lib/backStack';
import { lockScroll, unlockScroll } from '../../lib/scrollLock';

export interface Spotlight {
  token: string;
  vendorName?: string;
  displayName: string;
  dailyNo: number;
  tableLabel: string;
  ready: boolean;
}

// Full-screen token for showing staff across a crowded counter.
export function TokenSpotlight({ spot, onClose }: { spot: Spotlight | null; onClose: () => void }) {
  const open = spot !== null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useBackDismiss(open, onClose);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!spot) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Token ${spot.token}`}
      tabIndex={-1}
      onClick={onClose}
      className="spotlight fixed inset-0 z-spotlight flex flex-col items-center justify-center bg-surface px-6 text-center outline-none"
    >
      <p className="text-lg font-medium text-ink-3">{spot.vendorName}</p>
      <p className="mt-2 font-mono text-[clamp(64px,22vw,128px)] font-semibold leading-none tracking-tight text-ink">
        {spot.token}
      </p>
      <p className="mt-8 text-xl font-semibold text-ink">
        {spot.displayName} · {formatDailyCustomerNo(spot.dailyNo)}
      </p>
      <p className="mt-1 text-base text-ink-3">Table {spot.tableLabel}</p>
      {spot.ready && (
        <p className="mt-6 rounded-full bg-ready-tint px-4 py-2 text-base font-semibold text-ready">Ready to collect</p>
      )}
      <div className="absolute inset-x-0 bottom-0 px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        <Button variant="outline" size="lg" block onClick={onClose} className="mx-auto max-w-md">
          Done
        </Button>
      </div>
    </div>,
    document.body
  );
}
