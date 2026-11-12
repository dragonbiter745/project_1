import { Component, type ErrorInfo, type ReactNode } from 'react';

// Crash reporting without a vendor SDK (the diner app has a 150 KB budget): errors are posted to
// /api/client-error on the app's own site, which logs them at ERROR so the same alerting that watches the
// backend sees them. Capped per page so a render loop cannot flood it, and it never throws.

let app = 'unknown';
let sent = 0;
const MAX_PER_PAGE = 5;
const seen = new Set<string>();

/** Sends one error report. Duplicates and anything past the per-page cap are dropped. */
export function reportClientError(error: unknown, context?: string): void {
  try {
    const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
    const message = `${context ? `${context}: ` : ''}${e.message}`.slice(0, 500);
    if (seen.has(message) || sent >= MAX_PER_PAGE) return;
    seen.add(message);
    sent++;
    const body = JSON.stringify({ app, message, stack: (e.stack ?? '').slice(0, 2000), url: window.location.pathname.slice(0, 200), ua: navigator.userAgent.slice(0, 200) });
    // sendBeacon survives the page being closed; fetch with keepalive is the fallback.
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/client-error', blob)) void fetch('/api/client-error', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => undefined);
  } catch {
    /* reporting must never break the page */
  }
}

/** Call once at start-up: catches errors that escape React (event handlers, promises, scripts). */
export function installErrorReporting(appName: string): void {
  app = appName;
  window.addEventListener('error', (ev) => {
    // Resource load failures (an image, an extension's script) carry no error object; they are not app bugs.
    if (ev.error) reportClientError(ev.error, 'window');
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason as { code?: string } | undefined;
    // Callable errors are expected answers (a sold-out dish, no network) and are shown to the person already.
    if (typeof reason?.code === 'string' && reason.code.startsWith('functions/')) return;
    reportClientError(ev.reason, 'promise');
  });
}

interface BoundaryState {
  failed: boolean;
}

/**
 * Last line of defence for a render crash: instead of a blank white page the person gets a short note and a
 * reload button, and the crash is reported. Their cart and session live in storage, so a reload keeps them.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError(error, `render${info.componentStack ? ` at ${info.componentStack.trim().split('\n')[0]?.trim()}` : ''}`);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#faf8f4', color: '#1a1a1a' }}>
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <p style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>Something went wrong</p>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 20px', color: '#555' }}>Reload to carry on. Your cart and any order you placed are safe.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ font: 'inherit', fontWeight: 600, padding: '12px 24px', borderRadius: 999, border: 0, background: '#1a1a1a', color: '#fff', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
