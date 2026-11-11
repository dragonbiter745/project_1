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

/** Minutes since midnight in IST (a fixed UTC+5:30; India has no daylight saving). */
export function istMinutesOfDay(date: Date = new Date()): number {
  return Math.floor((date.getTime() + 330 * 60_000) / 60_000) % 1440;
}

const clockMinutes = (s: string | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && v <= 1440 ? v : null;
};

/**
 * Is a shop open at this moment, by its saved hours ("HH:MM", IST)? Hours that cross midnight
 * (18:00 to 02:00) work. A shop with no hours saved, unreadable hours, or the same opening and closing
 * time is treated as always open: bad data must never close a shop.
 */
export function isOpenAt(hours: { open?: string; close?: string } | undefined | null, date: Date = new Date()): boolean {
  const open = clockMinutes(hours?.open);
  const close = clockMinutes(hours?.close);
  if (open === null || close === null || open === close) return true;
  const now = istMinutesOfDay(date);
  return open < close ? now >= open && now < close : now >= open || now < close;
}
