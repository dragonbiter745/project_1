import { useEffect } from 'react';
import { create } from 'zustand';
import { getIstDateKey } from '@foodcourt/shared';
import { useAuth } from '../../lib/authStore';
import { getCallable } from '../../lib/firebase';
import type { TableSession } from './useTableSession';

interface StartSessionResult {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  displayName: string;
  dailyNo: number;
}

// The website's session: no table, collected at the counter. Signed-in diners and guests both get one.
const usePickup = create<{ session: TableSession | null }>()(() => ({ session: null }));

const cacheKey = (uid: string) => `fc_pickup_${uid}_${getIstDateKey()}`;
let inflight: { uid: string; promise: Promise<TableSession> } | null = null;

function readCache(uid: string): TableSession | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(uid));
    return raw ? (JSON.parse(raw) as TableSession) : null;
  } catch {
    return null;
  }
}

/**
 * Opens (or resumes) today's pickup session for the signed-in diner. `refresh` asks the server even
 * when one is cached, which also keeps the session from expiring (checkout always refreshes).
 */
export function ensurePickupSession(refresh = false): Promise<TableSession> {
  const user = useAuth.getState().user;
  // Guests (anonymous accounts) order for pickup too; they get a generated name from the server.
  if (!user) return Promise.reject(Object.assign(new Error('Still connecting. Try again in a moment.'), { code: 'no-user' }));
  if (inflight?.uid === user.uid) return inflight.promise;
  const current = usePickup.getState().session;
  if (!refresh && current && readCache(user.uid)?.id === current.id) return Promise.resolve(current);
  const promise = getCallable<{ mode: 'pickup' }, StartSessionResult>('startSession')
    .then((fn) => fn({ mode: 'pickup' }))
    .then(({ data }) => {
      const session: TableSession = {
        id: data.sessionId,
        tableId: data.tableId,
        tableLabel: data.tableLabel,
        displayName: data.displayName,
        dailyNo: data.dailyNo,
        kind: 'pickup',
      };
      try {
        sessionStorage.setItem(cacheKey(user.uid), JSON.stringify(session));
      } catch {
        // storage blocked: the session is simply not cached
      }
      if (useAuth.getState().user?.uid === user.uid) usePickup.setState({ session });
      return session;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { uid: user.uid, promise };
  return promise;
}

/**
 * The website's pickup session. Members get one opened in the background on sign-in. A guest gets one only
 * when they check out (so merely browsing writes nothing), and it is restored on reload so their order stays
 * trackable.
 */
export function usePickupSession(): TableSession | null {
  const uid = useAuth((s) => s.user?.uid ?? null);
  const member = useAuth((s) => Boolean(s.user?.member));
  const session = usePickup((s) => s.session);

  useEffect(() => {
    if (!uid) {
      usePickup.setState({ session: null });
      return;
    }
    const cached = readCache(uid);
    usePickup.setState({ session: cached });
    // Re-checked with the server on every load so an ended session never lingers; the cached copy
    // shows meanwhile. A guest with nothing cached has not ordered, so there is nothing to open.
    if (member || cached) ensurePickupSession(true).catch((err: unknown) => console.warn('Pickup session unavailable', err));
  }, [uid, member]);

  return session;
}
