import { DOOR, HALL, PILLARS, PILLAR_HALF, TABLES } from '../../data/layout';
import { Batch, geo, trs } from '../batch';

const H = HALL.height;
const PI = Math.PI;

/** Window bays on the courtyard wall, shared with the light shafts. */
export const WINDOW_BAYS: number[] = (() => {
  const n = 7;
  const w = 2.6;
  const pier = (HALL.maxZ - HALL.minZ - n * w) / (n + 1);
  return Array.from({ length: n }, (_, i) => HALL.minZ + pier + w / 2 + i * (w + pier));
})();
export const WINDOW_W = 2.6;
export const WINDOW_SILL = 0.9;
export const WINDOW_TOP = 3.3;

export const FAN_SPOTS: Array<[number, number]> = [
  [-1, 1],
  [5, 1],
  [-1, 5],
  [5, 5],
  [9.5, 3],
  [-6.5, 3],
];

export function buildHall(b: Batch) {
  // Walls are planes facing into the hall, so from outside the camera sees straight in.
  b.add('plaster', geo.plane(HALL.maxX - HALL.minX, H, 2.5), trs(0, H / 2, HALL.minZ + 0.002));
  b.add('plasterSage', geo.plane(HALL.maxZ - HALL.minZ, H, 2.5), trs(HALL.minX + 0.002, H / 2, 0, PI / 2));

  // Front wall with the entrance.
  const doorL = DOOR.x - DOOR.width / 2;
  const doorR = DOOR.x + DOOR.width / 2;
  const leftW = doorL - HALL.minX;
  const rightW = HALL.maxX - doorR;
  b.add('plaster', geo.plane(leftW, H, 2.5), trs(HALL.minX + leftW / 2, H / 2, HALL.maxZ - 0.002, PI));
  b.add('plaster', geo.plane(rightW, H, 2.5), trs(doorR + rightW / 2, H / 2, HALL.maxZ - 0.002, PI));
  b.add('plaster', geo.plane(DOOR.width, H - 2.75, 2.5), trs(DOOR.x, 2.75 + (H - 2.75) / 2, HALL.maxZ - 0.002, PI));

  // Courtyard wall: sill band, head band, piers between windows.
  const len = HALL.maxZ - HALL.minZ;
  b.add('plaster', geo.plane(len, WINDOW_SILL, 2.5), trs(HALL.maxX - 0.002, WINDOW_SILL / 2, 0, -PI / 2));
  b.add('plaster', geo.plane(len, H - WINDOW_TOP, 2.5), trs(HALL.maxX - 0.002, WINDOW_TOP + (H - WINDOW_TOP) / 2, 0, -PI / 2));
  const edges = [HALL.minZ, ...WINDOW_BAYS.flatMap((z) => [z - WINDOW_W / 2, z + WINDOW_W / 2]), HALL.maxZ];
  for (let i = 0; i < edges.length; i += 2) {
    const z0 = edges[i]!;
    const z1 = edges[i + 1]!;
    b.add('plaster', geo.plane(z1 - z0, WINDOW_TOP - WINDOW_SILL, 2.5), trs(HALL.maxX - 0.002, (WINDOW_SILL + WINDOW_TOP) / 2, (z0 + z1) / 2, -PI / 2));
  }
  for (const z of WINDOW_BAYS) {
    const hgt = WINDOW_TOP - WINDOW_SILL;
    b.add('glass', geo.plane(WINDOW_W, hgt), trs(HALL.maxX - 0.04, WINDOW_SILL + hgt / 2, z, -PI / 2));
    // Mullions and transom.
    for (const dz of [-WINDOW_W / 2, 0, WINDOW_W / 2]) b.box('frame', 0.09, hgt, 0.07, HALL.maxX - 0.04, WINDOW_SILL + hgt / 2, z + dz);
    b.box('frame', 0.09, 0.07, WINDOW_W, HALL.maxX - 0.04, 2.55, z);
    b.box('frame', 0.12, 0.07, WINDOW_W + 0.1, HALL.maxX - 0.04, WINDOW_TOP, z);
  }
  b.box('concrete', 0.26, 0.05, len, HALL.maxX - 0.13, WINDOW_SILL, 0);

  // Ceiling faces down; invisible from the orbit camera above.
  b.add('ceiling', geo.plane(HALL.maxX - HALL.minX, len, 3), trs(0, H, 0, 0, PI / 2));

  // Skirting and a parapet cap that outlines the building from above.
  b.box('walnut', HALL.maxX - HALL.minX, 0.1, 0.02, 0, 0.05, HALL.minZ + 0.012);
  b.box('walnut', 0.02, 0.1, len, HALL.minX + 0.012, 0.05, 0);
  b.box('walnut', leftW, 0.1, 0.02, HALL.minX + leftW / 2, 0.05, HALL.maxZ - 0.012);
  b.box('walnut', rightW, 0.1, 0.02, doorR + rightW / 2, 0.05, HALL.maxZ - 0.012);
  for (const [w, d, x, z] of [
    [HALL.maxX - HALL.minX + 0.6, 0.3, 0, HALL.minZ - 0.15],
    [HALL.maxX - HALL.minX + 0.6, 0.3, 0, HALL.maxZ + 0.15],
    [0.3, len, HALL.minX - 0.15, 0],
    [0.3, len, HALL.maxX + 0.15, 0],
  ] as const) {
    // Cap only: full-height outer walls would hide the hall from the orbit camera.
    b.box('concrete', w, 0.35, d, x, H + 0.17, z, 0, 0.04);
  }

  // Corners not taken by a shop.
  b.block('plaster', 4, H, 4.6, HALL.minX + 2, 0, HALL.minZ + 2.3);
  b.block('plaster', 4, H, 1.1, HALL.minX + 2, 0, HALL.maxZ - 0.55);
  b.block('plaster', 2, H, 4, HALL.maxX - 1, 0, HALL.minZ + 2);

  buildEntrance(b);
  buildCeiling(b);

  for (const p of PILLARS) {
    b.block('plaster', PILLAR_HALF * 2, H, PILLAR_HALF * 2, p.x, 0, p.z, 0.03);
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      b.block('steel', 0.05, 1.2, 0.05, p.x + sx * PILLAR_HALF, 0, p.z + sz * PILLAR_HALF);
    }
    b.add('notice', geo.box(0.62, 0.8, 0.03), trs(p.x, 1.55, p.z + PILLAR_HALF + 0.016));
    b.box('walnut', 0.68, 0.86, 0.02, p.x, 1.55, p.z + PILLAR_HALF + 0.004);
    b.box('walnut', 0.04, 0.12, 0.02, p.x, 0.07, p.z + PILLAR_HALF + 0.01);
  }
}

