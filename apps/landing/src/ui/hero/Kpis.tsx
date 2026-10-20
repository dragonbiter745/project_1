import { ChefHat, Clock3, Users } from 'lucide-react';
import { useUi } from '../../store/ui';
import { waitLabel } from '../format';

export function Kpis() {
  const snap = useUi((s) => s.snapshot);
  if (!snap) return null;
  const tiles = [
    { icon: ChefHat, label: 'Orders this hour', value: String(snap.ordersThisHour), tone: 'text-accent-ink bg-accent-tint' },
    { icon: Clock3, label: 'Average wait', value: waitLabel(snap.avgWaitMin), tone: 'text-prep bg-prep-tint' },
    { icon: Users, label: 'Tables occupied', value: `${snap.tablesOccupied} / ${snap.tablesTotal}`, tone: 'text-ready bg-ready-tint' },
  ];
  return (
    <dl className="pointer-events-auto absolute left-3 top-[68px] hidden gap-2 md:left-4 md:top-[76px] md:grid md:grid-cols-3">
      {tiles.map(({ icon: Icon, label, value, tone }) => (
        <div key={label} className="glass min-w-[150px] rounded-[18px] px-3.5 py-3">
          <dt className="flex items-center gap-2 text-xs font-medium text-ink-3">
            <span className={`grid h-6 w-6 place-items-center rounded-[8px] ${tone}`}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            {label}
          </dt>
          <dd className="mt-1.5 text-[22px] font-semibold leading-none tabular-nums tracking-tight text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
