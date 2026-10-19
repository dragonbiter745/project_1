import type { SubOrder, SubOrderStatus } from './types';
import { getIstDateKey } from './tokens';

const FINISHED: ReadonlySet<SubOrderStatus> = new Set(['COLLECTED', 'REJECTED', 'TIMED_OUT', 'CANCELLED']);

export interface TodayStats {
  collected: number;
  salesPaise: number;
  medianReadyMin: number | null;
  rejected: number;
  finished: SubOrder[];
}

// Accept-to-ready is the kitchen's own speed (the pitch's core metric, PRD §9).
export function todayStats(subs: SubOrder[], now: number): TodayStats {
  const today = getIstDateKey(new Date(now));
  const mine = subs.filter((s) => getIstDateKey(new Date(s.ts.placed)) === today);
  const collected = mine.filter((s) => s.status === 'COLLECTED');
  const durations = mine
    .filter((s) => s.ts.accepted && s.ts.ready)
    .map((s) => (s.ts.ready! - s.ts.accepted!) / 60_000)
    .sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const median =
    durations.length === 0
      ? null
      : durations.length % 2
        ? durations[mid]!
        : (durations[mid - 1]! + durations[mid]!) / 2;

  return {
    collected: collected.length,
    salesPaise: collected.reduce((sum, s) => sum + s.subtotalPaise, 0),
    medianReadyMin: median,
    rejected: mine.filter((s) => s.status === 'REJECTED' || s.status === 'TIMED_OUT').length,
    finished: mine.filter((s) => FINISHED.has(s.status)).sort((a, b) => b.ts.placed - a.ts.placed),
  };
}
