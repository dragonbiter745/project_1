import { useCallback, useEffect, useState } from 'react';
import { getFounderIncome, getPartners, listFounderEntries } from '@foodcourt/firebase-client/finance';
import type { FounderEntry, FounderIncome, Partner } from '@foodcourt/shared';

export interface Books {
  entries: FounderEntry[] | null;
  partners: Partner[];
  income: FounderIncome | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Everything the Revenue & expenses and Founders tabs need; refetched after every change. */
export function useBooks(enabled = true): Books {
  const [entries, setEntries] = useState<FounderEntry[] | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [income, setIncome] = useState<FounderIncome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([listFounderEntries(), getPartners(), getFounderIncome()])
      .then(([e, p, i]) => {
        if (!live) return;
        setEntries(e);
        setPartners(p);
        setIncome(i);
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tick, enabled]);

  return { entries, partners, income, error, loading, reload: useCallback(() => setTick((t) => t + 1), []) };
}
