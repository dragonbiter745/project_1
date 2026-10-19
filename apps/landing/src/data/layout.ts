import { SHOPS } from './shops';

// World units are metres. Origin is the hall centre on the floor, +y up,
// back wall (shops) at -z, entrance in the front wall at +z, windows on +x.
export const HALL = { minX: -18, maxX: 18, minZ: -12, maxZ: 12, height: 4.5 } as const;

export const DOOR = { x: 4, z: HALL.maxZ, width: 3.2 } as const;
export const SPAWN = { x: 4, z: 14.4 } as const;

export const SHOP_WIDTH = 5.6;
export const KITCHEN_DEPTH = 4;
export const QUEUE_SLOTS = 6;

export interface Vec2 {
  x: number;
  z: number;
}

export interface ShopSlot {
  shopId: string;
  index: number;
  wall: 'back' | 'left';
  /** Counter-front centre on the floor. */
  ox: number;
  oz: number;
  /** Rotation that maps shop-local +z (towards the hall) into the world. */
  yaw: number;
}

const BACK_X = [-10.8, -4.8, 1.2, 7.2, 13.2];
const LEFT_Z = [-3.8, 2.2, 8.2];

export const SHOP_SLOTS: ShopSlot[] = SHOPS.map((shop, index) =>
  index < BACK_X.length
    ? { shopId: shop.id, index, wall: 'back', ox: BACK_X[index]!, oz: HALL.minZ + KITCHEN_DEPTH, yaw: 0 }
    : { shopId: shop.id, index, wall: 'left', ox: HALL.minX + KITCHEN_DEPTH, oz: LEFT_Z[index - BACK_X.length]!, yaw: Math.PI / 2 }
);

export const SLOT_BY_SHOP: Record<string, ShopSlot> = Object.fromEntries(SHOP_SLOTS.map((s) => [s.shopId, s]));

/** Shop-local (x across the counter, z towards the hall) to world. */
export function shopToWorld(slot: ShopSlot, lx: number, lz: number): Vec2 {
  const c = Math.cos(slot.yaw);
  const s = Math.sin(slot.yaw);
  return { x: slot.ox + lx * c + lz * s, z: slot.oz - lx * s + lz * c };
}

/** Heading (radians, 0 = facing +z) for something facing shop-local +z. */
export const shopFacing = (slot: ShopSlot, towardsHall: boolean) => slot.yaw + (towardsHall ? 0 : Math.PI);

// Fixed points inside every shop, in shop-local coordinates.
export const SHOP_POINTS = {
  queueSlot: (i: number) => ({ x: -1.3, z: 0.8 + i * 0.68 }),
  pickup: { x: 1.5, z: 0.65 },
  menuRead: { x: 0.7, z: 4.6 },
  cooks: [
    { x: -1.3, z: -2.7 },
    { x: 1.1, z: -2.7 },
  ],
  assistant: { x: 0.5, z: -1.15 },
  supplierDrop: { x: 2.55, z: 0.9 },
} as const;

export type TableKind = 'four' | 'bench' | 'high';

export interface SeatDef {
  x: number;
  z: number;
  /** Heading of a diner sitting here (faces the table). */
  heading: number;
  height: number;
}

export interface TableDef {
  id: string;
  label: string;
  kind: TableKind;
  x: number;
  z: number;
  /** Footprint half sizes. */
  hx: number;
  hz: number;
  top: number;
  seats: SeatDef[];
}

const headingTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);

