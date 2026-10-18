/**
 * Format daily vendor token e.g. RM-042
 */
export function formatVendorToken(vendorCode: string, sequenceNumber: number): string {
  const padded = String(sequenceNumber).padStart(3, '0');
  return `${vendorCode.toUpperCase()}-${padded}`;
}

/**
 * Format customer daily sequence e.g. #042
 */
export function formatDailyCustomerNo(dailyNo: number): string {
  return `#${String(dailyNo).padStart(3, '0')}`;
}

/**
 * Get dateKey in IST timezone (Asia/Kolkata) - YYYY-MM-DD
 */
export function getIstDateKey(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // outputs YYYY-MM-DD
}
