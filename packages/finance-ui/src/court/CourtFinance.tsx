import { useState, type ComponentType } from 'react';
import { Landmark, LayoutDashboard, ReceiptText } from 'lucide-react';
import { cx } from '@foodcourt/ui';
import { RangePicker } from '../components/RangePicker';
import { presetRange, rangeLabel, type Range } from '../lib/range';
import { useReport } from '../lib/useReport';
import type { PageProps } from '../types';
import { Overview } from './Overview';
import { Payouts } from './Payouts';
import { Transactions } from './Transactions';

type Tab = 'overview' | 'transactions' | 'payouts';

const TABS: Array<{ key: Tab; label: string; icon: typeof LayoutDashboard; component: ComponentType<PageProps> }> = [
  { key: 'overview', label: 'Income and shops', icon: LayoutDashboard, component: Overview },
  { key: 'transactions', label: 'Transactions', icon: ReceiptText, component: Transactions },
  { key: 'payouts', label: 'Payouts', icon: Landmark, component: Payouts },
];

/** The court's own money: commission income, what every shop is owed, payouts and the payment ledger. */
export function CourtFinance() {
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>(() => presetRange('today'));
  const report = useReport(range);
  const Page = TABS.find((t) => t.key === tab)!.component;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3" data-print="hide">
        <div role="tablist" aria-label="Finance" className="no-scrollbar flex max-w-full gap-1 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cx(
                'pressable inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors duration-150',
                tab === key ? 'bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line' : 'text-ink-2 hover:bg-surface-2'
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>
      <p className="mt-3 text-sm text-ink-3">{rangeLabel(range)} · all shops</p>
      <div key={tab} className="enter-up mt-5">
        <Page range={range} report={report} />
      </div>
    </>
  );
}