function makeTable(n: number, kind: TableKind, x: number, z: number): TableDef {
  const label = `T${String(n).padStart(2, '0')}`;
  if (kind === 'four') {
    const offsets = [
      [0, -0.74],
      [0.74, 0],
      [0, 0.74],
      [-0.74, 0],
    ] as const;
    return {
      id: label,
      label,
      kind,
      x,
      z,
      hx: 0.45,
      hz: 0.45,
      top: 0.75,
      seats: offsets.map(([dx, dz]) => ({ x: x + dx, z: z + dz, heading: headingTo(x + dx, z + dz, x, z), height: 0.45 })),
    };
  }
  if (kind === 'bench') {
    const seats: SeatDef[] = [];
    for (const side of [-1, 1]) {
      for (const dz of [-0.6, 0, 0.6]) {
        seats.push({ x: x + side * 0.72, z: z + dz, heading: side < 0 ? Math.PI / 2 : -Math.PI / 2, height: 0.45 });
      }
    }
    return { id: label, label, kind, x, z, hx: 0.4, hz: 0.95, top: 0.75, seats };
  }
  // Window bar: two stools side by side, diners look out at the courtyard.
  return {
    id: label,
    label,
    kind,
    x,
    z,
    hx: 0.28,
    hz: 0.5,
    top: 1.05,
    seats: [-0.28, 0.28].map((dz) => ({ x: x - 0.62, z: z + dz, heading: Math.PI / 2, height: 0.76 })),
  };
}

export const TABLES: TableDef[] = (() => {
  const list: TableDef[] = [];
  let n = 1;
  for (const z of [-1, 3, 7]) for (const x of [-2.5, 1.5, 5.5, 9.5]) list.push(makeTable(n++, 'four', x, z));
  for (const x of [-6.5, 14]) for (const z of [-0.8, 3.2, 7.2]) list.push(makeTable(n++, 'bench', x, z));
  for (const z of [-3, -0.6, 1.8, 4.2, 6.6, 9]) list.push(makeTable(n++, 'high', 17.25, z));
  return list;
})();

export const TABLE_BY_ID: Record<string, TableDef> = Object.fromEntries(TABLES.map((t) => [t.id, t]));
export const TOTAL_SEATS = TABLES.reduce((n, t) => n + t.seats.length, 0);

export const PILLARS: Vec2[] = [
  { x: -4.5, z: 1 },
  { x: -4.5, z: 5 },
  { x: 11.75, z: 1 },
  { x: 11.75, z: 5 },
];
export const PILLAR_HALF = 0.28;

// Support stations along the front wall.
export const STATIONS = {
  trayReturn: { x: -9.4, z: 11.55, w: 2.4 },
  trayDrop: { x: -9.4, z: 10.75 },
  waterCooler: { x: -6.9, z: 11.55 },
  cutlery: { x: -5.6, z: 11.6 },
  basins: [
    { x: -3.6, z: 11.65 },
    { x: -2.6, z: 11.65 },
  ],
  bins: [
    { x: -11.2, z: 11.55 },
    { x: -10.7, z: 11.55 },
  ],
  kiosks: [
    { x: 7.6, z: 10.9 },
    { x: 8.9, z: 10.9 },
    { x: 10.2, z: 10.9 },
  ],
  helpdesk: { x: 13.3, z: 10.9 },
  vending: { x: 17.35, z: 11.1 },
  tokenBoard: { x: 1.2, y: 3.15, z: -4.4 },
  runnerBase: { x: 0.6, z: 10.1 },
  cleanerBase: { x: -7.9, z: 10.4 },
  plants: [
    { x: -13.4, z: 11.3 },
    { x: 1.6, z: 11.3 },
    { x: 6.4, z: 11.3 },
    { x: 15.6, z: 11.3 },
    { x: 17.2, z: -10.9 },
    { x: -13.4, z: -11.1 },
  ],
} as const;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Extra path cost instead of a hard block (chairs can be walked past when needed). */
  cost?: number;
}

const rect = (x: number, z: number, hx: number, hz: number, cost?: number): Rect => ({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, cost });

function shopRect(slot: ShopSlot, lx0: number, lx1: number, lz0: number, lz1: number): Rect {
  const a = shopToWorld(slot, lx0, lz0);
  const b = shopToWorld(slot, lx1, lz1);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}

