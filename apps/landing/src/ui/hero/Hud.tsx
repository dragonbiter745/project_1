import { useEffect, useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { useUi } from '../../store/ui';
import { DetailPanel } from './DetailPanel';
import { Kpis } from './Kpis';
import { LiveData } from './LiveData';
import { OrderPanel } from './OrderPanel';
import { TopBar } from './TopBar';

export function Hud() {
  const orderOpen = useUi((s) => s.orderOpen);
  const dataOpen = useUi((s) => s.dataOpen);
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <TopBar />
      <Kpis />
      <DetailPanel />
      {orderOpen && <OrderPanel />}
      {dataOpen && <LiveData />}
      <Hint />
    </div>
  );
}

function Hint() {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), 7000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      data-visible={shown}
      className="float-bar pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4"
    >
      <p className="glass-strong inline-flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium text-ink-2">
        <MousePointerClick className="h-4 w-4 text-accent-ink" strokeWidth={2} />
        Drag to look around, scroll or pinch to zoom, tap any shop, table or person.
      </p>
    </div>
  );
}
