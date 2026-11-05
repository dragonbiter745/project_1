import type { InviteInfo, VendorAccessInput, VendorAccessList, VendorLoginRole } from '@foodcourt/shared';
import { getFunctionsClient, httpsCallable } from './functions';
import { ActionError } from './ops';
import { staffSignIn } from './staff';

// Vendor logins by email. The court manager's console calls vendorAccess (master only on the server).
// The emailed link opens the kitchen or shop-admin site, which calls inspectInvite and completeInvite
// with no sign-in: the one-time token in the link is the proof.

function message(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'functions/unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine)) return 'No connection. Check the network and try again.';
  return e?.message?.replace(/^Firebase: /, '') || 'Something went wrong. Try again.';
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new ActionError(message(err));
  }
}

const act = <T>(data: VendorAccessInput) => guarded(async () => (await httpsCallable<unknown, T>(getFunctionsClient(), 'vendorAccess')(data)).data);

export const listVendorLogins = () => act<VendorAccessList>({ action: 'LIST' });
export const inviteVendorLogin = (email: string, vendorId: string, role: VendorLoginRole) => act<{ uid: string }>({ action: 'INVITE', email, vendorId, role });
export const resendVendorLogin = (uid: string) => act<{ ok: true }>({ action: 'RESEND', uid });
export const setVendorLoginEnabled = (uid: string, enabled: boolean) => act<{ ok: true }>({ action: 'SET_ENABLED', uid, enabled });
export const removeVendorLogin = (uid: string) => act<{ ok: true }>({ action: 'REMOVE_LOGIN', uid });
export const createShop = (shop: { requestKey: string; name: string; code: string; open: string; close: string; defaultPrepMin: number; feePct: number }) =>
  act<{ vendorId: string }>({ action: 'CREATE_SHOP', ...shop });
export const deleteShop = (vendorId: string, confirmName: string) => act<{ removed: boolean; archived: boolean; logins: number }>({ action: 'DELETE_SHOP', vendorId, confirmName });

// ─── The emailed set-password link ─────────────────────────────────────────────────────────────

export const lookupInvite = (token: string) => guarded(async () => (await httpsCallable<unknown, InviteInfo>(getFunctionsClient(), 'inspectInvite')({ token })).data);

/** Sets the password, then signs the person in with it so they land straight in their app. */
export async function finishInvite(token: string, password: string): Promise<InviteInfo['app']> {
  const res = await guarded(async () => (await httpsCallable<unknown, { email: string; app: InviteInfo['app'] }>(getFunctionsClient(), 'completeInvite')({ token, password })).data);
  await staffSignIn(res.email, password);
  return res.app;
}
