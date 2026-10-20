type Cell = string | number | null | undefined;

const escape = (v: Cell) => {
  const s = v == null ? '' : String(v);
  // Leading = + - @ would run as a formula in Excel or Sheets.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Paise as a plain rupee number for spreadsheets, e.g. 12050 → "120.50". */
export const rupees = (paise: number | null | undefined) => (paise == null ? '' : (paise / 100).toFixed(2));

export function downloadCsv(filename: string, header: string[], rows: Cell[][]): void {
  const text = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
  // BOM so Excel reads ₹ and Indian names correctly.
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
