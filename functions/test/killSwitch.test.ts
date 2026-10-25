import { describe, expect, it } from 'vitest';
import { disableBilling, overBudget } from '../src/billing/killSwitch';

describe('overBudget', () => {
  it('trips only when the spend has reached the budget, never on an early-threshold alert', () => {
    expect(overBudget({ costAmount: 49, budgetAmount: 100, alertThresholdExceeded: 0.5 })).toBe(false);
    expect(overBudget({ costAmount: 91, budgetAmount: 100, alertThresholdExceeded: 0.9 })).toBe(false);
    expect(overBudget({ costAmount: 100, budgetAmount: 100, alertThresholdExceeded: 1 })).toBe(true);
    expect(overBudget({ costAmount: 140, budgetAmount: 100 })).toBe(true);
  });

  it('ignores messages it cannot read', () => {
    expect(overBudget({})).toBe(false);
    expect(overBudget({ costAmount: 5 })).toBe(false);
    expect(overBudget({ costAmount: 5, budgetAmount: 0 })).toBe(false);
  });
});

function fakeGoogle(billingEnabled: boolean, putStatus = 200) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetchImpl = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
    if (url.includes('metadata.google.internal')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
    if (init?.method === 'PUT') return { ok: putStatus === 200, status: putStatus, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ billingEnabled }) };
  };
  return { fetchImpl, calls };
}

describe('disableBilling', () => {
  it('unlinks the billing account of this project only', async () => {
    const { fetchImpl, calls } = fakeGoogle(true);
    expect(await disableBilling(fetchImpl, 'my-project')).toBe('disabled');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('https://cloudbilling.googleapis.com/v1/projects/my-project/billingInfo');
    expect(JSON.parse(put.body!)).toEqual({ billingAccountName: '' });
  });

  it('does nothing when billing is already off, and fails loudly when Google refuses', async () => {
    const off = fakeGoogle(false);
    expect(await disableBilling(off.fetchImpl, 'p')).toBe('already');
    expect(off.calls.some((c) => c.method === 'PUT')).toBe(false);
    await expect(disableBilling(fakeGoogle(true, 403).fetchImpl, 'p')).rejects.toThrow('403');
  });
});
