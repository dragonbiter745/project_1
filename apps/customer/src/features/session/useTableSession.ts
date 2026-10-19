import { useEffect, useState } from 'react';
import { generateDisplayName, getIstDateKey, type Session } from '@foodcourt/shared';
import { jsonEqual, localStore, useLocal } from '../../lib/store';

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
  | { status: 'ready'; session: TableSession };

// QR codes encode /t/{tableCode} (PRD FR-C1). `?t=` and the T14 default exist for local dev only.
function readTableCode(): string {
  const fromPath = window.location.pathname.match(/^\/t\/([A-Za-z0-9-]+)/)?.[1];
  const fromQuery = new URLSearchParams(window.location.search).get('t');
  return (fromPath ?? fromQuery ?? (import.meta.env.DEV ? 'T14' : '')).toUpperCase();
}

export function useTableSession(): TableSessionState {
  const [code] = useState(readTableCode);
  const table = useLocal((s) => s.tables.find((t) => t.code === code && t.active) ?? null, jsonEqual);

  const session = useLocal((s) => {
    if (!table) return null;
    const dateKey = getIstDateKey();
    let latest: Session | null = null;
    for (const candidate of Object.values(s.sessions)) {
      if (candidate.tableId !== table.id || candidate.dateKey !== dateKey) continue;
      if (!latest || candidate.createdAt > latest.createdAt) latest = candidate;
    }
    return latest
      ? {
          id: latest.id,
          tableId: latest.tableId,
          tableLabel: latest.tableLabel,
          displayName: latest.displayName,
          dailyNo: latest.dailyNo,
        }
      : null;
  }, jsonEqual);

  // Local stand-in for the startSession callable (PRD §7.1).
  useEffect(() => {
    if (!table || session) return;
    const dateKey = getIstDateKey();
    const now = Date.now();
    localStore.mutate((draft) => {
      const dailyNo = (draft.dailyCounter[dateKey] || 0) + 1;
      const id = `sess_${now}`;
      draft.dailyCounter[dateKey] = dailyNo;
      draft.sessions[id] = {
        id,
        uid: `guest_${now}`,
        tableId: table.id,
        tableLabel: table.label,
        dateKey,
        dailyNo,
        displayName: generateDisplayName(dailyNo),
        createdAt: now,
        lastActiveAt: now,
        expiresAt: now + 3 * 3600 * 1000,
      };
    });
  }, [table, session]);

  if (!table) return { status: 'unknown-table', code };
  return session ? { status: 'ready', session } : { status: 'loading' };
}
