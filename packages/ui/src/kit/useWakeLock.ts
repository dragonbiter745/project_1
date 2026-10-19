import { useEffect } from 'react';

// Keeps the screen on while food is on its way (PRD FR-C6). Browsers drop the lock when
// the tab is hidden, so it is re-requested on return.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) void sentinel.release();
      } catch {
        // denied (battery saver, permissions policy); nothing to do
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
    };
  }, [active]);
}
