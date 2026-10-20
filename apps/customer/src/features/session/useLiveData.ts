import { useEffect } from 'react';
import { keepCatalogFresh } from '@foodcourt/firebase-client/rest';
import { ensureAnonymousUser } from '../../lib/firebase';
import { useCart } from '../cart/cartStore';
import { useUi } from '../ui/uiStore';

/** Shops, menus, stock and flags over REST, refreshed while the page is open. */
export function useCatalog() {
  useEffect(() => keepCatalogFresh(), []);
}

function useLiveListener(key: string | null, start: (uid: string, live: typeof import('@foodcourt/firebase-client/live')) => () => void) {
  useEffect(() => {
    if (!key) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    // The realtime SDK loads only once there is something to track.
    Promise.all([ensureAnonymousUser(), import('@foodcourt/firebase-client/live')])
      .then(([uid, live]) => {
        if (!cancelled) stop = start(uid, live);
      })
      .catch((err: unknown) => console.warn('Live updates unavailable', err));
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
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
