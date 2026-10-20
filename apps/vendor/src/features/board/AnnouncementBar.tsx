import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import type { Announcement } from '@foodcourt/shared';
import { watchAnnouncements } from '@foodcourt/firebase-client/live';

const KEY = 'fc_kitchen_announcements_seen';

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** A message from the court manager across the top of the board until the kitchen taps Got it. */
export function AnnouncementBar({ vendorId }: { vendorId: string }) {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [seen, setSeen] = useState<string[]>(readSeen);
  useEffect(() => watchAnnouncements(vendorId, setRows), [vendorId]);

  const current = rows.find((a) => !seen.includes(a.id));
  if (!current) return null;

  const dismiss = () => {
    const next = [current.id, ...seen].slice(0, 50);
    setSeen(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage blocked: it comes back after a reload
    }
  };

  return (
    <div role="status" className="enter-down mx-4 mt-3 flex items-start gap-3 rounded-card bg-accent-tint px-4 py-3 ring-1 ring-inset ring-accent-line">
      <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-ink">{current.title}</p>
        <p className="text-sm text-ink-2">{current.body}</p>
      </div>
      <button type="button" onClick={dismiss} className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-inset ring-line">
        <X className="h-4 w-4" />
        Got it
      </button>
    </div>
  );
}
