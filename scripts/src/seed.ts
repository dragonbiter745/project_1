import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { generateFoodCourtTables, type Coupon } from '@foodcourt/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(__dirname, '../../service-account.json');
let credentialOption;
if (fs.existsSync(serviceAccountPath)) {
  const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  credentialOption = cert(sa);
}

const app = (getApps()[0] || initializeApp({
  ...(credentialOption ? { credential: credentialOption } : {}),
  projectId: process.env.GCLOUD_PROJECT || 'demo-foodcourt',
}))!;

const db = getFirestore(app, 'default');
const auth = getAuth(app);

async function runSeed() {
  console.log('Seeding FoodCourt initial data...');

  // 1. Venue
  const venueRef = db.collection('venues').doc('venue-reva');
  await venueRef.set({
    name: 'REVA Food Court',
    timezone: 'Asia/Kolkata',
    taxConfig: { gstPct: 5, taxInclusive: true },
    sessionTtlMin: 180,
  });
  console.log('✔ Venue seeded');

  // 2. Global Config
  const configRef = db.collection('config').doc('global');
  await configRef.set({
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
  });
  console.log('✔ Global config seeded');

  // 3. Vendors
  const vendors = [
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
      hours: { open: '07:00', close: '21:00' },
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
      hours: { open: '07:00', close: '21:00' },
    },
    // Sweet Cravings, Basil and Yash Fruit Juice & Icecream Corner. The platform charge is ₹1 per order and no percentage; hours are 07:00 to 21:00.
    {
      id: 'vendor-sweet-cravings',
      name: 'Sweet Cravings',
      code: 'SC',
      status: 'active',
      acceptingOrders: true,
      defaultPrepMin: 5,
      fulfilmentMode: 'pickup',
      acceptSlaSec: 180,
      feePct: 0,
      perOrderFeePaise: 100,
      hours: { open: '07:00', close: '21:00' },
    },
    {
      id: 'vendor-basil',
      name: 'Basil',
      code: 'BA',
      status: 'active',
      acceptingOrders: true,
      defaultPrepMin: 8,
      fulfilmentMode: 'pickup',
      acceptSlaSec: 180,
      feePct: 0,
      perOrderFeePaise: 100,
      hours: { open: '07:00', close: '21:00' },
    },
    {
      id: 'vendor-yash-fruit-juice',
      name: 'Yash Fruit Juice & Icecream Corner',
      code: 'YF',
      status: 'active',
      acceptingOrders: true,
      defaultPrepMin: 8,
      fulfilmentMode: 'pickup',
      acceptSlaSec: 180,
      feePct: 0,
      perOrderFeePaise: 100,
      hours: { open: '07:00', close: '21:00' },
    },
  ];

  for (const v of vendors) {
    await db.collection('vendors').doc(v.id).set(v);
    const unavailable: Record<string, boolean> = {};
    if (v.id === 'vendor-roll-me') {
      // Out of stock item for testing Journey A
      unavailable['rm-feat-2'] = true;
    }
    await db.collection('availability').doc(v.id).set({
      vendorId: v.id,
      unavailable,
      updatedAt: Date.now(),
    });
  }
  console.log('✔ Vendors & Availability seeded (including rm-feat-2 out of stock)');

  // 4. Menus from docs/menus/*.json
  const docsDir = path.resolve(__dirname, '../../docs/menus');
  const menuFiles: Record<string, string> = {
    'vendor-roll-me': 'roll-me.json',
    'vendor-siddi-vinayaka': 'siddi-vinayaka.json',
    'vendor-sweet-cravings': 'sweet-cravings.json',
    'vendor-basil': 'basil.json',
    'vendor-yash-fruit-juice': 'yash-fruit-juice.json',
  };
  for (const [vendorId, file] of Object.entries(menuFiles)) {
    const menuPath = path.join(docsDir, file);
    if (fs.existsSync(menuPath)) await db.collection('menus').doc(vendorId).set(JSON.parse(fs.readFileSync(menuPath, 'utf8')));
  }
  console.log('✔ Menus seeded from Appendix A');

  // 5. Tables & QR codes (95 4-seaters + 60 6-seaters = 155 tables)
  const tables = generateFoodCourtTables();
  const batch = db.batch();
  for (const t of tables) {
    const qrToken = t.code === 'T14' ? 'Q7xk2PqM9vR4tLw8nB3ydA' : crypto.randomBytes(16).toString('base64url');
    batch.set(db.collection('tables').doc(t.id), { ...t, qrToken, qrUpdatedAt: Date.now() });
  }
  await batch.commit();
  console.log(`✔ ${tables.length} Tables seeded (95 4-seaters, 60 6-seaters) with QR tokens`);

  // 6. Coupons
  const now = Date.now();
  const coupons: Coupon[] = [
    {
      code: 'PERCENT10',
      title: '10% Off Orders',
      description: 'Get 10% off your entire order up to ₹50',
      kind: 'PERCENT',
      percentBps: 1000,
      maxDiscountPaise: 5000,
      minOrderPaise: 10000,
      scope: { kind: 'ALL' },
      audience: 'EVERYONE',
      firstOrderOnly: false,
      showInWallet: true,
      startsAt: now - 3600000,
      endsAt: now + 86400000,
      totalLimit: 100,
      perCustomerLimit: 5,
      active: true,
      usedCount: 0,
      discountGivenPaise: 0,
      createdAt: now,
      createdBy: 'seed',
      updatedAt: now,
    },
    {
      code: 'FLAT50',
      title: 'Flat ₹50 Off',
      description: 'Flat ₹50 off on orders above ₹100',
      kind: 'FLAT',
      flatPaise: 5000,
      minOrderPaise: 10000,
      scope: { kind: 'ALL' },
      audience: 'EVERYONE',
      firstOrderOnly: false,
      showInWallet: true,
      startsAt: now - 3600000,
      endsAt: now + 86400000,
      totalLimit: 100,
      perCustomerLimit: 5,
      active: true,
      usedCount: 0,
      discountGivenPaise: 0,
      createdAt: now,
      createdBy: 'seed',
      updatedAt: now,
    },
    {
      code: 'EXPIRED',
      title: 'Expired Coupon',
      description: 'Already expired',
      kind: 'FLAT',
      flatPaise: 2000,
      minOrderPaise: 5000,
      scope: { kind: 'ALL' },
      audience: 'EVERYONE',
      firstOrderOnly: false,
      showInWallet: false,
      startsAt: now - 7200000,
      endsAt: now - 3600000,
      totalLimit: 100,
      perCustomerLimit: 5,
      active: true,
      usedCount: 0,
      discountGivenPaise: 0,
      createdAt: now - 7200000,
      createdBy: 'seed',
      updatedAt: now - 7200000,
    },
    {
      code: 'MAXED',
      title: 'Use Limit Reached',
      description: 'Total limit reached',
      kind: 'FLAT',
      flatPaise: 2000,
      minOrderPaise: 5000,
      scope: { kind: 'ALL' },
      audience: 'EVERYONE',
      firstOrderOnly: false,
      showInWallet: false,
      startsAt: now - 3600000,
      endsAt: now + 86400000,
      totalLimit: 5,
      perCustomerLimit: 5,
      active: true,
      usedCount: 5,
      discountGivenPaise: 10000,
      createdAt: now,
      createdBy: 'seed',
      updatedAt: now,
    },
    {
      code: 'MIN500',
      title: 'Big Order Discount',
      description: 'Orders above ₹500 only',
      kind: 'FLAT',
      flatPaise: 5000,
      minOrderPaise: 50000,
      scope: { kind: 'ALL' },
      audience: 'EVERYONE',
      firstOrderOnly: false,
      showInWallet: false,
      startsAt: now - 3600000,
      endsAt: now + 86400000,
      totalLimit: 100,
      perCustomerLimit: 5,
      active: true,
      usedCount: 0,
      discountGivenPaise: 0,
      createdAt: now,
      createdBy: 'seed',
      updatedAt: now,
    },
    {
      code: 'ROLLMEONLY',
      title: 'Roll Me Exclusive',
      description: 'Valid only on Roll Me items',
      kind: 'FLAT',
      flatPaise: 3000,
      minOrderPaise: 5000,
      scope: { kind: 'VENDORS', vendorIds: ['vendor-roll-me'] },
      audience: 'EVERYONE',
      firstOrderOnly: false,
      showInWallet: true,
      startsAt: now - 3600000,
      endsAt: now + 86400000,
      totalLimit: 100,
      perCustomerLimit: 5,
      active: true,
      usedCount: 0,
      discountGivenPaise: 0,
      createdAt: now,
      createdBy: 'seed',
      updatedAt: now,
    },
    {
      code: 'ONCEPERDINER',
      title: 'Single Use Per Person',
      description: 'One use per customer',
      kind: 'FLAT',
      flatPaise: 2000,
      minOrderPaise: 5000,
      scope: { kind: 'ALL' },
      audience: 'EVERYONE',
      firstOrderOnly: false,
      showInWallet: true,
      startsAt: now - 3600000,
      endsAt: now + 86400000,
      totalLimit: 100,
      perCustomerLimit: 1,
      active: true,
      usedCount: 0,
      discountGivenPaise: 0,
      createdAt: now,
      createdBy: 'seed',
      updatedAt: now,
    },
  ];

  for (const c of coupons) {
    await db.collection('coupons').doc(c.code).set(c);
  }
  console.log(`✔ ${coupons.length} Test coupons seeded`);

  // 7. Auth users for Kitchen, Shop Owners, Master
  const staffAccounts = [
    { email: 'master@foodcourt.local', password: 'password123', claims: { role: 'master' }, displayName: 'Master Admin' },
    { email: 'kitchen-rm@foodcourt.local', password: 'password123', claims: { role: 'vendorStaff', vendorId: 'vendor-roll-me' }, displayName: 'Roll Me Kitchen' },
    { email: 'owner-rm@foodcourt.local', password: 'password123', claims: { role: 'vendorAdmin', vendorId: 'vendor-roll-me' }, displayName: 'Roll Me Owner' },
    { email: 'kitchen-sv@foodcourt.local', password: 'password123', claims: { role: 'vendorStaff', vendorId: 'vendor-siddi-vinayaka' }, displayName: 'SV Kitchen' },
    { email: 'owner-sv@foodcourt.local', password: 'password123', claims: { role: 'vendorAdmin', vendorId: 'vendor-siddi-vinayaka' }, displayName: 'SV Owner' },
    { email: 'kitchen-sc@foodcourt.local', password: 'password123', claims: { role: 'vendorStaff', vendorId: 'vendor-sweet-cravings' }, displayName: 'Sweet Cravings Kitchen' },
    { email: 'owner-sc@foodcourt.local', password: 'password123', claims: { role: 'vendorAdmin', vendorId: 'vendor-sweet-cravings' }, displayName: 'Sweet Cravings Owner' },
    { email: 'kitchen-ba@foodcourt.local', password: 'password123', claims: { role: 'vendorStaff', vendorId: 'vendor-basil' }, displayName: 'Basil Kitchen' },
    { email: 'owner-ba@foodcourt.local', password: 'password123', claims: { role: 'vendorAdmin', vendorId: 'vendor-basil' }, displayName: 'Basil Owner' },
    { email: 'kitchen-yf@foodcourt.local', password: 'password123', claims: { role: 'vendorStaff', vendorId: 'vendor-yash-fruit-juice' }, displayName: 'Yash Kitchen' },
    { email: 'owner-yf@foodcourt.local', password: 'password123', claims: { role: 'vendorAdmin', vendorId: 'vendor-yash-fruit-juice' }, displayName: 'Yash Owner' },
  ];

  for (const account of staffAccounts) {
    let user;
    try {
      user = await auth.getUserByEmail(account.email);
      await auth.updateUser(user.uid, { password: account.password, displayName: account.displayName });
    } catch {
      user = await auth.createUser({ email: account.email, password: account.password, displayName: account.displayName });
    }
    await auth.setCustomUserClaims(user.uid, account.claims);
  }
  console.log(`✔ ${staffAccounts.length} Staff accounts seeded with custom claims`);

  // 8. Public Catalog cache (publicCatalog/data and publicCatalog/status)
  const activeVendors = vendors.map((v) => {
    const copy = { ...v } as any;
    delete copy.acceptingOrders;
    delete copy.hours;
    return copy;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const menusMap: Record<string, any> = {};
  for (const [vendorId, file] of Object.entries(menuFiles)) {
    const menuPath = path.join(docsDir, file);
    if (fs.existsSync(menuPath)) menusMap[vendorId] = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
  }

  const catalogVersion = 'v-seed-' + Date.now().toString(36);
  await db.collection('publicCatalog').doc('data').set({
    v: catalogVersion,
    builtAt: now,
    vendors: activeVendors,
    menus: menusMap,
  });

  const availMap: Record<string, any> = {};
  for (const v of vendors) {
    availMap[v.id] = {
      vendorId: v.id,
      unavailable: v.id === 'vendor-roll-me' ? { 'rm-feat-2': true } : {},
      updatedAt: now,
    };
  }

  const vendorsStatusMap: Record<string, any> = {};
  for (const v of vendors) {
    vendorsStatusMap[v.id] = { acceptingOrders: true };
  }

  await db.collection('publicCatalog').doc('status').set({
    v: catalogVersion,
    builtAt: now,
    vendors: vendorsStatusMap,
    availability: availMap,
    config: {
      pointsPerRupee: 0.1,
      pointsExpiryDays: 90,
      gstPct: 5,
      taxInclusive: true,
      platformFeePaise: 0,
      flags: { paymentsEnabled: true, loyaltyEnabled: true, maintenance: false },
    },
  });
  console.log('✔ Public catalog cache documents seeded');

  console.log('Seeding completed successfully!');
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
