import { useRef, useSyncExternalStore } from 'react';

export interface ExternalStore<S> {
  getState: () => S;
  subscribe: (listener: (state: S) => void) => () => void;
}

export type SelectorMode = 'ref' | 'json';

// The local realtime store mutates objects in place, so a cached selection can alias the
// very objects that just changed. 'json' mode compares a serialised key and hands out a
// fresh copy whenever the data changes; 'ref' mode is for slices that are replaced, not
// mutated (menus). Components re-render only when the slice they read changes.
export function useStoreSelector<S, T>(
  store: ExternalStore<S>,
  selector: (state: S) => T,
  mode: SelectorMode = 'ref'
): T {
  const cache = useRef<{ key: string | null; value: T } | null>(null);
  const subscribe = useRef((onChange: () => void) => store.subscribe(() => onChange())).current;

  const getSnapshot = (): T => {
    const next = selector(store.getState());
    const prev = cache.current;
    if (mode === 'ref') {
      if (prev && Object.is(prev.value, next)) return prev.value;
      cache.current = { key: null, value: next };
      return next;
    }
    const key = JSON.stringify(next) ?? 'undefined';
    if (prev && prev.key === key) return prev.value;
    const value = (key === 'undefined' ? undefined : JSON.parse(key)) as T;
    cache.current = { key, value };
    return value;
  };

  return useSyncExternalStore(subscribe, getSnapshot);
}
