import { Bell, Check, QrCode } from 'lucide-react';
import { formatPaise } from '@foodcourt/shared';
import { VegDot, cx } from '@foodcourt/ui';
import { SHOPS, SHOP_BY_ID } from '../../data/shops';

/** A phone running the diner app, one screen per story step. */
export function Phone({ step }: { step: number }) {
  return (
    <div className="relative mx-auto w-[300px] shrink-0">
      <div className="absolute -inset-10 -z-10 rounded-[80px] bg-gradient-to-br from-[#ffd7bd] via-[#fde68a]/60 to-[#fbcfe8] opacity-70 blur-3xl" />
      <div className="rounded-[52px] bg-[#111214] p-[11px] shadow-[0_40px_80px_-30px_rgba(92,48,18,0.55)]">
        <div className="relative h-[600px] overflow-hidden rounded-[42px] bg-bg">
          <div className="absolute left-1/2 top-2.5 z-20 h-7 w-28 -translate-x-1/2 rounded-full bg-black" />
          {[ScanScreen, BrowseScreen, CartScreen, TokenScreen, ReadyScreen].map((Screen, i) => (
            <div key={i} className="swap-layer absolute inset-0" data-active={step === i} aria-hidden={step !== i}>
              <Screen />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex h-12 items-end justify-between px-7 pb-1 text-[11px] font-semibold text-ink">
      <span>12:48</span>
      <span>5G</span>
    </div>
  );
}

function ScanScreen() {
  return (
    <div className="field-saffron flex h-full flex-col">
      <StatusBar />
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="relative grid h-48 w-48 place-items-center rounded-[34px] bg-white shadow-card">
          <QrCode className="h-28 w-28 text-ink" strokeWidth={1.2} />
          {(['left-3 top-3 border-l-4 border-t-4', 'right-3 top-3 border-r-4 border-t-4', 'bottom-3 left-3 border-b-4 border-l-4', 'bottom-3 right-3 border-b-4 border-r-4'] as const).map((c) => (
            <span key={c} className={cx('absolute h-8 w-8 rounded-[6px] border-accent', c)} />
          ))}
        </div>
        <p className="mt-6 text-xl font-semibold tracking-tight text-ink">Table T07</p>
        <p className="mt-1 text-sm text-ink-3">Opening every menu in the court…</p>
      </div>
    </div>
  );
}

function BrowseScreen() {
  const shop = SHOPS[0]!;
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <div className="px-5">
        <p className="text-xs font-semibold text-ink-3">T07 · REVA Food Court</p>
        <p className="mt-1 text-[22px] font-semibold tracking-tight text-ink">What are you craving?</p>
      </div>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-hidden px-5">
        {SHOPS.slice(0, 5).map((s, i) => (
          <span key={s.id} className={cx('flex h-8 shrink-0 items-center gap-1.5 rounded-full pl-1 pr-3 text-xs font-semibold', i === 0 ? 'bg-ink text-white' : 'bg-white text-ink-2 shadow-thumb')}>
            <span className="grid h-6 w-6 place-items-center rounded-full font-mono text-[9px] text-white" style={{ background: s.color }}>
              {s.code}
            </span>
            {s.name.split(' ')[0]}
          </span>
        ))}
      </div>
      <ul className="mt-4 space-y-2 px-4">
        {shop.menu.slice(0, 5).map((m, i) => (
          <li key={m.id} className="flex items-center gap-3 rounded-[18px] bg-white px-3.5 py-3 shadow-thumb">
            <VegDot veg={m.veg} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
              <p className="text-xs text-ink-3">
                {formatPaise(m.pricePaise)} · {m.prepMin} min
              </p>
            </div>
            <span className={cx('rounded-full px-3 py-1.5 text-xs font-semibold', i === 0 ? 'bg-accent-ink text-white' : 'bg-accent-tint text-accent-ink')}>{i === 0 ? '1' : 'Add'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CART = [
  { shop: 'dosa-corner', item: 'dc-masala', qty: 1 },
  { shop: 'wok-momos', item: 'wm-chkmomo', qty: 1 },
  { shop: 'chai-chaat', item: 'cc-chai', qty: 2 },
];

function CartScreen() {
  const subtotal = CART.reduce((n, l) => n + SHOP_BY_ID[l.shop]!.menu.find((m) => m.id === l.item)!.pricePaise * l.qty, 0);
  const gst = Math.round((subtotal * 5) / 100);
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <p className="px-5 text-[22px] font-semibold tracking-tight text-ink">Your cart</p>
      <p className="px-5 text-xs text-ink-3">3 shops · 3 tokens · 1 payment</p>
      <ul className="mt-3 space-y-2 px-4">
        {CART.map((l) => {
          const s = SHOP_BY_ID[l.shop]!;
          const m = s.menu.find((x) => x.id === l.item)!;
          return (
            <li key={l.item} className="rounded-[18px] bg-white p-3 shadow-thumb">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-3">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </p>
              <p className="mt-1 flex justify-between text-sm font-semibold text-ink">
                <span>
                  {l.qty} × {m.name}
                </span>
                <span className="tabular-nums">{formatPaise(m.pricePaise * l.qty)}</span>
              </p>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto space-y-3 p-4">
        <div className="flex justify-between text-sm text-ink-2">
          <span>Incl. 5% GST {formatPaise(gst, true)}</span>
          <span className="font-semibold text-ink">{formatPaise(subtotal + gst, true)}</span>
        </div>
        <div className="flex h-12 items-center justify-center rounded-full bg-accent-ink text-sm font-semibold text-white">Pay once with UPI</div>
      </div>
    </div>
  );
}

function TokenScreen() {
  const rows = [
    { token: 'DC-042', shop: 'dosa-corner', label: 'Cooking', at: 3 },
    { token: 'WM-019', shop: 'wok-momos', label: 'Accepted', at: 2 },
    { token: 'CC-107', shop: 'chai-chaat', label: 'Ready', at: 4 },
  ];
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <p className="px-5 text-[22px] font-semibold tracking-tight text-ink">Paid. Three tokens.</p>
      <p className="px-5 text-xs text-ink-3">Every kitchen got its ticket the same second.</p>
      <ul className="mt-4 space-y-2.5 px-4">
        {rows.map((r) => {
          const s = SHOP_BY_ID[r.shop]!;
          return (
            <li key={r.token} className="rounded-[20px] bg-white p-3.5 shadow-thumb">
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-semibold text-ink">{r.token}</span>
                <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', r.label === 'Ready' ? 'bg-ready-tint text-ready' : 'bg-accent-tint text-accent-ink')}>{r.label}</span>
              </div>
              <p className="text-[11px] text-ink-3">{s.name}</p>
              <div className="mt-2.5 flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={cx('h-1.5 flex-1 rounded-full', i < r.at ? (r.label === 'Ready' ? 'bg-ready' : 'bg-accent') : 'bg-surface-2')} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReadyScreen() {
  return (
    <div className="field-mint relative flex h-full flex-col">
      <StatusBar />
      <div className="mx-3 mt-2 flex items-center gap-3 rounded-[20px] bg-white/90 p-3 shadow-card">
        <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-ready text-white">
          <Bell className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">DC-042 is ready</p>
          <p className="text-xs text-ink-3">A runner is bringing it to T07</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="grid h-24 w-24 place-items-center rounded-full bg-ready text-white shadow-[0_20px_40px_-12px_rgba(21,128,61,0.55)]">
          <Check className="h-12 w-12" strokeWidth={2.5} />
        </span>
        <p className="mt-6 text-2xl font-semibold tracking-tight text-ink">At your table</p>
        <p className="mt-1 text-sm text-ink-2">Hot, from three kitchens, and you never stood in a line.</p>
      </div>
    </div>
  );
}
