/**
 * Stands in for Razorpay's checkout.js in the browser: "opens" the window and immediately reports a
 * successful payment, signed the way Razorpay signs it (HMAC-SHA256 of "order_id|payment_id" with the key
 * secret, hex). Use as `await page.addInitScript(razorpayMock)`; Playwright serialises it, so it must stay
 * self-contained. The secret is the local emulator's placeholder, see RAZORPAY_KEY_SECRET in functions/.env.local.
 *
 * The emulator cannot read the payment back (see the stand-in in functions/src/lib/razorpay.ts), so
 * verifyPayment answers "not settled yet" and the test's signed webhook is what marks the order paid.
 */
export function razorpayMock(): void {
  const KEY_SECRET = 'rzp_test_placeholder_secret';
  (window as any).Razorpay = class {
    constructor(private options: any) {}
    on(): void {}
    open(): void {
      const enc = new TextEncoder();
      const paymentId = 'pay_e2e';
      crypto.subtle
        .importKey('raw', enc.encode(KEY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        .then((key) => crypto.subtle.sign('HMAC', key, enc.encode(`${this.options.order_id}|${paymentId}`)))
        .then((sig) => {
          const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
          this.options.handler({ razorpay_order_id: this.options.order_id, razorpay_payment_id: paymentId, razorpay_signature: hex });
        });
    }
  };
}
