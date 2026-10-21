import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import type { ShopAdminInput, VendorMenu } from '@foodcourt/shared';
import { getFirebaseApp } from './app';
import { getFunctionsClient, httpsCallable } from './functions';
import { ActionError } from './ops';

// The shop owner's controls. Menu, settings and the kitchen password all go through the shopAdmin
// callable (the server re-checks every price and photo); photos go straight to the shop's own
// Storage folder, which the storage rules limit to small images.

function message(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'functions/unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine)) return 'No connection. Check the network and try again.';
  return e?.message?.replace(/^Firebase: /, '') || 'Something went wrong. Try again.';
}

type Distribute<T> = T extends unknown ? Omit<T, 'vendorId'> : never;
export type ShopAdminRequest = Distribute<ShopAdminInput>;

export async function shopAdmin(input: ShopAdminRequest): Promise<{ ok: true; menu?: VendorMenu }> {
  try {
    return (await httpsCallable<unknown, { ok: true; menu?: VendorMenu }>(getFunctionsClient(), 'shopAdmin')(input)).data;
  } catch (err) {
    throw new ActionError(message(err));
  }
}

/** A new key for each form opening; the server turns it into the dish's id, so a double tap adds one dish. */
export const newRequestKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const MAX_SIDE = 1000;

/** Shrinks a phone photo to at most 1000px on its long side as JPEG (about 100-200 KB). */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new ActionError('Choose a photo (JPG, PNG or WebP).');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new ActionError('That photo could not be opened. Try another one.');
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ActionError('This browser cannot prepare photos.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.82));
  if (!blob) throw new ActionError('That photo could not be prepared. Try another one.');
  return blob;
}

/** Uploads a dish photo or logo to the shop's folder and returns its public link. */
export async function uploadShopImage(vendorId: string, file: File): Promise<string> {
  const blob = await shrink(file);
  const path = `menus/${vendorId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  try {
    const target = ref(getStorage(getFirebaseApp()), path);
    await uploadBytes(target, blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000,immutable' });
    return await getDownloadURL(target);
  } catch (err) {
    throw new ActionError(message(err));
  }
}
