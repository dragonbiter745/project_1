import { useEffect, useId, useState, type FormEvent } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { notify, notifyError } from '../../lib/toast';
import type { TableSession } from '../session/useTableSession';
import { useUi, type LoginMode } from '../ui/uiStore';
import {
  SignInCancelled,
  logInWithEmail,
  sendPasswordReset,
  signInErrorMessage,
  signInWithGoogle,
  signUpWithEmail,
  type SignInResult,
} from './account';
import { PerkList } from './perks';
import { TextField } from './TextField';
import { Button, Sheet } from '@foodcourt/ui';

type Mode = LoginMode | 'reset';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[6-9]\d{9}$/;

/** Google's mark, drawn to their brand guidelines (it cannot come from an icon set). */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

async function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { default: confetti } = await import('canvas-confetti');
  void confetti({ particleCount: 70, spread: 70, startVelocity: 32, origin: { y: 0.75 }, colors: ['#3A0F34', '#F9A602', '#DDE3E8', '#FFFFFF'], disableForReducedMotion: true });
}

/** What every successful sign-in does next: say hello, and ask for a missing name or number once. */
export function welcomeBack({ firstSignIn, merged, profile }: SignInResult, close: () => void) {
  close();
  void celebrate();
  const first = profile.name?.split(' ')[0];
  if (!profile.phone || !profile.name) {
    // Opening the details sheet in the same tick races the sign-in sheet's history entry.
    setTimeout(() => useUi.getState().showDetails('welcome'), 320);
    return;
  }
  notify(first ? `You're in, ${first}` : "You're in", {
    description: firstSignIn
      ? 'Coupons you get will show up in your account.'
      : merged > 0
        ? `${merged === 1 ? 'Your order from this phone is' : `${merged} orders from this phone are`} now in your account.`
        : 'Your orders and favourites are here.',
  });
}

const TITLES: Record<Mode, string> = {
  choose: 'Sign in to REVA',
  signup: 'Create your account',
  login: 'Welcome back',
  reset: 'Reset your password',
};

export function LoginSheet({ session }: { session: TableSession | null }) {
  const open = useUi((s) => s.open.login);
  const reason = useUi((s) => s.loginReason);
  const startMode = useUi((s) => s.loginMode);
  const required = useUi((s) => s.loginRequired);
  const hide = useUi((s) => s.hide);
  const [mode, setMode] = useState<Mode>(startMode);
  const [googlePending, setGooglePending] = useState(false);
  const close = () => hide('login');

  useEffect(() => {
    if (open) setMode(startMode);
  }, [open, startMode]);

  const google = async () => {
    if (googlePending) return;
    setGooglePending(true);
    try {
      welcomeBack(await signInWithGoogle(session?.id), close);
    } catch (err) {
      if (err instanceof SignInCancelled) return;
      console.error('Google sign-in failed', err);
      notifyError("Couldn't sign you in", { description: signInErrorMessage(err) });
    } finally {
      setGooglePending(false);
    }
  };

  const description =
    mode === 'choose'
      ? (reason ?? (required ? 'An account is needed to order online for pickup.' : 'Optional. Ordering as a guest still works.'))
      : mode === 'signup'
        ? 'Your name goes on your food token at the counter.'
        : mode === 'login'
          ? 'Log in with the email you signed up with.'
          : "We'll email you a link to choose a new password.";

  return (
    <Sheet
      open={open}
      onClose={close}
      title={TITLES[mode]}
      description={description}
      footer={
        mode === 'choose' ? (
          <ChooseFooter
            required={required}
            googlePending={googlePending}
            onGoogle={() => void google()}
            onEmail={() => setMode('signup')}
            onLogin={() => setMode('login')}
            onGuest={close}
          />
        ) : undefined
      }
    >
      {mode === 'choose' ? (
        <div className="rounded-card bg-bg p-4 ring-1 ring-inset ring-line">
          <p className="mb-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Why have an account</p>
          <PerkList />
        </div>
      ) : mode === 'reset' ? (
        <ResetForm onBack={() => setMode('login')} />
      ) : (
        <EmailForm
          key={mode}
          mode={mode}
          session={session}
          googlePending={googlePending}
          onGoogle={() => void google()}
          onSwitch={setMode}
          onDone={(r) => welcomeBack(r, close)}
        />
      )}
      {mode !== 'reset' && (
        <p className="mt-5 text-xs text-ink-3">
          We use your name, email and mobile number for your account and receipts, nothing else. You can delete your account any
          time from Privacy in your account.
        </p>
      )}
    </Sheet>
  );
}

interface ChooseFooterProps {
  required: boolean;
  googlePending: boolean;
  onGoogle: () => void;
  onEmail: () => void;
  onLogin: () => void;
  onGuest: () => void;
}

