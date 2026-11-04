export const URLS = {
  customer: 'http://localhost:5173',
  vendor: 'http://localhost:5174',
  master: 'http://localhost:5175',
  admin: 'http://localhost:5176',
  landing: 'http://localhost:5186',
  functions: 'http://127.0.0.1:5001/demo-foodcourt/asia-south1',
  firestore: 'http://127.0.0.1:8080',
  auth: 'http://127.0.0.1:9099',
};

export const SEED_DATA = {
  qrToken: 'Q7xk2PqM9vR4tLw8nB3ydA', // Table T-14
  tableLabel: 'T-14',
  tableCode: 'T14',
  staff: {
    master: { email: 'master@foodcourt.local', password: 'password123', role: 'master' },
    kitchenRollMe: { email: 'kitchen-rm@foodcourt.local', password: 'password123', role: 'vendorStaff', vendorId: 'vendor-roll-me' },
    ownerRollMe: { email: 'owner-rm@foodcourt.local', password: 'password123', role: 'vendorAdmin', vendorId: 'vendor-roll-me' },
    kitchenSiddi: { email: 'kitchen-sv@foodcourt.local', password: 'password123', role: 'vendorStaff', vendorId: 'vendor-siddi-vinayaka' },
    ownerSiddi: { email: 'owner-sv@foodcourt.local', password: 'password123', role: 'vendorAdmin', vendorId: 'vendor-siddi-vinayaka' },
  },
  coupons: {
    validPercent: 'PERCENT10',
    validFlat: 'FLAT50',
    expired: 'EXPIRED',
    maxed: 'MAXED',
    minOrder: 'MIN500',
    shopOnly: 'ROLLMEONLY',
    oncePerDiner: 'ONCEPERDINER',
  },
};
