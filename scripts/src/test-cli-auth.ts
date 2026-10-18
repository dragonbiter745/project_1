import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Firestore } from '@google-cloud/firestore';
import { OAuth2Client } from 'google-auth-library';

function getCliOAuthClient() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const tokens = cfg.tokens;

  const auth = new OAuth2Client();
  auth.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  return auth;
}

async function run() {
  try {
    const auth = getCliOAuthClient();
    const db = new Firestore({
      projectId: 'reva-nest-foodcourt',
      databaseId: 'default',
      authClient: auth as any,
    });

    console.log('Testing Firestore write via CLI OAuth...');
    await db.collection('venues').doc('venue-reva').set({
      name: 'REVA Food Court',
      timezone: 'Asia/Kolkata',
      taxConfig: { gstPct: 5, taxInclusive: true },
      sessionTtlMin: 180,
    });
    console.log('SUCCESS! Successfully wrote venue-reva to Firestore default database!');
  } catch (err: any) {
    console.error('Test error:', err?.message || err);
  }
}

run();
