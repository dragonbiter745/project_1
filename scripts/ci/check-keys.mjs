// Live Razorpay keys only on the production project; test keys everywhere else. Stops a staging deploy (or a
// mistyped --project) from taking real money, and production from running with test keys by accident.
import { readFileSync, existsSync } from 'node:fs';
const project = process.argv[2] || process.env.FIREBASE_PROJECT_ID;
const PROD = 'reva-nest-foodcourt';
if (!project) {
  console.error('::error::No project given to check-keys.');
  process.exit(1);
}
const file = `functions/.env.${project}`;
const env = existsSync(file) ? readFileSync(file, 'utf8') : '';
const key = /^RAZORPAY_KEY_ID=(.*)$/m.exec(env)?.[1]?.trim() ?? '';
const live = key.startsWith('rzp_live_');
if (project === PROD && !live) {
  console.error(`::error::${file} must use a rzp_live_ key for production.`);
  process.exit(1);
}
if (project !== PROD && live) {
  console.error(`::error::${file} uses a live Razorpay key on a non-production project. Use a rzp_test_ key.`);
  process.exit(1);
}
console.log(`Razorpay key mode matches ${project}.`);
