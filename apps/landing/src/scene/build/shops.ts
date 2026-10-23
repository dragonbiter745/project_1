import * as THREE from 'three';
import { KITCHEN_DEPTH, SHOP_WIDTH, type ShopSlot } from '../../data/layout';
import type { ShopDef } from '../../data/shops';
import { Batch, geo, trs } from '../batch';

const W = SHOP_WIDTH;
const D = KITCHEN_DEPTH;
const PI = Math.PI;
const LINE_Z = -D + 0.38; // back-line cabinet centre
const LINE_TOP = 0.92;

export function slotMatrix(slot: ShopSlot): THREE.Matrix4 {
  return trs(slot.ox, 0, slot.oz, slot.yaw);
}

/** Local points used by the animated layer (flames, steam, glow) per equipment. */
export interface ShopFx {
  flames: Array<[number, number, number]>;
  steam: Array<[number, number, number]>;
}

export function buildShop(b: Batch, slot: ShopSlot, shop: ShopDef): ShopFx {
  b.frame = slotMatrix(slot);
  const lacquer = `lacquer:${shop.id}`;
  const trim = `trim:${shop.id}`;
  const fx: ShopFx = { flames: [], steam: [] };

  // Shell: kitchen floor, tiled back wall, party walls, fascia and bulkhead.
  b.add('kitchenFloor', geo.plane(W - 0.3, D - 0.75), trs(0, 0.004, -(0.75 + (D - 0.75) / 2), 0, -PI / 2));
  b.add('wallTile', geo.plane(W - 0.3, 3, 2.4), trs(0, 1.5, -D + 0.012));
  for (const side of [-1, 1]) {
    b.block('plaster', 0.3, 3.75, D, side * (W / 2 + 0.05), 0, -D / 2);
    b.add('wallTile', geo.plane(D - 0.1, 2.4, 2.4), trs(side * (W / 2 - 0.101), 1.2, -D / 2, -side * (PI / 2)));
  }
  b.box(lacquer, W + 0.4, 0.78, 0.26, 0, 3.36, -0.13, 0, 0.02);
  b.box('plaster', W + 0.4, 0.76, 0.3, 0, 4.13, -0.15);
  b.box(trim, W + 0.36, 0.035, 0.03, 0, 2.965, 0.0);
  b.box('steel', W + 0.42, 0.04, 0.3, 0, 3.77, -0.13);

  // Counter with steel top, wood band and kick plate, leaving a staff gate on the right.
  const cw = W / 2 + 2.3;
  const cx = (-W / 2 + 2.3) / 2;
  b.block(lacquer, cw, 0.86, 0.66, cx, 0.1, -0.37, 0.02);
  b.block('rubber', cw - 0.04, 0.1, 0.6, cx, 0, -0.4);
  b.block('oak', cw + 0.01, 0.1, 0.67, cx, 0.72, -0.37);
  b.block('steel', cw + 0.08, 0.05, 0.8, cx, 0.96, -0.37, 0.012);
  // Sneeze guard.
  b.box('glass', 2.6, 0.42, 0.015, -1.15, 1.23, -0.12);
  for (const x of [-2.42, 0.12]) b.cyl('chrome', 0.012, 0.012, 0.44, x, 1.0, -0.12, 8);
  // Hand-off shelf with heat lamp.
  b.box('steel', 1.0, 0.03, 0.42, 1.65, 1.32, -0.34);
  for (const x of [1.2, 2.1]) b.cyl('chrome', 0.012, 0.012, 0.34, x, 1.0, -0.34, 8);
  b.box('iron', 0.9, 0.06, 0.12, 1.65, 1.72, -0.34);
  b.box('heatLamp', 0.82, 0.015, 0.08, 1.65, 1.69, -0.34);
  b.cyl('chrome', 0.01, 0.01, 0.7, 1.65, 1.74, -0.34, 6);
  // POS terminal.
  b.block('black', 0.24, 0.06, 0.2, 0.25, 1.0, -0.3, 0.01);
  b.add('black', geo.box(0.26, 0.19, 0.02, 0.005), trs(0.25, 1.17, -0.33, 0, -0.35));
  b.add('screenDark', geo.box(0.23, 0.16, 0.004), trs(0.25, 1.17, -0.318, 0, -0.35));
  // Staff gate flap.
  b.block(lacquer, 0.46, 0.06, 0.62, 2.55, 0.9, -0.37);

  // Menu board frame under the fascia (the board face is a live canvas).
  b.box('black', W - 0.7, 0.96, 0.06, 0, 2.45, -0.86, 0, 0.01);
  b.box('iron', 0.04, 0.6, 0.04, -W / 2 + 0.6, 3.22, -0.86);
  b.box('iron', 0.04, 0.6, 0.04, W / 2 - 0.6, 3.22, -0.86);
  // Token screen on a pole at the hand-off end.
  b.cyl('iron', 0.02, 0.02, 0.6, 2.05, 1.0, -0.15, 8);
  b.box('black', 0.62, 0.38, 0.05, 2.05, 1.86, -0.15, 0, 0.012);

  // Back line: steel cabinets, hood and extraction duct.
  b.block('steel', W - 0.34, 0.86, 0.72, 0, 0.06, LINE_Z, 0.015);
  b.block('rubber', W - 0.4, 0.06, 0.66, 0, 0, LINE_Z + 0.02);
  for (let x = -W / 2 + 0.6; x < W / 2 - 0.3; x += 0.9) b.box('steelDark', 0.012, 0.6, 0.012, x, 0.48, LINE_Z + 0.365);
  b.add('steel', geo.box(W - 0.7, 0.52, 1.05, 0.02), trs(0, 2.55, -D + 0.55));
  b.box('iron', W - 0.75, 0.03, 0.95, 0, 2.28, -D + 0.55);
  b.cyl('duct', 0.18, 0.18, 1.7, 1.6, 2.8, -D + 0.45, 16);
  // Utensil rail.
  b.box('chrome', W - 1.2, 0.02, 0.02, 0, 1.75, -D + 0.05);
  for (let x = -1.8; x <= 1.8; x += 0.45) {
    b.cyl('steel', 0.006, 0.006, 0.26, x, 1.5, -D + 0.07, 6);
    b.add('steel', geo.cyl(0.05, 0.05, 0.01, 12), trs(x, 1.48, -D + 0.09, 0, PI / 2));
  }
  // Prep island between counter and back line.
  b.block('steel', 2.2, 0.88, 0.55, -0.6, 0.06, -1.7, 0.015);
  b.block('oak', 0.7, 0.04, 0.42, -1.1, 0.94, -1.7, 0.01);

  equipment(b, shop, fx);
  queueLane(b);
  b.frame = null;
  return fx;
}

