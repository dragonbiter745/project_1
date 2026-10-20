import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/authStore';
import { cx } from '../../lib/format';
import { notify, notifyError } from '../../lib/toast';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { accountCall, rememberDetails, type AccountProfile } from './account';
import { useProfile } from './profileStore';
import { Button, Sheet } from '@foodcourt/ui';

const fieldClass =
  'h-12 w-full rounded-field bg-surface-2 px-3.5 text-md text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50';

/**
 * The name called out at the counter and the mobile number Cashfree needs for an online payment.
 * Guests keep these on this phone; signed-in diners save them to their account.
 */
export function DetailsSheet({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.details);
  const hide = useUi((s) => s.hide);
  const member = useAuth((s) => Boolean(s.user?.member));
  const saved = useProfile((s) => s.profile);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const ids = { form: useId(), phone: useId(), phoneHelp: useId(), phoneError: useId(), name: useId(), nameHelp: useId() };

  useEffect(() => {
    if (!open) return;
    setPhone(saved?.phone ?? '');
    setName(saved?.name && saved.name !== 'REVA diner' ? saved.name : '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => hide('details');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError('Enter a 10-digit mobile number.');
      return;
    }
    const displayName = name.trim().length >= 2 ? name.trim() : saved?.name || `Diner ${phone.slice(-4)}`;
    setPending(true);
    try {
      if (member) {
        const { profile } = await accountCall<{ profile: AccountProfile }>({ action: 'UPDATE_PROFILE', sessionId: session.id, phone, name: displayName });
        rememberDetails(profile);
      } else {
        useProfile.getState().signIn({ name: displayName, phone, studentId: saved?.studentId });
      }
      close();
      notify('Details saved', { description: 'Tap Pay to finish your order.' });
    } catch (err) {
      notifyError("Couldn't save your details", { description: (err as Error).message || 'Try again.' });
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Your details"
      description="For your payment receipt and the counter call-out."
      footer={
        <div className="space-y-1">
          <Button type="submit" form={ids.form} size="lg" block loading={pending}>
            Save and continue
          </Button>
          <Button variant="ghost" block onClick={close}>
            Cancel
          </Button>
        </div>
      }
    >
      <form id={ids.form} onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
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
              autoFocus
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
              The payment gateway sends your receipt to it. We don't call or text you.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor={ids.name} className="block text-sm font-medium text-ink">
            Your name <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input
            id={ids.name}
            type="text"
            autoComplete="given-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={ids.nameHelp}
            placeholder="Ananya"
            className={fieldClass}
          />
          <p id={ids.nameHelp} className="text-sm text-ink-3">
            Shown on your food tokens at the counter.
          </p>
        </div>
      </form>
    </Sheet>
  );
}
