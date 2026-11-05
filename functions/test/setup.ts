process.env.GCLOUD_PROJECT ||= 'demo-foodcourt';
process.env.RAZORPAY_KEY_ID = 'rzp_test_unit';
process.env.RAZORPAY_KEY_SECRET = 'test-key-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.CUSTOMER_URL = 'https://order.example.test';
// Admin Auth calls (deleteUser, verifyIdToken) must never reach the real project from a test run.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// No test may send a real push; tests that check pushes install their own fake.
const { setPushSender } = await import('../src/lib/push');
setPushSender(async () => {
  throw new Error('Real push sending is disabled in tests');
});
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run tests through `pnpm test` so the Firestore emulator is running.');
