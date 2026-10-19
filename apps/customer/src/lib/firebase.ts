import type { HttpsCallable } from '@foodcourt/firebase-client/functions';

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

export async function getCallable<Req, Res>(name: string): Promise<HttpsCallable<Req, Res>> {
  const [{ getFunctionsClient, httpsCallable }] = await Promise.all([
    import('@foodcourt/firebase-client/functions'),
    ensureAnonymousUser(),
  ]);
  return httpsCallable<Req, Res>(getFunctionsClient(), name);
}
