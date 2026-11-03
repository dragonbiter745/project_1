import { useId, useRef, useState } from 'react';
import { POLICY_VERSION } from '@foodcourt/shared';
import { cx } from '@foodcourt/ui';
import { LegalLink } from '../ui/LegalLinks';

/** What the server records when the box is ticked (accountAction SYNC). */
export const ACCEPT = { version: POLICY_VERSION, adult: true } as const;
export type Acceptance = typeof ACCEPT;

/**
 * Consent to make an account: never pre-ticked, given by a clear action (DPDP s.6), and confirming the
 * diner is 18 or older (s.9). `ensure()` is called by every sign-in button before anything happens.
 */
export function useConsent() {
  const [agreed, setAgreedState] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const setAgreed = (on: boolean) => {
    setAgreedState(on);
    if (on) setError(false);
  };
  const ensure = (): boolean => {
    if (agreed) return true;
    setError(true);
    ref.current?.focus();
    return false;
  };
  return { agreed, setAgreed, error, ref, ensure };
}

export type Consent = ReturnType<typeof useConsent>;

export function ConsentCheck({ consent, className }: { consent: Consent; className?: string }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <input
          ref={consent.ref}
          id={id}
          type="checkbox"
          checked={consent.agreed}
          onChange={(e) => consent.setAgreed(e.target.checked)}
          aria-invalid={consent.error || undefined}
          aria-describedby={consent.error ? errorId : undefined}
          className={cx('mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-[rgb(var(--ink))]', consent.error && 'outline outline-2 outline-offset-2 outline-danger')}
        />
        <label htmlFor={id} className="cursor-pointer text-sm text-ink-2">
          I'm 18 or older, and I agree to the <LegalLink page="terms" /> and <LegalLink page="privacy" />.
        </label>
      </div>
      {consent.error && (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-danger">
          Tick the box to continue. Under 18? You can still order as a guest at a table.
        </p>
      )}
    </div>
  );
}
