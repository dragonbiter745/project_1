import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MatKey } from './materials';

const geoCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = normalise(make());
    geoCache.set(key, g);
  }
  return g;
}

/** Non-indexed with exactly position / normal / uv, so any pieces can be merged together. */
function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) {
    const n = out.attributes.position!.count;
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return out;
}

export const geo = {
  box: (w: number, h: number, d: number, r = 0) =>
    cached(`box:${w}:${h}:${d}:${r}`, () => (r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d))),
  cyl: (rt: number, rb: number, h: number, seg = 20, open = false) => cached(`cyl:${rt}:${rb}:${h}:${seg}:${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  sphere: (r: number, ws = 16, hs = 12) => cached(`sph:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  /** With a tile size, UVs repeat every `tile` metres instead of stretching once across the plane. */
  plane: (w: number, h: number, tile = 0) =>
    cached(`plane:${w}:${h}:${tile}`, () => {
      const g = new THREE.PlaneGeometry(w, h);
      if (tile > 0) {
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
      }
      return g;
    }),
  torus: (r: number, t: number, seg = 24) => cached(`tor:${r}:${t}:${seg}`, () => new THREE.TorusGeometry(r, t, 8, seg)),
  /**
   * Box whose UVs repeat once per `bays` window bays (bayW wide, floorH tall), so a facade texture
   * shows correctly sized windows on any building size. Top and bottom faces get the same scale.
   */
  facade: (w: number, h: number, d: number, bayW: number, floorH: number, bays = 4) =>
    cached(`facade:${w}:${h}:${d}:${bayW}:${floorH}`, () => {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const dims: Array<[number, number]> = [
        [d, h],
        [d, h],
        [w, d],
        [w, d],
        [w, h],
        [w, h],
      ];
      for (let i = 0; i < uv.count; i++) {
        const [du, dv] = dims[Math.floor(i / 4)]!;
        uv.setXY(i, (uv.getX(i) * du) / (bayW * bays), (uv.getY(i) * dv) / (floorH * bays));
      }
      return g;
    }),
  ico: (r: number, d = 1) => cached(`ico:${r}:${d}`, () => new THREE.IcosahedronGeometry(r, d)),
  cone: (r: number, h: number, seg = 16) => cached(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  /** Profile points are [radius, height] pairs from bottom to top. */
  lathe: (key: string, profile: Array<[number, number]>, seg = 28) =>
    cached(`lathe:${key}`, () => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg)),
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

export function trs(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  tmpE.set(rx, ry, rz, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  tmpP.set(x, y, z);
  tmpS.set(sx, sy, sz);
  return new THREE.Matrix4().compose(tmpP, tmpQ, tmpS);
}

/**
 * Collects static pieces and merges them into one mesh per material, so the whole
 * hall costs a few dozen draw calls instead of thousands.
 */
export class Batch {
  private readonly parts = new Map<MatKey, THREE.BufferGeometry[]>();
  /** Applied to every piece added while set (used for shop-local building). */
  frame: THREE.Matrix4 | null = null;

  add(key: MatKey, g: THREE.BufferGeometry, m: THREE.Matrix4) {
    const piece = g.clone();
    piece.applyMatrix4(this.frame ? tmpM.multiplyMatrices(this.frame, m) : m);
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(piece);
  }

  box(key: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, r = 0) {
    this.add(key, geo.box(w, h, d, r), trs(x, y, z, ry));
  }

  /** Box resting on y (bottom face at y). */
  block(key: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, r = 0, ry = 0) {
    this.add(key, geo.box(w, h, d, r), trs(x, y + h / 2, z, ry));
  }

  cyl(key: MatKey, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 20) {
    this.add(key, geo.cyl(rt, rb, h, seg), trs(x, y + h / 2, z));
  }

  build(): Array<{ key: MatKey; geometry: THREE.BufferGeometry }> {
    const out: Array<{ key: MatKey; geometry: THREE.BufferGeometry }> = [];
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      out.push({ key, geometry: merged });
    }
    this.parts.clear();
    return out;
  }
}
