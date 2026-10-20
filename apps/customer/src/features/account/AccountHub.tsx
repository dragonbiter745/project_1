import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, CircleHelp, Gift, Heart, LockKeyhole, LogOut, Radio, ReceiptText, TicketPercent, UserRound, Wallet } from 'lucide-react';
import { formatPaise } from '@foodcourt/shared';
import { Button, lockScroll, unlockScroll } from '@foodcourt/ui';
import { useAuth } from '../../lib/authStore';
import { useLocal } from '../../lib/store';
import { notifyError } from '../../lib/toast';
import { signOutToGuest } from '../auth/account';
import { useProfile } from '../auth/profileStore';
import type { TableSession } from '../session/useTableSession';
import { useUi } from '../ui/uiStore';
import { Avatar } from './Avatar';
import { HubContext, track, useHub, useMyOrders, useMyProfile, useVendorNames, type Hub, type Route } from './data';
import { Group, Panel, Row, isLive, isPaid, monthFormat, shortOrderNo } from './hubParts';
import { CouponsScreen, FavouritesScreen, HelpScreen, NotificationsScreen, PaymentsScreen, PointsScreen, PrivacyScreen, ProfileScreen } from './MoreScreens';
import { OrderDetailScreen, OrdersScreen, ReceiptScreen } from './OrdersScreens';

const EXIT_MS = 300;

const TITLES: Record<Route['name'], string> = {
  home: 'Account',
  orders: 'Your orders',
  order: 'Order details',
  receipt: 'Receipt',
  favourites: 'Favourites',
  coupons: 'Coupons',
  payments: 'Payments and refunds',
  points: 'REVA points',
  notifications: 'Notifications',
  profile: 'Profile and preferences',
  help: 'Help and support',
  privacy: 'Privacy and account',
};

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'orders':
      return <OrdersScreen />;
    case 'order':
      return <OrderDetailScreen id={route.id} />;
    case 'receipt':
      return <ReceiptScreen id={route.id} />;
    case 'favourites':
      return <FavouritesScreen />;
    case 'coupons':
      return <CouponsScreen />;
    case 'payments':
      return <PaymentsScreen />;
    case 'points':
      return <PointsScreen />;
    case 'notifications':
      return <NotificationsScreen />;
    case 'profile':
      return <ProfileScreen />;
    case 'help':
      return <HelpScreen />;
    case 'privacy':
      return <PrivacyScreen />;
  }
}

interface Entry {
  key: number;
  route: Route;
  open: boolean;
}

