import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CreditCard, Crosshair, Minus, Plus, QrCode, RotateCcw, Search, Store, Wallet, X } from 'lucide-react';
import { computeOrderTotals, formatPaise, type GlobalConfig } from '@foodcourt/shared';
import { VegDot, cx } from '@foodcourt/ui';
import { TABLES } from '../../data/layout';
import { SHOPS, SHOP_BY_ID } from '../../data/shops';
import { chime } from '../../lib/audio';
import { orderAtTable } from '../../lib/links';
import { useCart } from '../../store/cart';
import { getSim, type YouOrder } from '../../store/sim';
import { useUi } from '../../store/ui';
import { formatClock } from '../format';

// Demo checkout uses the same pricing maths as the real app: 5% GST on top.
const DEMO_CONFIG: GlobalConfig = {
  pointsPerRupee: 0.1,
  pointsExpiryDays: 90,
  gstPct: 5,
  taxInclusive: false,
  platformFeePaise: 0,
  flags: { paymentsEnabled: true, loyaltyEnabled: false, maintenance: false },
};

type Step = 'menu' | 'pay' | 'track';
type Filter = 'veg' | 'cheap' | 'quick';

export function OrderPanel() {
  const you = useUi((s) => s.snapshot?.you ?? null);
  const [step, setStep] = useState<Step>(you ? 'track' : 'menu');
  useEffect(() => {
    if (you && step !== 'track') setStep('track');
  }, [you, step]);

  return (
    <section
      aria-label="Order"
      className="glass-strong pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[84dvh] flex-col rounded-t-[28px] md:inset-x-auto md:bottom-4 md:left-4 md:max-h-[calc(100dvh-180px)] md:w-[400px] md:rounded-[28px]"
    >
      {step === 'menu' && <MenuStep onCheckout={() => setStep('pay')} />}
      {step === 'pay' && <PayStep onBack={() => setStep('menu')} onPlaced={() => setStep('track')} />}
      {step === 'track' && <TrackStep onAgain={() => setStep('menu')} />}
    </section>
  );
}

