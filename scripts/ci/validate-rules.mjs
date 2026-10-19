// Compiles Firestore and Storage rules by loading them into the running emulators, which
// reject invalid rules with 400 and line/column details. Merely starting the emulators does
// not validate rules, so this must run inside `firebase emulators:exec`.
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
const project = process.env.GCLOUD_PROJECT || 'demo-foodcourt';

const firestoreRules = (Array.isArray(config.firestore) ? config.firestore[0] : config.firestore)?.rules;
const storageRules = (Array.isArray(config.storage) ? config.storage[0] : config.storage)?.rules;

const checks = [];
if (firestoreRules) {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? `127.0.0.1:${config.emulators?.firestore?.port ?? 8080}`;
  checks.push({
    label: 'Firestore',
    file: firestoreRules,
    url: `http://${host}/emulator/v1/projects/${project}:securityRules`,
  });
}
if (storageRules) {
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? `127.0.0.1:${config.emulators?.storage?.port ?? 9199}`;
  checks.push({ label: 'Storage', file: storageRules, url: `http://${host}/internal/setRules` });
}

let failed = false;
for (const { label, file, url } of checks) {
  const content = readFileSync(file, 'utf8');
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: file, content }] } }),
  });
  if (res.ok) {
    console.log(`✔ ${label} rules compile (${file})`);
  } else {
    failed = true;
    console.error(`::error file=${file}::${label} rules failed to compile (HTTP ${res.status})`);
    console.error(await res.text());
  }
}

if (checks.length === 0) {
  console.error('::error::No rules files found in firebase.json');
  process.exit(1);
}
process.exit(failed ? 1 : 0);
