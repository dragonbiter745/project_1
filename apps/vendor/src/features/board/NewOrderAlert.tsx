import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import type { SubOrder } from '@foodcourt/shared';
import { Button, IconButton } from '@foodcourt/ui';

const EXIT_MS = 220;

interface NewOrderAlertProps {
  sub: SubOrder | null;
  onAccept: (sub: SubOrder) => void;
  onView: () => void;
  onDismiss: () => void;
}

// Drops in from the top on phones when an order lands while the cook is on another tab.
export function NewOrderAlert({ sub, onAccept, onView, onDismiss }: NewOrderAlertProps) {
  const [shown, setShown] = useState<SubOrder | null>(sub);
  if (sub && sub !== shown) setShown(sub);
  const leaving = !sub && shown !== null;

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setShown(null), EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  if (!shown) return null;
  const items = shown.items.reduce((n, i) => n + i.qty, 0);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-float px-3 pt-[max(12px,env(safe-area-inset-top))]">
      <div
        role="alert"
        data-leaving={leaving}
        className="order-drop pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-[22px] bg-surface p-2.5 shadow-float ring-1 ring-inset ring-accent-line"
      >
        <button type="button" onClick={onView} className="pressable flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] bg-accent-ink text-on-accent">
            <BellRing key={shown.id} className="bell-ring h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-accent-ink">New order · {shown.tableLabel}</span>
            <span className="block font-mono text-lg font-semibold leading-tight text-ink">{shown.token}</span>
            <span className="block truncate text-xs text-ink-3">
              {items} {items === 1 ? 'item' : 'items'} · {shown.items.map((i) => i.name).join(', ')}
            </span>
          </span>
        </button>
        <Button variant="accent" onClick={() => onAccept(shown)}>
          Accept
        </Button>
        <IconButton label="Dismiss" onClick={onDismiss}>
          <X className="h-4 w-4" strokeWidth={2.25} />
        </IconButton>
      </div>
    </div>
  );
}