function PanelHeader({ title, sub, onBack }: { title: string; sub?: string; onBack?: () => void }) {
  return (
    <header className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
      {onBack && (
        <button type="button" aria-label="Back" onClick={onBack} className="pressable grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink-2">
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {sub && <p className="truncate text-xs text-ink-3">{sub}</p>}
      </div>
      <button type="button" aria-label="Close order" onClick={() => useUi.getState().set({ orderOpen: false })} className="pressable grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink-2">
        <X className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </header>
  );
}

function MenuStep({ onCheckout }: { onCheckout: () => void }) {
  const shopId = useUi((s) => s.orderShop);
  const soldOut = useUi((s) => s.snapshot?.shops.find((x) => x.id === shopId)?.soldOut ?? []);
  const lines = useCart((s) => s.lines);
  const history = useCart((s) => s.history);
  const add = useCart((s) => s.add);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const shopRow = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    const source = query ? SHOPS.flatMap((s) => s.menu.map((m) => ({ shop: s, m }))) : SHOP_BY_ID[shopId]!.menu.map((m) => ({ shop: SHOP_BY_ID[shopId]!, m }));
    return source.filter(
      ({ m }) =>
        (!query || m.name.toLowerCase().includes(query)) &&
        (!filters.has('veg') || m.veg) &&
        (!filters.has('cheap') || m.pricePaise < 10_000) &&
        (!filters.has('quick') || m.prepMin < 10)
    );
  }, [q, filters, shopId]);

  const qtyOf = (s: string, i: string) => lines.find((l) => l.shopId === s && l.itemId === i)?.qty ?? 0;
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + (SHOP_BY_ID[l.shopId]?.menu.find((m) => m.id === l.itemId)?.pricePaise ?? 0) * l.qty, 0);
  const shopsInCart = new Set(lines.map((l) => l.shopId)).size;
  const toggle = (f: Filter) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  return (
    <>
      <PanelHeader title="Order from any shop" sub="One cart across all eight kitchens, one payment." />
      <div className="shrink-0 px-5">
        <label className="flex h-11 items-center gap-2 rounded-full bg-white/80 px-4 ring-1 ring-inset ring-line/70 focus-within:ring-2 focus-within:ring-accent/40">
          <Search className="h-4 w-4 text-ink-3" strokeWidth={2} />
          <span className="sr-only">Search dishes</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every menu" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3" />
        </label>
        <div className="mt-2.5 flex gap-1.5">
          {(
            [
              ['veg', 'Veg'],
              ['cheap', 'Under ₹100'],
              ['quick', 'Under 10 min'],
            ] as const
          ).map(([f, label]) => (
            <button key={f} type="button" aria-pressed={filters.has(f)} onClick={() => toggle(f)} className="chip h-8 bg-white/70 px-3 text-[13px]">
              {label}
            </button>
          ))}
        </div>
      </div>
      {!q && (
        // shrink-0: a scrolling row would otherwise collapse to nothing inside the flex column.
        <div
          ref={shopRow}
          className="no-scrollbar mt-2 flex shrink-0 snap-x gap-2 overflow-x-auto scroll-px-5 px-5 py-1.5 [mask-image:linear-gradient(to_right,black_85%,transparent)]"
        >
          {SHOPS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === shopId}
              onClick={() => {
                useUi.getState().set({ orderShop: s.id });
                useUi.getState().select({ kind: 'shop', id: s.id });
              }}
              className={cx(
                'pressable flex h-10 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full pl-1.5 pr-3.5 text-sm font-semibold transition-[background-color,color,box-shadow]',
                s.id === shopId ? 'bg-ink text-white shadow-thumb' : 'bg-white/70 text-ink-2 hover:bg-white'
              )}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full font-mono text-[11px] text-white" style={{ background: s.color }}>
                {s.code}
              </span>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {items.length === 0 && <li className="px-2 py-8 text-center text-sm text-ink-3">Nothing matches. Try another filter.</li>}
        {items.map(({ shop, m }) => {
          const qty = qtyOf(shop.id, m.id);
          const out = shop.id === shopId ? soldOut.includes(m.name) : false;
          return (
            <li key={m.id} className={cx('flex items-center gap-3 rounded-[16px] px-3 py-2.5 transition-colors', qty > 0 ? 'bg-accent-tint/70 ring-1 ring-inset ring-accent-line' : 'hover:bg-white/70', out && 'opacity-50')}>
              <span className="mt-0.5 self-start pt-1">
                <VegDot veg={m.veg} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{m.name}</p>
                <p className="text-xs text-ink-3">
                  {q ? `${shop.name} · ` : ''}
                  {m.prepMin} min · {formatPaise(m.pricePaise)}
                </p>
              </div>
              {out ? (
                <span className="text-xs font-semibold text-danger">Sold out</span>
              ) : qty === 0 ? (
                <button type="button" aria-label={`Add ${m.name}`} onClick={() => add(shop.id, m.id, 1)} className="pressable h-10 rounded-full bg-white px-4 text-sm font-semibold text-accent-ink shadow-thumb ring-1 ring-inset ring-accent-line">
                  Add
                </button>
              ) : (
                <span className="flex h-10 items-center rounded-full bg-white shadow-thumb ring-1 ring-inset ring-accent-line">
                  <button type="button" aria-label={`Remove one ${m.name}`} onClick={() => add(shop.id, m.id, -1)} className="pressable grid h-10 w-10 place-items-center text-accent-ink">
                    <Minus className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                  <span key={qty} className="tick w-5 text-center text-sm font-semibold tabular-nums">
                    {qty}
                  </span>
                  <button type="button" aria-label={`Add one more ${m.name}`} onClick={() => add(shop.id, m.id, 1)} className="pressable grid h-10 w-10 place-items-center text-accent-ink">
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </span>
              )}
            </li>
          );
        })}
        {!q && history[0] && lines.length === 0 && (
          <li className="px-2 pt-2">
            <button
              type="button"
              onClick={() => useCart.getState().replace(history[0]!.lines)}
              className="pressable flex w-full items-center gap-3 rounded-[16px] bg-white/70 px-3 py-3 text-left text-sm ring-1 ring-inset ring-line/60 hover:bg-white"
            >
              <RotateCcw className="h-4 w-4 text-accent-ink" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">Order again</span>
                <span className="block truncate text-xs text-ink-3">
                  {history[0].tokens.join(' + ')} · {formatPaise(history[0].totalPaise)}
                </span>
              </span>
            </button>
          </li>
        )}
        {!q && shopId === 'dosa-corner' && (
          <li className="px-2 pt-1">
            <button
              type="button"
              onClick={() => {
                add('dosa-corner', 'dc-masala', 1);
                add('chai-chaat', 'cc-chai', 1);
              }}
              className="spot pressable flex w-full items-center gap-3 rounded-[16px] bg-gradient-to-r from-[#fff4e6] to-[#fdecef] px-3 py-3 text-left text-sm ring-1 ring-inset ring-accent-line"
            >
              <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-accent-ink text-white">
                <Store className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">Popular pairing across two shops</span>
                <span className="block text-xs text-ink-3">Masala Dosa + Masala Chai · {formatPaise(9000 + 2500)} · two tokens, one payment</span>
              </span>
            </button>
          </li>
        )}
      </ul>

      <footer className="shrink-0 border-t border-line/70 p-3">
        <button
          type="button"
          disabled={count === 0}
          onClick={onCheckout}
          className="pressable flex h-14 w-full items-center justify-between rounded-full bg-ink pl-5 pr-2 text-white shadow-float transition-[background-color,opacity] hover:bg-black disabled:opacity-40"
        >
          <span className="text-left">
            <span className="block text-sm font-semibold">{count === 0 ? 'Add a dish to start' : `${count} ${count === 1 ? 'item' : 'items'} · ${shopsInCart} ${shopsInCart === 1 ? 'shop' : 'shops'}`}</span>
            {count > 0 && <span className="block text-xs text-white/70">{formatPaise(subtotal)} before GST</span>}
          </span>
          <span className="rounded-full bg-accent-ink px-4 py-2.5 text-sm font-semibold">Checkout</span>
        </button>
      </footer>
    </>
  );
}

type Method = 'upi' | 'card' | 'counter';

function PayStep({ onBack, onPlaced }: { onBack: () => void; onPlaced: () => void }) {
  const lines = useCart((s) => s.lines);
  const tableStatus = useUi((s) => s.snapshot?.tableStatus ?? {});
  const preset = useUi((s) => s.presetTable);
  const [table, setTable] = useState<string>(preset ?? 'auto');
  const [method, setMethod] = useState<Method>('upi');
  const [error, setError] = useState<string | null>(null);

  const byShop = useMemo(() => {
    const m = new Map<string, Array<{ name: string; qty: number; pricePaise: number }>>();
    for (const l of lines) {
      const item = SHOP_BY_ID[l.shopId]?.menu.find((x) => x.id === l.itemId);
      if (!item) continue;
      const list = m.get(l.shopId) ?? [];
      list.push({ name: item.name, qty: l.qty, pricePaise: item.pricePaise });
      m.set(l.shopId, list);
    }
    return m;
  }, [lines]);
  const totals = computeOrderTotals({ items: [...byShop.values()].flat(), config: DEMO_CONFIG });
  const freeTables = TABLES.filter((t) => tableStatus[t.id] === 'free');

  const place = () => {
    const res = getSim().placeYouOrder(lines, table === 'auto' ? undefined : table);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    const tokens = res.orderIds.map((id) => getSim().orders.get(id)!.token);
    useCart.getState().remember({ at: Date.now(), tokens, totalPaise: totals.totalPaise, lines });
    useCart.getState().clear();
    const ui = useUi.getState();
    ui.set({ presetTable: null, cameraMode: 'follow', follow: res.agentId, selection: { kind: 'person', id: res.agentId } });
    onPlaced();
  };

  return (
    <>
      <PanelHeader title="Pay once" sub={`${byShop.size} ${byShop.size === 1 ? 'shop' : 'shops'}, ${byShop.size} ${byShop.size === 1 ? 'token' : 'tokens'}, one payment`} onBack={onBack} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
        <ul className="space-y-2">
          {[...byShop].map(([shopId, items]) => {
            const shop = SHOP_BY_ID[shopId]!;
            return (
              <li key={shopId} className="rounded-[18px] bg-white/75 p-3.5 ring-1 ring-inset ring-line/60">
                <p className="flex items-center justify-between text-sm font-semibold text-ink">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: shop.color }} />
                    {shop.name}
                  </span>
                  <span className="font-mono text-xs text-ink-3">{shop.code}-···</span>
                </p>
                <ul className="mt-1.5 space-y-0.5 text-sm text-ink-2">
                  {items.map((i) => (
                    <li key={i.name} className="flex justify-between">
                      <span>
                        {i.qty} × {i.name}
                      </span>
                      <span className="tabular-nums">{formatPaise(i.pricePaise * i.qty)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-3">Deliver to</p>
          <select
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="h-11 w-full rounded-[14px] bg-white/80 px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line/70 outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="auto">Any free table ({freeTables.length} free)</option>
            {preset && !freeTables.some((t) => t.id === preset) && <option value={preset}>{preset} (scanned)</option>}
            {freeTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · {t.kind === 'four' ? '4 seats' : t.kind === 'bench' ? 'bench, 6 seats' : 'window bar'}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-3">A runner brings every tray to your table.</p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-3">Pay with (demo, nothing is charged)</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['upi', 'UPI QR', QrCode],
                ['card', 'Card', CreditCard],
                ['counter', 'At counter', Wallet],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={cx(
                  'pressable flex h-16 flex-col items-center justify-center gap-1 rounded-[16px] text-xs font-semibold transition-colors',
                  method === m ? 'bg-accent-tint text-accent-ink ring-2 ring-inset ring-accent' : 'bg-white/75 text-ink-2 ring-1 ring-inset ring-line/60'
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <dl className="space-y-1 rounded-[18px] bg-white/75 p-3.5 text-sm ring-1 ring-inset ring-line/60">
          <div className="flex justify-between text-ink-2">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatPaise(totals.subtotalPaise, true)}</dd>
          </div>
          <div className="flex justify-between text-ink-2">
            <dt>GST 5%</dt>
            <dd className="tabular-nums">{formatPaise(totals.taxPaise, true)}</dd>
          </div>
          <div className="flex justify-between border-t border-line/70 pt-1.5 text-base font-semibold text-ink">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPaise(totals.totalPaise, true)}</dd>
          </div>
        </dl>
        {error && (
          <p role="alert" className="rounded-[14px] bg-danger-tint px-3.5 py-2.5 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <footer className="shrink-0 border-t border-line/70 p-3">
        <button type="button" onClick={place} disabled={lines.length === 0} className="pressable h-14 w-full rounded-full bg-accent-ink text-base font-semibold text-white shadow-float transition-[filter] hover:brightness-110 disabled:opacity-40">
          Pay {formatPaise(totals.totalPaise, true)} and watch it arrive
        </button>
      </footer>
    </>
  );
}

function TrackStep({ onAgain }: { onAgain: () => void }) {
  const you = useUi((s) => s.snapshot?.you ?? null);
  const follow = useUi((s) => s.follow);
  const sound = useUi((s) => s.sound);
  const readySeen = useRef(new Set<string>());

  useEffect(() => {
    for (const o of you?.orders ?? []) {
      if (o.status === 'READY' && !readySeen.current.has(o.token)) {
        readySeen.current.add(o.token);
        if (sound) chime();
      }
    }
  }, [you, sound]);

  if (!you) {
    return (
      <>
        <PanelHeader title="Thanks for eating with us" />
        <div className="px-5 pb-5">
          <p className="text-sm text-ink-2">Your table was wiped and handed to the next diners. That is the whole loop, from QR to clean table.</p>
          <div className="mt-4 grid gap-2">
            <button type="button" onClick={onAgain} className="pressable h-12 rounded-full bg-ink text-sm font-semibold text-white">
              Place another demo order
            </button>
            <a href={orderAtTable()} className="pressable grid h-12 place-items-center rounded-full bg-white text-sm font-semibold text-accent-ink ring-1 ring-inset ring-accent-line">
              Scan a table QR at REVA to order
            </a>
          </div>
        </div>
      </>
    );
  }

  const done = you.orders.every((o) => o.status === 'COLLECTED');
  const following = follow === you.agentId;
  return (
    <>
      <PanelHeader title={done ? 'Enjoy your meal' : 'Your order is on its way'} sub={`Table ${you.tableId} · ${you.orders.length} ${you.orders.length === 1 ? 'token' : 'tokens'}`} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
        {you.orders.map((o) => (
          <Ticket key={o.token} order={o} />
        ))}
      </div>
      <footer className="flex shrink-0 gap-2 border-t border-line/70 p-3">
        <button
          type="button"
          onClick={() => useUi.getState().set(following ? { follow: null, cameraMode: 'orbit' } : { follow: you.agentId, cameraMode: 'follow' })}
          className={cx('pressable inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold', following ? 'bg-accent-ink text-white' : 'bg-ink text-white')}
        >
          <Crosshair className="h-4 w-4" />
          {following ? 'Following you' : 'Follow me'}
        </button>
        <button type="button" onClick={() => useUi.getState().select({ kind: 'table', id: you.tableId })} className="pressable h-12 rounded-full bg-white px-5 text-sm font-semibold text-ink ring-1 ring-inset ring-line">
          My table
        </button>
      </footer>
    </>
  );
}

function Ticket({ order }: { order: YouOrder }) {
  const nowIndex = order.steps.findIndex((s) => s.at === null);
  return (
    <article className="rounded-[20px] bg-white/80 p-4 ring-1 ring-inset ring-line/60">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: order.color }} />
            {order.shopName}
          </p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight text-ink">{order.token}</p>
        </div>
        <span
          className={cx(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            order.status === 'READY' ? 'bg-ready-tint text-ready' : order.status === 'COLLECTED' ? 'bg-surface-2 text-ink-2' : 'bg-accent-tint text-accent-ink'
          )}
        >
          {order.label}
          {order.etaMin !== null && order.status !== 'COLLECTED' ? ` · ~${order.etaMin} min` : ''}
        </span>
      </header>
      <p className="mt-1 truncate text-xs text-ink-3">{order.lines.join(', ')}</p>
      <ol className="mt-3 grid grid-cols-6 gap-1">
        {order.steps.map((s, i) => (
          <li key={s.label} className="flex flex-col items-center text-center">
            <span className={cx('step-dot grid h-6 w-6 place-items-center rounded-full bg-surface-2 transition-colors duration-500')} data-done={s.at !== null} data-now={i === nowIndex}>
              {s.at !== null && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </span>
            <span className="mt-1 text-[10px] font-semibold leading-tight text-ink-2">{s.label}</span>
            <span className="text-[10px] tabular-nums text-ink-3">{s.at !== null ? formatClock(s.at).replace(/ (am|pm)/, '') : ''}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
