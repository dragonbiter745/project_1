import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { generateFoodCourtTables } from '@foodcourt/shared';
import * as fs from 'fs';
import * as path from 'path';
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
  projectId: process.env.GCLOUD_PROJECT || 'reva-nest-foodcourt',
}))!;

const db = getFirestore(app, 'default');

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
    await db.collection('availability').doc(v.id).set({
      vendorId: v.id,
      unavailable: {},
      updatedAt: Date.now(),
    });
  }
  console.log('✔ Vendors & Availability seeded');

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
    batch.set(db.collection('tables').doc(t.id), t);
  }
  await batch.commit();
  console.log(`✔ ${tables.length} Tables seeded (95 4-seaters, 60 6-seaters)`);

  console.log('Seeding completed successfully!');
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
