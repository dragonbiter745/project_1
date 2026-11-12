import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from 'firebase-functions/v2';
import { clientError } from '../src/clientError';
import { resetLocalLimits } from '../src/lib/guard';
import { webhookCall } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
  resetLocalLimits();
});

describe('client crash reports', () => {
  it('logs a crash at ERROR under one message the alert watches, with no personal data', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const res = await webhookCall(clientError as never, { app: 'customer', message: 'Cannot read properties of undefined', stack: 'at Cart', url: '/t/abc', ua: 'Mobile Safari' }, {});
    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledWith('Client error', expect.objectContaining({ app: 'customer', error: 'Cannot read properties of undefined', path: '/t/abc' }));
  });

  it('ignores empty reports, unknown apps are labelled, and a looping page is capped', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    await webhookCall(clientError as never, { app: 'customer' }, {});
    expect(spy).not.toHaveBeenCalled();
    await webhookCall(clientError as never, { app: 'evil', message: 'x'.repeat(5000) }, {});
    expect(spy).toHaveBeenLastCalledWith('Client error', expect.objectContaining({ app: 'unknown', error: 'x'.repeat(500) }));
    for (let i = 0; i < 50; i++) await webhookCall(clientError as never, { app: 'vendor', message: `loop ${i}` }, {});
    expect(spy.mock.calls.length).toBeLessThanOrEqual(30);
  });
});
