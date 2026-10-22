import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirebaseApp, shouldUseEmulators } from './app';

let auth: Auth | null = null;

export function getAuthClient(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  if (shouldUseEmulators()) {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099');
    } catch {
      // already connected during HMR
    }
  }
  return auth;
}

export {
  signInAnonymously,
  onAuthStateChanged,
  GoogleAuthProvider,
  linkWithPopup,
  linkWithCredential,
  signInWithCredential,
  EmailAuthProvider,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  type User,
} from 'firebase/auth';
