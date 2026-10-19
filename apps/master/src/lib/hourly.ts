import { getIstDateKey, type SubOrder } from '@foodcourt/shared';

export interface HourBucket {
  hour: number;
  label: string;
  orders: number;
  salesPaise: number;
}

const hourFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' });
const istHour = (ms: number) => Number(hourFormat.format(ms));
const label = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;

// Today's tickets by IST hour, from opening (or the first order, if earlier) to now.
// Sales count collected tickets only, so the curve matches the "collected sales" figures.
export function hourlyToday(subs: SubOrder[], now: number, openingHour = 8): HourBucket[] {
  const today = getIstDateKey(new Date(now));
  const mine = subs.filter((s) => getIstDateKey(new Date(s.ts.placed)) === today);
  const last = istHour(now);
  const first = Math.min(openingHour, last, ...mine.map((s) => istHour(s.ts.placed)));
  const buckets: HourBucket[] = [];
  for (let h = first; h <= last; h++) buckets.push({ hour: h, label: label(h), orders: 0, salesPaise: 0 });
  for (const s of mine) {
    const bucket = buckets[istHour(s.ts.placed) - first];
    if (!bucket) continue;
    bucket.orders += 1;
    if (s.status === 'COLLECTED') bucket.salesPaise += s.subtotalPaise;
  }
  return buckets;
}
