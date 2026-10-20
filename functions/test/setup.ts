process.env.GCLOUD_PROJECT ||= 'demo-foodcourt';
process.env.CASHFREE_APP_ID = 'test-app-id';
process.env.CASHFREE_SECRET_KEY = 'test-secret-key';
process.env.CASHFREE_ENV = 'SANDBOX';
process.env.CUSTOMER_URL = 'https://order.example.test';
// Admin Auth calls (deleteUser, verifyIdToken) must never reach the real project from a test run.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run tests through `pnpm test` so the Firestore emulator is running.');
