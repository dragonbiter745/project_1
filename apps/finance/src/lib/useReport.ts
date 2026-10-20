import { useCallback, useEffect, useState } from 'react';
import { getFinanceReport } from '@foodcourt/firebase-client/finance';
import type { FinanceReport } from '@foodcourt/shared';
import type { Range } from './range';

export interface ReportState {
  report: FinanceReport | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Loads the court-wide finance report for a date range; the last good report stays on screen while refreshing. */
export function useReport(range: Range): ReportState {
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    getFinanceReport(range.from, range.to)
      .then((r) => live && setReport(r))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [range.from, range.to, tick]);

  return { report, loading, error, reload: useCallback(() => setTick((t) => t + 1), []) };
}
