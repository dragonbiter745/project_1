import { useEffect, useId, useState, type FormEvent } from 'react';
import { cx } from '../../lib/format';
import { notify } from '../../lib/toast';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { useProfile } from './profileStore';
import { Button, Sheet } from '@foodcourt/ui';

type Step = 'phone' | 'details';

const fieldClass =
  'h-12 w-full rounded-field bg-surface-2 px-3.5 text-md text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50';

// Two steps today; phone OTP (PRD FR-C8, milestone M5) slots in between them.
export function LoginSheet(_props: { session: TableSession }) {
  const open = useUi((s) => s.open.login);
  const hide = useUi((s) => s.hide);
  const signIn = useProfile((s) => s.signIn);
  const [step, setStep] = useState<Step>('phone');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const ids = {
    phoneForm: useId(),
    detailsForm: useId(),
    phone: useId(),
    phoneHelp: useId(),
    phoneError: useId(),
    name: useId(),
    nameHelp: useId(),
    student: useId(),
  };

  useEffect(() => {
    if (!open) return;
    setStep('phone');
    setError('');
  }, [open]);

  const close = () => hide('login');

  const goTo = (next: Step) => {
    setDirection(next === 'details' ? 'forward' : 'back');
    setStep(next);
  };

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    if (phone.length !== 10) {
      setError('Enter a 10-digit mobile number.');
      return;
    }
    goTo('details');
  };

  const submitDetails = (e: FormEvent) => {
    e.preventDefault();
    const displayName = name.trim() || `Diner ${phone.slice(-4)}`;
    signIn({ name: displayName, phone, studentId: studentId.trim() || undefined });
    close();
    notify(`Welcome, ${displayName}`, { description: 'Points are added when you collect your food.' });
  };

  const isPhone = step === 'phone';

  return (
    <Sheet
      open={open}
      onClose={close}
      title={isPhone ? 'Sign in' : 'Almost done'}
      description={
        isPhone ? 'Optional. Keep your order history and earn REVA points.' : 'Tell the counter who to call out.'
      }
      footer={
        <div className="space-y-1">
          <Button type="submit" form={isPhone ? ids.phoneForm : ids.detailsForm} size="lg" block>
            {isPhone ? 'Continue' : 'Sign in'}
          </Button>
          {isPhone ? (
            <Button variant="ghost" block onClick={close}>
              Continue as guest
            </Button>
          ) : (
            <Button variant="ghost" block onClick={() => goTo('phone')}>
              Back
            </Button>
          )}
        </div>
      }
    >
      <div key={step} className={direction === 'forward' ? 'step-forward' : 'step-back'}>
        {isPhone ? (
          <form id={ids.phoneForm} onSubmit={submitPhone} noValidate className="space-y-2">
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
                aria-describedby={error ? ids.phoneError : ids.phoneHelp}
                placeholder="98765 43210"
                className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-md tabular-nums tracking-wide text-ink outline-none placeholder:text-ink-3"
              />
            </div>
            {error ? (
              <p id={ids.phoneError} role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : (
              <p id={ids.phoneHelp} className="text-sm text-ink-3">
                We only use your number for your orders and REVA points.
              </p>
            )}
          </form>
        ) : (
          <form id={ids.detailsForm} onSubmit={submitDetails} noValidate className="space-y-5">
            <div className="space-y-2">
              <label htmlFor={ids.name} className="block text-sm font-medium text-ink">
                Your name
              </label>
              <input
                id={ids.name}
                type="text"
                autoComplete="given-name"
                autoFocus
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
        )}
      </div>
    </Sheet>
  );
}
