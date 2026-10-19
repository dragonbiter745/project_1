import { useState } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { pauseOrders, resumeOrders } from '@foodcourt/firebase-client/local-ops';
import { formatPaise, todayStats, type Vendor } from '@foodcourt/shared';
import { Button, PauseSheet, cx, useNow } from '@foodcourt/ui';
import { jsonEqual, useLocal } from '../../lib/store';

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export function Shops() {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const [pausing, setPausing] = useState<Vendor | null>(null);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        {vendors.map((vendor) => (
          <ShopCard key={vendor.id} vendor={vendor} onPause={() => setPausing(vendor)} />
        ))}
      </div>
      <PauseSheet
        shopName={pausing?.name ?? ''}
        open={pausing !== null}
        onClose={() => setPausing(null)}
        onPause={(until) => {
          if (pausing) pauseOrders(pausing.id, until);
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

  return (
    <article className="rounded-sheet bg-surface p-6 ring-1 ring-inset ring-line">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-ink">{vendor.name}</h2>
          <p className="mt-0.5 text-sm text-ink-3">
            Tokens {vendor.code} · usual prep {vendor.defaultPrepMin} min
          </p>
        </div>
        <span
          className={cx(
            'shrink-0 rounded-full px-3 py-1 text-sm font-semibold',
            paused ? 'bg-danger-tint text-danger' : 'bg-ready-tint text-ready'
          )}
        >
          {paused ? (vendor.pausedUntil ? `Paused until ${formatTime(vendor.pausedUntil)}` : 'Paused') : 'Taking orders'}
        </span>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Metric label="Active tickets" value={String(active)} />
        <Metric label="Waiting to accept" value={String(waiting)} warn={waiting > 0} />
        <Metric label="Sold-out dishes" value={`${soldOut} of ${menuSize}`} />
        <Metric label="Collected today" value={String(stats.collected)} />
        <Metric label="Collected sales" value={formatPaise(stats.salesPaise)} />
        <Metric
          label="Accept to ready"
          value={stats.medianReadyMin === null ? 'No data yet' : `${Math.round(stats.medianReadyMin)} min`}
          muted={stats.medianReadyMin === null}
        />
      </dl>

      <footer className="mt-6 flex justify-end border-t border-line pt-4">
        {paused ? (
          <Button variant="positive" onClick={() => resumeOrders(vendor.id)} icon={<PlayCircle className="h-4 w-4" strokeWidth={2} />}>
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

function Metric({ label, value, warn, muted }: { label: string; value: string; warn?: boolean; muted?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd
        className={cx(
          'mt-0.5 font-semibold tabular-nums',
          muted ? 'text-base text-ink-3' : 'text-xl',
          warn ? 'text-danger' : !muted && 'text-ink'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
