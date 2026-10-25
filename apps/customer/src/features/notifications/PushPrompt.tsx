import { useState } from 'react';
import { BellRing, Share, X } from 'lucide-react';
import { Button } from '@foodcourt/ui';
import { cx } from '../../lib/format';
import { notify, notifyError } from '../../lib/toast';
import { enablePush, usePushState } from './push';

const HIDE_KEY = 'fc_push_prompt_hidden';

function hiddenThisVisit(): boolean {
  try {
    return sessionStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Shown once food is ordered: the moment diners most want to know when it is ready. */
export function PushPrompt({ className }: { className?: string }) {
  const state = usePushState();
  const [hidden, setHidden] = useState(hiddenThisVisit);
  const [pending, setPending] = useState(false);
  if (hidden || (state !== 'off' && state !== 'install')) return null;

  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, '1');
    } catch {
      // ignore
    }
  };

  const turnOn = async () => {
    setPending(true);
    try {
      const next = await enablePush();
      if (next === 'on') notify("You'll get a buzz when it's ready", { description: 'Even if you lock your phone or switch apps.' });
      else if (next === 'blocked') notifyError('Notifications are blocked', { description: 'Allow them for this site in your browser settings.' });
    } catch (err) {
      console.error('Push setup failed', err);
      notifyError("Couldn't turn on notifications", { description: 'Your order screen still buzzes while it is open.' });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={cx('relative flex items-start gap-3 rounded-card bg-surface p-4 pr-11 ring-1 ring-inset ring-line', className)}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
        {state === 'install' ? <Share className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <BellRing className="h-[18px] w-[18px]" strokeWidth={1.75} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{state === 'install' ? 'Get alerts on iPhone' : 'Get a buzz when your food is ready'}</p>
        <p className="mt-0.5 text-sm text-ink-2">
          {state === 'install' ? 'Tap Share, then Add to Home Screen. Open Qrave from there to turn on alerts.' : 'Works even if you lock your phone or switch apps.'}
        </p>
        {state === 'off' && (
          <Button size="sm" variant="tint" className="mt-3" loading={pending} onClick={() => void turnOn()}>
            Turn on
          </Button>
        )}
      </div>
      <button type="button" onClick={hide} aria-label="Not now" className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full text-ink-3 hover:text-ink">
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
