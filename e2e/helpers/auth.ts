import admin from 'firebase-admin';

export function getAdminAuth() {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'demo-foodcourt' });
  }
  return admin.auth();
}