function buildEntrance(b: Batch) {
  const z = HALL.maxZ;
  const half = DOOR.width / 2;
  // Frame.
  b.block('frame', 0.12, 2.75, 0.2, DOOR.x - half, 0, z);
  b.block('frame', 0.12, 2.75, 0.2, DOOR.x + half, 0, z);
  b.box('frame', DOOR.width + 0.12, 0.14, 0.2, DOOR.x, 2.75, z);
  b.box('frame', 0.08, 2.6, 0.12, DOOR.x, 1.3, z);
  // Glass leaves standing open inward, with push bars.
  for (const side of [-1, 1]) {
    const hinge = DOOR.x + side * half;
    const angle = side * 1.15;
    const cx = hinge - side * Math.cos(angle) * (half / 2);
    const cz = z - Math.sin(Math.abs(angle)) * (half / 2);
    b.add('glassTint', geo.box(half - 0.08, 2.5, 0.02), trs(cx, 1.3, cz, -angle));
    b.add('frame', geo.box(half - 0.04, 0.08, 0.05), trs(cx, 2.55, cz, -angle));
    b.add('frame', geo.box(half - 0.04, 0.1, 0.05), trs(cx, 0.08, cz, -angle));
    b.add('chrome', geo.box(half - 0.3, 0.04, 0.04), trs(cx, 1.05, cz, -angle));
  }
  b.add('mat', geo.plane(2.8, 1.3), trs(DOOR.x, 0.008, z - 0.85, 0, -PI / 2));
  b.box('exitGlow', 0.5, 0.18, 0.05, DOOR.x, 3.05, z - 0.05);
  b.box('whiteLacquer', 0.56, 0.22, 0.03, DOOR.x, 3.05, z - 0.02);

  // Front plaza and canopy.
  b.add('paving', geo.plane(48, 10, 3), trs(6, 0.004, z + 5, 0, -PI / 2));
  b.box('concrete', DOOR.width + 2.4, 0.14, 2.2, DOOR.x, 2.95, z + 1.1);
  b.box('streetGlow', DOOR.width + 2, 0.02, 0.08, DOOR.x, 2.87, z + 2.05);
  // FOOD COURT sign standing on the canopy's front edge.
  b.box('frame', 5.6, 0.82, 0.12, DOOR.x, 3.43, z + 2.12);
  b.add('courtSign', geo.plane(5.4, 0.7), trs(DOOR.x, 3.43, z + 2.185));
  for (const dx of [-4.5, 4.5, -9, 9]) {
    const px = DOOR.x + dx;
    b.add('terracotta', geo.lathe('planter', [
      [0.001, 0],
      [0.38, 0],
      [0.44, 0.55],
      [0.4, 0.58],
      [0.001, 0.58],
    ]), trs(px, 0, z + 1.4));
    b.add('leaf', geo.ico(0.42, 1), trs(px, 0.95, z + 1.4));
    b.add('leafLight', geo.ico(0.3, 1), trs(px + 0.15, 1.2, z + 1.3));
  }
}

