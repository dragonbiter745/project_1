import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 4001;
const ROOT_DIR = fs.existsSync(path.resolve(process.cwd(), 'docs'))
  ? process.cwd()
  : path.resolve(process.cwd(), '..');
const STATE_FILE = path.resolve(ROOT_DIR, '.dev_state.json');

// Dynamically load environment variables from local gitignored env file if present
const envFile = path.resolve(ROOT_DIR, 'functions/.env');
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf8');
  envContent.split('\n').forEach((line) => {
    const [k, ...v] = line.trim().split('=');
    if (k && v.length && !process.env[k]) {
      process.env[k] = v.join('=');
    }
  });
}

// Clients for Server-Sent Events (SSE)
const sseClients: http.ServerResponse[] = [];

// Load initial state or persisted state
function loadState(): any {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading dev state:', err);
  }

  // Pre-seed with full venue and menus
  try {
    const rmMenu = JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, 'docs/menus/roll-me.json'), 'utf8'));
    const svMenu = JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, 'docs/menus/siddi-vinayaka.json'), 'utf8'));

    return {
      venue: {
        id: 'venue-reva',
        name: 'REVA Food Court',
        timezone: 'Asia/Kolkata',
        taxConfig: { gstPct: 5, taxInclusive: true },
        sessionTtlMin: 180,
      },
      vendors: [
        {
          id: 'vendor-roll-me',
          name: 'Roll Me',
          code: 'RM',
          status: 'active',
          acceptingOrders: true,
          defaultPrepMin: 12,
          fulfilmentMode: 'pickup',
          acceptSlaSec: 180,
          feePct: 3,
          perOrderFeePaise: 100,
          hours: { open: '09:00', close: '22:00' },
        },
        {
          id: 'vendor-siddi-vinayaka',
          name: 'Siddi Vinayaka Garden',
          code: 'SV',
          status: 'active',
          acceptingOrders: true,
          defaultPrepMin: 10,
          fulfilmentMode: 'pickup',
          acceptSlaSec: 180,
          feePct: 3,
          perOrderFeePaise: 100,
          hours: { open: '08:00', close: '21:30' },
        },
      ],
      menus: {
        'vendor-roll-me': rmMenu,
        'vendor-siddi-vinayaka': svMenu,
      },
      availability: {
        'vendor-roll-me': { vendorId: 'vendor-roll-me', unavailable: {}, updatedAt: Date.now() },
        'vendor-siddi-vinayaka': { vendorId: 'vendor-siddi-vinayaka', unavailable: {}, updatedAt: Date.now() },
      },
      tables: [
        { id: 'tbl-1', code: 'T14', label: 'T-14', zone: 'Central Courtyard', active: true },
        { id: 'tbl-2', code: 'T15', label: 'T-15', zone: 'Central Courtyard', active: true },
        { id: 'tbl-3', code: 'T01', label: 'T-01', zone: 'Terrace Garden', active: true },
        { id: 'tbl-4', code: 'T02', label: 'T-02', zone: 'Terrace Garden', active: true },
      ],
      sessions: {},
      orders: {},
      subOrders: {},
      users: {},
      pointsLedger: {},
      config: {
        pointsPerRupee: 0.1,
        pointsExpiryDays: 90,
        gstPct: 5,
        taxInclusive: true,
        platformFeePaise: 0,
        flags: {
          paymentsEnabled: true,
          loyaltyEnabled: true,
          maintenance: false,
        },
      },
      dailyCounter: {},
      vendorCounters: {},
    };
  } catch (e) {
    console.error('Error pre-seeding initial dev state', e);
  }

  return {};
}

function saveState(state: any) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving dev state:', err);
  }
}

let currentState = loadState();

const server = http.createServer((req, res) => {
  // Enable CORS for all ports (5173, 5174, 5175)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // SSE Stream endpoint
  if (req.url === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    sseClients.push(res);
    // Send current state immediately on connect
    if (currentState) {
      res.write(`data: ${JSON.stringify({ type: 'INIT', state: currentState })}\n\n`);
    }

    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  // Get state endpoint
  if (req.method === 'GET' && req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(currentState || {}));
    return;
  }

  // Mutate state endpoint
  if (req.method === 'POST' && req.url === '/api/mutate') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        currentState = payload;
        saveState(currentState);

        // Broadcast to all connected apps (5173, 5174, 5175)
        const eventData = `data: ${JSON.stringify({ type: 'STATE_UPDATED', state: currentState })}\n\n`;
        sseClients.forEach((client) => {
          client.write(eventData);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Create Cashfree Sandbox Order
  if (req.method === 'POST' && req.url === '/api/cashfree/create-order') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const orderId = payload.orderId || `ord_${Date.now()}`;
        const amount = payload.amount || 100;
        const phone = payload.customerPhone || '9876543210';
        const name = payload.customerName || 'Demo Diner';

        const appId = process.env.CASHFREE_APP_ID || '';
        const secret = process.env.CASHFREE_SECRET_KEY || '';

        const cfRes = await fetch('https://sandbox.cashfree.com/pg/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': appId,
            'x-client-secret': secret,
            'x-api-version': '2023-08-01',
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
        res.writeHead(cfRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cfData));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`📡 FoodCourt Real-time Dev Sync Server active on http://localhost:${PORT}`);
});
