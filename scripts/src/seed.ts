import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
  const rollMePath = path.join(docsDir, 'roll-me.json');
  const siddiPath = path.join(docsDir, 'siddi-vinayaka.json');

  if (fs.existsSync(rollMePath)) {
    const rmMenu = JSON.parse(fs.readFileSync(rollMePath, 'utf8'));
    await db.collection('menus').doc('vendor-roll-me').set(rmMenu);
  }

  if (fs.existsSync(siddiPath)) {
    const svMenu = JSON.parse(fs.readFileSync(siddiPath, 'utf8'));
    await db.collection('menus').doc('vendor-siddi-vinayaka').set(svMenu);
  }
  console.log('✔ Menus seeded from Appendix A');

  // 5. Tables & QR codes
  const tables = [
    { id: 'tbl-1', code: 'T14', label: 'T-14', zone: 'Central Courtyard', active: true },
    { id: 'tbl-2', code: 'T15', label: 'T-15', zone: 'Central Courtyard', active: true },
    { id: 'tbl-3', code: 'T01', label: 'T-01', zone: 'Terrace Garden', active: true },
    { id: 'tbl-4', code: 'T02', label: 'T-02', zone: 'Terrace Garden', active: true },
  ];

  for (const t of tables) {
    await db.collection('tables').doc(t.id).set(t);
  }
  console.log('✔ Tables seeded');

  console.log('Seeding completed successfully!');
}

runSeed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
