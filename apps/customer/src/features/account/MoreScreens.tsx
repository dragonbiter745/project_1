import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { BellRing, Download, Heart, ShieldCheck, TicketPercent, Trash2, Wallet } from 'lucide-react';
import { formatPaise, type MenuItem, type SubOrder } from '@foodcourt/shared';
import { Button, Sheet } from '@foodcourt/ui';
import { useAuth } from '../../lib/authStore';
import { cx } from '../../lib/format';
import { jsonEqual, useLocal } from '../../lib/store';
import { notify, notifyError } from '../../lib/toast';
import { accountCall, rememberDetails, signOutToGuest, type AccountProfile } from '../auth/account';
import { ItemRow } from '../menu/ItemRow';
import { useUi } from '../ui/uiStore';
import { useHub, useMyOrders, useMyProfile, useVendorNames } from './data';
import { Empty, Group, Pill, Switch, dayFormat, isPaid, shortOrderNo, timeFormat } from './hubParts';

const fieldClass =
  'h-12 w-full rounded-field bg-surface-2 px-3.5 text-md text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-accent/50 disabled:text-ink-3';

const live = () => import('@foodcourt/firebase-client/live');

function SignInFirst({ text }: { text: string }) {
  const showLogin = useUi((s) => s.showLogin);
  return (
    <Empty
      icon={ShieldCheck}
      title="Sign in to use this"
      text={text}
      action={
        <Button variant="accent" onClick={() => showLogin()}>
          Sign in with Google
        </Button>
      }
    />
  );
}

// ─── Favourites ──────────────────────────────────────────────────────────────

