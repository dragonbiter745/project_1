import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChefHat, Inbox, PackageCheck, type LucideIcon } from 'lucide-react';
import type { SubOrder, SubOrderStatus } from '@foodcourt/shared';
import { cx, prefersReducedMotion, useNow } from '@foodcourt/ui';
import { acceptOrder, markCollected, markReady, rejectOrder, undoReady } from '@foodcourt/firebase-client/local-ops';
import { buzz } from '../../lib/device';
import { playNewOrderChime } from '../../lib/sound';
import { jsonEqual, useLocal } from '../../lib/store';
import { NewOrderAlert } from './NewOrderAlert';
import { RejectSheet } from './RejectSheet';
import { SwipeTicket } from './SwipeTicket';
import { TabBar } from './TabBar';
import { TicketCard } from './TicketCard';

const ACTIVE: ReadonlySet<SubOrderStatus> = new Set(['NEW', 'ACCEPTED', 'PREPARING', 'READY']);
const READY_UNDO_MS = 30_000; // PRD FR-V2
const COLLECT_UNDO_MS = 10_000;
const CHIME_EVERY_MS = 4_000;
const ALERT_MS = 8_000;

type ColumnKey = 'new' | 'cooking' | 'ready';
const COLUMN_KEYS: ColumnKey[] = ['new', 'cooking', 'ready'];

interface Undo {
  label: string;
  run: () => void;
  expiresAt: number;
}

interface BoardProps {
  vendorId: string;
  alarmOn: boolean;
  phone: boolean;
  onMore: () => void;
  /** Shows a dot on the phone More tab (paused, muted or sold-out dishes). */
  moreAlert: boolean;
}

