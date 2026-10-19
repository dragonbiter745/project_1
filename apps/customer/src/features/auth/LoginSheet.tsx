import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../lib/format';
import { localStore } from '../../lib/store';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { useProfile } from './profileStore';

const fieldClass =
  'h-12 w-full rounded-field bg-surface-2 px-3.5 text-md text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50';

export function LoginSheet({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.login);
  const hide = useUi((s) => s.hide);
  const signIn = useProfile((s) => s.signIn);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const ids = { form: useId(), phone: useId(), phoneError: useId(), name: useId(), nameHelp: useId(), student: useId() };

  const close = () => {
    hide('login');
    setError('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Enter a 10-digit mobile number.');
      return;
    }
    const displayName = name.trim() || `Diner ${digits.slice(-4)}`;
    signIn({ name: displayName, phone: digits, studentId: studentId.trim() || undefined });
    localStore.mutate((draft) => {
      const current = draft.sessions[session.id];
      if (current) current.displayName = displayName;
    });
    close();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Sign in"
      description="Optional. Keep your order history and earn REVA points."
      footer={
        <div className="space-y-1">
          <Button type="submit" form={ids.form} size="lg" block>
            Sign in
          </Button>
          <Button variant="ghost" block onClick={close}>
            Continue as guest
          </Button>
        </div>
      }
    >
      <form id={ids.form} onSubmit={submit} noValidate className="space-y-5">
        <div className="space-y-2">
          <label htmlFor={ids.phone} className="block text-sm font-medium text-ink">
            Mobile number
          </label>
          <div
            className={cx(
              'flex h-12 items-center rounded-field bg-surface-2 transition-[background-color,box-shadow] duration-150 focus-within:bg-surface focus-within:ring-2',
              error ? 'ring-2 ring-danger/60 focus-within:ring-danger/60' : 'focus-within:ring-accent/50'
            )}
          >
            <span className="pl-3.5 pr-2 text-md font-medium text-ink-3" aria-hidden>
              +91
            </span>
            <input
              id={ids.phone}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, ''));
                if (error) setError('');
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? ids.phoneError : undefined}
              placeholder="98765 43210"
              className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-md tabular-nums text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          {error && (
            <p id={ids.phoneError} role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor={ids.name} className="block text-sm font-medium text-ink">
            Your name
          </label>
          <input
            id={ids.name}
            type="text"
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={ids.nameHelp}
            placeholder="Ananya"
            className={fieldClass}
          />
          <p id={ids.nameHelp} className="text-sm text-ink-3">
            Shown on your food tokens at the counter.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor={ids.student} className="block text-sm font-medium text-ink">
            REVA student or staff ID <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input
            id={ids.student}
            type="text"
            autoCapitalize="characters"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.toUpperCase())}
            placeholder="R20EA123"
            className={cx(fieldClass, 'uppercase')}
          />
        </div>
      </form>
    </Sheet>
  );
}