export function FavouritesScreen() {
  const { closeHub } = useHub();
  const member = useAuth((s) => Boolean(s.user?.member));
  const keys = useMyProfile()?.favourites;
  const menus = useLocal((s) => s.menus);
  const availability = useLocal((s) => s.availability);
  const vendors = useLocal((s) => s.vendors, jsonEqual);

  const groups = useMemo(() => {
    const byVendor = new Map<string, MenuItem[]>();
    for (const key of keys ?? []) {
      const [vendorId, itemId] = key.split(':') as [string, string];
      const item = menus[vendorId]?.categories.flatMap((c) => c.items).find((i) => i.id === itemId);
      if (!item) continue;
      byVendor.set(vendorId, [...(byVendor.get(vendorId) ?? []), item]);
    }
    return vendors.filter((v) => byVendor.has(v.id)).map((v) => ({ vendor: v, items: byVendor.get(v.id)! }));
  }, [keys, menus, vendors]);

  if (!member) return <SignInFirst text="Save the dishes you love and find them at every visit." />;
  if (groups.length === 0) {
    return (
      <Empty
        icon={Heart}
        title="No favourites yet"
        text="Tap the heart next to any dish to keep it here."
        action={
          <Button variant="outline" onClick={closeHub}>
            Browse the menu
          </Button>
        }
      />
    );
  }
  return (
    <>
      {groups.map(({ vendor, items }) => (
        <section key={vendor.id} className="mt-6 first:mt-0" aria-label={vendor.name}>
          <div className="flex items-baseline justify-between px-1 pb-2">
            <h3 className="text-base font-semibold text-ink">{vendor.name}</h3>
            {!vendor.acceptingOrders && <span className="text-sm text-ink-3">Not taking orders</span>}
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line/70">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} vendorId={vendor.id} soldOut={Boolean(availability[vendor.id]?.unavailable?.[item.id])} paused={!vendor.acceptingOrders} />
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-4 px-1 text-sm text-ink-3">Prices are today's menu prices.</p>
    </>
  );
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

export function CouponsScreen() {
  const { push } = useHub();
  const member = useAuth((s) => Boolean(s.user?.member));
  if (!member) return <SignInFirst text="Signed-in diners get coupons and offers as they launch." />;
  return (
    <Empty
      icon={TicketPercent}
      title="No coupons yet"
      text="Coupons you get will show up here. Turn on offers to hear about them first."
      action={
        <Button variant="outline" onClick={() => push({ name: 'notifications' })}>
          Notification settings
        </Button>
      }
    />
  );
}

// ─── Payments and refunds ────────────────────────────────────────────────────

const REFUND_LABEL: Record<string, { label: string; tone: 'ready' | 'prep' | 'danger' | 'muted' }> = {
  PENDING: { label: 'On its way', tone: 'prep' },
  PROCESSED: { label: 'Refunded', tone: 'ready' },
  FAILED: { label: 'Delayed', tone: 'danger' },
  NOT_REQUIRED: { label: 'Not charged', tone: 'muted' },
};

type RefundedTicket = SubOrder & { refund: NonNullable<SubOrder['refund']> };

export function PaymentsScreen() {
  const { push } = useHub();
  const uid = useAuth((s) => s.user?.uid);
  const orders = useMyOrders();
  const names = useVendorNames();
  const paidOnline = orders.filter((o) => isPaid(o) && o.payment.mode !== 'COUNTER');
  const refundedKey = orders
    .filter((o) => o.status === 'PARTIALLY_REFUNDED' || o.status === 'CANCELLED')
    .slice(0, 10)
    .map((o) => o.id)
    .join(',');
  const refunds = useLocal((s) => {
    const ids = new Set(refundedKey.split(','));
    return Object.values(s.subOrders).filter((t): t is RefundedTicket => Boolean(t.refund) && ids.has(t.orderId));
  }, jsonEqual);

  // Refund details live on each shop's ticket; load them for the most recent refunded orders.
  useEffect(() => {
    if (!uid || !refundedKey) return;
    void live()
      .then((l) => Promise.all(refundedKey.split(',').map((id) => l.fetchTickets(uid, id))))
      .catch(() => undefined);
  }, [uid, refundedKey]);

  return (
    <>
      <div className="flex gap-3 rounded-card bg-ready-tint p-4 ring-1 ring-inset ring-ready/20">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ready" strokeWidth={1.75} />
        <div className="text-sm text-ink-2">
          <p className="font-semibold text-ink">Your card and UPI details never reach REVA</p>
          <p className="mt-1">
            Payments run on Cashfree, an RBI-authorised payment gateway. Saved cards and UPI IDs stay with Cashfree and your UPI app, and you
            pick them in the payment window each time.
          </p>
        </div>
      </div>

      {refunds.length > 0 && (
        <>
          <Group title="Refunds" className="mt-6">
            {refunds.map((t) => {
              const label = REFUND_LABEL[t.refund.status] ?? REFUND_LABEL.PENDING!;
              return (
                <button key={t.id} type="button" onClick={() => push({ name: 'order', id: t.orderId })} className="hover-surface flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium tabular-nums text-ink">{formatPaise(t.refund.amountPaise)}</span>
                    <span className="block truncate text-sm text-ink-3">
                      {t.vendorName} · {shortOrderNo(t.orderId)}
                    </span>
                  </span>
                  <Pill tone={label.tone}>{label.label}</Pill>
                </button>
              );
            })}
          </Group>
          <p className="mt-2 px-1 text-sm text-ink-3">Banks usually take 5 to 7 working days to show a refund.</p>
        </>
      )}

      <Group title="Payments" className="mt-6">
        {paidOnline.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-3">Online payments you make show up here.</p>
        ) : (
          paidOnline.map((o) => (
            <button key={o.id} type="button" onClick={() => push({ name: 'order', id: o.id })} className="hover-surface flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
                <Wallet className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-ink">{[...new Set(o.items.map((i) => names[i.vendorId] ?? 'A shop'))].join(' · ')}</span>
                <span className="block text-sm text-ink-3">
                  {dayFormat.format(o.createdAt)}, {timeFormat.format(o.createdAt)}
                  {o.payment.method ? ` · ${o.payment.method}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-base font-semibold tabular-nums text-ink">{formatPaise(o.totals.totalPaise)}</span>
            </button>
          ))
        )}
      </Group>
    </>
  );
}

// ─── Points ──────────────────────────────────────────────────────────────────

export function PointsScreen() {
  const profile = useMyProfile();
  const perRupee = useLocal((s) => s.config.pointsPerRupee);
  const everyRupees = perRupee > 0 ? Math.round(1 / perRupee) : 10;
  return (
    <>
      <div className="rounded-card bg-accent-tint p-5 ring-1 ring-inset ring-accent-line">
        <p className="text-sm font-medium text-accent-ink">REVA points</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-ink">{profile?.pointsBalance ?? 0}</p>
        <p className="mt-1 text-sm text-ink-2">1 point for every ₹{everyRupees} you spend, added when you collect your food.</p>
      </div>
      <p className="mt-4 px-1 text-sm text-ink-3">Ways to use your points are coming. Your balance is kept safe until then.</p>
    </>
  );
}

// ─── Notifications ───────────────────────────────────────────────────────────

export function NotificationsScreen() {
  const member = useAuth((s) => Boolean(s.user?.member));
  const prefs = useMyProfile()?.prefs ?? {};
  const [saving, setSaving] = useState<string | null>(null);

  const set = async (key: 'orderUpdates' | 'offers', on: boolean) => {
    setSaving(key);
    try {
      await accountCall({ action: 'SET_PREFS', [key]: on });
    } catch (err) {
      notifyError("Couldn't save that", { description: (err as Error).message || 'Try again.' });
    } finally {
      setSaving(null);
    }
  };

  if (!member) return <SignInFirst text="Choose what we tell you about: your orders, and offers as they launch." />;
  return (
    <>
      <Group>
        <Switch
          label="Order updates"
          description="When a shop accepts your order and when it's ready."
          checked={prefs.orderUpdates !== false}
          disabled={saving === 'orderUpdates'}
          onChange={(on) => void set('orderUpdates', on)}
        />
        <Switch
          label="Offers and announcements"
          description="New coupons, offers and court news. Only a few a month."
          checked={prefs.offers === true}
          disabled={saving === 'offers'}
          onChange={(on) => void set('offers', on)}
        />
      </Group>
      <p className="mt-3 flex items-start gap-2 px-1 text-sm text-ink-3">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        You can change these any time. We never share your details with the shops or anyone else.
      </p>
    </>
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const { session, back } = useHub();
  const user = useAuth((s) => s.user);
  const profile = useMyProfile();
  const [name, setName] = useState(profile?.name ?? user?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [studentId, setStudentId] = useState(profile?.studentId ?? '');
  const [vegOnly, setVegOnly] = useState(profile?.prefs?.vegOnly === true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ids = { name: useId(), phone: useId(), student: useId() };

  if (!user?.member) return <SignInFirst text="Set the name on your food tokens, your mobile number and your preferences." />;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Enter at least 2 letters for your name.');
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return setError('Enter a 10-digit mobile number, or leave it empty.');
    setError(null);
    setPending(true);
    try {
      const { profile: saved } = await accountCall<{ profile: AccountProfile }>({ action: 'UPDATE_PROFILE', sessionId: session.id, name: name.trim(), phone, studentId: studentId.trim() });
      if (vegOnly !== (profile?.prefs?.vegOnly === true)) await accountCall({ action: 'SET_PREFS', vegOnly });
      rememberDetails(saved);
      notify('Profile saved');
      back();
    } catch (err) {
      setError((err as Error).message || "Couldn't save. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} noValidate className="space-y-5">
      <div className="space-y-2">
        <label htmlFor={ids.name} className="block text-sm font-medium text-ink">
          Name on your food tokens
        </label>
        <input id={ids.name} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="given-name" className={fieldClass} />
      </div>
      <div className="space-y-2">
        <label htmlFor={ids.phone} className="block text-sm font-medium text-ink">
          Mobile number
        </label>
        <div className="flex h-12 items-center rounded-field bg-surface-2 focus-within:bg-surface focus-within:ring-2 focus-within:ring-accent/50">
          <span className="pl-3.5 pr-2 text-md font-medium text-ink-3" aria-hidden>
            +91
          </span>
          <input
            id={ids.phone}
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            autoComplete="tel-national"
            placeholder="98765 43210"
            className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-md tabular-nums text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <p className="text-sm text-ink-3">For payment receipts. We don't call or text you.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={ids.student} className="block text-sm font-medium text-ink">
          REVA student or staff ID <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input id={ids.student} value={studentId} maxLength={20} onChange={(e) => setStudentId(e.target.value.toUpperCase())} placeholder="R20EA123" className={cx(fieldClass, 'uppercase')} />
      </div>
      <div className="space-y-2">
        <span className="block text-sm font-medium text-ink">Google account</span>
        <input value={user.email ?? ''} disabled className={fieldClass} aria-label="Google account email" />
      </div>
      <Group>
        <Switch label="Veg only menu" description="Open the menu with only vegetarian dishes showing." checked={vegOnly} onChange={setVegOnly} />
      </Group>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block loading={pending}>
        Save
      </Button>
    </form>
  );
}

// ─── Help ────────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: 'I paid but my order is not showing',
    a: 'Keep the tracking screen open for a minute while the payment is confirmed. If it fails, any amount taken is refunded automatically to the same account.',
  },
  {
    q: 'When will I get my refund?',
    a: 'If a shop can’t make your food, the refund starts straight away. Banks usually show it in 5 to 7 working days. You can follow it in Payments and refunds.',
  },
  {
    q: 'How do tokens work?',
    a: 'Each shop gives you its own token, like RM-042. When your food is ready the token turns green and your phone buzzes. Show the token at that shop’s counter.',
  },
  {
    q: 'Can I change or cancel an order?',
    a: 'Ask at the shop counter before they start cooking. If they reject it, you get a full refund for that shop’s part.',
  },
  {
    q: 'Something was wrong or missing',
    a: 'Open the order and tap “Get help with this” under that shop. The court manager sees it right away.',
  },
];

export function HelpScreen() {
  const { push } = useHub();
  return (
    <>
      <div className="divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line/70">
        {FAQ.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
              {f.q}
              <span aria-hidden className="text-lg text-ink-3 transition-transform duration-200 group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="px-4 pb-4 text-sm text-ink-2">{f.a}</p>
          </details>
        ))}
      </div>
      <div className="mt-6 rounded-card bg-surface p-4 ring-1 ring-inset ring-line/70">
        <p className="text-base font-semibold text-ink">Still stuck?</p>
        <p className="mt-1 text-sm text-ink-2">Ask at the shop counter, or open the order and report the problem. It goes straight to the court manager.</p>
        <Button variant="outline" className="mt-3" onClick={() => push({ name: 'orders' })}>
          Go to your orders
        </Button>
      </div>
    </>
  );
}

// ─── Privacy and account ─────────────────────────────────────────────────────

export function PrivacyScreen() {
  const user = useAuth((s) => s.user);
  const profile = useMyProfile();
  const orders = useMyOrders();
  const [confirming, setConfirming] = useState(false);

  const download = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      account: {
        email: user?.email,
        name: profile?.name,
        phone: profile?.phone,
        studentId: profile?.studentId,
        prefs: profile?.prefs,
        favourites: profile?.favourites,
        memberSince: profile?.createdAt ? new Date(profile.createdAt).toISOString() : null,
      },
      orders: orders.map((o) => ({
        id: o.id,
        placedAt: new Date(o.createdAt).toISOString(),
        table: o.tableLabel,
        status: o.status,
        items: o.items.map((i) => ({ name: i.name, qty: i.qty, priceRupees: i.pricePaise / 100 })),
        totalRupees: o.totals.totalPaise / 100,
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'reva-food-court-my-data.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!user?.member) return <SignInFirst text="Download or delete what we keep about your account." />;
  return (
    <>
      <div className="rounded-card bg-surface p-4 text-sm text-ink-2 ring-1 ring-inset ring-line/70">
        <p className="text-base font-semibold text-ink">What we keep</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your Google name, email and photo.</li>
          <li>The mobile number and student ID you add.</li>
          <li>Your orders, favourites and preferences.</li>
        </ul>
        <p className="mt-3">Shops see only the name on your token. We never sell your data.</p>
      </div>
      <Group className="mt-6">
        <button type="button" onClick={download} className="hover-surface flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left">
          <Download className="h-[18px] w-[18px] text-ink-2" strokeWidth={1.75} />
          <span className="text-base font-medium text-ink">Download my data</span>
        </button>
        <button type="button" onClick={() => setConfirming(true)} className="hover-surface flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left">
          <Trash2 className="h-[18px] w-[18px] text-danger" strokeWidth={1.75} />
          <span className="text-base font-medium text-danger">Delete my account</span>
        </button>
      </Group>
      <DeleteAccountSheet open={confirming} onClose={() => setConfirming(false)} />
    </>
  );
}

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const inputId = useId();
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const remove = async () => {
    setPending(true);
    try {
      await accountCall({ action: 'DELETE_ACCOUNT', confirm: 'DELETE' });
      notify('Your account is deleted');
      await signOutToGuest();
    } catch (err) {
      setPending(false);
      notifyError("Couldn't delete your account", { description: (err as Error).message || 'Try again.' });
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Delete your account?"
      description="Your profile, favourites and saved details are removed. This can't be undone."
      footer={
        <div className="space-y-1">
          <Button size="lg" block disabled={typed !== 'DELETE'} loading={pending} onClick={() => void remove()} className="!bg-danger !text-white disabled:!bg-danger/40">
            Delete for good
          </Button>
          <Button variant="ghost" block onClick={onClose}>
            Keep my account
          </Button>
        </div>
      }
    >
      <p className="text-sm text-ink-2">The court keeps its record of past orders for its accounts, without your name, email or number.</p>
      <label htmlFor={inputId} className="mt-4 block text-sm font-medium text-ink">
        Type DELETE to confirm
      </label>
      <input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoCapitalize="characters" className={cx(fieldClass, 'mt-2 uppercase')} />
    </Sheet>
  );
}