function buildCeiling(b: Batch) {
  // Two runs of exposed duct with joint rings and straps.
  for (const z of [-4.6, 5.4]) {
    b.add('duct', geo.cyl(0.3, 0.3, HALL.maxX - HALL.minX - 1, 24, true), trs(0, 3.95, z, 0, 0, PI / 2));
    for (let x = HALL.minX + 1.5; x < HALL.maxX - 1; x += 2.2) {
      b.add('duct', geo.torus(0.31, 0.025, 28), trs(x, 3.95, z, PI / 2));
      b.box('iron', 0.03, 0.3, 0.03, x, 4.35, z);
    }
    for (let x = HALL.minX + 3; x < HALL.maxX - 2; x += 4.4) {
      b.box('frame', 0.5, 0.06, 0.25, x, 3.62, z);
      b.add('duct', geo.cyl(0.12, 0.12, 0.3, 16), trs(x, 3.75, z));
    }
  }
  // Tube-light panels on a grid.
  for (let x = -13; x <= 16; x += 4) {
    for (const z of [-7.2, -2, 1.2, 3.6, 8, 10.6]) {
      b.box('whiteLacquer', 1.36, 0.05, 0.32, x, H - 0.03, z);
      b.box('tubeLight', 1.24, 0.03, 0.22, x, H - 0.07, z);
    }
  }
  // Pendants over the four-seat tables.
  for (const t of TABLES) {
    if (t.kind !== 'four' && t.kind !== 'bench') continue;
    const zs = t.kind === 'bench' ? [t.z - 0.5, t.z + 0.5] : [t.z];
    for (const z of zs) {
      b.add('black', geo.cyl(0.006, 0.006, H - 2.35, 6), trs(t.x, 2.35 + (H - 2.35) / 2, z));
      b.add(
        'iron',
        geo.lathe('pendant', [
          [0.03, 0.26],
          [0.05, 0.24],
          [0.14, 0.12],
          [0.2, 0.0],
          [0.19, 0.0],
          [0.13, 0.11],
          [0.04, 0.23],
        ]),
        trs(t.x, 2.12, z)
      );
      b.add('pendantGlow', geo.sphere(0.06, 12, 8), trs(t.x, 2.16, z));
    }
  }
  for (const [x, z] of FAN_SPOTS) {
    b.add('iron', geo.cyl(0.015, 0.015, 0.55, 8), trs(x, H - 0.28, z));
  }
}

