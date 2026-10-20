import { useEffect, useRef, useState } from 'react';
import { Maximize2, MessageSquareWarning } from 'lucide-react';
import { formatPaise, type Order, type SubOrder } from '@foodcourt/shared';
import { cx, prefersReducedMotion } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { SignInNudge } from '../auth/SignInNudge';
import { useCart } from '../cart/cartStore';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { ReportProblemSheet, type ReportTarget } from './ReportProblemSheet';
import { TokenSpotlight, type Spotlight } from './TokenSpotlight';
import { STEP_LABELS, isClosedWithRefund, stepIndex, useActiveOrder, useReadyAlert } from './useActiveOrder';
import { Button, Sheet, useNow, useWakeLock } from '@foodcourt/ui';

const MINUTE = 60_000;

export function TrackingSheet({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.tracking);
  const hide = useUi((s) => s.hide);
  const setActiveOrder = useCart((s) => s.setActiveOrder);
  const { orderId, order, subOrders } = useActiveOrder();
  const prepMinutes = useLocal(
    (s) => Object.fromEntries(s.vendors.map((v) => [v.id, v.defaultPrepMin])) as Record<string, number>,
    jsonEqual
  );
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const now = useNow(30_000, open);

  const finished =
    subOrders.length > 0 && subOrders.every((s) => s.status === 'COLLECTED' || isClosedWithRefund(s.status));

  useReadyAlert(subOrders);
  useWakeLock(Boolean(orderId) && !finished);

  const close = () => hide('tracking');

  return (
    <>
      <Sheet
        open={open && Boolean(orderId)}
        onClose={close}
        title={orderId ? `Order #${orderId.slice(-4).toUpperCase()}` : 'Your order'}
        description={`Table ${session.tableLabel} · ${session.displayName}`}
        footer={
          finished ? (
            <Button
              size="lg"
              block
              onClick={() => {
                setActiveOrder(null);
                close();
              }}
            >
              Done
            </Button>
          ) : (
            <Button size="lg" variant="outline" block onClick={close}>
              Order more
            </Button>
          )
        }
      >
        {subOrders.length === 0 ? (
          <PaymentPending order={order} />
        ) : (
          <div className="space-y-3">
            {subOrders.map((sub) => (
              <SubOrderCard
                key={sub.id}
                sub={sub}
                displayName={session.displayName}
                prepMin={prepMinutes[sub.vendorId] ?? 10}
                now={now}
                onShowToken={() =>
                  setSpotlight({
                    token: sub.token,
                    vendorName: sub.vendorName,
                    displayName: session.displayName,
                    dailyNo: session.dailyNo,
                    tableLabel: session.tableLabel,
                    ready: sub.status === 'READY',
                  })
                }
                onReport={() =>
                  setReport({
                    orderId: sub.orderId,
                    subOrderId: sub.id,
                    vendorId: sub.vendorId,
                    vendorName: sub.vendorName,
                  })
                }
              />
            ))}
            <SignInNudge place="tracking" />
          </div>
        )}
      </Sheet>
      <ReportProblemSheet target={report} onClose={() => setReport(null)} />
      <TokenSpotlight spot={spotlight} onClose={() => setSpotlight(null)} />
    </>
  );
}

