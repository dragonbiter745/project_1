import { useState, type ReactNode } from 'react';
import { ChefHat, Clock3, IndianRupee, PackageCheck, PackageX, PauseCircle, PlayCircle, Timer } from 'lucide-react';
import { pauseOrders, resumeOrders } from '@foodcourt/firebase-client/ops';
import { formatPaise, todayStats, type Vendor } from '@foodcourt/shared';
import { Button, Monogram, PauseSheet, cx, run, useNow } from '@foodcourt/ui';
import { jsonEqual, useLocal } from '../../lib/store';

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export function Shops() {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const [pausing, setPausing] = useState<Vendor | null>(null);

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-2">
        {vendors.map((vendor) => (
          <ShopCard key={vendor.id} vendor={vendor} onPause={() => setPausing(vendor)} />
        ))}
      </div>
      <PauseSheet
        shopName={pausing?.name ?? ''}
        open={pausing !== null}
        onClose={() => setPausing(null)}
        onPause={(until) => {
          if (pausing) void run(pauseOrders(pausing.id, until));
          setPausing(null);
        }}
      />
    </>
  );
}

function ShopCard({ vendor, onPause }: { vendor: Vendor; onPause: () => void }) {
  const subs = useLocal((s) => Object.values(s.subOrders).filter((sub) => sub.vendorId === vendor.id), jsonEqual);
  const soldOut = useLocal((s) => Object.keys(s.availability[vendor.id]?.unavailable ?? {}).length);
  const menuSize = useLocal((s) => s.menus[vendor.id]?.categories.reduce((n, c) => n + c.items.length, 0) ?? 0);
  const now = useNow(30_000);
  const stats = todayStats(subs, now);
  const active = subs.filter((s) => ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(s.status)).length;
  const waiting = subs.filter((s) => s.status === 'NEW').length;
  const paused = !vendor.acceptingOrders;
  const inStockShare = menuSize === 0 ? 0 : (menuSize - soldOut) / menuSize;

  return (
    <article className="overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
      <header className="kpi-feature flex items-center justify-between gap-4 border-b border-accent-line/60 px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <Monogram code={vendor.code} size="lg" tone="solid" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-bold text-ink">{vendor.name}</h2>
            <p className="mt-0.5 text-sm text-ink-3">
              Tokens {vendor.code}-001 onward · usual prep {vendor.defaultPrepMin} min
            </p>
          </div>
        </div>
        <span
          className={cx(
            'inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold ring-1 ring-inset',
            paused ? 'bg-danger-tint text-danger ring-danger/20' : 'bg-ready-tint text-ready ring-ready/20'
          )}
        >
          <span aria-hidden className={cx('h-2 w-2 rounded-full', paused ? 'bg-danger' : 'live-dot bg-ready')} />
          {paused ? (vendor.pausedUntil ? `Paused until ${formatTime(vendor.pausedUntil)}` : 'Paused') : 'Taking orders'}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-px bg-line/70 sm:grid-cols-3">
        <Metric icon={<ChefHat className="h-4 w-4" />} tone="text-prep" label="Active tickets" value={String(active)} />
        <Metric
          icon={<Clock3 className="h-4 w-4" />}
          tone={waiting > 0 ? 'text-danger' : 'text-ink-3'}
          label="Waiting to accept"
          value={String(waiting)}
          warn={waiting > 0}
        />
        <Metric icon={<PackageCheck className="h-4 w-4" />} tone="text-ready" label="Collected today" value={String(stats.collected)} />
        <Metric icon={<IndianRupee className="h-4 w-4" />} tone="text-accent-ink" label="Collected sales" value={formatPaise(stats.salesPaise)} />
        <Metric
          icon={<Timer className="h-4 w-4" />}
          tone="text-accent-ink"
          label="Accept to ready"
          value={stats.medianReadyMin === null ? 'No data yet' : `${Math.round(stats.medianReadyMin)} min`}
          muted={stats.medianReadyMin === null}
        />
        <Metric icon={<PackageX className="h-4 w-4" />} tone="text-ink-3" label="Sold-out dishes" value={`${soldOut} of ${menuSize}`} />
      </dl>

      <footer className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-[180px] flex-1">
          <p className="flex justify-between text-xs text-ink-3">
            <span>Menu in stock</span>
            <span className="font-semibold tabular-nums text-ink-2">{Math.round(inStockShare * 100)}%</span>
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-ready transition-[width] duration-500 ease-out" style={{ width: `${inStockShare * 100}%` }} />
          </div>
        </div>
        {paused ? (
          <Button variant="positive" onClick={() => void run(resumeOrders(vendor.id))} icon={<PlayCircle className="h-4 w-4" strokeWidth={2} />}>
            Resume orders
          </Button>
        ) : (
          <Button variant="outline" onClick={onPause} icon={<PauseCircle className="h-4 w-4" strokeWidth={2} />}>
            Pause orders
          </Button>
        )}
      </footer>
    </article>
  );
}

function Metric({
  icon,
  tone,
  label,
  value,
  warn,
  muted,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: string;
  warn?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="bg-surface px-6 py-4">
      <dt className="flex items-center gap-2 text-sm text-ink-3">
        <span className={tone}>{icon}</span>
        {label}
      </dt>
      <dd
        className={cx(
          'mt-1 font-semibold tabular-nums tracking-tight',
          muted ? 'text-base text-ink-3' : 'text-2xl',
          warn ? 'text-danger' : !muted && 'text-ink'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