export function buildCourtyard(b: Batch) {
  // Outdoor ground on the window side and a strip behind the building.
  b.add('grass', geo.plane(26, 46, 5), trs(31.5, 0.002, 0, 0, -PI / 2));
  b.add('paving', geo.plane(3, 46, 3), trs(22.5, 0.006, 0, 0, -PI / 2));
  b.add('paving', geo.plane(14, 3, 3), trs(28, 0.006, -1, 0, -PI / 2));
  for (const z of [-18, -9, 0, 9, 18]) {
    b.block('hedge', 0.8, 0.9, 6.5, 20, 0, z + 2.8, 0.25);
  }
  const trees: Array<[number, number, number]> = [
    [26, -15, 1.1],
    [34, -9, 1.3],
    [26, 13, 1.2],
    [36, 6, 1.0],
    [33, 17, 1.25],
    [38, -16, 1.15],
    [24.5, 4.5, 0.9],
    [-6, 21, 1.1],
    [12, 21, 1.2],
    [-16, 20, 1],
  ];
  for (const [x, z, s] of trees) {
    b.add('bark', geo.cyl(0.11, 0.17, 3.2, 10), trs(x, 1.6 * s, z, 0, 0, 0, s, s, s));
    b.add('leaf', geo.ico(1.6, 1), trs(x, 3.9 * s, z, 0.4, 0, 0, s, s * 0.9, s));
    b.add('leafLight', geo.ico(1.1, 1), trs(x + 0.7 * s, 4.6 * s, z - 0.3 * s, 1.1, 0, 0, s, s, s));
    b.add('leaf', geo.ico(1.0, 1), trs(x - 0.8 * s, 3.4 * s, z + 0.5 * s, 2, 0, 0, s, s, s));
    b.add('soil', geo.cyl(0.7 * s, 0.7 * s, 0.03, 16), trs(x, 0.004, z));
  }
  // Umbrella tables.
  const umbrellas: Array<[number, number, string]> = [
    [27.5, -6, 'umbrellaA'],
    [27.5, 0.5, 'umbrellaB'],
    [27.5, 7, 'umbrellaA'],
    [31.5, -2.8, 'umbrellaB'],
    [31.5, 3.8, 'umbrellaA'],
  ];
  for (const [x, z, fabric] of umbrellas) {
    b.add('chrome', geo.cyl(0.03, 0.03, 2.4, 8), trs(x, 1.2, z));
    b.add(fabric, geo.cyl(0.06, 1.45, 0.5, 8, true), trs(x, 2.35, z));
    b.add('steel', geo.cyl(0.42, 0.42, 0.03, 20), trs(x, 0.74, z));
    b.add('iron', geo.cyl(0.03, 0.18, 0.72, 10), trs(x, 0.36, z));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + 0.4;
      const sx = x + Math.cos(a) * 0.75;
      const sz = z + Math.sin(a) * 0.75;
      b.add('iron', geo.cyl(0.18, 0.16, 0.04, 14), trs(sx, 0.45, sz));
      b.add('iron', geo.cyl(0.02, 0.02, 0.45, 6), trs(sx, 0.22, sz));
    }
  }
  for (const z of [-15, -5, 5, 15]) {
    b.add('iron', geo.cyl(0.05, 0.07, 3.4, 10), trs(23.6, 1.7, z));
    b.add('streetGlow', geo.sphere(0.16, 12, 8), trs(23.6, 3.45, z));
    b.add('iron', geo.cyl(0.2, 0.12, 0.08, 12), trs(23.6, 3.62, z));
  }
}
