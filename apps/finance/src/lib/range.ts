import { getIstDateKey } from '@foodcourt/shared';

export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom';

export interface Range {
  preset: Preset;
  from: string;
  to: string;
}

/** Shifts a YYYY-MM-DD day by n days without touching time zones. */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function presetRange(preset: Exclude<Preset, 'custom'>, today = getIstDateKey()): Range {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case 'today':
      return { preset, from: today, to: today };
    case 'yesterday':
      return { preset, from: addDays(today, -1), to: addDays(today, -1) };
    case 'week':
      return { preset, from: addDays(today, -6), to: today };
    case 'month':
      return { preset, from: monthStart, to: today };
    case 'lastMonth': {
      const end = addDays(monthStart, -1);
      return { preset, from: `${end.slice(0, 8)}01`, to: end };
    }
  }
}

export const PRESETS: Array<{ key: Exclude<Preset, 'custom'>; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
];

const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const formatDay = (key: string) => dayFormat.format(new Date(`${key}T00:00:00Z`));

export function rangeLabel(r: Range): string {
  return r.from === r.to ? formatDay(r.from) : `${formatDay(r.from)} – ${formatDay(r.to)}`;
}
