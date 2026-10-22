import { useState } from 'react';
import { X } from 'lucide-react';
import { cx } from '@foodcourt/ui';
import { TABLES } from '../../data/layout';
import { useUi } from '../../store/ui';

type Tab = 'orders' | 'shops' | 'tables';

const TABLE_TONE: Record<string, string> = {
  free: 'bg-ready-tint text-ready',
  reserved: 'bg-prep-tint text-prep',
  occupied: 'bg-accent-tint text-accent-ink',
  dirty: 'bg-danger-tint text-danger',
  cleaning: 'bg-[#e0f2fe] text-[#0369a1]',
};
const TABLE_LABEL: Record<string, string> = { free: 'Free', reserved: 'Reserved', occupied: 'Occupied', dirty: 'Needs cleaning', cleaning: 'Cleaning' };

export function LiveData() {
  const [tab, setTab] = useState<Tab>('orders');
  const snap = useUi((s) => s.snapshot);
  if (!snap) return null;
  const peak = Math.max(...snap.shops.map((s) => s.servedToday), 1);

  return (
    <section aria-label="Live data" className="glass-strong pointer-events-auto absolute bottom-3 right-3 z-20 flex max-h-[56dvh] w-[min(94vw,440px)] flex-col rounded-[26px] p-3 md:bottom-4 md:right-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <div role="tablist" aria-label="Live data" className="flex rounded-full bg-surface-2/80 p-1">
          {(['orders', 'shops', 'tables'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx('h-8 rounded-full px-3.5 text-[13px] font-semibold capitalize transition-colors', tab === t ? 'bg-white text-ink shadow-thumb' : 'text-ink-3 hover:text-ink')}
            >
              {t}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Close live data" onClick={() => useUi.getState().set({ dataOpen: false })} className="pressable grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink-2">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {tab === 'orders' && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink-3">
              <tr>
                <th className="py-2 font-medium">Token</th>
                <th className="py-2 font-medium">Table</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {snap.recent.map((o) => (
                <tr key={o.token}>
                  <td className="py-2">
                    <span className="flex items-center gap-2 font-mono font-semibold text-ink">
                      <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />
                      {o.token}
                    </span>
                  </td>
                  <td className="py-2 text-ink-2">{o.table}</td>
                  <td className="py-2 text-ink-2">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'shops' && (
          <ul className="space-y-2">
            {[...snap.shops]
              .sort((a, b) => b.servedToday - a.servedToday)
              .map((s, i) => (
                <li key={s.id}>
                  <button type="button" onClick={() => useUi.getState().select({ kind: 'shop', id: s.id })} className="w-full rounded-[14px] bg-white/60 px-3 py-2.5 text-left transition-colors hover:bg-white">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <span className="w-4 text-xs tabular-nums text-ink-3">{i + 1}</span>
                        {s.name}
                        {s.rush && <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[11px] font-semibold text-danger">Rush</span>}
                      </span>
                      <span className="tabular-nums text-ink-2">
                        {s.queue} in line · {s.etaMin} min
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${(s.servedToday / peak) * 100}%`, background: s.color }} />
                    </div>
                  </button>
                </li>
              ))}
          </ul>
        )}
        {tab === 'tables' && (
          <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {TABLES.map((t) => {
              const st = snap.tableStatus[t.id] ?? 'free';
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    title={TABLE_LABEL[st]}
                    onClick={() => useUi.getState().select({ kind: 'table', id: t.id })}
                    className={cx('pressable flex h-12 w-full flex-col items-center justify-center rounded-[12px] text-xs font-semibold', TABLE_TONE[st])}
                  >
                    {t.label}
                    <span className="text-[10px] font-medium opacity-80">{TABLE_LABEL[st]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
