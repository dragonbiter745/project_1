import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Mail, Plus, Power, RefreshCw, Store, Trash2, UserPlus } from 'lucide-react';
import { VENDOR_LOGIN_LABEL, VENDOR_LOGIN_ROLES, type Vendor, type VendorLoginRole, type VendorLoginRow } from '@foodcourt/shared';
import { createShop, deleteShop, inviteVendorLogin, listVendorLogins, removeVendorLogin, resendVendorLogin, setVendorLoginEnabled } from '@foodcourt/firebase-client/vendor-access';
import { Button, Monogram, Sheet, cx } from '@foodcourt/ui';
import { jsonEqual, useLocal } from '../../lib/store';

const ROLE_HELP: Record<VendorLoginRole, string> = {
  vendorStaff: 'Kitchen display only: sees and updates orders.',
  vendorAdmin: 'Kitchen display with the owner’s controls.',
  vendorFinance: 'Shop admin site: menu, sales and payouts.',
};

const inputClass =
  'h-11 w-full rounded-field bg-surface px-3.5 text-sm text-ink ring-1 ring-inset ring-line-strong outline-none transition-shadow placeholder:text-ink-3 focus:ring-2 focus:ring-accent/60 disabled:bg-surface-2 disabled:text-ink-3';

const ago = (ms: number) => {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(ms);
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 3);

