import { onRequest } from 'firebase-functions/v2/https';

export const createCashfreeOrder = onRequest(
  {
    region: 'asia-south1',
    cors: true,
  },
  async (req, res) => {
    // Enable CORS headers explicitly
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const orderId = payload.orderId || `ord_${Date.now()}`;
      const amount = payload.amount || 100;
      const phone = payload.customerPhone || '9876543210';
      const name = payload.customerName || 'Demo Diner';

      const appId = process.env.CASHFREE_APP_ID || '';
      const secret = process.env.CASHFREE_SECRET_KEY || '';
      const env = process.env.CASHFREE_ENV || 'SANDBOX';
      const baseUrl = env === 'PRODUCTION' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';

      const cfRes = await fetch(`${baseUrl}/pg/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': appId,
          'x-client-secret': secret,
          'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
        },
        body: JSON.stringify({
          order_id: orderId,
          order_amount: amount,
          order_currency: 'INR',
          customer_details: {
            customer_id: `cust_${Date.now()}`,
            customer_phone: phone,
            customer_name: name,
          },
        }),
      });

      const cfData = await cfRes.json();
      res.status(cfRes.status).json(cfData);
    } catch (err: any) {
      console.error('Error creating Cashfree order:', err);
      res.status(500).json({ error: err.message });
    }
  }
);
