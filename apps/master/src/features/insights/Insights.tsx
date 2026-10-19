import { AlertTriangle, IndianRupee, PackageCheck, Timer } from 'lucide-react';
import { formatPaise, todayStats } from '@foodcourt/shared';
import { Monogram, useNow } from '@foodcourt/ui';
import { HourBars, ShareBars } from '../../components/Charts';
import { KpiTile } from '../../components/KpiTile';
import { hourlyToday } from '../../lib/hourly';
import { jsonEqual, useLocal } from '../../lib/store';

const percent = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));

// Today's numbers only, computed from the live tickets. Longer ranges come from the
// analyticsDaily rollups once they exist (PRD §6.2.10); nothing here is estimated.
export function Insights() {
  const subs = useLocal((s) => Object.values(s.subOrders), jsonEqual);
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const now = useNow(60_000);
  const all = todayStats(subs, now);
  const hours = hourlyToday(subs, now);
  const problemShare = percent(all.rejected + all.finished.filter((s) => s.status === 'CANCELLED').length, all.finished.length);
  const perShop = vendors.map((vendor) => ({ vendor, stats: todayStats(subs.filter((s) => s.vendorId === vendor.id), now) }));

  return (
    <>
      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile feature label="Collected sales today" value={formatPaise(all.salesPaise)} icon={IndianRupee} tone="accent" />
        <KpiTile label="Orders collected" value={String(all.collected)} icon={PackageCheck} tone="ready" />
        <KpiTile
          label="Accept to ready"
          value={all.medianReadyMin === null ? 'No data yet' : `${Math.round(all.medianReadyMin)} min`}
          muted={all.medianReadyMin === null}
          icon={Timer}
          tone="prep"
          hint="Median, all shops"
        />
        <KpiTile
          label="Rejected, missed or cancelled"
          value={problemShare === null ? 'No data yet' : `${problemShare}%`}
          muted={problemShare === null}
          alert={problemShare !== null && problemShare >= 10}
          icon={AlertTriangle}
          tone={problemShare !== null && problemShare >= 10 ? 'danger' : 'neutral'}
          hint={problemShare === null ? undefined : 'Share of finished orders'}
        />
      </dl>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="hourly" className="rounded-sheet bg-surface p-6 shadow-card ring-1 ring-inset ring-line/70">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="hourly" className="text-lg font-semibold tracking-tight text-ink">
              Orders by hour
            </h2>
            <p className="text-sm tabular-nums text-ink-3">{hours.reduce((n, h) => n + h.orders, 0)} today</p>
          </div>
          <div className="mt-6">
            <HourBars
              title="Orders placed each hour today"
              bars={hours.map((h) => ({ key: String(h.hour), label: h.label, value: h.orders, display: `${h.orders} ${h.orders === 1 ? 'order' : 'orders'}` }))}
            />
          </div>
        </section>

        <section aria-labelledby="shop-share" className="rounded-sheet bg-surface p-6 shadow-card ring-1 ring-inset ring-line/70">
          <h2 id="shop-share" className="text-lg font-semibold tracking-tight text-ink">
            Sales by shop
          </h2>
          <div className="mt-6">
            <ShareBars
              rows={perShop.map(({ vendor, stats }) => ({
                key: vendor.id,
                label: vendor.name,
                value: stats.salesPaise,
                display: formatPaise(stats.salesPaise),
              }))}
            />
          </div>
        </section>
      </div>

      <section aria-labelledby="by-shop" className="mt-6 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <h2 id="by-shop" className="px-6 pt-5 text-lg font-semibold tracking-tight text-ink">
          Shop by shop
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-bg/60 text-xs text-ink-3">
              <tr>
                <th className="py-3 pl-6 pr-3 font-medium">Shop</th>
                <th className="px-3 py-3 text-right font-medium">Collected</th>
                <th className="px-3 py-3 text-right font-medium">Sales</th>
                <th className="px-3 py-3 text-right font-medium">Accept to ready</th>
                <th className="py-3 pl-3 pr-6 text-right font-medium">Rejected or missed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {perShop.map(({ vendor, stats }) => (
                <tr key={vendor.id} className="transition-colors hover:bg-accent-tint/40">
                  <td className="py-3.5 pl-6 pr-3">
                    <span className="flex items-center gap-3 font-medium text-ink">
                      <Monogram code={vendor.code} size="sm" />
                      {vendor.name}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-ink-2">{stats.collected}</td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-ink">{formatPaise(stats.salesPaise)}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-ink-2">
                    {stats.medianReadyMin === null ? 'No data yet' : `${Math.round(stats.medianReadyMin)} min`}
                  </td>
                  <td className="py-3.5 pl-3 pr-6 text-right tabular-nums text-ink-2">{stats.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
