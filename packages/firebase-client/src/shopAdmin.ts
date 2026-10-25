import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { THUMB_SIDE, imagePathsOf, type ShopAdminInput, type VendorMenu } from '@foodcourt/shared';
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

/** Shrinks a phone photo to at most `maxSide` px on its long side as JPEG (about 100-200 KB at 1000px, about 10 KB at 240px). */
async function shrink(file: File, maxSide = MAX_SIDE, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new ActionError('Choose a photo (JPG, PNG or WebP).');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new ActionError('That photo could not be opened. Try another one.');
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ActionError('This browser cannot prepare photos.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', quality));
  if (!blob) throw new ActionError('That photo could not be prepared. Try another one.');
  return blob;
}

/**
 * Removes a replaced or discarded photo and its small copy from storage. Called only after the server has
 * accepted the change, so a dish never points at a deleted picture; a failure just leaves a file behind.
 */
export async function deleteShopImage(url: string | null | undefined): Promise<void> {
  const paths = imagePathsOf(url);
  if (!paths) return;
  const storage = getStorage(getFirebaseApp());
  await Promise.allSettled([paths.full, paths.thumb].map((path) => deleteObject(ref(storage, path))));
}

/** Uploads a dish photo or logo to the shop's folder and returns its public link. */
export async function uploadShopImage(vendorId: string, file: File): Promise<string> {
  const blob = await shrink(file);
  const path = `menus/${vendorId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  try {
    const target = ref(getStorage(getFirebaseApp()), path);
    await uploadBytes(target, blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000,immutable' });
    // The small copy menu lists load. A failed one is harmless: lists fall back to the full photo.
    await shrink(file, THUMB_SIDE, 0.72)
      .then((small) => uploadBytes(ref(getStorage(getFirebaseApp()), path.replace(/\.jpg$/, '-t.jpg')), small, { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000,immutable' }))
      .catch(() => undefined);
    return await getDownloadURL(target);
  } catch (err) {
    throw new ActionError(message(err));
  }
}