export function Board({ vendorId, alarmOn, phone, onMore, moreAlert }: BoardProps) {
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
  const [alertId, setAlertId] = useState<string | null>(null);
  // "Collected" is committed after a short grace period so a mis-tap can be undone;
  // the status machine has no way back from COLLECTED.
  const [collecting, setCollecting] = useState<Record<string, true>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seen = useRef<Set<string> | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

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

  // Orders already on the board when it opens never raise the phone alert.
  useEffect(() => {
    const ids = columns.new.map((t) => t.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seen.current!.has(id));
    for (const id of ids) seen.current.add(id);
    if (fresh.length > 0) {
      setAlertId(fresh[fresh.length - 1]!);
      buzz([90, 60, 90]);
    }
  }, [columns.new]);

  useEffect(() => {
    if (!alertId) return;
    const t = setTimeout(() => setAlertId(null), ALERT_MS);
    return () => clearTimeout(t);
  }, [alertId]);

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

  const onAccept = useCallback((sub: SubOrder) => {
    if (acceptOrder(sub.id)) buzz(10);
  }, []);
  const onReject = useCallback((sub: SubOrder) => setRejecting(sub), []);

  const onReady = useCallback((sub: SubOrder) => {
    if (!markReady(sub.id)) return;
    buzz(10);
    setUndo({ label: `${sub.token} marked ready`, run: () => undoReady(sub.id), expiresAt: Date.now() + READY_UNDO_MS });
  }, []);

  const onCollect = useCallback((sub: SubOrder) => {
    buzz(10);
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

  // Phone columns sit side by side in a snapping rail; the tab pill follows the scroll directly.
  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail || rail.clientWidth === 0) return;
    const progress = rail.scrollLeft / rail.clientWidth;
    if (indicatorRef.current) indicatorRef.current.style.transform = `translateX(${progress * 100}%)`;
    setTab(COLUMN_KEYS[Math.min(COLUMN_KEYS.length - 1, Math.max(0, Math.round(progress)))]!);
  };

  const goTo = useCallback((key: ColumnKey) => {
    const rail = railRef.current;
    if (!rail) return setTab(key);
    rail.scrollTo({ left: COLUMN_KEYS.indexOf(key) * rail.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const renderTickets = (list: SubOrder[], empty: ReactNode) => {
    if (list.length === 0) return empty;
    const Ticket = phone ? SwipeTicket : TicketCard;
    return (
      <div className="space-y-3">
        {list.map((sub) => (
          <Ticket key={sub.id} sub={sub} now={now} onAccept={onAccept} onReject={onReject} onReady={onReady} onCollect={onCollect} />
        ))}
      </div>
    );
  };

  const spec: Array<{
    key: ColumnKey;
    title: string;
    hint: string;
    swipeHint: string;
    Icon: LucideIcon;
    band: string;
    body: string;
    list: SubOrder[];
    tone: string;
    emptyText: string;
  }> = [
    {
      key: 'new',
      title: 'New',
      hint: 'Accept or reject',
      swipeHint: 'Swipe right to accept, left to reject',
      Icon: Inbox,
      band: 'bg-accent-tint text-accent-ink ring-accent-line',
      body: 'bg-accent-tint/25',
      list: columns.new,
      tone: 'bg-accent-ink text-on-accent',
      emptyText: 'No new orders',
    },
    {
      key: 'cooking',
      title: 'Cooking',
      hint: 'Mark ready when plated',
      swipeHint: 'Swipe right once it is plated',
      Icon: ChefHat,
      band: 'bg-prep-tint text-prep ring-prep/20',
      body: 'bg-prep-tint/30',
      list: columns.cooking,
      tone: 'bg-prep text-on-accent',
      emptyText: 'Nothing on the stove',
    },
    {
      key: 'ready',
      title: 'Ready',
      hint: 'Hand over at the counter',
      swipeHint: 'Swipe right once it is handed over',
      Icon: PackageCheck,
      band: 'bg-ready-tint text-ready ring-ready/20',
      body: 'bg-ready-tint/30',
      list: columns.ready,
      tone: 'bg-ready text-on-accent',
      emptyText: 'Nothing waiting at the counter',
    },
  ];

  const alertSub = phone && tab !== 'new' && alertId ? (columns.new.find((t) => t.id === alertId) ?? null) : null;

  return (
    <>
      {phone ? (
        <>
          <main
            ref={railRef}
            onScroll={onRailScroll}
            aria-label="Orders"
            className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          >
            {spec.map((col) => (
              <section key={col.key} aria-label={`${col.title} orders`} className={cx('flex min-h-0 w-full shrink-0 snap-start snap-always flex-col', col.body)}>
                <header className="flex items-center gap-3 px-4 pb-2 pt-3">
                  <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-[11px] ring-1 ring-inset', col.band)}>
                    <col.Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold leading-tight tracking-tight text-ink">{col.title}</h2>
                    <p className="truncate text-xs text-ink-3">{col.swipeHint}</p>
                  </div>
                  <Count n={col.list.length} tone={col.tone} />
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
                  {renderTickets(col.list, <Empty Icon={col.Icon} text={col.emptyText} hint="Swipe sideways to check the other columns." />)}
                </div>
              </section>
            ))}
          </main>
          <TabBar
            items={spec.map((col) => ({ key: col.key, label: col.title, Icon: col.Icon, count: col.list.length, tone: col.tone }))}
            active={tab}
            onSelect={goTo}
            onMore={onMore}
            moreAlert={moreAlert}
            indicatorRef={indicatorRef}
          />
          <NewOrderAlert
            sub={alertSub}
            onAccept={(sub) => {
              onAccept(sub);
              setAlertId(null);
            }}
            onView={() => {
              goTo('new');
              setAlertId(null);
            }}
            onDismiss={() => setAlertId(null)}
          />
        </>
      ) : (
        <>
          {/* Portrait tablets show one column at a time. */}
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

          <main className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-3 lg:p-5">
            {spec.map((col) => (
              <section
                key={col.key}
                aria-label={`${col.title} orders`}
                className={cx(
                  'min-h-0 flex-col overflow-hidden rounded-sheet ring-1 ring-inset ring-line/60',
                  col.body,
                  tab === col.key ? 'flex' : 'hidden lg:flex'
                )}
              >
                <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ring-1 ring-inset', col.band)}>
                      <col.Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold leading-tight tracking-tight text-ink">{col.title}</h2>
                      <p className="truncate text-xs text-ink-3">{col.hint}</p>
                    </div>
                  </div>
                  <Count n={col.list.length} tone={col.tone} />
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
                  {renderTickets(col.list, <Empty Icon={col.Icon} text={col.emptyText} hint="New tickets appear here instantly." />)}
                </div>
              </section>
            ))}
          </main>
        </>
      )}

      <div
        className={cx(
          'pointer-events-none fixed inset-x-0 z-float flex justify-center px-4',
          phone ? 'bottom-[calc(80px+env(safe-area-inset-bottom))]' : 'safe-bottom bottom-0'
        )}
      >
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
      key={n}
      className={cx(
        'tick grid h-8 min-w-8 place-items-center rounded-full px-2.5 font-mono text-base font-semibold tabular-nums shadow-card',
        n > 0 ? tone : 'bg-surface text-ink-3'
      )}
    >
      {n}
    </span>
  );
}

function Empty({ Icon, text, hint }: { Icon: LucideIcon; text: string; hint: string }) {
  return (
    <div className="mx-1 mt-2 flex flex-col items-center rounded-card border border-dashed border-line-strong/80 px-4 py-14 text-center text-ink-3">
      <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <Icon className="h-6 w-6" strokeWidth={1.5} />
      </span>
      <p className="mt-4 text-sm font-medium text-ink-2">{text}</p>
      <p className="mt-1 text-xs">{hint}</p>
    </div>
  );
}
