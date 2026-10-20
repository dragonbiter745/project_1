import { useSyncExternalStore } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// A failed staff action must never be silent: `run` shows why it failed and resolves false.

let message: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showActionError(text: string) {
  message = text;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    message = null;
    emit();
  }, 5000);
  emit();
}

export async function run(action: Promise<unknown>): Promise<boolean> {
  try {
    await action;
    return true;
  } catch (err) {
    showActionError((err as Error).message || 'That did not go through. Try again.');
    return false;
  }
}

export function ActionToast() {
  const text = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => message
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-spotlight flex justify-center px-4">
      <div data-visible={text !== null} className="float-bar-top pointer-events-auto">
        <p role="alert" className="flex items-center gap-3 rounded-full bg-danger py-2 pl-4 pr-2 text-sm font-semibold text-white shadow-float">
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          {text}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              message = null;
              emit();
            }}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/15"
          >
            <X className="h-4 w-4" />
          </button>
        </p>
      </div>
    </div>
  );
}
