import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { URLS } from '../helpers/constants';

test.describe('Journey G: Backend Health & Rules Audit', () => {
  test('Firestore security rules: unauthenticated direct reads on orders are denied', async () => {
    const res = await fetch(`${URLS.firestore}/v1/projects/demo-foodcourt/databases/default/documents/orders/any-doc`);
    expect(res.status).toBe(403);
  });

  test('Firestore security rules: client direct writes to orders are denied', async () => {
    const res = await fetch(`${URLS.firestore}/v1/projects/demo-foodcourt/databases/default/documents/orders/fake-order`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { status: { stringValue: 'PAID' } } }),
    });
    expect(res.status).toBe(403);
  });

  test('Customer app bundle budget: initial entrypoint chunk ≤ 150 KB gzipped', async () => {
    const distDir = path.resolve(__dirname, '../../apps/customer/dist/assets');
    if (!fs.existsSync(distDir)) {
      test.skip();
      return;
    }

    const files = fs.readdirSync(distDir);
    const mainJsFile = files.find((f) => f.startsWith('index-') && f.endsWith('.js'));
    expect(mainJsFile).toBeTruthy();

    const content = fs.readFileSync(path.join(distDir, mainJsFile!));
    const gzipped = zlib.gzipSync(content);
    const sizeKb = gzipped.length / 1024;

    console.log(`Initial customer JS bundle (${mainJsFile}): ${sizeKb.toFixed(2)} KB gzipped`);
    expect(sizeKb).toBeLessThanOrEqual(150);
  });
});