/** The account hub: a stack of full-screen pages over the menu, like a native app's account tab. */
export default function AccountHub({ session }: { session: TableSession }) {
  const open = useUi((s) => s.open.account);
  const hide = useUi((s) => s.hide);
  const [stack, setStack] = useState<Entry[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const nextKey = useRef(0);

  useEffect(() => {
    if (open) {
      setStack([{ key: nextKey.current++, route: { name: 'home' }, open: true }]);
      lockScroll();
      return () => unlockScroll();
    }
    setStack((s) => s.map((e) => ({ ...e, open: false })));
    const t = setTimeout(() => setStack([]), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  const closeHub = useCallback(() => hide('account'), [hide]);
  const push = useCallback((route: Route) => setStack((s) => [...s, { key: nextKey.current++, route, open: true }]), []);
  const back = useCallback(() => {
    const showing = stackRef.current.filter((e) => e.open);
    const top = showing[showing.length - 1];
    if (!top || showing.length <= 1) {
      hide('account');
      return;
    }
    setStack((s) => s.map((e) => (e.key === top.key ? { ...e, open: false } : e)));
    setTimeout(() => setStack((s) => s.filter((e) => e.key !== top.key)), EXIT_MS);
  }, [hide]);

  const hub = useMemo<Hub>(() => ({ session, push, back, closeHub }), [session, push, back, closeHub]);
  if (stack.length === 0) return null;

  return createPortal(
    <HubContext.Provider value={hub}>
      {stack.map((e, i) => (
        <Panel key={e.key} open={e.open} title={TITLES[e.route.name]} onBack={i === 0 ? closeHub : back} close={i === 0}>
          <Screen route={e.route} />
        </Panel>
      ))}
    </HubContext.Provider>,
    document.body
  );
}

function Home() {
  const { push, closeHub } = useHub();
  const user = useAuth((s) => s.user);
  const member = Boolean(user?.member);
  const profile = useMyProfile();
  const details = useProfile((s) => s.profile);
  const orders = useMyOrders();
  const names = useVendorNames();
  const loyalty = useLocal((s) => s.config.flags.loyaltyEnabled);
  const showLogin = useUi((s) => s.showLogin);
  const [signingOut, setSigningOut] = useState(false);

  const paid = useMemo(() => orders.filter(isPaid), [orders]);
  const spent = paid.reduce((n, o) => n + o.totals.totalPaise, 0);
  const usual = useMemo(() => {
    const count = new Map<string, number>();
    for (const o of paid) for (const i of o.items) count.set(i.vendorId, (count.get(i.vendorId) ?? 0) + i.qty);
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? names[top[0]] ?? null : null;
  }, [paid, names]);
  const active = orders.find((o) => isLive(o));
  const name = profile?.name || details?.name || user?.name || 'Guest';

  const signOut = async () => {
    setSigningOut(true);
    try {
      await signOutToGuest();
    } catch {
      setSigningOut(false);
      notifyError("Couldn't sign out", { description: 'Check your connection and try again.' });
    }
  };

  return (
    <>
      {member ? (
        <section className="enter-up flex items-center gap-4 rounded-card bg-surface p-4 ring-1 ring-inset ring-line/70">
          <Avatar name={name} photoURL={user?.photoURL} size={60} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-semibold tracking-tight text-ink">{name}</p>
            <p className="truncate text-sm text-ink-3">{user?.email}</p>
            {profile?.createdAt && <p className="mt-0.5 text-xs text-ink-3">Member since {monthFormat.format(profile.createdAt)}</p>}
          </div>
          <Button size="sm" variant="quiet" onClick={() => push({ name: 'profile' })}>
            Edit
          </Button>
        </section>
      ) : (
        <section className="enter-up overflow-hidden rounded-card bg-gradient-to-br from-accent-tint to-surface p-5 ring-1 ring-inset ring-accent-line">
          <p className="text-xl font-semibold tracking-tight text-ink">You're ordering as a guest</p>
          <p className="mt-1 text-sm text-ink-2">Sign in to keep your orders on any phone, save favourites, and get coupons as they launch.</p>
          <Button variant="accent" className="mt-4" onClick={() => showLogin()}>
            Sign in with Google
          </Button>
        </section>
      )}

      {paid.length > 0 && (
        <dl className="enter-up mt-3 grid grid-cols-3 gap-2" style={{ ['--i' as string]: 1 }}>
          <Stat label="Orders" value={String(paid.length)} />
          <Stat label="Spent" value={formatPaise(spent)} />
          <Stat label="Your usual" value={usual ?? '—'} small />
        </dl>
      )}

      {active && (
        <button
          type="button"
          onClick={() => track(active.id, closeHub)}
          className="enter-up pressable mt-3 flex w-full items-center gap-3 rounded-card bg-accent-ink px-4 py-3.5 text-left text-on-accent shadow-float"
          style={{ ['--i' as string]: 2 }}
        >
          <span className="live-dot h-2.5 w-2.5 shrink-0 rounded-full bg-on-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Order {shortOrderNo(active.id)} is in the kitchen</span>
            <span className="block text-sm opacity-85">Tap to track it live</span>
          </span>
          <Radio className="h-5 w-5 shrink-0" strokeWidth={1.75} />
        </button>
      )}

      <Group title="Food" className="mt-6">
        <Row
          icon={ReceiptText}
          label="Your orders"
          detail={orders.length > 0 ? `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}${member ? '' : ' on this phone'}` : 'Receipts, refunds, reorder'}
          onClick={() => push({ name: 'orders' })}
        />
        <Row icon={Heart} label="Favourites" detail={profile?.favourites?.length ? `${profile.favourites.length} saved` : 'Dishes you love'} onClick={() => push({ name: 'favourites' })} />
        <Row icon={TicketPercent} label="Coupons" detail="Offers you get show up here" onClick={() => push({ name: 'coupons' })} />
      </Group>

      <Group title="Money" className="mt-6">
        <Row icon={Wallet} label="Payments and refunds" detail="How you paid, refund status" onClick={() => push({ name: 'payments' })} />
        {loyalty && member && <Row icon={Gift} label="REVA points" detail={`${profile?.pointsBalance ?? 0} points`} onClick={() => push({ name: 'points' })} />}
      </Group>

      <Group title="Settings" className="mt-6">
        {member && <Row icon={UserRound} label="Profile and preferences" detail="Name on tokens, mobile, veg only" onClick={() => push({ name: 'profile' })} />}
        <Row icon={BellRing} label="Notifications" detail="Order updates and offers" onClick={() => push({ name: 'notifications' })} />
        <Row icon={CircleHelp} label="Help and support" detail="Refunds, tokens, problems with an order" onClick={() => push({ name: 'help' })} />
        {member && <Row icon={LockKeyhole} label="Privacy and account" detail="Download or delete your data" onClick={() => push({ name: 'privacy' })} />}
      </Group>

      {member && (
        <Button variant="danger" block className="mt-6" loading={signingOut} icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>
          Sign out
        </Button>
      )}
      <p className="mt-6 text-center text-xs text-ink-3">REVA Food Court</p>
    </>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="min-w-0 rounded-card bg-surface px-3 py-3 ring-1 ring-inset ring-line/70">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={small ? 'mt-1 truncate text-sm font-semibold text-ink' : 'mt-0.5 truncate text-lg font-semibold tabular-nums tracking-tight text-ink'}>{value}</dd>
    </div>
  );
}
