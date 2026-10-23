import { STATIONS, TABLES } from '../../data/layout';
import { Batch, geo, trs } from '../batch';

const PI = Math.PI;

export function buildFurniture(b: Batch) {
  for (const t of TABLES) {
    if (t.kind === 'four') {
      b.add('oak', geo.box(0.92, 0.04, 0.92, 0.015), trs(t.x, t.top - 0.02, t.z));
      b.add('walnut', geo.box(0.94, 0.02, 0.94, 0.008), trs(t.x, t.top - 0.045, t.z));
      b.add('iron', geo.cyl(0.04, 0.04, t.top - 0.06, 12), trs(t.x, (t.top - 0.06) / 2, t.z));
      b.add('iron', geo.cyl(0.26, 0.3, 0.03, 24), trs(t.x, 0.015, t.z));
    } else if (t.kind === 'bench') {
      b.add('oak', geo.box(0.82, 0.045, 1.92, 0.015), trs(t.x, t.top - 0.022, t.z));
      for (const dz of [-0.8, 0.8]) {
        b.add('iron', geo.box(0.06, t.top - 0.05, 0.06), trs(t.x - 0.3, (t.top - 0.05) / 2, t.z + dz));
        b.add('iron', geo.box(0.06, t.top - 0.05, 0.06), trs(t.x + 0.3, (t.top - 0.05) / 2, t.z + dz));
        b.add('iron', geo.box(0.66, 0.04, 0.05), trs(t.x, 0.1, t.z + dz));
      }
      for (const side of [-1, 1]) {
        const bx = t.x + side * 0.72;
        b.add('walnut', geo.box(0.36, 0.05, 1.92, 0.012), trs(bx, 0.44, t.z));
        b.add('cushion', geo.box(0.32, 0.03, 1.84, 0.012), trs(bx, 0.475, t.z));
        for (const dz of [-0.82, 0.82]) b.add('iron', geo.box(0.05, 0.42, 0.05), trs(bx, 0.21, t.z + dz));
      }
    } else {
      // Window bar counter section with two stools.
      b.add('walnut', geo.box(0.56, 0.05, 1.02, 0.012), trs(t.x, t.top - 0.025, t.z));
      b.add('iron', geo.box(0.04, t.top - 0.05, 0.04), trs(t.x - 0.2, (t.top - 0.05) / 2, t.z - 0.45));
      b.add('iron', geo.box(0.04, t.top - 0.05, 0.04), trs(t.x - 0.2, (t.top - 0.05) / 2, t.z + 0.45));
      b.add('chrome', geo.box(0.03, 0.03, 0.96), trs(t.x - 0.22, 0.25, t.z));
      for (const s of t.seats) {
        b.add('oak', geo.cyl(0.19, 0.17, 0.05, 20), trs(s.x, s.height - 0.03, s.z));
        b.add('chrome', geo.cyl(0.025, 0.025, s.height - 0.05, 10), trs(s.x, (s.height - 0.05) / 2, s.z));
        b.add('chrome', geo.torus(0.15, 0.012, 20), trs(s.x, 0.3, s.z, 0, PI / 2));
        b.add('iron', geo.cyl(0.2, 0.22, 0.025, 20), trs(s.x, 0.012, s.z));
      }
    }
    // Steel water jug and glasses on some tables.
    if (Number(t.id.slice(1)) % 3 === 0) {
      const jx = t.kind === 'high' ? t.x + 0.05 : t.x - 0.18;
      b.add('steel', geo.lathe('jug', [
        [0.001, 0],
        [0.07, 0],
        [0.08, 0.14],
        [0.06, 0.2],
        [0.065, 0.22],
        [0.001, 0.22],
      ]), trs(jx, t.top, t.z - 0.12));
      b.add('glass', geo.cyl(0.035, 0.03, 0.1, 12), trs(jx + 0.15, t.top + 0.05, t.z - 0.02));
    }
    // Napkin holder.
    b.add('chrome', geo.box(0.1, 0.08, 0.05, 0.005), trs(t.x + (t.kind === 'high' ? 0.1 : 0.18), t.top + 0.04, t.z + 0.1));
  }
}

