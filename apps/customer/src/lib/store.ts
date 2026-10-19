import { useRef, useSyncExternalStore } from 'react';
import { localStore, type FoodCourtDataState } from '@foodcourt/firebase-client/local-store';

const subscribe = (onChange: () => void) => localStore.subscribe(() => onChange());

// localStore mutates in place, so selections are cached and compared rather than
// relying on reference changes. Components re-render only when their slice changes.
export function useLocal<T>(
  selector: (state: FoodCourtDataState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const cache = useRef<{ value: T } | null>(null);
  const getSnapshot = () => {
    const next = selector(localStore.getState());
    const prev = cache.current;
    if (prev && isEqual(prev.value, next)) return prev.value;
    cache.current = { value: next };
    return next;
  };
  return useSyncExternalStore(subscribe, getSnapshot);
}

export const jsonEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export { localStore };
