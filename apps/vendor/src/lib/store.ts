import { useSyncExternalStore } from 'react';
import { useStoreSelector } from '@foodcourt/ui';
import { liveStore } from '@foodcourt/firebase-client/live-store';
import type { FoodCourtDataState } from '@foodcourt/firebase-client/state';

// Passing an equality function (always jsonEqual here) opts into structural comparison.
export function useLocal<T>(selector: (state: FoodCourtDataState) => T, isEqual?: (a: T, b: T) => boolean): T {
  return useStoreSelector(liveStore, selector, isEqual ? 'json' : 'ref');
}

export type SyncStatus = 'connected' | 'connecting' | 'disconnected';

const toSync = (): SyncStatus => {
  const s = liveStore.getStatus();
  return s === 'live' ? 'connected' : s === 'connecting' ? 'connecting' : 'disconnected';
};

export const useSyncStatus = (): SyncStatus => useSyncExternalStore((cb) => liveStore.subscribeStatus(() => cb()), toSync);

export { jsonEqual } from '@foodcourt/ui';
export { liveStore };
