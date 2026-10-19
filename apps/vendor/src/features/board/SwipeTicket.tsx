import { memo, useEffect, useRef, type PointerEvent } from 'react';
import { Check, PackageCheck, X } from 'lucide-react';
import { cx, prefersReducedMotion } from '@foodcourt/ui';
import { buzz } from '../../lib/device';
import { TicketCard, type TicketCardProps } from './TicketCard';

const COMMIT_SHARE = 0.38; // drag past this share of the card width to commit
const FLICK_VELOCITY = 0.11; // px per ms; a quick flick commits regardless of distance
const FLICK_MIN_PX = 48;
const SETTLE = 'transform 260ms var(--ease-out)';

const FORWARD = {
  NEW: { label: 'Accept', tone: 'bg-accent-ink text-on-accent', icon: Check },
  COOKING: { label: 'Ready', tone: 'bg-ready text-on-accent', icon: Check },
  READY: { label: 'Collected', tone: 'bg-ink text-surface', icon: PackageCheck },
};

interface Drag {
  id: number;
  x: number;
  y: number;
  t: number;
  dx: number;
  axis: 'x' | 'y' | null;
  armed: boolean;
}

// Phone ticket: swipe right moves the order to its next step, swipe left on a new order
// opens Reject. The buttons stay for anyone who prefers to tap.
export const SwipeTicket = memo(function SwipeTicket(props: TicketCardProps) {
  const { sub, onAccept, onReject, onReady, onCollect } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const forwardRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const mounted = useRef(true);
  const isNew = sub.status === 'NEW';
  const isReady = sub.status === 'READY';
  const forward = isNew ? FORWARD.NEW : isReady ? FORWARD.READY : FORWARD.COOKING;

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const paint = (dx: number, animate: boolean) => {
    const card = cardRef.current;
    if (!card) return;
    const motion = animate && !prefersReducedMotion();
    card.style.transition = motion ? SETTLE : 'none';
    card.style.transform = dx === 0 ? '' : `translateX(${dx}px)`;
    const progress = Math.min(1, Math.abs(dx) / (card.offsetWidth * COMMIT_SHARE || 1));
    for (const [layer, shown] of [
      [forwardRef.current, dx > 0],
      [backRef.current, dx < 0],
    ] as const) {
      if (!layer) continue;
      layer.style.transition = motion ? 'opacity 260ms var(--ease-out)' : 'none';
      layer.style.opacity = shown ? String(progress) : '0';
      layer.dataset.armed = String(shown && progress >= 1);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, axis: null, armed: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const rawX = e.clientX - d.x;
    const rawY = e.clientY - d.y;
    if (d.axis === null) {
      if (Math.hypot(rawX, rawY) < 8) return;
      d.axis = Math.abs(rawX) > Math.abs(rawY) ? 'x' : 'y';
      if (d.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.axis !== 'x') return;
    // Left only means something on a new order; elsewhere it resists like a rubber band.
    const allowed = rawX > 0 || isNew;
    d.dx = allowed ? rawX : -Math.sqrt(-rawX) * 3;
    paint(d.dx, false);
    const armed = allowed && Math.abs(rawX) >= (cardRef.current?.offsetWidth ?? 1) * COMMIT_SHARE;
    if (armed !== d.armed) {
      d.armed = armed;
      if (armed) buzz(8);
    }
  };

  const finish = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.axis !== 'x') return;
    const width = cardRef.current?.offsetWidth ?? 1;
    const velocity = Math.abs(d.dx) / Math.max(1, performance.now() - d.t);
    const commit = !cancelled && (Math.abs(d.dx) >= width * COMMIT_SHARE || (velocity > FLICK_VELOCITY && Math.abs(d.dx) > FLICK_MIN_PX));

    if (commit && d.dx > 0) {
      paint(width * 1.1, true);
      buzz(14);
      setTimeout(() => {
        if (isNew) onAccept(sub);
        else if (isReady) onCollect(sub);
        else onReady(sub);
        // The ticket normally moves to another column and unmounts; if the step was refused, slide it back.
        setTimeout(() => mounted.current && paint(0, true), 120);
      }, 170);
      return;
    }
    paint(0, true);
    if (commit && d.dx < 0 && isNew) onReject(sub);
  };

  return (
    <div className="relative isolate overflow-hidden rounded-card">
      <div
        ref={forwardRef}
        aria-hidden
        className={cx('swipe-layer absolute inset-0 flex items-center gap-2 pl-6 text-base font-semibold opacity-0', forward.tone)}
      >
        <forward.icon className="swipe-icon h-6 w-6" strokeWidth={2.5} />
        {forward.label}
      </div>
      {isNew && (
        <div
          ref={backRef}
          aria-hidden
          className="swipe-layer absolute inset-0 flex items-center justify-end gap-2 bg-danger pr-6 text-base font-semibold text-on-accent opacity-0"
        >
          Reject
          <X className="swipe-icon h-6 w-6" strokeWidth={2.5} />
        </div>
      )}
      <div
        ref={cardRef}
        className="swipe-card relative"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
      >
        <TicketCard {...props} compact />
      </div>
    </div>
  );
});