/** Everything people must walk around. Kitchens are open to staff through a gap at the side. */
export function obstacles(): Rect[] {
  const list: Rect[] = [];
  for (const slot of SHOP_SLOTS) {
    // Counter, leaving a staff gate at local x 2.3..2.8.
    list.push(shopRect(slot, -SHOP_WIDTH / 2, 2.3, -0.75, 0));
    // Party walls between shops.
    list.push(shopRect(slot, SHOP_WIDTH / 2 - 0.05, SHOP_WIDTH / 2 + 0.05, -KITCHEN_DEPTH, 0));
    list.push(shopRect(slot, -SHOP_WIDTH / 2 - 0.05, -SHOP_WIDTH / 2 + 0.05, -KITCHEN_DEPTH, 0));
    // Back-of-kitchen equipment line.
    list.push(shopRect(slot, -SHOP_WIDTH / 2, SHOP_WIDTH / 2, -KITCHEN_DEPTH, -3.3));
  }
  // Empty corner behind the first back shop and the first left shop.
  list.push({ minX: HALL.minX, maxX: HALL.minX + KITCHEN_DEPTH, minZ: HALL.minZ, maxZ: -6.7 });
  list.push({ minX: HALL.minX, maxX: HALL.minX + KITCHEN_DEPTH, minZ: 10.9, maxZ: HALL.maxZ });
  list.push({ minX: 15.95, maxX: HALL.maxX, minZ: HALL.minZ, maxZ: -8 });

  for (const t of TABLES) {
    // Tight margin so the cell under each chair stays reachable.
    list.push(rect(t.x, t.z, t.hx + 0.02, t.hz + 0.02));
    for (const s of t.seats) list.push(rect(s.x, s.z, 0.22, 0.22, 25));
  }
  for (const p of PILLARS) list.push(rect(p.x, p.z, PILLAR_HALF + 0.05, PILLAR_HALF + 0.05));
  list.push(rect(STATIONS.trayReturn.x, STATIONS.trayReturn.z, STATIONS.trayReturn.w / 2, 0.45));
  list.push(rect(STATIONS.waterCooler.x, STATIONS.waterCooler.z, 0.3, 0.3));
  list.push(rect(STATIONS.cutlery.x, STATIONS.cutlery.z, 0.45, 0.3));
  for (const b of STATIONS.basins) list.push(rect(b.x, b.z, 0.32, 0.25));
  for (const b of STATIONS.bins) list.push(rect(b.x, b.z, 0.22, 0.22));
  for (const k of STATIONS.kiosks) list.push(rect(k.x, k.z, 0.35, 0.3));
  list.push(rect(STATIONS.helpdesk.x, STATIONS.helpdesk.z, 1, 0.45));
  list.push(rect(STATIONS.vending.x, STATIONS.vending.z, 0.45, 0.45));
  for (const p of STATIONS.plants) list.push(rect(p.x, p.z, 0.32, 0.32));
  return list;
}

export interface CameraArea {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const AREAS: CameraArea[] = [
  { id: 'overview', label: 'Whole court', position: [19, 17, 23], target: [0, 0, -1.5] },
  { id: 'entrance', label: 'Entrance', position: [9, 4.2, 6], target: [4, 1.2, 11.5] },
  { id: 'shops', label: 'Shops row', position: [2.5, 4.8, 3.5], target: [1, 1.6, -9] },
  { id: 'seating', label: 'Seating hall', position: [-9, 6.5, 13], target: [4, 0.6, 2.5] },
  { id: 'trays', label: 'Tray return', position: [-5.5, 3.4, 6.5], target: [-9.4, 1, 11.4] },
  { id: 'courtyard', label: 'Courtyard', position: [30, 6, 6], target: [17, 1.5, 2] },
  { id: 'campus', label: 'Campus', position: [46, 34, 58], target: [0, 4, -12] },
  { id: 'gate', label: 'Main gate', position: [4, 3.2, 40], target: [4, 4, 14] },
];
