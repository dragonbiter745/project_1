import { useStoreSelector } from '@foodcourt/ui';
import { localStore, type FoodCourtDataState } from '@foodcourt/firebase-client/local-store';

// Passing an equality function (always jsonEqual here) opts into structural comparison.
export function useLocal<T>(selector: (state: FoodCourtDataState) => T, isEqual?: (a: T, b: T) => boolean): T {
  return useStoreSelector(localStore, selector, isEqual ? 'json' : 'ref');
}

export { jsonEqual } from '@foodcourt/ui';
export { localStore };
