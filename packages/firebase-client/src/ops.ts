import { doc, setDoc, updateDoc } from 'firebase/firestore';
import type { VendorActionName } from '@foodcourt/shared';
import { getDb } from './db';
import { getFunctionsClient, httpsCallable } from './functions';

// Real kitchen and court actions. Status changes go through the vendorAction callable (the shared
// status machine runs server-side); stock, pause and flags are rule-checked document writes.

export class ActionError extends Error {}

function message(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'functions/unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine)) return 'No connection. Check the network and try again.';
  return e?.message?.replace(/^Firebase: /, '') || 'Something went wrong. Try again.';
}

async function vendorAction(subOrderId: string, action: VendorActionName, reason?: string): Promise<boolean> {
  try {
    await httpsCallable(getFunctionsClient(), 'vendorAction')({ subOrderId, action, ...(reason ? { reason } : {}) });
    return true;
  } catch (err) {
    throw new ActionError(message(err));
  }
}

export const acceptOrder = (id: string) => vendorAction(id, 'ACCEPT');
export const markReady = (id: string) => vendorAction(id, 'READY');
export const undoReady = (id: string) => vendorAction(id, 'UNDO_READY');
export const markCollected = (id: string) => vendorAction(id, 'COLLECTED');
export const rejectOrder = (id: string, reason: string) => vendorAction(id, 'REJECT', reason);
export const cancelSubOrder = (id: string, reason: string) => vendorAction(id, 'CANCEL', reason);

async function write(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    throw new ActionError(message(err));
  }
}

export function setItemAvailable(vendorId: string, itemId: string, available: boolean, current: Record<string, boolean>): Promise<void> {
  const unavailable = { ...current };
  if (available) delete unavailable[itemId];
  else unavailable[itemId] = true;
  return write(() => setDoc(doc(getDb(), 'availability', vendorId), { vendorId, unavailable, updatedAt: Date.now() }));
}

export const pauseOrders = (vendorId: string, until: number | null) =>
  write(() => updateDoc(doc(getDb(), 'vendors', vendorId), { acceptingOrders: false, pausedUntil: until ? new Date(until).toISOString() : null, updatedAt: Date.now() }));

export const resumeOrders = (vendorId: string) =>
  write(() => updateDoc(doc(getDb(), 'vendors', vendorId), { acceptingOrders: true, pausedUntil: null, updatedAt: Date.now() }));

export const setPrepMinutes = (vendorId: string, minutes: number) =>
  write(() => updateDoc(doc(getDb(), 'vendors', vendorId), { defaultPrepMin: Math.min(60, Math.max(3, Math.round(minutes))), updatedAt: Date.now() }));

export const setPaymentsEnabled = (enabled: boolean) => write(() => updateDoc(doc(getDb(), 'config', 'global'), { 'flags.paymentsEnabled': enabled }));
export const setMaintenance = (on: boolean) => write(() => updateDoc(doc(getDb(), 'config', 'global'), { 'flags.maintenance': on }));

/** Master: gives every table an unguessable QR token, or replaces one table's token. */
export async function ensureQrTokens(): Promise<{ updated: number; total: number }> {
  const res = await httpsCallable<unknown, { updated: number; total: number }>(getFunctionsClient(), 'adminAction')({ action: 'ENSURE_QR_TOKENS' });
  return res.data;
}

export async function rotateQr(tableId: string): Promise<string> {
  const res = await httpsCallable<unknown, { qrToken: string }>(getFunctionsClient(), 'adminAction')({ action: 'ROTATE_QR', tableId });
  return res.data.qrToken;
}
