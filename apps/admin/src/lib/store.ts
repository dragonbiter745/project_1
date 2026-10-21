import { useStoreSelector } from '@foodcourt/ui';
import { liveStore } from '@foodcourt/firebase-client/live-store';
import type { FoodCourtDataState } from '@foodcourt/firebase-client/state';

// Passing an equality function opts into structural comparison; without one, reference equality.
export function useLocal<T>(selector: (state: FoodCourtDataState) => T, isEqual?: (a: T, b: T) => boolean): T {
  return useStoreSelector(liveStore, selector, isEqual ? 'json' : 'ref');
}
