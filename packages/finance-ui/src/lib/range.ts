import { addDays, daysInRange, getIstDateKey } from '@foodcourt/shared';

export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface Range {
  preset: Preset;
  from: string;
  to: string;
}

export { addDays };

export function presetRange(preset: Exclude<Preset, 'custom'>, today = getIstDateKey()): Range {
  switch (preset) {
    case 'today':
      return { preset, from: today, to: today };
    case 'yesterday':
      return { preset, from: addDays(today, -1), to: addDays(today, -1) };
    case 'week':
      return { preset, from: addDays(today, -6), to: today };
    case 'month':
      return { preset, from: addDays(today, -29), to: today };
  }
}

export const PRESETS: Array<{ key: Exclude<Preset, 'custom'>; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
];

const dayFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const formatDay = (key: string) => dayFormat.format(new Date(`${key}T00:00:00Z`));

export function rangeLabel(r: Range): string {
  return r.from === r.to ? formatDay(r.from) : `${formatDay(r.from)} – ${formatDay(r.to)}`;
}

/** What the comparison is against, in words: "vs yesterday", "vs previous 7 days". */
export function compareLabel(r: Range): string {
  if (r.preset === 'today') return 'vs yesterday';
  if (r.preset === 'yesterday') return 'vs the day before';
  const n = daysInRange(r.from, r.to);
  return n === 1 ? 'vs previous day' : `vs previous ${n} days`;
}
