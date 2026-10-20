import { useEffect } from 'react';
import { keepCatalogFresh } from '@foodcourt/firebase-client/rest';
import { selectMember, useAuth } from '../../lib/authStore';
import { ensureAnonymousUser } from '../../lib/firebase';
import { jsonEqual, useLocal } from '../../lib/store';
import { rememberDetails } from '../auth/account';
import { useCart } from '../cart/cartStore';
import { useUi } from '../ui/uiStore';

/** Shops, menus, stock and flags over REST, refreshed while the page is open. */
export function useCatalog() {
  useEffect(() => keepCatalogFresh(), []);
}

function useLiveListener(key: string | null, start: (uid: string, live: typeof import('@foodcourt/firebase-client/live')) => () => void) {
  // Restarts when the diner signs in to an existing account (a different uid).
  const uid = useAuth((s) => s.user?.uid ?? null);
  useEffect(() => {
    if (!key) return;
    if (!uid) {
      void ensureAnonymousUser().catch(() => undefined);
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    // The realtime SDK loads only once there is something to track.
    import('@foodcourt/firebase-client/live')
      .then((live) => {
        if (!cancelled) stop = start(uid, live);
      })
      .catch((err: unknown) => console.warn('Live updates unavailable', err));
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uid]);
}

/** A signed-in diner's messages from the court (a small, capped listener). */
export function useInboxSync() {
  const member = useAuth(selectMember);
  useLiveListener(member ? 'inbox' : null, (uid, live) => live.watchInbox(uid));
}

/** A signed-in diner's own profile, live: favourites on the menu, preferences, the name on tokens. */
export function useProfileSync() {
  const member = useAuth(selectMember);
  useLiveListener(member ? 'profile' : null, (uid, live) => live.watchProfile(uid));
  const profile = useLocal((s) => {
    const uid = useAuth.getState().user?.uid;
    const p = uid ? s.users[uid] : undefined;
    return p?.member ? { name: p.name ?? null, phone: p.phone ?? null, studentId: p.studentId ?? null } : null;
  }, jsonEqual);
  useEffect(() => {
    if (profile) rememberDetails(profile);
  }, [profile]);
}

/** Live status of the order being tracked. */
export function useActiveOrderSync() {
  const orderId = useCart((s) => s.activeOrderId);
  useLiveListener(orderId, (uid, live) => live.watchOrder(uid, orderId!));
}

/** Past orders and points, only while the account sheet is open. */
export function useHistorySync() {
  const open = useUi((s) => s.open.account);
  useLiveListener(open ? 'history' : null, (uid, live) => live.watchMyHistory(uid));
}

/** Back from a UPI app or the payment page: reopen the order that was just paid. */
export function useReturnFromPayment() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');
    if (!orderId || !/^o[0-9a-f]{24}$/.test(orderId)) return;
    useCart.getState().clear();
    useCart.getState().setActiveOrder(orderId);
    useUi.getState().show('tracking');
    params.delete('order_id');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  }, []);
}
