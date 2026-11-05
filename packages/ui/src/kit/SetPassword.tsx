import { useEffect, useId, useState, type FormEvent } from 'react';
import { Check, Eye, EyeOff, KeyRound, Link2Off } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { Button } from './Button';

export interface SetPasswordInfo {
  email: string;
  shopName: string;
  roleLabel: string;
}

interface SetPasswordProps {
  /** Looks the emailed link up; rejects with a readable message when it is expired or used. */
  lookup: (token: string) => Promise<SetPasswordInfo>;
  /** Sets the password and signs the person in. */
  finish: (token: string, password: string) => Promise<void>;
  /** Called after success, once the person is signed in. */
  onDone: () => void;
}

const field =
  'h-12 w-full rounded-field bg-surface-2 px-3.5 text-base text-ink outline-none ring-1 ring-inset ring-transparent transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50';

const MIN = 10;
const checks = (p: string, email: string) => [
  { ok: p.length >= MIN, label: `At least ${MIN} characters` },
  { ok: /[A-Za-z]/.test(p) && /\d/.test(p), label: 'A letter and a number' },
  { ok: p.length > 0 && p.toLowerCase() !== email.toLowerCase(), label: 'Not your email' },
];

/** The page behind the emailed link: choose a password once, then go straight in. */
export function SetPassword({ lookup, finish, onDone }: SetPasswordProps) {
  const token = new URLSearchParams(window.location.search).get('t') ?? '';
  const [info, setInfo] = useState<SetPasswordInfo | null>(null);
  const [dead, setDead] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = { pw: useId(), again: useId(), error: useId() };

  useEffect(() => {
    if (!token) {
      setDead('This link is incomplete. Open it again from your email.');
      return;
    }
    lookup(token).then(setInfo, (e: Error) => setDead(e.message || 'This link has expired or was already used.'));
  }, [token, lookup]);

  const rules = checks(password, info?.email ?? '');
  const valid = rules.every((r) => r.ok) && password === again;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await finish(token, password);
      // The link is single use: take it out of the address bar and history before moving on.
      window.history.replaceState(null, '', '/');
      onDone();
    } catch (err) {
      setError((err as Error).message || 'Could not set the password. Try again.');
      setBusy(false);
    }
  };

  return (
    <main className="grain relative grid min-h-[100dvh] place-items-center overflow-hidden bg-surface-2 px-6 py-12">
      <div className="enter-up relative w-full max-w-sm rounded-[28px] bg-surface p-7 shadow-float ring-1 ring-inset ring-line/70">
        <BrandMark size="lg" />
        {dead ? (
          <div role="alert">
            <span className="mt-6 grid h-12 w-12 place-items-center rounded-full bg-danger-tint text-danger">
              <Link2Off className="h-5 w-5" />
            </span>
            <h1 className="mt-4 font-display text-[28px] font-bold leading-tight text-ink">This link no longer works</h1>
            <p className="mt-2 text-sm text-ink-3">{dead}</p>
          </div>
        ) : !info ? (
          <div className="mt-8 space-y-3" aria-busy="true">
            <div className="h-8 w-3/4 animate-pulse rounded-field bg-surface-2" />
            <div className="h-4 w-full animate-pulse rounded-field bg-surface-2" />
            <div className="h-12 w-full animate-pulse rounded-field bg-surface-2" />
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h1 className="mt-6 font-display text-[28px] font-bold leading-tight text-ink">Choose your password</h1>
            <p className="mt-1.5 text-sm text-ink-3">
              {info.shopName} · {info.roleLabel}
            </p>
            <p className="mt-4 rounded-field bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2">
              You will sign in with <strong className="font-semibold text-ink">{info.email}</strong>
            </p>
            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor={ids.pw} className="block text-sm font-medium text-ink">
                  New password
                </label>
                <div className="relative">
                  <input
                    id={ids.pw}
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${field} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <ul className="space-y-1 pt-1" aria-label="Password rules">
                  {rules.map((r) => (
                    <li key={r.label} className={`flex items-center gap-2 text-xs ${r.ok ? 'text-ready' : 'text-ink-3'}`}>
                      <Check className={`h-3.5 w-3.5 ${r.ok ? 'opacity-100' : 'opacity-30'}`} strokeWidth={2.5} aria-hidden />
                      {r.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={ids.again} className="block text-sm font-medium text-ink">
                  Type it again
                </label>
                <input
                  id={ids.again}
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={again}
                  onChange={(e) => setAgain(e.target.value)}
                  aria-invalid={again.length > 0 && again !== password}
                  aria-describedby={error ? ids.error : undefined}
                  className={field}
                />
                {again.length > 0 && again !== password && <p className="text-xs text-danger">The two passwords do not match.</p>}
              </div>
              {error && (
                <p id={ids.error} role="alert" className="rounded-[12px] bg-danger-tint px-3.5 py-2.5 text-sm font-medium text-danger">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" variant="accent" size="lg" block loading={busy} disabled={!valid} className="mt-6" icon={<KeyRound className="h-4 w-4" strokeWidth={2} />}>
              Save and sign in
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
