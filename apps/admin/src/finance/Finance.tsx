import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { RangePicker, ShopFinance, presetRange, rangeLabel, type Range } from '@foodcourt/finance-ui';
import type { ShopFinance as ShopFigures } from '@foodcourt/shared';
import { BalanceCard, MoneyBackdrop } from './CashHero';

/** The shop's money: what it is owed up top (with the rupees floating behind it), then the full report. */
export default function Finance({ vendorId }: { vendorId: string }) {
  const [range, setRange] = useState<Range>(() => presetRange('today'));
  const [shop, setShop] = useState<ShopFigures | null>(null);

  return (
    <>
      <MoneyBackdrop />
      <div className="relative z-10 space-y-6">
        <BalanceCard balancePaise={shop?.balanceDuePaise ?? null} />
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-sheet bg-surface/90 p-4 shadow-card ring-1 ring-inset ring-line/70 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Money</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-3">
            <CalendarDays className="h-4 w-4" /> {rangeLabel(range)}
          </p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>
        <ShopFinance vendorId={vendorId} range={range} onLoaded={setShop} />
      </div>
    </>
  );
}
