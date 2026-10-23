import * as THREE from 'three';
import { Rng } from '../../sim/rng';
import { Batch, geo, trs } from '../batch';

const PI = Math.PI;

// Campus around the food court. The hall spans x -18..18, z -12..12; the courtyard is east (+x),
// the entrance plaza south (+z). Everything here sits clear of those.

interface Block {
  style: 'brick' | 'stone' | 'modern' | 'hostel';
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  floorH: number;
  bay: number;
}

/** Triangular prism along x (gable roofs, the portico pediment): base at y0, apex `height` above. */
function prism(b: Batch, key: string, x: number, y0: number, z: number, length: number, depth: number, height: number) {
  // A 3-sided cylinder has its apex at +1 and its base at -0.5 once turned to point up.
  const m = new THREE.Matrix4()
    .makeTranslation(x, y0 + height / 3, z)
    .multiply(new THREE.Matrix4().makeScale(1, (height * 2) / 3, depth / Math.sqrt(3)))
    .multiply(new THREE.Matrix4().makeRotationX(-PI / 2))
    .multiply(new THREE.Matrix4().makeRotationZ(PI / 2));
  b.add(key, geo.cyl(1, 1, length, 3), m);
}

/** A building: podium, facade box with window bays, cornice and roof slab with plant. */
function building(b: Batch, k: Block) {
  const h = k.floors * k.floorH;
  const podium = 1.1;
  b.add('trim', geo.box(k.w + 0.3, podium, k.d + 0.3), trs(k.x, podium / 2, k.z));
  b.add(`facade:${k.style}`, geo.facade(k.w, h, k.d, k.bay, k.floorH), trs(k.x, podium + h / 2, k.z));
  // Floor bands make the storeys read from a distance.
  for (let f = 1; f < k.floors; f++) {
    b.add('trim', geo.box(k.w + 0.12, 0.16, k.d + 0.12), trs(k.x, podium + f * k.floorH, k.z));
  }
  b.add('trim', geo.box(k.w + 0.7, 0.5, k.d + 0.7), trs(k.x, podium + h + 0.25, k.z));
  b.add('roof', geo.box(k.w, 0.2, k.d), trs(k.x, podium + h + 0.55, k.z));
  // Rooftop plant and water tanks.
  b.add('steelDark', geo.box(3, 1.6, 2.4), trs(k.x + k.w * 0.25, podium + h + 1.45, k.z));
  b.add('plasticBlue', geo.cyl(0.9, 0.9, 1.6, 16), trs(k.x - k.w * 0.25, podium + h + 1.45, k.z));
  return podium + h;
}

function tree(b: Batch, x: number, z: number, s: number, rng: Rng) {
  b.add('bark', geo.cyl(0.12, 0.2, 3.2, 8), trs(x, 1.6 * s, z, 0, 0, 0, s, s, s));
  const crowns = rng.int(2, 3);
  for (let i = 0; i < crowns; i++) {
    b.add(i % 2 ? 'leafLight' : 'leaf', geo.ico(1.5 - i * 0.25, 1), trs(x + rng.range(-0.7, 0.7) * s, (3.6 + i * 0.7) * s, z + rng.range(-0.7, 0.7) * s, rng.range(0, 6), 0, 0, s, s * 0.92, s));
  }
}

function lamp(b: Batch, x: number, z: number) {
  b.add('iron', geo.cyl(0.06, 0.09, 4.6, 10), trs(x, 2.3, z));
  b.add('iron', geo.box(0.9, 0.08, 0.12), trs(x + 0.4, 4.55, z));
  b.add('streetGlow', geo.box(0.42, 0.06, 0.2), trs(x + 0.75, 4.48, z));
}

function scooter(b: Batch, x: number, z: number, ry: number, paint: string) {
  const at = (dx: number, dy: number, dz: number) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    return [x + dx * c + dz * s, dy, z - dx * s + dz * c] as const;
  };
  for (const dz of [-0.55, 0.55]) {
    const [wx, wy, wz] = at(0, 0.23, dz);
    b.add('rubber', geo.cyl(0.23, 0.23, 0.1, 14), trs(wx, wy, wz, ry, 0, PI / 2));
  }
  const [bx, , bz] = at(0, 0, 0.1);
  b.add(paint, geo.box(0.32, 0.38, 1.0, 0.1), trs(bx, 0.48, bz, ry));
  const [sx, , sz] = at(0, 0, -0.1);
  b.add('black', geo.box(0.3, 0.1, 0.62, 0.04), trs(sx, 0.75, sz, ry));
  const [hx, , hz] = at(0, 0, 0.62);
  b.add(paint, geo.box(0.22, 0.75, 0.18, 0.06), trs(hx, 0.75, hz, ry));
  b.add('chrome', geo.box(0.62, 0.04, 0.04), trs(hx, 1.12, hz, ry));
}

