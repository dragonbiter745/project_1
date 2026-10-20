import { emptyState, type FoodCourtDataState } from './state';

export type LiveStatus = 'connecting' | 'live' | 'offline' | 'error';

/**
 * Same interface as the old local store (getState / subscribe), filled from Firestore. Apps keep
 * their selectors; writes go through ./ops (callables and rule-checked documents), never here.
 */
export class LiveStore {
  private state: FoodCourtDataState = emptyState();
  private listeners = new Set<(s: FoodCourtDataState) => void>();
  private statusListeners = new Set<(s: LiveStatus) => void>();
  private status: LiveStatus = 'connecting';
  private loaded = new Set<string>();
  private pending = false;

  getState = (): FoodCourtDataState => this.state;

  subscribe = (listener: (s: FoodCourtDataState) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Applies a change and notifies once per microtask, so a burst of snapshots renders once. */
  patch(change: (draft: FoodCourtDataState) => void) {
    change(this.state);
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      for (const l of this.listeners) l(this.state);
    });
  }

  markLoaded(key: string) {
    this.loaded.add(key);
    this.setStatus('live');
  }

  isLoaded(key: string) {
    return this.loaded.has(key);
  }

  getStatus = () => this.status;

  setStatus(s: LiveStatus) {
    if (s === this.status) return;
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  subscribeStatus = (listener: (s: LiveStatus) => void) => {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  };
}

export const liveStore = new LiveStore();