function ChooseFooter({ required, googlePending, onGoogle, onEmail, onLogin, onGuest }: ChooseFooterProps) {
  return (
    <div className="space-y-2 pb-1">
      <Button size="lg" variant="outline" block loading={googlePending} onClick={onGoogle} icon={<GoogleMark />}>
        Continue with Google
      </Button>
      <Button size="lg" block onClick={onEmail} icon={<Mail className="h-[18px] w-[18px]" strokeWidth={1.75} />}>
        Sign up with email
      </Button>
      <div className="flex items-center justify-center gap-1 text-sm text-ink-3">
        Already have an account?
        <TextLink onClick={onLogin}>Log in</TextLink>
      </div>
      {!required && (
        <Button variant="ghost" block onClick={onGuest}>
          Continue as guest
        </Button>
      )}
    </div>
  );
}

function TextLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable h-11 px-1 text-sm font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4"
    >
      {children}
    </button>
  );
}

interface EmailFormProps {
  mode: 'signup' | 'login';
  session: TableSession | null;
  googlePending: boolean;
  onGoogle: () => void;
  onSwitch: (mode: Mode) => void;
  onDone: (result: SignInResult) => void;
}

function EmailForm({ mode, session, googlePending, onGoogle, onSwitch, onDone }: EmailFormProps) {
  const signup = mode === 'signup';
  const formId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const field = (key: string, set: (v: string) => void) => (v: string) => {
    set(v);
    if (errors[key]) setErrors(({ [key]: _cleared, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const next: Record<string, string> = {};
    if (signup && name.trim().length < 2) next.name = 'Enter your name, at least 2 letters.';
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (signup && !PHONE.test(phone)) next.phone = 'Enter a 10-digit mobile number.';
    if (signup ? password.length < 8 : password.length === 0) next.password = signup ? 'Use at least 8 characters.' : 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setPending(true);
    try {
      const result = signup
        ? await signUpWithEmail({ name, email, phone, password }, session?.id)
        : await logInWithEmail(email, password, session?.id);
      onDone(result);
    } catch (err) {
      console.error(signup ? 'Email sign-up failed' : 'Email log-in failed', err);
      const code = (err as { code?: string }).code ?? '';
      const message = signInErrorMessage(err);
      if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use' || code === 'auth/invalid-email') setErrors({ email: message });
      else if (code === 'auth/weak-password') setErrors({ password: message });
      else notifyError(signup ? "Couldn't create your account" : "Couldn't log you in", { description: message });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="step-forward">
      <Button size="lg" variant="outline" block loading={googlePending} onClick={onGoogle} icon={<GoogleMark />}>
        Continue with Google
      </Button>
      <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.1em] text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or with email
        <span className="h-px flex-1 bg-line" />
      </div>
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        {signup && (
          <TextField
            label="Full name"
            value={name}
            onChange={field('name', setName)}
            error={errors.name}
            autoComplete="name"
            maxLength={40}
            placeholder="Ananya Rao"
          />
        )}
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={field('email', setEmail)}
          error={errors.email}
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
        />
        {signup && (
          <TextField
            label="Mobile number"
            type="tel"
            prefix="+91"
            value={phone}
            onChange={field('phone', (v) => setPhone(v.replace(/\D/g, '').slice(0, 10)))}
            error={errors.phone}
            help="For payment receipts. We don't call or text you."
            autoComplete="tel-national"
            inputMode="numeric"
            placeholder="98765 43210"
          />
        )}
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={field('password', setPassword)}
          error={errors.password}
          help={signup ? 'At least 8 characters.' : undefined}
          autoComplete={signup ? 'new-password' : 'current-password'}
        />
        {!signup && (
          <div className="-mt-2">
            <TextLink onClick={() => onSwitch('reset')}>Forgot password?</TextLink>
          </div>
        )}
        <Button type="submit" size="lg" block loading={pending}>
          {signup ? 'Create account' : 'Log in'}
        </Button>
      </form>
      <div className="mt-2 flex items-center justify-center gap-1 text-sm text-ink-3">
        {signup ? 'Already have an account?' : 'New to REVA?'}
        <TextLink onClick={() => onSwitch(signup ? 'login' : 'signup')}>{signup ? 'Log in' : 'Create an account'}</TextLink>
      </div>
      <BackLink onClick={() => onSwitch('choose')}>All sign-in options</BackLink>
    </div>
  );
}

function BackLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="pressable mx-auto flex h-11 items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
      <ArrowLeft className="h-4 w-4" strokeWidth={2} />
      {children}
    </button>
  );
}

function ResetForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setPending(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      notifyError("Couldn't send the email", { description: signInErrorMessage(err) });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="step-forward">
      {sent ? (
        <div role="status" className="rounded-card bg-ready-tint p-4 text-sm text-ink-2 ring-1 ring-inset ring-ready/25">
          <span className="block font-semibold text-ink">Check your inbox</span>
          If {email.trim()} has a REVA account, a reset link is on its way. It can take a minute.
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(v) => {
              setEmail(v);
              if (error) setError('');
            }}
            error={error}
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
          />
          <Button type="submit" size="lg" block loading={pending}>
            Send reset link
          </Button>
        </form>
      )}
      <div className="mt-2">
        <BackLink onClick={onBack}>Back to log in</BackLink>
      </div>
    </div>
  );
}