function PaymentPending({ order }: { order: Order | null }) {
  const failed = order?.status === 'FAILED' || order?.status === 'EXPIRED';
  if (failed) {
    return (
      <div className="px-4 py-10 text-center" role="alert">
        <p className="text-base font-semibold text-ink">Payment didn't go through</p>
        <p className="mt-1 text-sm text-ink-3">If any amount was debited, it will be refunded automatically.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center" aria-live="polite">
      <span className="spinner block h-8 w-8 rounded-full border-[3px] border-accent border-r-transparent" aria-hidden />
      <p className="mt-5 text-base font-semibold text-ink">Confirming your payment</p>
      <p className="mt-1 text-sm text-ink-3">This usually takes a few seconds. Keep this screen open.</p>
    </div>
  );
}

function statusMessage(sub: SubOrder, displayName: string): string {
  const shop = sub.vendorName ?? 'The shop';
  switch (sub.status) {
    case 'NEW':
      return `Waiting for ${shop} to accept your order.`;
    case 'ACCEPTED':
      return `${shop} accepted your order.`;
    case 'PREPARING':
      return `${shop} is preparing your food.`;
    case 'READY':
      return `${displayName}, your ${shop} order is ready at the counter.`;
    case 'COLLECTED':
      return 'Collected. Enjoy your meal.';
    case 'REJECTED':
      return `${shop} couldn't take this order. Your refund is on its way.`;
    case 'TIMED_OUT':
      return `${shop} didn't respond in time. Your refund is on its way.`;
    case 'CANCELLED':
      return 'This part of your order was cancelled. Your refund is on its way.';
    default:
      return '';
  }
}

// Based on the shop's usual prep time, so it is phrased as a typical wait, not a promise.
function timing(sub: SubOrder, prepMin: number, now: number): string | null {
  const placed = sub.ts?.placed;
  if (!placed) return null;
  const elapsed = Math.floor((now - placed) / MINUTE);
  const placedText = elapsed < 1 ? 'Placed just now' : `Placed ${elapsed} min ago`;
  if (sub.status !== 'NEW' && sub.status !== 'ACCEPTED' && sub.status !== 'PREPARING') return placedText;
  const start = sub.ts.accepted ?? placed;
  const remaining = Math.ceil((start + prepMin * MINUTE - now) / MINUTE);
  return remaining > 0
    ? `${placedText} · usually ready in about ${remaining} min`
    : `${placedText} · should be ready any minute`;
}

interface SubOrderCardProps {
  sub: SubOrder;
  displayName: string;
  prepMin: number;
  now: number;
  onShowToken: () => void;
  onReport: () => void;
}

function SubOrderCard({ sub, displayName, prepMin, now, onShowToken, onReport }: SubOrderCardProps) {
  const index = stepIndex(sub.status);
  const ready = sub.status === 'READY';
  const done = sub.status === 'COLLECTED';
  const closed = isClosedWithRefund(sub.status);
  const cardRef = useRef<HTMLElement>(null);
  const previousStatus = useRef(sub.status);
  const when = timing(sub, prepMin, now);

  // One small pop the moment this shop's food turns ready; not on first render.
  useEffect(() => {
    if (sub.status === 'READY' && previousStatus.current !== 'READY' && !prefersReducedMotion()) {
      cardRef.current?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }, { transform: 'scale(1)' }],
        { duration: 360, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
      );
    }
    previousStatus.current = sub.status;
  }, [sub.status]);

  return (
    <article
      ref={cardRef}
      className={cx(
        'rounded-card p-4 ring-1 ring-inset transition-colors duration-500',
        ready ? 'bg-ready-tint ring-ready/25' : closed ? 'bg-danger-tint ring-danger/20' : 'bg-surface ring-line'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-3">{sub.vendorName}</p>
          <p className="mt-0.5 font-mono text-3xl font-semibold tracking-tight text-ink">{sub.token}</p>
        </div>
        {!closed && !done && (
          <button
            type="button"
            onClick={onShowToken}
            aria-label={`Show token ${sub.token} full screen`}
            className="pressable -mr-1.5 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2">
              <Maximize2 className="h-4 w-4" strokeWidth={2} />
            </span>
          </button>
        )}
      </div>
      <p className={cx('mt-2 text-sm', ready ? 'font-semibold text-ready' : 'text-ink-2')} aria-live="polite">
        {statusMessage(sub, displayName)}
      </p>
      {when && <p className="mt-0.5 text-xs tabular-nums text-ink-3">{when}</p>}

      {!closed && (
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-1.5" aria-hidden>
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className={cx('progress-fill h-full', ready || done ? 'bg-ready' : 'bg-accent')}
                  style={{ transform: `scaleX(${i <= index ? 1 : 0})` }}
                />
              </div>
            ))}
          </div>
          <ol className="mt-1.5 grid grid-cols-4 text-2xs text-ink-3">
            {STEP_LABELS.map((label, i) => (
              <li
                key={label}
                className={cx(i === index && 'font-semibold text-ink')}
                aria-current={i === index ? 'step' : undefined}
              >
                {label}
              </li>
            ))}
          </ol>
        </div>
      )}

      <ul className="mt-4 space-y-1 border-t border-ink/10 pt-3 text-sm text-ink-2">
        {sub.items.map((item, i) => (
          <li key={`${item.id}-${i}`} className="flex justify-between gap-3">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {item.qty} × {item.name}
              {item.note && <span className="block text-xs text-ink-3">Note: {item.note}</span>}
            </span>
            <span className="shrink-0 tabular-nums">{formatPaise(item.pricePaise * item.qty)}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onReport}
        className="-mb-2 -ml-1 mt-1 inline-flex h-11 items-center gap-1.5 px-1 text-sm font-medium text-ink-3"
      >
        <MessageSquareWarning className="h-4 w-4" strokeWidth={1.75} />
        Report a problem
      </button>
    </article>
  );
}
