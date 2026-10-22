import { BellRing, MonitorSmartphone, Timer } from 'lucide-react';
import { BrandMark, Button } from '@foodcourt/ui';

const CHECKS = [
  { icon: BellRing, text: 'Rings for every new order until it is accepted' },
  { icon: MonitorSmartphone, text: 'Keeps this screen awake all service' },
  { icon: Timer, text: 'Flags tickets that wait longer than 2, 5 and 10 minutes' },
];

export function StartOverlay({ shopName, onStart }: { shopName: string; onStart: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-title"
      className="ambient fixed inset-0 z-spotlight grid place-items-center bg-bg/95 px-6 backdrop-blur-md"
    >
      <div className="spotlight w-full max-w-md rounded-[28px] bg-surface p-8 text-center shadow-float ring-1 ring-inset ring-line/70">
        <BrandMark size="lg" className="mx-auto" />
        <h1 id="start-title" className="mt-6 font-display text-[30px] font-bold leading-tight text-ink">
          {shopName} kitchen
        </h1>
        <p className="mt-2 text-base text-ink-3">One tap to start service.</p>
        <ul className="mt-6 space-y-3 text-left">
          {CHECKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 rounded-card bg-bg px-4 py-3 text-sm text-ink-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <Button variant="accent" size="lg" block className="mt-7" onClick={onStart} autoFocus>
          Start service
        </Button>
      </div>
    </div>
  );
}
