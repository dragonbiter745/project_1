import { formatPaise, type Granularity } from '@foodcourt/shared';

export const money = (p: number) => formatPaise(p, p % 100 !== 0);

/** Short rupees for chart axes and bars: ₹950, ₹12.4k, ₹1.2L, ₹3.1Cr. */
export function compactRupees(paise: number): string {
  const r = paise / 100;
  const a = Math.abs(r);
  const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ''));
  if (a >= 1e7) return `₹${trim(r / 1e7)}Cr`;
  if (a >= 1e5) return `₹${trim(r / 1e5)}L`;
  if (a >= 1e3) return `₹${trim(r / 1e3)}k`;
  return `₹${Math.round(r)}`;
}

const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
/** "2026-10" → "Oct 2026". */
export const monthLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));

const dayShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const hourText = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

/** Axis label for a series key: "9 am", "20 Oct". */
export type ChartGrain = Granularity | 'month';

export function bucketLabel(key: string, g: ChartGrain): string {
  if (g === 'month') return monthFormat.format(new Date(`${key}-01T00:00:00Z`)).replace(/ (\d{2})(\d{2})$/, " '$2");
  if (g === 'hour') return hourText(Number(key.slice(11, 13)));
  return dayShort.format(new Date(`${key.slice(0, 10)}T00:00:00Z`));
}

/** Tooltip title for a series key: "9 – 10 am", "Mon, 20 Oct", "Week of 13 Oct". */
export function bucketTitle(key: string, g: ChartGrain): string {
  if (g === 'month') return monthLabel(key);
  if (g === 'hour') {
    const h = Number(key.slice(11, 13));
    return `${hourText(h)} – ${hourText((h + 1) % 24)}`;
  }
  const d = new Date(`${key.slice(0, 10)}T00:00:00Z`);
  return g === 'week' ? `Week of ${dayShort.format(d)}` : weekday.format(d);
}
