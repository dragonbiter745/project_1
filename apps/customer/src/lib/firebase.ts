import type { HttpsCallable } from '@foodcourt/firebase-client/functions';
import type { IssueInput } from '@foodcourt/firebase-client/issues';

let userPromise: Promise<string> | null = null;

// Firebase Auth is not needed to browse the menu, so it loads off the critical path.
export function ensureAnonymousUser(): Promise<string> {
  if (!userPromise) {
    userPromise = import('@foodcourt/firebase-client/auth').then(
      ({ getAuthClient, onAuthStateChanged, signInAnonymously }) =>
        new Promise<string>((resolve, reject) => {
          const auth = getAuthClient();
          const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
              unsubscribe();
              resolve(user.uid);
            } else {
              signInAnonymously(auth).catch((err: unknown) => {
                unsubscribe();
                reject(err);
              });
            }
          });
        })
    );
    userPromise.catch(() => {
      userPromise = null;
    });
  }
  return userPromise;
}

export function warmAuthWhenIdle(): void {
  const run = () => {
    ensureAnonymousUser().catch((err: unknown) => console.warn('Anonymous sign-in failed:', err));
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 1500);
  }
}

// Reasons as shown on the sheet, mapped to the codes the reportIssue function accepts.
const ISSUE_CODES: Record<string, string> = {
  'Wrong item': 'wrong_item',
  'Something is missing': 'missing_item',
  'Taking too long': 'wait',
  'Food quality': 'quality',
  'Something else': 'other',
};

// Reports go through a validated, rate-limited function; clients cannot write issues directly.
export async function reportIssue(input: IssueInput): Promise<string> {
  const fn = await getCallable<{ orderId: string; subOrderId?: string; reason: string; text?: string }, { issueId: string }>('reportIssue');
  const { data } = await fn({
    orderId: input.orderId,
    ...(input.subOrderId ? { subOrderId: input.subOrderId } : {}),
    reason: ISSUE_CODES[input.reason] ?? 'other',
    ...(input.text?.trim() ? { text: input.text.trim().slice(0, 600) } : {}),
  });
  return data.issueId;
}

export async function getCallable<Req, Res>(name: string): Promise<HttpsCallable<Req, Res>> {
  const [{ getFunctionsClient, httpsCallable }] = await Promise.all([
    import('@foodcourt/firebase-client/functions'),
    ensureAnonymousUser(),
  ]);
  return httpsCallable<Req, Res>(getFunctionsClient(), name);
}