export function Vendors() {
  const vendors = useLocal((s) => s.vendors, jsonEqual);
  const [logins, setLogins] = useState<VendorLoginRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [invite, setInvite] = useState<{ vendorId?: string; shopName?: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [removingShop, setRemovingShop] = useState<Vendor | null>(null);
  const [removingLogin, setRemovingLogin] = useState<VendorLoginRow | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 7000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLogins((await listVendorLogins()).logins);
      setLoadError('');
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [refresh]);

  const byShop = useMemo(() => {
    const map = new Map<string, VendorLoginRow[]>();
    for (const l of logins ?? []) map.set(l.vendorId, [...(map.get(l.vendorId) ?? []), l]);
    return map;
  }, [logins]);

  const live = vendors.filter((v) => v.status === 'active');
  const needsLogin = logins ? live.filter((v) => !(byShop.get(v.id) ?? []).some((l) => !l.placeholder && l.status !== 'disabled')) : [];
  const activeLogins = (logins ?? []).filter((l) => l.status === 'active' && !l.placeholder).length;
  const pending = (logins ?? []).filter((l) => l.status === 'invited').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-3">Add a shop, then email its owner a link. They choose their own password. You never see or type it.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAdding(true)} icon={<Store className="h-4 w-4" />}>
            Add shop
          </Button>
          <Button variant="accent" onClick={() => setInvite({})} icon={<UserPlus className="h-4 w-4" />}>
            Invite a login
          </Button>
        </div>
      </div>

      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-card bg-ready-tint px-4 py-3 text-sm font-medium text-ready ring-1 ring-inset ring-ready/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
        </p>
      )}
      {loadError && (
        <p role="alert" className="flex items-center justify-between gap-3 rounded-card bg-danger-tint px-4 py-3 text-sm font-medium text-danger ring-1 ring-inset ring-danger/20">
          <span>Could not load the logins. {loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            Retry
          </Button>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Shops" value={String(live.length)} />
        <Tile label="Logins in use" value={logins ? String(activeLogins) : '–'} />
        <Tile label="Waiting for a password" value={logins ? String(pending) : '–'} warn={pending > 0} />
        <Tile label="Shops with no login" value={logins ? String(needsLogin.length) : '–'} warn={needsLogin.length > 0} />
      </dl>

      {needsLogin.length > 0 && (
        <section aria-label="Needs attention" className="rounded-sheet bg-prep-tint p-4 ring-1 ring-inset ring-prep/20">
          <p className="flex items-center gap-2 text-sm font-semibold text-prep">
            <AlertTriangle className="h-4 w-4" />
            These shops have no working login with a real email yet
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {needsLogin.map((v) => (
              <Button key={v.id} size="sm" variant="outline" onClick={() => setInvite({ vendorId: v.id, shopName: v.name })} icon={<Mail className="h-4 w-4" />}>
                {v.name}
              </Button>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {vendors.map((v) => (
          <ShopAccess
            key={v.id}
            vendor={v}
            logins={byShop.get(v.id) ?? []}
            loaded={logins !== null}
            onInvite={() => setInvite({ vendorId: v.id, shopName: v.name })}
            onRemoveShop={() => setRemovingShop(v)}
            onRemoveLogin={setRemovingLogin}
            onChanged={refresh}
            say={say}
          />
        ))}
      </div>
      {vendors.length === 0 && <p className="rounded-sheet bg-surface p-8 text-center text-sm text-ink-3 ring-1 ring-inset ring-line/70">No shops yet. Add the first one.</p>}

      <InviteSheet
        open={invite !== null}
        initial={invite ?? {}}
        vendors={live}
        onClose={() => setInvite(null)}
        onSent={(email) => {
          setInvite(null);
          say(`Email sent to ${email}. The link works once and lasts 72 hours.`);
          void refresh();
        }}
      />
      <AddShopSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(vendorId, name) => {
          setAdding(false);
          say(`${name} added. It stays paused until its menu is ready. Now invite its owner.`);
          // Sheets close through the browser's back stack; opening the next one in the same instant would
          // make that back step land on the page behind them. Wait for the first to finish closing.
          setTimeout(() => setInvite({ vendorId, shopName: name }), 400);
        }}
      />
      <RemoveShopSheet
        vendor={removingShop}
        logins={removingShop ? (byShop.get(removingShop.id) ?? []).length : 0}
        onClose={() => setRemovingShop(null)}
        onDone={(msg) => {
          setRemovingShop(null);
          say(msg);
          void refresh();
        }}
      />
      <RemoveLoginSheet
        login={removingLogin}
        onClose={() => setRemovingLogin(null)}
        onDone={(email) => {
          setRemovingLogin(null);
          say(`Removed the login for ${email}.`);
          void refresh();
        }}
      />
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-card bg-surface px-5 py-4 shadow-card ring-1 ring-inset ring-line/70">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className={cx('mt-1 text-3xl font-semibold tabular-nums tracking-tight', warn ? 'text-prep' : 'text-ink')}>{value}</dd>
    </div>
  );
}

function ShopAccess(props: {
  vendor: Vendor;
  logins: VendorLoginRow[];
  loaded: boolean;
  onInvite: () => void;
  onRemoveShop: () => void;
  onRemoveLogin: (l: VendorLoginRow) => void;
  onChanged: () => Promise<void>;
  say: (t: string) => void;
}) {
  const { vendor, logins, loaded } = props;
  const off = vendor.status !== 'active';
  return (
    <article className={cx('overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70', off && 'opacity-70')}>
      <header className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Monogram code={vendor.code} size="md" tone="solid" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-bold text-ink">{vendor.name}</h2>
            <p className="text-xs text-ink-3">{off ? 'Switched off' : `Tokens ${vendor.code}-001 onward`}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {!off && (
            <Button size="sm" variant="tint" onClick={props.onInvite} icon={<Mail className="h-4 w-4" />}>
              Invite
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={props.onRemoveShop} aria-label={`Remove ${vendor.name}`} icon={<Trash2 className="h-4 w-4" />} />
        </div>
      </header>
      <ul className="divide-y divide-line/70">
        {!loaded && <li className="px-5 py-4 text-sm text-ink-3">Loading logins…</li>}
        {loaded && logins.length === 0 && <li className="px-5 py-4 text-sm text-ink-3">No logins yet. Use Invite to email the owner.</li>}
        {logins.map((l) => (
          <LoginRow key={l.uid} login={l} onRemove={() => props.onRemoveLogin(l)} onChanged={props.onChanged} say={props.say} onInviteReal={props.onInvite} />
        ))}
      </ul>
    </article>
  );
}

const STATUS: Record<VendorLoginRow['status'], { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'bg-ready-tint text-ready' },
  invited: { label: 'Invite sent', tone: 'bg-prep-tint text-prep' },
  disabled: { label: 'Switched off', tone: 'bg-surface-2 text-ink-3' },
};

function LoginRow({ login, onRemove, onChanged, say, onInviteReal }: { login: VendorLoginRow; onRemove: () => void; onChanged: () => Promise<void>; say: (t: string) => void; onInviteReal: () => void }) {
  const [busy, setBusy] = useState<'send' | 'toggle' | null>(null);
  const [error, setError] = useState('');
  const status = STATUS[login.status];
  const meta = login.placeholder
    ? 'Stand-in address, not a real inbox'
    : login.status === 'invited'
      ? login.lastSentAt
        ? `Link sent ${ago(login.lastSentAt)}, not used yet`
        : 'Email not sent yet'
      : login.lastSignInAt
        ? `Last signed in ${ago(login.lastSignInAt)}`
        : 'Has not signed in yet';

  const act = async (kind: 'send' | 'toggle', fn: () => Promise<unknown>, done: string) => {
    setBusy(kind);
    setError('');
    try {
      await fn();
      say(done);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{login.email}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
            <span>{VENDOR_LOGIN_LABEL[login.role]}</span>
            <span aria-hidden>·</span>
            <span>{meta}</span>
          </p>
        </div>
        <span className={cx('inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold', status.tone)}>{status.label}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {login.placeholder ? (
          <Button size="sm" variant="tint" onClick={onInviteReal} icon={<Mail className="h-4 w-4" />}>
            Invite real email
          </Button>
        ) : (
          login.status !== 'disabled' && (
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'send'}
              onClick={() => void act('send', () => resendVendorLogin(login.uid), login.status === 'invited' ? `Invite sent again to ${login.email}.` : `Reset link sent to ${login.email}.`)}
              icon={login.status === 'invited' ? <RefreshCw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            >
              {login.status === 'invited' ? 'Resend invite' : 'Send reset link'}
            </Button>
          )
        )}
        <Button
          size="sm"
          variant="ghost"
          loading={busy === 'toggle'}
          onClick={() => void act('toggle', () => setVendorLoginEnabled(login.uid, login.status === 'disabled'), login.status === 'disabled' ? `${login.email} can sign in again.` : `${login.email} is switched off and signed out.`)}
          icon={<Power className="h-4 w-4" />}
        >
          {login.status === 'disabled' ? 'Switch on' : 'Switch off'}
        </Button>
        <Button size="sm" variant="danger" onClick={onRemove} icon={<Trash2 className="h-4 w-4" />}>
          Remove
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-field bg-danger-tint px-3 py-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

const ErrorLine = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="rounded-field bg-danger-tint px-3.5 py-2.5 text-sm font-medium text-danger">
      {text}
    </p>
  ) : null;

function InviteSheet({ open, initial, vendors, onClose, onSent }: { open: boolean; initial: { vendorId?: string; shopName?: string }; vendors: Vendor[]; onClose: () => void; onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [role, setRole] = useState<VendorLoginRole>('vendorAdmin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setError('');
    setRole('vendorAdmin');
    setVendorId(initial.vendorId ?? '');
  }, [open, initial.vendorId]);

  // A shop added a moment ago may not have reached the live list yet.
  const options = initial.vendorId && initial.shopName && !vendors.some((v) => v.id === initial.vendorId) ? [...vendors, { id: initial.vendorId, name: initial.shopName } as Vendor] : vendors;
  const ready = /^\S+@\S+\.\S+$/.test(email.trim()) && vendorId !== '';

  const send = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await inviteVendorLogin(email.trim(), vendorId, role);
      onSent(email.trim().toLowerCase());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite a login"
      description="They get one short email with a button to choose their own password."
      footer={
        <Button variant="accent" size="lg" block loading={busy} disabled={!ready} onClick={() => void send()} icon={<Mail className="h-4 w-4" />}>
          Send invite
        </Button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Field label="Their email" hint="Their own inbox. The invite goes only here.">
          <input type="email" inputMode="email" autoComplete="off" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="owner@theirshop.com" />
        </Field>
        <Field label="Shop">
          <select aria-label="Shop" value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputClass}>
            <option value="">Choose a shop</option>
            {options.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend className="text-sm font-medium text-ink">What they can open</legend>
          <div className="mt-1.5 space-y-2">
            {VENDOR_LOGIN_ROLES.map((r) => (
              <label key={r} className={cx('flex cursor-pointer items-start gap-3 rounded-field px-3.5 py-3 ring-1 ring-inset transition-colors', role === r ? 'bg-accent-tint ring-accent-line' : 'bg-surface ring-line-strong')}>
                <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="mt-1 accent-[rgb(var(--accent-ink))]" />
                <span>
                  <span className="block text-sm font-semibold text-ink">{VENDOR_LOGIN_LABEL[r]}</span>
                  <span className="block text-xs text-ink-3">{ROLE_HELP[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <ErrorLine text={error} />
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function AddShopSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (vendorId: string, name: string) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [openAt, setOpenAt] = useState('09:00');
  const [closeAt, setCloseAt] = useState('21:00');
  const [prep, setPrep] = useState('10');
  const [fee, setFee] = useState('3');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef('');

  useEffect(() => {
    if (!open) return;
    key.current = crypto.randomUUID();
    setName('');
    setCode('');
    setCodeTouched(false);
    setOpenAt('09:00');
    setCloseAt('21:00');
    setPrep('10');
    setFee('3');
    setError('');
  }, [open]);

  const ready = name.trim().length >= 2 && /^[A-Za-z]{2,4}$/.test(code);

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await createShop({ requestKey: key.current, name: name.trim(), code: code.toUpperCase(), open: openAt, close: closeAt, defaultPrepMin: Number(prep) || 10, feePct: Number(fee) || 0 });
      onCreated(res.vendorId, name.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a shop"
      description="It starts paused with an empty menu, so diners cannot order until the owner is ready."
      footer={
        <Button variant="accent" size="lg" block loading={busy} disabled={!ready} onClick={() => void save()} icon={<Plus className="h-4 w-4" />}>
          Add shop
        </Button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Shop name">
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              if (!codeTouched) setCode(initials(e.target.value));
            }}
            className={inputClass}
            placeholder="Dosa Corner"
          />
        </Field>
        <Field label="Token code" hint="2 to 4 letters. Diners see tokens like DC-001.">
          <input
            value={code}
            maxLength={4}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase());
            }}
            className={cx(inputClass, 'font-mono uppercase tracking-wide')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens">
            <input type="time" value={openAt} onChange={(e) => setOpenAt(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Closes">
            <input type="time" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Usual prep (min)">
            <input inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, ''))} className={inputClass} />
          </Field>
          <Field label="Commission %" hint="Qrave’s cut of each order.">
            <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ''))} className={inputClass} />
          </Field>
        </div>
        <ErrorLine text={error} />
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function RemoveShopSheet({ vendor, logins, onClose, onDone }: { vendor: Vendor | null; logins: number; onClose: () => void; onDone: (msg: string) => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const last = useRef<Vendor | null>(null);
  if (vendor) last.current = vendor;
  const shown = vendor ?? last.current;

  useEffect(() => {
    setTyped('');
    setError('');
  }, [vendor?.id]);

  const confirm = async () => {
    if (!vendor || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await deleteShop(vendor.id, typed);
      onDone(res.archived ? `${vendor.name} is switched off and hidden from diners. Its past orders and money are kept.` : `${vendor.name} was removed.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={vendor !== null}
      onClose={onClose}
      title={`Remove ${shown?.name ?? 'shop'}?`}
      description="This switches the shop off for diners and removes every login for it."
      footer={
        <Button variant="accent" size="lg" block loading={busy} disabled={typed === '' || typed.trim().toLowerCase() !== (shown?.name ?? '').trim().toLowerCase()} onClick={() => void confirm()} icon={<Trash2 className="h-4 w-4" />}>
          Remove shop
        </Button>
      }
    >
      <div className="space-y-4">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>{logins === 0 ? 'It has no logins.' : `${logins} login${logins === 1 ? '' : 's'} will be deleted and signed out.`}</li>
          <li>A shop with no orders yet is deleted completely.</li>
          <li>A shop that has taken orders is switched off and hidden instead, so past orders, payouts and reports still add up.</li>
        </ul>
        <Field label={`Type “${shown?.name ?? ''}” to confirm`}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputClass} autoComplete="off" />
        </Field>
        <ErrorLine text={error} />
      </div>
    </Sheet>
  );
}

function RemoveLoginSheet({ login, onClose, onDone }: { login: VendorLoginRow | null; onClose: () => void; onDone: (email: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const last = useRef<VendorLoginRow | null>(null);
  if (login) last.current = login;
  const shown = login ?? last.current;

  useEffect(() => setError(''), [login?.uid]);

  const confirm = async () => {
    if (!login || busy) return;
    setBusy(true);
    setError('');
    try {
      await removeVendorLogin(login.uid);
      onDone(login.email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={login !== null}
      onClose={onClose}
      title="Remove this login?"
      description={shown ? `${shown.email} will be signed out and can no longer open ${VENDOR_LOGIN_LABEL[shown.role].toLowerCase()}.` : undefined}
      footer={
        <Button variant="accent" size="lg" block loading={busy} onClick={() => void confirm()} icon={<Trash2 className="h-4 w-4" />}>
          Remove login
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-2">The shop and its orders are not affected. You can invite the same email again later.</p>
        <ErrorLine text={error} />
      </div>
    </Sheet>
  );
}
