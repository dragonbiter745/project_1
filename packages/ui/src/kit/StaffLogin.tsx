import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { Button } from './Button';

interface StaffLoginProps {
  title: string;
  subtitle: string;
  onSubmit: (email: string, password: string) => Promise<void>;
  /** Decoration drawn with the page, e.g. an animated scene. */
  scene?: ReactNode;
  /** Small control in the card's top-right corner. */
  corner?: ReactNode;
  /** Fades the card out while the page hands over to the signed-in view. */
  exiting?: boolean;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const field =
  'h-12 w-full rounded-field bg-surface-2 px-3.5 text-base text-ink outline-none ring-1 ring-inset ring-transparent transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50';

/** Email + password sign-in for kitchen and court staff. Errors come back from onSubmit as thrown messages. */
export function StaffLogin({ title, subtitle, onSubmit, scene, corner, exiting = false }: StaffLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = { email: useId(), password: useId(), error: useId() };
  const formRef = useRef<HTMLFormElement>(null);

  // A short head-shake says "no" without moving the fields the user is about to retype.
  const shake = () => {
    if (reducedMotion()) return;
    formRef.current?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-9px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
      { duration: 380, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
    );
  };

  // The entrance animation holds its end frame, so the exit runs as its own animation on top.
  useEffect(() => {
    if (!exiting) return;
    formRef.current?.animate([{ opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(0.96)', filter: 'blur(2px)' }], {
      duration: reducedMotion() ? 0 : 420,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'forwards',
    });
  }, [exiting]);

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
      shake();
    }
  };

  return (
    <main className="grain relative grid min-h-[100dvh] place-items-center overflow-hidden bg-surface-2 px-6 py-12">
      {scene}
      <form
        ref={formRef}
        onSubmit={submit}
        noValidate
        data-login-card
        className={`enter-up relative w-full max-w-sm rounded-[28px] bg-surface p-7 shadow-float ring-1 ring-inset ring-line/70 ${exiting ? 'pointer-events-none' : ''}`}
      >
        {corner && <div className="absolute right-4 top-4">{corner}</div>}
        <BrandMark size="lg" />
        <h1 className="mt-6 font-display text-[30px] font-bold leading-tight text-ink">{title}</h1>
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
