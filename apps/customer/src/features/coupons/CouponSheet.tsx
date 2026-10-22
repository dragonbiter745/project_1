import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { TicketPercent } from 'lucide-react';
import { computeOrderTotals, couponHeadline, formatPaise, type CouponPreview, type CouponScope, type PublicCoupon } from '@foodcourt/shared';
import { Button, Sheet } from '@foodcourt/ui';
import { selectMember, useAuth } from '../../lib/authStore';
import { cleanLabel, cx, prefersReducedMotion } from '../../lib/format';
import { jsonEqual, liveStore, useLocal } from '../../lib/store';
import { notify } from '../../lib/toast';
import { useCart } from '../cart/cartStore';
import { useUi } from '../ui/uiStore';
import { couponLines, previewCoupon, previewSaving, useCoupon, walletCoupons, type WalletCoupon } from './couponStore';

const endFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

export function useScopeText(): (scope: CouponScope) => string {
  const names = useLocal(
    (s) => ({
      shops: Object.fromEntries(s.vendors.map((v) => [v.id, v.name])) as Record<string, string>,
      categories: Object.fromEntries(Object.entries(s.menus).flatMap(([v, m]) => m.categories.map((c) => [`${v}:${c.id}`, cleanLabel(c.name)]))) as Record<string, string>,
    }),
    jsonEqual
  );
  return (scope) => {
    if (scope.kind === 'ALL') return 'any shop';
    if (scope.kind === 'VENDORS') return scope.vendorIds.map((v) => names.shops[v] ?? 'a shop').join(', ');
    const cats = scope.categories.map((c) => names.categories[`${c.vendorId}:${c.categoryId}`]).filter(Boolean);
    return cats.length > 2 ? `${cats.slice(0, 2).join(', ')} and more` : cats.join(', ') || 'chosen dishes';
  };
}

export function couponTerms(c: PublicCoupon, scopeText: (s: CouponScope) => string): string {
  return [`On ${scopeText(c.scope)}`, c.minOrderPaise > 0 ? `orders of ${formatPaise(c.minOrderPaise)}+` : null, c.firstOrderOnly ? 'first order only' : null, c.endsAt ? `until ${endFormat.format(c.endsAt)}` : null]
    .filter(Boolean)
    .join(' · ');
}

async function sparkle() {
  if (prefersReducedMotion()) return;
  const { default: confetti } = await import('canvas-confetti');
  void confetti({ particleCount: 40, spread: 55, startVelocity: 26, origin: { y: 0.8 }, colors: ['#343A36', '#B95C3C', '#8B9A78'], disableForReducedMotion: true });
}

/** Applies a coupon to the cart, telling the diner the saving straight away (or what is missing). */
export function applyPreview(preview: CouponPreview): void {
  useCoupon.getState().apply(preview);
  const state = liveStore.getState();
  const items = Object.values(useCart.getState().items);
  const totals = computeOrderTotals({ items, config: state.config });
  const result = previewSaving(preview, couponLines(items, state.menus), totals.totalPaise);
  if (result.ok) {
    void sparkle();
    notify(`${preview.coupon.code} applied`, { description: `You save ${formatPaise(result.discountPaise)} on this order.` });
  } else {
    notify(`${preview.coupon.code} is on your cart`, { description: result.reason });
  }
}

export function CouponSheet() {
  const open = useUi((s) => s.open.coupons);
  const hide = useUi((s) => s.hide);
  const showLogin = useUi((s) => s.showLogin);
  const member = useAuth(selectMember);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletCoupon[] | null>(null);
  const scopeText = useScopeText();
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    setCode('');
    setError(null);
    setWallet(null);
    walletCoupons()
      .then(setWallet)
      .catch(() => setWallet([]));
  }, [open, member]);

  const close = () => hide('coupons');

  const apply = async (raw: string) => {
    const value = raw.trim();
    if (!value) return setError('Enter a coupon code.');
    setPending(value.toUpperCase());
    setError(null);
    try {
      applyPreview(await previewCoupon(value));
      close();
    } catch (err) {
      setError((err as { message?: string }).message?.replace(/^Firebase: /, '') || "Couldn't check that code. Try again.");
    } finally {
      setPending(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void apply(code);
  };

  const sorted = useMemo(() => [...(wallet ?? [])].sort((a, b) => Number(b.usable) - Number(a.usable)), [wallet]);

  return (
    <Sheet open={open} onClose={close} title="Coupons" description="The discount comes off your online payment.">
      <form onSubmit={submit} noValidate className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Coupon code
        </label>
        <input
          id={inputId}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (error) setError(null);
          }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          placeholder="Enter a code"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cx(
            'h-12 min-w-0 flex-1 rounded-field bg-surface-2 px-3.5 font-mono text-md uppercase tracking-wide text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-3 focus:bg-surface focus:ring-2',
            error ? 'ring-2 ring-danger/60' : 'focus:ring-accent/50'
          )}
        />
        <Button type="submit" size="lg" loading={pending !== null && pending === code.trim().toUpperCase()}>
          Apply
        </Button>
      </form>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <h3 className="mt-6 text-base font-semibold text-ink">For you</h3>
      {wallet === null ? (
        <div className="mt-3 h-24 shimmer rounded-card" aria-busy="true" />
      ) : sorted.length === 0 ? (
        <div className="mt-3 rounded-card bg-bg p-4 text-sm text-ink-3">
          {member ? 'No coupons right now. New ones show up here as they launch.' : 'Sign in to get coupons as they launch.'}
          {!member && (
            <Button variant="tint" size="sm" className="mt-3 flex" onClick={() => showLogin('Signed-in diners get coupons and offers first.')}>
              Sign in
            </Button>
          )}
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {sorted.map((w) => (
            <li key={w.coupon.code}>
              <CouponTicket
                coupon={w.coupon}
                terms={couponTerms(w.coupon, scopeText)}
                reason={w.reason}
                action={
                  w.usable ? (
                    <Button size="sm" variant="accent" loading={pending === w.coupon.code} onClick={() => void apply(w.coupon.code)}>
                      Apply
                    </Button>
                  ) : w.coupon.audience === 'MEMBERS' && !member ? (
                    <Button size="sm" variant="tint" onClick={() => showLogin('Sign in to use this coupon.')}>
                      Sign in
                    </Button>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/** A coupon drawn as a ticket stub: code left of a dashed tear line, terms on the right. */
export function CouponTicket({ coupon, terms, reason, action }: { coupon: PublicCoupon; terms: string; reason?: string | null; action?: ReactNode }) {
  return (
    <div className={cx('relative flex overflow-hidden rounded-card ring-1 ring-inset', reason ? 'bg-surface ring-line' : 'bg-accent-tint/70 ring-accent-line')}>
      <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-r border-dashed border-accent-line px-2 py-3 text-accent-ink">
        <TicketPercent className="h-5 w-5" strokeWidth={1.75} />
        <span className="max-w-full truncate font-mono text-2xs font-semibold tracking-wide">{coupon.code}</span>
      </div>
      <span aria-hidden className="absolute left-[74px] top-0 h-3 w-3 -translate-y-1/2 rounded-full bg-surface" />
      <span aria-hidden className="absolute bottom-0 left-[74px] h-3 w-3 translate-y-1/2 rounded-full bg-surface" />
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-ink">{couponHeadline(coupon)}</p>
          <p className="truncate text-sm text-ink-2">{coupon.title}</p>
          <p className="mt-0.5 text-xs text-ink-3">{terms}</p>
          {reason && <p className="mt-1 text-xs font-medium text-danger">{reason}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
