import { BellRing } from 'lucide-react';
import { Button } from '@foodcourt/ui';

export function StartOverlay({ shopName, onStart }: { shopName: string; onStart: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-title"
      className="fixed inset-0 z-spotlight grid place-items-center bg-bg/95 px-6 backdrop-blur-sm"
    >
      <div className="spotlight max-w-md text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent-tint text-accent ring-1 ring-inset ring-accent-line">
          <BellRing className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <h1 id="start-title" className="mt-6 text-2xl font-semibold tracking-tight text-ink">
          {shopName} kitchen
        </h1>
        <p className="mt-2 text-base text-ink-3">
          Tap to start. This turns on the new-order alarm and keeps the screen awake.
        </p>
        <Button variant="accent" size="lg" className="mt-8 min-w-[240px]" onClick={onStart} autoFocus>
          Start service
        </Button>
      </div>
    </div>
  );
}
