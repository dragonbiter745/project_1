import type * as THREE from 'three';
import { SHOP_SLOTS } from '../data/layout';
import { SHOP_BY_ID } from '../data/shops';
import { Batch } from './batch';
import { buildCampus } from './build/campus';
import { buildCourtyard, buildHall } from './build/hall';
import { buildFurniture, buildStations } from './build/furniture';
import { buildShop, type ShopFx } from './build/shops';
import type { MatKey } from './materials';

interface StaticWorld {
  meshes: Array<{ key: MatKey; geometry: THREE.BufferGeometry }>;
  fx: Array<{ shopId: string; fx: ShopFx }>;
}

let built: StaticWorld | null = null;

/** Builds the merged static hall once per page. */
export function staticWorld(): StaticWorld {
  if (built) return built;
  const b = new Batch();
  buildHall(b);
  buildCourtyard(b);
  buildCampus(b);
  const fx = SHOP_SLOTS.map((slot) => ({ shopId: slot.shopId, fx: buildShop(b, slot, SHOP_BY_ID[slot.shopId]!) }));
  buildFurniture(b);
  buildStations(b);
  built = { meshes: b.build(), fx };
  return built;
}