export function buildCampus(b: Batch) {
  const rng = new Rng(2026);

  // Roads: the main campus road south of the plaza, and a cross road west of the hall.
  b.add('asphalt', geo.plane(220, 8, 8), trs(10, 0.01, 27, 0, -PI / 2));
  b.add('asphalt', geo.plane(150, 7, 7), trs(-38, 0.012, -5, -PI / 2, -PI / 2));
  for (const z of [22.6, 31.4]) b.add('concrete', geo.box(220, 0.16, 0.5), trs(10, 0.08, z));
  // Footpaths.
  b.add('paving', geo.plane(64, 4, 3), trs(0, 0.008, -20, 0, -PI / 2));
  b.add('paving', geo.plane(4, 16, 3), trs(0, 0.009, -19.5, 0, -PI / 2));
  b.add('paving', geo.plane(3, 32, 3), trs(-25, 0.008, -5, 0, -PI / 2));
  b.add('paving', geo.plane(20, 3, 3), trs(45, 0.008, 14, 0, -PI / 2));

  // ── Academic block: brick, columned portico and clock tower ──
  const top = building(b, { style: 'brick', x: 0, z: -35, w: 64, d: 14, floors: 4, floorH: 3.6, bay: 3.2 });
  for (const side of [-1, 1]) building(b, { style: 'brick', x: side * 28, z: -24.5, w: 8, d: 7, floors: 3, floorH: 3.6, bay: 3.2 });
  // Portico.
  b.add('trim', geo.box(16, 0.5, 5), trs(0, 0.25, -26));
  b.add('trim', geo.box(15, 0.3, 4.4), trs(0, 0.65, -26.2));
  for (let i = 0; i < 6; i++) {
    const x = -6 + i * 2.4;
    b.add('whiteLacquer', geo.cyl(0.38, 0.45, 8.4, 18), trs(x, 0.8 + 4.2, -24.4));
    b.add('trim', geo.box(1.1, 0.4, 1.1), trs(x, 0.95, -24.4));
    b.add('trim', geo.box(1.1, 0.4, 1.1), trs(x, 9.35, -24.4));
  }
  b.add('trim', geo.box(15.6, 1.2, 4.6), trs(0, 10.1, -26.1));
  // Pediment: a triangular prism.
  prism(b, 'trim', 0, 10.7, -26.1, 15.6, 4.6, 2.2);
  // Clock tower.
  b.add('facade:brick', geo.facade(7, 11, 7, 3.2, 3.6), trs(0, top + 5.5, -35));
  b.add('trim', geo.box(7.6, 0.6, 7.6), trs(0, top + 11.3, -35));
  for (let i = 0; i < 4; i++) {
    const a = (i * PI) / 2;
    const cx = Math.sin(a) * 3.53;
    const cz = -35 + Math.cos(a) * 3.53;
    b.add('trim', geo.cyl(1.5, 1.5, 0.12, 32), trs(cx, top + 8, cz, a, PI / 2));
    b.add('iron', geo.box(0.12, 1.1, 0.05), trs(cx + Math.sin(a) * 0.08, top + 8.35, cz + Math.cos(a) * 0.08, a, 0, 0.5));
    b.add('iron', geo.box(0.1, 0.8, 0.05), trs(cx + Math.sin(a) * 0.08, top + 7.85, cz + Math.cos(a) * 0.08, a, 0, 2.2));
  }
  b.add('terracottaRoof', geo.cone(5.4, 5, 4), trs(0, top + 14.1, -35, PI / 4));
  b.add('patina', geo.cyl(0.05, 0.12, 2.6, 8), trs(0, top + 17.8, -35));

  // ── Library: sandstone with a green dome and glass atrium facing the cross road ──
  const libTop = building(b, { style: 'stone', x: -56, z: -4, w: 22, d: 30, floors: 3, floorH: 4, bay: 3.6 });
  b.add('patina', geo.sphere(6.5, 32, 16), trs(-56, libTop + 0.4, -4, 0, 0, 0, 1, 0.75, 1));
  b.add('trim', geo.cyl(6.8, 6.8, 1.2, 32), trs(-56, libTop + 0.6, -4));
  b.add('glassTint', geo.box(1.6, 9, 12), trs(-44.2, 5.6, -4));
  for (let i = 0; i < 5; i++) b.add('frame', geo.box(1.7, 9, 0.12), trs(-44.2, 5.6, -10 + i * 3));
  b.add('trim', geo.box(2.4, 0.6, 13), trs(-44.2, 10.4, -4));

  // ── Science block: glass and concrete with vertical fins ──
  const sciTop = building(b, { style: 'modern', x: 66, z: -12, w: 18, d: 32, floors: 5, floorH: 3.8, bay: 3 });
  for (let z = -27.5; z <= 3.5; z += 2.2) b.add('trim', geo.box(0.9, sciTop - 1.1, 0.18), trs(56.6, 1.1 + (sciTop - 1.1) / 2, z));
  b.add('steel', geo.box(6, 3, 6), trs(66, sciTop + 1.5, -18));

  // ── Hostels across the main road ──
  for (const x of [-34, 36]) {
    const t = building(b, { style: 'hostel', x, z: 50, w: 42, d: 12, floors: 5, floorH: 3.2, bay: 3 });
    prism(b, 'terracottaRoof', x, t + 0.5, 50, 43, 13, 3.4);
  }

  // ── Basketball court behind the science block ──
  b.add('court', geo.plane(16, 28), trs(45, 0.02, -42, 0, -PI / 2));
  for (const z of [-55.5, -28.5]) {
    b.add('iron', geo.cyl(0.08, 0.08, 3.4, 8), trs(45, 1.7, z + (z < -40 ? -0.6 : 0.6)));
    b.add('whiteLacquer', geo.box(1.8, 1.1, 0.06), trs(45, 3.3, z));
    b.add('foodRed', geo.torus(0.23, 0.02, 16), trs(45, 3.0, z + (z < -40 ? 0.35 : -0.35), 0, PI / 2));
  }
  b.add('iron', geo.box(17, 3, 0.05), trs(45, 1.5, -56.2));

  // ── Gate arch where the plaza meets the road ──
  for (const x of [-1.4, 9.4]) {
    b.add('trim', geo.box(1.4, 7.4, 1.4, 0.05), trs(x, 3.7, 22.2));
    b.add('terracottaRoof', geo.cone(1.2, 0.9, 4), trs(x, 7.85, 22.2, PI / 4));
  }
  b.add('trim', geo.box(12.4, 1.6, 1.0), trs(4, 6.5, 22.2));
  b.add('gateSign', geo.plane(10.8, 1.3), trs(4, 6.5, 22.71));
  b.add('gateSign', geo.plane(10.8, 1.3), trs(4, 6.5, 21.69, PI));

  // Flagpole on the quad.
  b.add('chrome', geo.cyl(0.06, 0.09, 11, 10), trs(14, 5.5, -19.5));
  b.add('flag', geo.box(2.2, 1.4, 0.02), trs(15.15, 10.1, -19.5));
  b.add('trim', geo.cyl(1.2, 1.4, 0.4, 16), trs(14, 0.2, -19.5));

  // Benches along the quad path.
  for (const x of [-22, -12, 8, 22]) {
    b.add('oak', geo.box(1.8, 0.08, 0.45, 0.02), trs(x, 0.46, -21.8));
    b.add('oak', geo.box(1.8, 0.4, 0.06, 0.02), trs(x, 0.7, -22.05, 0, -0.15));
    for (const dx of [-0.75, 0.75]) b.add('iron', geo.box(0.06, 0.44, 0.4), trs(x + dx, 0.22, -21.8));
  }

  // Parked scooters along the road edge.
  const paints = ['scooterA', 'scooterB', 'scooterC'];
  for (let i = 0; i < 18; i++) scooter(b, -30 + i * 1.1, 21.3, 0.25, paints[i % 3]!);
  for (let i = 0; i < 12; i++) scooter(b, 14 + i * 1.1, 21.3, -0.2, paints[(i + 1) % 3]!);

  // Street lamps and avenue trees along the main road.
  for (let x = -70; x <= 90; x += 12) {
    lamp(b, x, 22.2);
    if (Math.abs(x - 4) > 8) tree(b, x + 6, 33.5, rng.range(0.95, 1.25), rng);
  }
  for (let z = -60; z <= 18; z += 10) {
    tree(b, -42.5, z, rng.range(0.9, 1.2), rng);
    lamp(b, -33.8, z + 5);
  }
  // Clusters around the buildings and quad.
  const spots: Array<[number, number]> = [
    [-26, -16],
    [-30, 6],
    [-29, 16],
    [26, -17],
    [36, -24],
    [52, 16],
    [74, 14],
    [78, -32],
    [-70, -26],
    [-72, 18],
    [-48, 26],
    [60, 38],
    [-6, 40],
    [14, 40],
    [-60, 60],
    [80, 60],
  ];
  for (const [x, z] of spots) {
    tree(b, x, z, rng.range(0.9, 1.35), rng);
    tree(b, x + rng.range(2.5, 4), z + rng.range(-3, 3), rng.range(0.8, 1.15), rng);
  }

  // Distant city blocks and hills on the horizon, softened by fog.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2 + 0.3;
    const r = rng.range(125, 150);
    building(b, { style: i % 2 ? 'stone' : 'modern', x: Math.cos(a) * r, z: Math.sin(a) * r, w: rng.range(14, 26), d: rng.range(12, 20), floors: rng.int(4, 9), floorH: 3.4, bay: 3 });
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    const r = rng.range(200, 240);
    const s = rng.range(26, 46);
    b.add(i % 2 ? 'hill' : 'hillFar', geo.ico(1, 1), trs(Math.cos(a) * r, -s * 0.15, Math.sin(a) * r, rng.range(0, 6), 0, 0, s * 1.6, s * rng.range(0.45, 0.7), s * 1.2));
  }
}
