import { useSyncExternalStore } from 'react';

const PHONE_QUERY = '(max-width: 767px)';

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

// Phones get the one-handed layout; tablets and desktops keep the three-column board.
export const useIsPhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);

// Android Chrome vibrates; iOS Safari has no Vibration API, so this quietly does nothing there.
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // blocked by the browser; haptics are a nicety only
  }
}
