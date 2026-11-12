import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { REGION } from './config';
import { clientIp, limitLocal } from './lib/guard';

const APPS = new Set(['customer', 'vendor', 'master', 'admin']);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Crash reports from the web apps (POST /api/client-error on each app's own site, so no CORS). Each one is
 * logged at ERROR with the message "Client error", which a log-based alert watches. Nothing is stored and
 * nothing personal is logged: the app name, the error, the page path and the browser.
 */
export const clientError = onRequest({ region: REGION, cors: false, maxInstances: 3, concurrency: 80, timeoutSeconds: 10, memory: '256MiB' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('');
    return;
  }
  try {
    // A broken page can loop; one browser gets a few reports a minute, the whole instance a few hundred.
    // Reached through Hosting, so the address may be a CDN edge shared by many people: keep the per-address cap loose.
    limitLocal(`client-error:${clientIp({ rawRequest: req as unknown as { headers?: Record<string, unknown>; ip?: string } })}`, 30, 60);
    limitLocal('client-error:all', 300, 60);
  } catch {
    res.status(204).send('');
    return;
  }
  let body: Record<string, unknown> = {};
  try {
    // CSP reports arrive as application/csp-report, which is left unparsed (a Buffer): read the raw body then.
    const parsed = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body);
    body = (parsed ? req.body : JSON.parse(req.rawBody?.toString('utf8') || '{}')) as Record<string, unknown>;
  } catch {
    res.status(204).send('');
    return;
  }
  // Browsers post Content-Security-Policy violations here (report-only for now). Logged as warnings so the
  // policy can be tightened before it is enforced, without paging anyone.
  const csp = body['csp-report'] as Record<string, unknown> | undefined;
  if (csp && typeof csp === 'object') {
    logger.warn('CSP violation', { directive: text(csp['violated-directive'] ?? csp['effective-directive'], 100), blocked: text(csp['blocked-uri'], 300), page: text(csp['document-uri'], 300) });
    res.status(204).send('');
    return;
  }
  const app = text(body.app, 20);
  const message = text(body.message, 500);
  if (!message) {
    res.status(204).send('');
    return;
  }
  logger.error('Client error', { app: APPS.has(app) ? app : 'unknown', error: message, stack: text(body.stack, 2000), path: text(body.url, 200), ua: text(body.ua, 200) });
  res.status(204).send('');
});
