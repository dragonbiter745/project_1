import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getFirebaseApp, shouldUseEmulators } from './app';

let functions: Functions | null = null;

export function getFunctionsClient(): Functions {
  if (functions) return functions;
  functions = getFunctions(getFirebaseApp(), 'asia-south1');
  if (shouldUseEmulators()) {
    try {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    } catch {
      // already connected during HMR
    }
  }
  return functions;
}

export { httpsCallable } from 'firebase/functions';
export type { HttpsCallable } from 'firebase/functions';
