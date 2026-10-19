// Fails CI when an app's initial load (entry JS, its preloaded chunks and CSS)
// exceeds the PRD §5 budget. Lazy chunks are excluded: they are not on the first paint.
import { appendFileSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2] ?? 'apps/customer/dist';
const budgetKb = Number(process.env.BUNDLE_BUDGET_KB ?? 150);
const warnKb = Number(process.env.BUNDLE_WARN_KB ?? budgetKb * 0.8);
const app = basename(dirname(dist));

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = [...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];

if (assets.length === 0) {
  console.error(`No JS/CSS assets referenced from ${dist}/index.html`);
  process.exit(1);
}

const rows = assets.map((asset) => ({
  asset,
  kb: gzipSync(readFileSync(join(dist, asset)), { level: 9 }).length / 1024,
}));
const totalKb = rows.reduce((sum, r) => sum + r.kb, 0);

for (const r of rows) console.log(`${r.kb.toFixed(1).padStart(7)} KB  ${r.asset}`);
console.log(`${totalKb.toFixed(1).padStart(7)} KB  total (budget ${budgetKb} KB gz)`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `### ${app} initial bundle (gzip)`,
    '',
    '| Asset | KB |',
    '| --- | ---: |',
    ...rows.map((r) => `| \`${r.asset}\` | ${r.kb.toFixed(1)} |`),
    `| **Total** (budget ${budgetKb}) | **${totalKb.toFixed(1)}** |`,
    '',
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}

if (totalKb > budgetKb) {
  console.error(`::error::${app} initial bundle is ${totalKb.toFixed(1)} KB gz, over the ${budgetKb} KB budget.`);
  process.exit(1);
}
if (totalKb > warnKb) {
  console.log(`::warning::${app} initial bundle is ${totalKb.toFixed(1)} KB gz, approaching the ${budgetKb} KB budget.`);
}
