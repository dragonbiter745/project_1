/**
 * Generates table QR code SVG/HTML sheets with clean table branding.
 */
import * as fs from 'fs';
import * as path from 'path';

const TABLES = [
  { code: 'T14', label: 'Table T-14', zone: 'Central Courtyard' },
  { code: 'T15', label: 'Table T-15', zone: 'Central Courtyard' },
  { code: 'T01', label: 'Table T-01', zone: 'Terrace Garden' },
  { code: 'T02', label: 'Table T-02', zone: 'Terrace Garden' },
];

export function generateQrHtmlSheet(domain: string = 'http://localhost:5173') {
  const cardsHtml = TABLES.map((t) => {
    const targetUrl = `${domain}/t/${t.code}`;
    // QR rendered via pure SVG / dynamic QR API placeholder or native SVG
    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
      targetUrl
    )}`;

    return `
      <div style="border: 2px dashed #ea580c; border-radius: 16px; padding: 24px; text-align: center; width: 280px; page-break-inside: avoid; font-family: sans-serif; background: #fff; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin: 16px;">
        <div style="font-size: 13px; font-weight: 700; color: #ea580c; text-transform: uppercase; letter-spacing: 1px;">REVA Food Court</div>
        <h2 style="font-size: 26px; margin: 8px 0; color: #0f172a;">${t.label}</h2>
        <p style="font-size: 13px; color: #64748b; margin-top: 0; margin-bottom: 16px;">${t.zone}</p>
        <img src="${qrImg}" alt="Scan to Order" style="width: 180px; height: 180px; border-radius: 8px; border: 1px solid #e2e8f0; padding: 8px;" />
        <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 16px 0 4px;">Scan with Camera or GPay / Paytm</p>
        <p style="font-size: 11px; color: #94a3b8; margin: 0;">Browse menus, order & pay once</p>
      </div>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>FoodCourt QR Sheet - Print Ready</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; background: white; }
            .no-print { display: none; }
          }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #f1f5f9;
            padding: 32px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .sheet {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            max-width: 900px;
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 24px;">
          <button onclick="window.print()" style="background: #ea580c; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; cursor: pointer;">
            Print Table QRs (A4 PDF)
          </button>
        </div>
        <div class="sheet">
          ${cardsHtml}
        </div>
      </body>
    </html>
  `;

  const outDir = path.resolve(__dirname, '../../docs/qr');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table-qrs-sheet.html'), html);
  console.log(`✔ Generated printable QR sheet at docs/qr/table-qrs-sheet.html`);
}

generateQrHtmlSheet();