export function buildStations(b: Batch) {
  const s = STATIONS;
  // Tray return: counter with a hatch, dish rack and two bins.
  const tr = s.trayReturn;
  b.block('steel', tr.w, 0.92, 0.7, tr.x, 0, tr.z, 0.02);
  b.box('black', tr.w - 0.3, 0.75, 0.02, tr.x, 1.55, 11.99);
  b.box('frame', tr.w, 0.08, 0.1, tr.x, 1.97, 11.95);
  b.box('frame', tr.w, 0.08, 0.1, tr.x, 1.15, 11.95);
  for (let i = 0; i < 9; i++) b.add('chrome', geo.box(0.01, 0.22, 0.4), trs(tr.x - 0.9 + i * 0.07, 1.05, tr.z - 0.05));
  for (let i = 0; i < 4; i++) b.add('plasticGreen', geo.box(0.36, 0.02, 0.28, 0.01), trs(tr.x + 0.55, 0.95 + i * 0.025, tr.z));
  b.add('whiteLacquer', geo.box(1.0, 0.25, 0.03, 0.01), trs(tr.x, 2.25, 11.97));

  // Water cooler.
  const wc = s.waterCooler;
  b.block('whiteLacquer', 0.42, 1.05, 0.42, wc.x, 0, wc.z, 0.04);
  b.add('waterBlue', geo.lathe('can', [
    [0.001, 0],
    [0.15, 0],
    [0.16, 0.3],
    [0.12, 0.42],
    [0.05, 0.45],
    [0.001, 0.45],
  ]), trs(wc.x, 1.05, wc.z));
  b.box('plasticBlue', 0.05, 0.05, 0.05, wc.x - 0.08, 0.85, wc.z - 0.23);
  b.box('foodRed', 0.05, 0.05, 0.05, wc.x + 0.08, 0.85, wc.z - 0.23);

  // Cutlery station with spoon holders.
  const cu = s.cutlery;
  b.block('oak', 0.9, 0.95, 0.55, cu.x, 0, cu.z, 0.02);
  for (let i = 0; i < 4; i++) b.add('steel', geo.cyl(0.06, 0.06, 0.16, 14), trs(cu.x - 0.3 + i * 0.2, 1.03, cu.z));
  b.add('ceramic', geo.cyl(0.12, 0.12, 0.2, 18), trs(cu.x + 0.3, 1.05, cu.z - 0.12));

  // Hand-wash basins with mirror.
  for (const bs of s.basins) {
    b.block('whiteLacquer', 0.62, 0.82, 0.45, bs.x, 0, bs.z, 0.03);
    b.add('ceramic', geo.lathe('basin', [
      [0.001, 0.02],
      [0.18, 0.02],
      [0.24, 0.14],
      [0.23, 0.15],
      [0.17, 0.05],
      [0.001, 0.05],
    ]), trs(bs.x, 0.82, bs.z - 0.02));
    b.add('chrome', geo.cyl(0.015, 0.015, 0.2, 8), trs(bs.x, 0.92, bs.z + 0.16));
    b.add('chrome', geo.box(0.02, 0.02, 0.12), trs(bs.x, 1.12, bs.z + 0.1));
    b.box('glassTint', 0.55, 0.7, 0.02, bs.x, 1.55, 11.97);
    b.box('frame', 0.6, 0.75, 0.01, bs.x, 1.55, 11.985);
  }

  // Wet and dry bins.
  s.bins.forEach((bin, i) => {
    b.add(i === 0 ? 'plasticGreen' : 'plasticBlue', geo.lathe('bin', [
      [0.001, 0],
      [0.17, 0],
      [0.2, 0.65],
      [0.21, 0.66],
      [0.001, 0.66],
    ]), trs(bin.x, 0, bin.z));
    b.add('black', geo.cyl(0.21, 0.21, 0.04, 20), trs(bin.x, 0.68, bin.z));
  });

  // Self-order kiosks.
  for (const k of s.kiosks) {
    b.block('whiteLacquer', 0.5, 0.08, 0.42, k.x, 0, k.z, 0.03);
    b.add('whiteLacquer', geo.box(0.38, 1.35, 0.14, 0.05), trs(k.x, 0.75, k.z));
    b.add('black', geo.box(0.42, 0.66, 0.06, 0.03), trs(k.x, 1.25, k.z - 0.08, PI, -0.18));
    b.add('kioskGlow', geo.box(0.36, 0.58, 0.004), trs(k.x, 1.25, k.z - 0.115, PI, -0.18));
    b.add('steel', geo.box(0.24, 0.04, 0.08), trs(k.x, 0.8, k.z - 0.1, PI));
  }

  // Helpdesk.
  const hd = s.helpdesk;
  b.block('whiteLacquer', 2, 1.05, 0.8, hd.x, 0, hd.z, 0.04);
  b.block('oak', 2.08, 0.05, 0.88, hd.x, 1.05, hd.z, 0.015);
  b.box('trim:biryani-house', 1.9, 0.03, 0.02, hd.x, 0.5, hd.z - 0.41);
  b.add('black', geo.box(0.4, 0.3, 0.03, 0.01), trs(hd.x + 0.4, 1.28, hd.z + 0.1, PI, -0.2));

  // Vending machine.
  const vm = s.vending;
  b.block('lacquer:wok-momos', 0.9, 1.9, 0.8, vm.x, 0, vm.z, 0.04);
  b.box('fridgeGlow', 0.55, 1.2, 0.02, vm.x - 0.452, 1.15, vm.z - 0.08, PI / 2);
  b.box('glass', 0.6, 1.3, 0.02, vm.x - 0.46, 1.15, vm.z - 0.08, PI / 2);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) b.add(['bottleA', 'bottleB', 'bottleC'][(r + c) % 3]!, geo.box(0.08, 0.16, 0.08), trs(vm.x - 0.3, 0.68 + r * 0.22, vm.z - 0.25 + c * 0.17));
  b.box('black', 0.06, 0.4, 0.2, vm.x - 0.45, 1.2, vm.z + 0.27, PI / 2);

  // Plants.
  for (const p of s.plants) {
    b.add('terracotta', geo.lathe('pot', [
      [0.001, 0],
      [0.22, 0],
      [0.3, 0.5],
      [0.32, 0.52],
      [0.001, 0.52],
    ]), trs(p.x, 0, p.z));
    b.add('soil', geo.cyl(0.29, 0.29, 0.02, 16), trs(p.x, 0.5, p.z));
    b.add('bark', geo.cyl(0.025, 0.035, 0.7, 6), trs(p.x, 0.85, p.z));
    b.add('leaf', geo.ico(0.38, 1), trs(p.x, 1.3, p.z));
    b.add('leafLight', geo.ico(0.28, 1), trs(p.x + 0.12, 1.55, p.z - 0.1));
    b.add('leaf', geo.ico(0.24, 1), trs(p.x - 0.15, 1.1, p.z + 0.12));
  }

  // "Now serving" board: hangs from the ceiling over the shops row; faces are live canvases.
  const tb = s.tokenBoard;
  b.box('black', 3.3, 1.25, 0.12, tb.x, tb.y, tb.z, 0, 0.03);
  for (const dx of [-1.4, 1.4]) b.add('iron', geo.cyl(0.01, 0.01, 4.5 - tb.y - 0.62, 6), trs(tb.x + dx, tb.y + 0.62 + (4.5 - tb.y - 0.62) / 2, tb.z));

  // Wall clock frame above the tray return.
  b.add('iron', geo.cyl(0.36, 0.36, 0.06, 40), trs(-9.4, 3.05, 11.95, 0, PI / 2));
}
