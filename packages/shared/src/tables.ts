/** Unguessable per-table token from the QR (base64url, 22+ chars). Short table codes are no longer accepted. */
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

/** Orders placed on the website, away from a table: collected at the shop counter with a token. */
export const PICKUP_TABLE_ID = 'pickup';
export const PICKUP_TABLE_LABEL = 'Pickup';

/** "Table T-14", or "Pickup" for a website order. */
export function placeName(o: { tableId?: string; tableLabel: string }): string {
  return o.tableId === PICKUP_TABLE_ID || o.tableLabel === PICKUP_TABLE_LABEL ? PICKUP_TABLE_LABEL : `Table ${o.tableLabel}`;
}

import type { Table } from './types';

/**
 * Generates the full floor layout for REVA Nest Food Court:
 * - 95 4-seater tables (T-01 to T-95, 380 seats)
 * - 60 6-seater tables (T-96 to T-155, 360 seats)
 * Total: 155 tables, 740 seating capacity.
 */
export function generateFoodCourtTables(): Table[] {
  const tables: Table[] = [];

  // 95 4-Seater Tables (T-01 to T-95)
  for (let i = 1; i <= 95; i++) {
    const code = `T${String(i).padStart(2, '0')}`;
    let zone = 'Main Food Hall';
    if (i > 40 && i <= 70) zone = 'Central Courtyard';
    else if (i > 70) zone = 'North Atrium';

    tables.push({
      id: `tbl-${i}`,
      code,
      label: `T-${String(i).padStart(2, '0')}`,
      zone,
      capacity: 4,
      active: true,
    });
  }

  // 60 6-Seater Tables (T-96 to T-155)
  for (let i = 96; i <= 155; i++) {
    const code = `T${i}`;
    const zone = i <= 125 ? 'Garden Terrace' : 'Community Plaza';

    tables.push({
      id: `tbl-${i}`,
      code,
      label: `T-${i}`,
      zone,
      capacity: 6,
      active: true,
    });
  }

  return tables;
}
