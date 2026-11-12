import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { REGION, projectId } from '../config';

// Every diner starts as an anonymous Firebase account, and a campus shares a handful of public addresses.
// Firebase's default allows 100 new accounts per address per hour, which a lunch rush on campus Wi-Fi
// exceeds; diners then cannot open the app at all. Firebase allows a raised quota for at most 7 days at a
// time, so this renews it every Monday and Thursday, before the current window can lapse.

const QUOTA_PER_HOUR = '5000';
const WINDOW_SECONDS = 7 * 86_400;
const METADATA_TOKEN = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

export async function renewQuota(fetchImpl: typeof fetch = fetch, project = projectId(), now = Date.now()): Promise<string> {
  const tokenRes = await fetchImpl(METADATA_TOKEN, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!tokenRes.ok) throw new Error(`No access token (${tokenRes.status})`);
  const token = ((await tokenRes.json()) as { access_token: string }).access_token;
  const startTime = new Date(now + 60_000).toISOString();
  const res = await fetchImpl(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config?updateMask=quota.signUpQuotaConfig`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': project },
    body: JSON.stringify({ quota: { signUpQuotaConfig: { quota: QUOTA_PER_HOUR, startTime, quotaDuration: `${WINDOW_SECONDS}s` } } }),
  });
  if (!res.ok) throw new Error(`Quota renewal refused (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return startTime;
}

export const renewSignupQuota = onSchedule({ schedule: '0 4 * * 1,4', timeZone: 'Asia/Kolkata', region: REGION, timeoutSeconds: 60, maxInstances: 1, retryCount: 3 }, async () => {
  try {
    const from = await renewQuota();
    logger.info('Sign-up quota renewed', { from, perHour: QUOTA_PER_HOUR });
  } catch (err) {
    // ERROR so the function-error alert fires: without the raised quota, campus diners can be locked out at lunch.
    logger.error('Sign-up quota renewal failed', { err: (err as Error).message });
    throw err;
  }
});
