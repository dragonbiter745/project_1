import { WifiOff } from 'lucide-react';
import { useOnline } from '../../lib/useOnline';

// Browsing works from the loaded menu; only paying needs the network (PRD §6.3).
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(8px,env(safe-area-inset-top))] z-sheet flex justify-center px-4">
      <p
        role="status"
        className="enter-down inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-float"
      >
        <WifiOff className="h-4 w-4 shrink-0" strokeWidth={2} />
        You're offline. Reconnect to pay.
      </p>
    </div>
  );
}