function equipment(b: Batch, shop: ShopDef, fx: ShopFx) {
  const y = LINE_TOP;
  switch (shop.equipment) {
    case 'dosa':
      for (const x of [-1.5, -0.3]) {
        b.block('black', 1.0, 0.14, 0.6, x, y, LINE_Z, 0.02);
        b.add('iron', geo.cyl(0.42, 0.42, 0.02, 32), trs(x, y + 0.15, LINE_Z));
      }
      for (const [x, k] of [
        [0.8, 'steel'],
        [1.05, 'steel'],
        [1.3, 'ceramic'],
      ] as const)
        b.add(k, geo.lathe('tub', [
          [0.001, 0],
          [0.12, 0],
          [0.13, 0.22],
          [0.12, 0.22],
          [0.001, 0.2],
        ]), trs(x, y, LINE_Z - 0.1));
      // Idli steamer: stacked rings.
      for (let i = 0; i < 4; i++) b.add('steel', geo.cyl(0.2, 0.2, 0.1, 24), trs(1.95, y + 0.05 + i * 0.105, LINE_Z));
      b.add('steel', geo.lathe('lid', [
        [0.001, 0.07],
        [0.06, 0.06],
        [0.2, 0],
        [0.001, 0],
      ]), trs(1.95, y + 0.42, LINE_Z));
      fx.steam.push([1.95, y + 0.5, LINE_Z], [-0.9, y + 0.2, LINE_Z]);
      break;
    case 'biryani':
      for (const x of [-1.6, -0.4, 0.8]) {
        b.block('black', 0.9, 0.12, 0.62, x, y, LINE_Z, 0.02);
        b.add('copper', geo.lathe('handi', [
          [0.001, 0],
          [0.2, 0],
          [0.34, 0.12],
          [0.36, 0.25],
          [0.26, 0.4],
          [0.22, 0.44],
          [0.24, 0.46],
          [0.001, 0.46],
        ]), trs(x, y + 0.12, LINE_Z));
        b.add('brass', geo.lathe('handi-lid', [
          [0.001, 0.07],
          [0.05, 0.07],
          [0.24, 0.0],
          [0.001, 0.0],
        ]), trs(x, y + 0.58, LINE_Z));
        fx.steam.push([x, y + 0.66, LINE_Z]);
      }
      b.add('foodGreen', geo.box(0.6, 0.12, 0.4, 0.03), trs(1.9, y + 0.06, LINE_Z));
      break;
    case 'thali':
      b.add('clay', geo.lathe('tandoor', [
        [0.001, 0],
        [0.42, 0],
        [0.46, 0.5],
        [0.36, 0.9],
        [0.24, 0.92],
        [0.001, 0.9],
      ]), trs(-2.0, 0.0, -2.75));
      b.add('ovenGlow', geo.cyl(0.18, 0.18, 0.02, 20), trs(-2.0, 0.925, -2.75));
      fx.flames.push([-2.0, 0.95, -2.75]);
      // Bain-marie with six curry vessels.
      b.block('steel', 1.8, 0.1, 0.6, 0, y, LINE_Z, 0.01);
      for (let i = 0; i < 6; i++) {
        const x = -0.6 + (i % 3) * 0.6;
        const z = LINE_Z + (i < 3 ? -0.14 : 0.14);
        b.add('steel', geo.cyl(0.13, 0.11, 0.12, 20), trs(x, y + 0.1, z));
        b.add(i % 2 ? 'foodRed' : 'food', geo.cyl(0.12, 0.12, 0.01, 18), trs(x, y + 0.19, z));
      }
      b.block('oak', 0.8, 0.05, 0.5, 1.6, y, LINE_Z, 0.01);
      for (let i = 0; i < 5; i++) b.add('food', geo.cyl(0.09, 0.09, 0.01, 14), trs(1.4 + (i % 3) * 0.18, y + 0.06 + Math.floor(i / 3) * 0.012, LINE_Z - 0.05));
      break;
    case 'wok':
      for (const x of [-1.6, -0.5]) {
        b.block('black', 0.9, 0.18, 0.62, x, y, LINE_Z, 0.02);
        b.add('iron', geo.lathe('wok', [
          [0.001, 0],
          [0.12, 0.01],
          [0.26, 0.08],
          [0.34, 0.17],
          [0.33, 0.17],
          [0.25, 0.09],
          [0.11, 0.025],
          [0.001, 0.015],
        ]), trs(x, y + 0.2, LINE_Z));
        fx.flames.push([x, y + 0.2, LINE_Z]);
      }
      // Bamboo steamer stacks.
      for (const [x, n] of [
        [0.8, 3],
        [1.4, 4],
        [2.0, 2],
      ] as const) {
        for (let i = 0; i < n; i++) b.add('oak', geo.cyl(0.21, 0.21, 0.1, 22), trs(x, y + 0.05 + i * 0.105, LINE_Z));
        fx.steam.push([x, y + n * 0.105 + 0.06, LINE_Z]);
      }
      break;
    case 'burger':
      b.block('steelDark', 1.6, 0.16, 0.62, -1.2, y, LINE_Z, 0.01);
      b.block('black', 1.5, 0.02, 0.56, -1.2, y + 0.16, LINE_Z);
      for (let i = 0; i < 6; i++) b.add('foodRed', geo.cyl(0.06, 0.06, 0.02, 14), trs(-1.7 + i * 0.2, y + 0.19, LINE_Z));
      b.block('steel', 0.8, 0.3, 0.62, 0.5, y, LINE_Z, 0.01);
      b.block('food', 0.6, 0.02, 0.4, 0.5, y + 0.25, LINE_Z);
      for (const x of [0.32, 0.68]) {
        b.box('chrome', 0.26, 0.14, 0.24, x, y + 0.4, LINE_Z - 0.05);
        b.box('black', 0.03, 0.03, 0.3, x, y + 0.44, LINE_Z + 0.2);
      }
      fx.steam.push([-1.2, y + 0.25, LINE_Z]);
      b.block('steel', 0.9, 0.5, 0.5, 1.6, y, LINE_Z, 0.02);
      break;
    case 'pizza':
      b.block('black', 1.6, 0.2, 0.75, -1.2, y - 0.02, LINE_Z, 0.02);
      b.add('terracotta', geo.lathe('oven', [
        [0.001, 0],
        [0.75, 0],
        [0.74, 0.25],
        [0.62, 0.52],
        [0.4, 0.7],
        [0.001, 0.76],
      ]), trs(-1.2, y + 0.18, LINE_Z - 0.05, 0, 0, 0, 1, 1, 0.62));
      b.add('ovenGlow', geo.box(0.5, 0.28, 0.02, 0.1), trs(-1.2, y + 0.38, LINE_Z + 0.42));
      b.add('iron', geo.box(0.6, 0.36, 0.05, 0.12), trs(-1.2, y + 0.38, LINE_Z + 0.405));
      b.cyl('steelDark', 0.08, 0.08, 1.0, -1.2, y + 0.85, LINE_Z - 0.05, 12);
      fx.flames.push([-1.2, y + 0.28, LINE_Z + 0.3]);
      // Slice warmer with shelves.
      b.block('steel', 1.0, 0.08, 0.5, 0.9, y, LINE_Z);
      b.box('glass', 1.0, 0.5, 0.5, 0.9, y + 0.33, LINE_Z);
      b.box('heatLamp', 0.9, 0.012, 0.42, 0.9, y + 0.56, LINE_Z);
      for (let i = 0; i < 4; i++) b.add('food', geo.cone(0.14, 0.01, 3), trs(0.6 + i * 0.2, y + 0.12, LINE_Z, i, 0, 0, 1, 1, 1));
      b.block('oak', 0.7, 0.04, 0.45, 1.95, y, LINE_Z, 0.01);
      break;
    case 'chai':
      b.block('black', 1.0, 0.16, 0.6, -1.4, y, LINE_Z, 0.02);
      b.add('steel', geo.lathe('kettle', [
        [0.001, 0],
        [0.22, 0],
        [0.25, 0.18],
        [0.2, 0.36],
        [0.08, 0.42],
        [0.09, 0.46],
        [0.001, 0.46],
      ]), trs(-1.6, y + 0.16, LINE_Z));
      b.add('steel', geo.cyl(0.025, 0.035, 0.26, 8), trs(-1.36, y + 0.35, LINE_Z, 0, 0, -0.9));
      b.add('copper', geo.cyl(0.17, 0.15, 0.2, 20), trs(-1.1, y + 0.26, LINE_Z));
      fx.steam.push([-1.6, y + 0.66, LINE_Z], [-1.1, y + 0.4, LINE_Z]);
      // Samosa display case.
      b.block('steel', 1.3, 0.08, 0.55, 0.5, y, LINE_Z);
      b.box('glass', 1.3, 0.42, 0.55, 0.5, y + 0.29, LINE_Z);
      for (let i = 0; i < 10; i++)
        b.add('food', geo.cone(0.07, 0.1, 3), trs(0.0 + (i % 5) * 0.24, y + 0.14, LINE_Z + (i < 5 ? -0.1 : 0.1), i, 0, 0));
      for (let i = 0; i < 8; i++) b.add('ceramic', geo.cyl(0.03, 0.025, 0.07, 10), trs(1.5 + (i % 4) * 0.09, y, LINE_Z + (i < 4 ? -0.1 : 0.08)));
      break;
    case 'juice':
      for (const [x, k] of [
        [-1.9, 'bottleA'],
        [-1.55, 'bottleB'],
        [-1.2, 'bottleC'],
      ] as const) {
        b.add('black', geo.cyl(0.09, 0.11, 0.18, 14), trs(x, y + 0.09, LINE_Z));
        b.add(k, geo.cyl(0.08, 0.06, 0.24, 14), trs(x, y + 0.3, LINE_Z));
      }
      b.add('steel', geo.cyl(0.14, 0.16, 0.36, 18), trs(-0.55, y + 0.18, LINE_Z));
      b.add('steelDark', geo.cone(0.12, 0.12, 18), trs(-0.55, y + 0.42, LINE_Z));
      // Fruit crates.
      b.block('oak', 0.7, 0.18, 0.45, 0.4, y, LINE_Z, 0.01);
      for (let i = 0; i < 8; i++) b.add(i % 2 ? 'food' : 'foodGreen', geo.sphere(0.07, 10, 8), trs(0.15 + (i % 4) * 0.16, y + 0.24, LINE_Z + (i < 4 ? -0.08 : 0.08)));
      // Glass-door fridge.
      b.block('whiteLacquer', 0.9, 2.0, 0.7, 1.9, 0, -D + 0.42, 0.03);
      b.box('fridgeGlow', 0.76, 1.6, 0.02, 1.9, 1.05, -D + 0.75);
      b.box('glass', 0.8, 1.7, 0.02, 1.9, 1.05, -D + 0.78);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          b.add(['bottleA', 'bottleB', 'bottleC'][(r + c) % 3]!, geo.cyl(0.035, 0.035, 0.22, 10), trs(1.65 + c * 0.17, 0.4 + r * 0.38, -D + 0.6));
        }
      }
      break;
  }
}

function queueLane(b: Batch) {
  // Chrome stanchion posts with velvet rope, two rails per lane.
  const zs = [0.6, 1.9, 3.2, 4.45];
  for (const x of [-1.95, -0.65]) {
    for (const z of zs) {
      b.add('chrome', geo.lathe('post', [
        [0.001, 0],
        [0.16, 0],
        [0.16, 0.03],
        [0.03, 0.05],
        [0.025, 0.92],
        [0.04, 0.95],
        [0.001, 0.98],
      ], 18), trs(x, 0, z));
    }
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i]!;
      const z1 = zs[i + 1]!;
      b.add('rope', geo.cyl(0.016, 0.016, z1 - z0 - 0.06, 8), trs(x, 0.86, (z0 + z1) / 2, 0, PI / 2));
    }
  }
}
