import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChefHat, Inbox, PackageCheck } from 'lucide-react';
import type { SubOrder, SubOrderStatus } from '@foodcourt/shared';
import { cx, useNow } from '@foodcourt/ui';
import { acceptOrder, markCollected, markReady, rejectOrder, undoReady } from '../../lib/kitchen';
import { playNewOrderChime } from '../../lib/sound';
import { jsonEqual, useLocal } from '../../lib/store';
import { RejectSheet } from './RejectSheet';
import { TicketCard } from './TicketCard';

const ACTIVE: ReadonlySet<SubOrderStatus> = new Set(['NEW', 'ACCEPTED', 'PREPARING', 'READY']);
const READY_UNDO_MS = 30_000; // PRD FR-V2
const COLLECT_UNDO_MS = 10_000;
const CHIME_EVERY_MS = 4_000;

type ColumnKey = 'new' | 'cooking' | 'ready';
interface Undo {
  label: string;
  run: () => void;
  expiresAt: number;
}

export function Board({ vendorId, alarmOn }: { vendorId: string; alarmOn: boolean }) {
  const tickets = useLocal(
    (s) =>
      Object.values(s.subOrders)
        .filter((sub) => sub.vendorId === vendorId && ACTIVE.has(sub.status))
        .sort((a, b) => a.ts.placed - b.ts.placed),
    jsonEqual
  );
  const now = useNow(15_000);
  const [rejecting, setRejecting] = useState<SubOrder | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [tab, setTab] = useState<ColumnKey>('new');
  // "Collected" is committed after a short grace period so a mis-tap can be undone;
  // the status machine has no way back from COLLECTED.
  const [collecting, setCollecting] = useState<Record<string, true>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const columns = useMemo(() => {
    const visible = tickets.filter((t) => !collecting[t.id]);
    return {
      new: visible.filter((t) => t.status === 'NEW'),
      cooking: visible.filter((t) => t.status === 'ACCEPTED' || t.status === 'PREPARING'),
      ready: visible.filter((t) => t.status === 'READY'),
    };
  }, [tickets, collecting]);

  // Repeat until every new ticket is accepted or rejected (PRD FR-V1).
  const newCount = columns.new.length;
  useEffect(() => {
    if (!alarmOn || newCount === 0) return;
    playNewOrderChime();
    const id = setInterval(playNewOrderChime, CHIME_EVERY_MS);
    return () => clearInterval(id);
  }, [alarmOn, newCount]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), Math.max(0, undo.expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [undo]);

  // Never lose a collection: flush pending ones if the tab closes or the board unmounts.
  useEffect(() => {
    const pending = timers.current;
    const flush = () => {
      for (const [id, timer] of pending) {
        clearTimeout(timer);
        markCollected(id);
      }
      pending.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const onAccept = useCallback((sub: SubOrder) => acceptOrder(sub.id), []);
  const onReject = useCallback((sub: SubOrder) => setRejecting(sub), []);

  const onReady = useCallback((sub: SubOrder) => {
    if (!markReady(sub.id)) return;
    setUndo({ label: `${sub.token} marked ready`, run: () => undoReady(sub.id), expiresAt: Date.now() + READY_UNDO_MS });
  }, []);

  const onCollect = useCallback((sub: SubOrder) => {
    setCollecting((c) => ({ ...c, [sub.id]: true }));
    const finish = () => {
      timers.current.delete(sub.id);
      markCollected(sub.id);
      setCollecting(({ [sub.id]: _, ...rest }) => rest);
    };
    timers.current.set(sub.id, setTimeout(finish, COLLECT_UNDO_MS));
    setUndo({
      label: `${sub.token} collected`,
      expiresAt: Date.now() + COLLECT_UNDO_MS,
      run: () => {
        clearTimeout(timers.current.get(sub.id));
        timers.current.delete(sub.id);
        setCollecting(({ [sub.id]: _, ...rest }) => rest);
      },
    });
  }, []);

  const renderTickets = (list: SubOrder[], empty: ReactNode) =>
    list.length === 0 ? (
      empty
    ) : (
      <div className="space-y-3">
        {list.map((sub) => (
          <TicketCard
            key={sub.id}
            sub={sub}
            now={now}
            onAccept={onAccept}
            onReject={onReject}
            onReady={onReady}
            onCollect={onCollect}
          />
        ))}
      </div>
    );

  const spec: Array<{ key: ColumnKey; title: string; list: SubOrder[]; tone: string; empty: ReactNode }> = [
    {
      key: 'new',
      title: 'New',
      list: columns.new,
      tone: 'bg-accent-ink text-on-accent',
      empty: <Empty icon={<Inbox className="h-6 w-6" strokeWidth={1.5} />} text="No new orders" />,
    },
    {
      key: 'cooking',
      title: 'Cooking',
      list: columns.cooking,
      tone: 'bg-prep text-on-accent',
      empty: <Empty icon={<ChefHat className="h-6 w-6" strokeWidth={1.5} />} text="Nothing on the stove" />,
    },
    {
      key: 'ready',
      title: 'Ready',
      list: columns.ready,
      tone: 'bg-ready text-on-accent',
      empty: <Empty icon={<PackageCheck className="h-6 w-6" strokeWidth={1.5} />} text="Nothing waiting at the counter" />,
    },
  ];

  return (
    <>
      {/* Narrow screens (phone, portrait tablet) show one column at a time. */}
      <div role="tablist" aria-label="Order columns" className="grid grid-cols-3 gap-1 border-b border-line p-2 lg:hidden">
        {spec.map((col) => (
          <button
            key={col.key}
            type="button"
            role="tab"
            aria-selected={tab === col.key}
            onClick={() => setTab(col.key)}
            className={cx(
              'pressable flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors',
              tab === col.key ? 'bg-surface-2 text-ink' : 'text-ink-3'
            )}
          >
            {col.title}
            <Count n={col.list.length} tone={col.tone} />
          </button>
        ))}
      </div>

      <main className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-3">
        {spec.map((col) => (
          <section
            key={col.key}
            aria-label={`${col.title} orders`}
            className={cx('min-h-0 flex-col rounded-sheet bg-surface-2/60', tab === col.key ? 'flex' : 'hidden lg:flex')}
          >
            <header className="flex items-center justify-between px-4 pb-2 pt-4">
              <h2 className="text-lg font-semibold tracking-tight text-ink">{col.title}</h2>
              <Count n={col.list.length} tone={col.tone} />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">{renderTickets(col.list, col.empty)}</div>
          </section>
        ))}
      </main>

      <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-float flex justify-center px-4">
        <div data-visible={undo !== null} inert={undo === null} className="float-bar pointer-events-auto">
          <div role="status" className="flex items-center gap-4 rounded-full bg-ink py-2 pl-5 pr-2 text-surface shadow-float">
            <span className="text-base font-medium">{undo?.label}</span>
            <button
              type="button"
              onClick={() => {
                undo?.run();
                setUndo(null);
              }}
              className="pressable h-10 rounded-full bg-surface/10 px-4 text-sm font-semibold"
            >
              Undo
            </button>
          </div>
        </div>
      </div>

      <RejectSheet
        sub={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={(sub, reason) => {
          rejectOrder(sub.id, reason);
          setRejecting(null);
        }}
      />
    </>
  );
}

function Count({ n, tone }: { n: number; tone: string }) {
  return (
    <span
      className={cx(
        'grid h-7 min-w-7 place-items-center rounded-full px-2 font-mono text-sm font-semibold tabular-nums',
        n > 0 ? tone : 'bg-surface-2 text-ink-3'
      )}
    >
      {n}
    </span>
  );
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center text-ink-3">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2">{icon}</span>
      <p className="mt-3 text-sm font-medium">{text}</p>
    </div>
  );
}
