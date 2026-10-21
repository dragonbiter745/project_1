import { useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { Field, FormError, inputClass } from '@foodcourt/finance-ui';
import { shopAdmin } from '@foodcourt/firebase-client/shop-admin';
import { Button, Sheet } from '@foodcourt/ui';

const EMAIL_KEY = 'shop-admin.kitchen-email';
const remembered = () => {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Sets the password of the shop's order-screen (kitchen) login, so staff who left cannot use it. */
export function KitchenPasswordSheet({ open, onClose, seq }: { open: boolean; onClose: () => void; seq: number }) {
  return (
    <Sheet open={open} onClose={onClose} title="Kitchen password" description="For the order screen your staff sign in to">
      <PasswordForm key={seq} onDone={onClose} />
    </Sheet>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(remembered);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);

  const save = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter the email your kitchen signs in with.');
    if (password.length < 8) return setError('Use at least 8 characters.');
    setError('');
    setSaving(true);
    try {
      await shopAdmin({ action: 'SET_KITCHEN_PASSWORD', kitchenEmail: email.trim(), password });
      try {
        localStorage.setItem(EMAIL_KEY, email.trim());
      } catch {
        /* remembering the email is a convenience only */
      }
      setPassword('');
      setChanged(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (changed) {
    return (
      <div className="space-y-4 pb-2 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ready-tint text-ready">
          <Check className="h-7 w-7" strokeWidth={2.4} />
        </span>
        <p className="text-lg font-semibold text-ink">Password changed</p>
        <p className="text-sm text-ink-3">Tell your kitchen staff the new password. Phones already signed in stay signed in until they sign out.</p>
        <Button variant="accent" size="lg" block onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="Kitchen login email" hint="The email your staff use on the order screen. This is not your admin login.">
        {(id) => <input id={id} type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoCapitalize="none" placeholder="kitchen@yourshop.com" />}
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        {(id) => (
          <div className="relative">
            <input id={id} type={show ? 'text' : 'password'} className={`${inputClass} pr-12`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-ink-3">
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        )}
      </Field>
      <FormError text={error} />
      <Button type="submit" variant="accent" size="lg" block loading={saving}>
        Change password
      </Button>
    </form>
  );
}
