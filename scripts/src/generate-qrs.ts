import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { generateFoodCourtTables } from '@foodcourt/shared';

const BASE_URL = process.env.CUSTOMER_APP_URL || 'https://order.getqrave.in';
const rootDir = process.cwd().endsWith('scripts') ? path.resolve(process.cwd(), '..') : process.cwd();
const OUT_DIR = path.resolve(rootDir, 'generated-qrs');
const SVG_DIR = path.join(OUT_DIR, 'svg');

async function main() {
  console.log(`\n======================================================`);
  console.log(`Generating Table QR Codes for REVA Nest Food Court`);
  console.log(`Target URL: ${BASE_URL}/?table=T-XX`);
  console.log(`Output Directory: ${OUT_DIR}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(SVG_DIR)) {
    fs.mkdirSync(SVG_DIR, { recursive: true });
  }

  const tables = generateFoodCourtTables();
  console.log(`Found ${tables.length} tables to generate (95 4-seaters, 60 6-seaters)...`);

  const cardHtmlList: string[] = [];

  for (const table of tables) {
    const tableUrl = `${BASE_URL}/?table=${encodeURIComponent(table.label)}`;

    // Generate crisp vector SVG
    const svgString = await QRCode.toString(tableUrl, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H', // High error correction for fast camera scan
    });

    // Save individual SVG file
    const svgFileName = `${table.label}_${table.capacity}Seater.svg`;
    fs.writeFileSync(path.join(SVG_DIR, svgFileName), svgString, 'utf-8');

    // Build Standee Card HTML for Print Sheet
    const badgeColor = table.capacity === 4 ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-300';

    cardHtmlList.push(`
      <div class="standee-card">
        <div class="card-inner">
          <div class="header">
            <div class="brand">
              <span class="brand-icon">🍽️</span>
              <span class="brand-title">REVA NEST</span>
            </div>
            <span class="subtext">CAMPUS FOOD COURT</span>
          </div>

          <div class="table-info">
            <h1 class="table-num">${table.label}</h1>
            <div class="badge-row">
              <span class="badge ${badgeColor}">${table.capacity}-Seater Table</span>
              <span class="zone-text">${table.zone || 'Food Hall'}</span>
            </div>
          </div>

          <div class="qr-wrapper">
            ${svgString}
          </div>

          <div class="scan-instructions">
            <div class="scan-step">
              <span class="step-num">1</span>
              <span>Scan with Camera / Google Lens</span>
            </div>
            <div class="scan-step">
              <span class="step-num">2</span>
              <span>Browse stalls, select food & pay UPI</span>
            </div>
            <div class="scan-step">
              <span class="step-num">3</span>
              <span>Order notified directly to this table</span>
            </div>
          </div>

          <div class="footer">
            <span class="url-text">${tableUrl}</span>
          </div>
        </div>
      </div>
    `);
  }

  // Create Print-Ready HTML Document (A4 4-per-page grid)
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>REVA Food Court - All 155 Table QR Standees</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
    }
    .no-print-toolbar {
      background: #0f172a;
      color: white;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .print-btn {
      background: #f59e0b;
      color: #0f172a;
      font-weight: 700;
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .print-btn:hover {
      background: #d97706;
    }
    .container {
      max-width: 1200px;
      margin: 24px auto;
      padding: 0 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .standee-card {
      page-break-inside: avoid;
      break-inside: avoid;
      background: white;
      border: 2px dashed #cbd5e1;
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      position: relative;
    }
    .card-inner {
      width: 100%;
      border: 1.5px solid #0f172a;
      border-radius: 12px;
      padding: 16px 12px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .header {
      margin-bottom: 8px;
    }
    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .brand-icon {
      font-size: 20px;
    }
    .brand-title {
      font-weight: 900;
      letter-spacing: 1px;
      font-size: 18px;
      color: #0f172a;
    }
    .subtext {
      font-size: 10px;
      letter-spacing: 2px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }
    .table-info {
      margin: 8px 0;
    }
    .table-num {
      font-size: 38px;
      font-weight: 900;
      color: #0f172a;
      line-height: 1;
      letter-spacing: -0.5px;
    }
    .badge-row {
      display: flex;
      gap: 6px;
      justify-content: center;
      align-items: center;
      margin-top: 6px;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 9999px;
      border: 1px solid;
    }
    .bg-amber-100 { background-color: #fef3c7; color: #92400e; border-color: #fcd34d; }
    .bg-blue-100 { background-color: #dbeafe; color: #1e40af; border-color: #93c5fd; }
    .zone-text {
      font-size: 11px;
      color: #64748b;
      font-weight: 500;
    }
    .qr-wrapper {
      margin: 12px 0;
      background: #ffffff;
      padding: 10px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.04);
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .qr-wrapper svg {
      width: 170px;
      height: 170px;
      display: block;
    }
    .scan-instructions {
      width: 100%;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 12px;
      margin-top: 4px;
      text-align: left;
      font-size: 11px;
    }
    .scan-step {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 3px 0;
      color: #334155;
    }
    .step-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #0f172a;
      color: white;
      font-size: 9px;
      font-weight: bold;
      flex-shrink: 0;
    }
    .footer {
      margin-top: 10px;
    }
    .url-text {
      font-size: 9px;
      color: #94a3b8;
      word-break: break-all;
    }

    @media print {
      body {
        background: white;
      }
      .no-print-toolbar {
        display: none !important;
      }
      .container {
        max-width: 100%;
        margin: 0;
        padding: 0;
      }
      .grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 8mm;
      }
      .standee-card {
        border: 1px dashed #94a3b8;
        box-shadow: none;
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 6mm;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-toolbar">
    <div>
      <h2 style="font-size: 18px; font-weight: 700;">REVA Nest Food Court — Table QR Standees (155 Tables)</h2>
      <p style="font-size: 12px; color: #94a3b8;">95 4-Seater Tables (T-01 to T-95) &bull; 60 6-Seater Tables (T-96 to T-155) &bull; Total Seating: 740</p>
    </div>
    <div style="display: flex; gap: 12px; align-items: center;">
      <span style="font-size: 13px; color: #cbd5e1;">Tip: Set Margins to "Minimum" and layout to "Portrait"</span>
      <button class="print-btn" onclick="window.print()">
        <span>🖨️</span>
        <span>Print to PDF / Paper</span>
      </button>
    </div>
  </div>

  <div class="container">
    <div class="grid">
      ${cardHtmlList.join('\n')}
    </div>
  </div>
</body>
</html>`;

  const htmlPath = path.join(OUT_DIR, 'print-standees.html');
  fs.writeFileSync(htmlPath, fullHtml, 'utf-8');

  console.log(`\n======================================================`);
  console.log(` SUCCESS! 155 Table QRs Generated!`);
  console.log(` Individual SVGs: ${SVG_DIR}/ (*.svg)`);
  console.log(` Printable Sheet: ${htmlPath}`);
  console.log(`   -> Open 'generated-qrs/print-standees.html' in your browser and press Ctrl+P!`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error('Error generating QRs:', err);
  process.exit(1);
});
