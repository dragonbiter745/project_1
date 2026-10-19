import { formatPaise, todayStats } from '@foodcourt/shared';
import { useNow } from '@foodcourt/ui';
import { Stat } from '../../components/Stat';
import { jsonEqual, useLocal } from '../../lib/store';

const percent = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));

// Today's numbers only, computed from the live tickets. Longer ranges come from the
// analyticsDaily rollups once they exist (PRD §6.2.10); nothing here is estimated.
export function Insights() {
  const subs = useLocal((s) => Object.values(s.subOrders), jsonEqual);
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const now = useNow(60_000);
  const all = todayStats(subs, now);
  const problemShare = percent(all.rejected + all.finished.filter((s) => s.status === 'CANCELLED').length, all.finished.length);

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Collected sales today" value={formatPaise(all.salesPaise)} />
        <Stat label="Orders collected" value={String(all.collected)} />
        <Stat
          label="Accept to ready (median)"
          value={all.medianReadyMin === null ? 'No data yet' : `${Math.round(all.medianReadyMin)} min`}
          tone={all.medianReadyMin === null ? 'muted' : 'default'}
        />
        <Stat
          label="Rejected, missed or cancelled"
          value={problemShare === null ? 'No data yet' : `${problemShare}%`}
          tone={problemShare === null ? 'muted' : problemShare >= 10 ? 'warn' : 'default'}
          hint={problemShare === null ? undefined : 'Share of finished orders'}
        />
      </dl>

      <section aria-labelledby="by-shop" className="mt-8">
        <h2 id="by-shop" className="text-lg font-semibold tracking-tight text-ink">
          By shop
        </h2>
        <div className="mt-3 overflow-x-auto rounded-card bg-surface ring-1 ring-inset ring-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">Shop</th>
                <th className="px-4 py-3 text-right font-medium">Collected</th>
                <th className="px-4 py-3 text-right font-medium">Sales</th>
                <th className="px-4 py-3 text-right font-medium">Accept to ready</th>
                <th className="px-4 py-3 text-right font-medium">Rejected or missed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {vendors.map((vendor) => {
                const s = todayStats(
                  subs.filter((sub) => sub.vendorId === vendor.id),
                  now
                );
                return (
                  <tr key={vendor.id}>
                    <td className="px-4 py-3 font-medium text-ink">{vendor.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-2">{s.collected}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">{formatPaise(s.salesPaise)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-2">
                      {s.medianReadyMin === null ? 'No data yet' : `${Math.round(s.medianReadyMin)} min`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-2">{s.rejected}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
