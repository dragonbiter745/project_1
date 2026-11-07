// Setup for the real-Firestore load run (`pnpm load:real`): same fakes as setup.ts, but no emulator is required.
process.env.RAZORPAY_KEY_ID = 'rzp_test_unit';
process.env.RAZORPAY_KEY_SECRET = 'test-key-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.CUSTOMER_URL = 'https://order.example.test';
if (!process.env.LOADTEST_DATABASE || process.env.LOADTEST_DATABASE === 'default') throw new Error('Refusing to run: LOADTEST_DATABASE must name a throwaway database, never "default".');
const { setPushSender } = await import('../src/lib/push');
setPushSender(async () => {
  throw new Error('Real push sending is disabled in tests');
});
