import { useId, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { Button } from './Button';

interface StaffLoginProps {
  title: string;
  subtitle: string;
  onSubmit: (email: string, password: string) => Promise<void>;
}

const field =
  'h-12 w-full rounded-field bg-surface-2 px-3.5 text-base text-ink outline-none ring-1 ring-inset ring-transparent transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50';

/** Email + password sign-in for kitchen and court staff. Errors come back from onSubmit as thrown messages. */
export function StaffLogin({ title, subtitle, onSubmit }: StaffLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = { email: useId(), password: useId(), error: useId() };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError((err as Error).message || 'Sign-in failed. Try again.');
      setBusy(false);
    }
  };

  return (
    <main className="grain ambient grid min-h-[100dvh] place-items-center px-6 py-12">
      <form onSubmit={submit} noValidate className="enter-up w-full max-w-sm rounded-[28px] bg-surface p-7 shadow-float ring-1 ring-inset ring-line/70">
        <BrandMark size="lg" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={ids.email} className="block text-sm font-medium text-ink">
              Email
            </label>
            <input id={ids.email} type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.password} className="block text-sm font-medium text-ink">
              Password
            </label>
            <div className="relative">
              <input
                id={ids.password}
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? ids.error : undefined}
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
          </div>
          {error && (
            <p id={ids.error} role="alert" className="rounded-[12px] bg-danger-tint px-3.5 py-2.5 text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" variant="accent" size="lg" block loading={busy} className="mt-6" icon={<Lock className="h-4 w-4" strokeWidth={2} />}>
          Sign in
        </Button>
        <p className="mt-4 text-center text-xs text-ink-3">Forgot your password? Ask the court manager to reset it.</p>
      </form>
    </main>
  );
}
