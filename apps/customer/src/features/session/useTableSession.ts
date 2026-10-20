import { useCallback, useEffect, useState } from 'react';
import { QR_TOKEN_PATTERN } from '@foodcourt/shared';
import { ensureAnonymousUser, getCallable } from '../../lib/firebase';

export interface TableSession {
  id: string;
  tableId: string;
  tableLabel: string;
  displayName: string;
  dailyNo: number;
}

export type TableSessionState =
  | { status: 'loading' }
  | { status: 'unknown-table'; code: string }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; session: TableSession; qrToken: string };

// QR codes encode /t/{qrToken}: an unguessable per-table token (old /t/T14 links are refused server-side).
export function readQrToken(): string {
  return window.location.pathname.match(/^\/t\/([A-Za-z0-9_-]+)/)?.[1] ?? '';
}

const cacheKey = (token: string) => `fc_session_${token}`;

interface StartSessionResult {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  displayName: string;
  dailyNo: number;
}

function readCache(token: string): TableSession | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(token));
    return raw ? (JSON.parse(raw) as TableSession) : null;
  } catch {
    return null;
  }
}

export function useTableSession(): TableSessionState {
  const [token] = useState(readQrToken);
  const [state, setState] = useState<TableSessionState>(() => {
    if (!QR_TOKEN_PATTERN.test(token)) return { status: 'unknown-table', code: token };
    const cached = readCache(token);
    return cached ? { status: 'ready', session: cached, qrToken: token } : { status: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!QR_TOKEN_PATTERN.test(token)) return;
    let live = true;
    // Always (re)validated server-side: a cached session for a rotated QR must not keep working.
    ensureAnonymousUser()
      .then(() => getCallable<{ qrToken: string }, StartSessionResult>('startSession'))
      .then((fn) => fn({ qrToken: token }))
      .then(({ data }) => {
        if (!live) return;
        const session: TableSession = { id: data.sessionId, tableId: data.tableId, tableLabel: data.tableLabel, displayName: data.displayName, dailyNo: data.dailyNo };
        try {
          sessionStorage.setItem(cacheKey(token), JSON.stringify(session));
          // A home-screen launch or a notification tap reopens this table.
          localStorage.setItem('fc_last_table', token);
        } catch {
          // storage blocked: the session simply is not cached
        }
        setState({ status: 'ready', session, qrToken: token });
      })
      .catch((err: { code?: string }) => {
        if (!live) return;
        if (err?.code === 'functions/not-found' || err?.code === 'functions/invalid-argument') {
          try {
            sessionStorage.removeItem(cacheKey(token));
            if (localStorage.getItem('fc_last_table') === token) localStorage.removeItem('fc_last_table');
          } catch {
            // ignore
          }
          setState({ status: 'unknown-table', code: '' });
        } else {
          setState((s) => (s.status === 'ready' ? s : { status: 'error', retry }));
        }
      });
    return () => {
      live = false;
    };
  }, [token, attempt, retry]);

  return state;
}
