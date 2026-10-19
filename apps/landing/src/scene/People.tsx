import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RIG, createPose, poseFor } from '../sim/rig';
import type { Agent } from '../sim/types';
import { getSim } from '../store/sim';
import { useUi } from '../store/ui';
import { frame } from './frame';

const MAX = 180;

type PartKey =
  | 'pelvis'
  | 'torso'
  | 'head'
  | 'eyes'
  | 'hairShort'
  | 'hairLong'
  | 'hairBun'
  | 'chefCap'
  | 'upperArm'
  | 'forearm'
  | 'hand'
  | 'thigh'
  | 'shin'
  | 'foot'
  | 'backpack'
  | 'phone'
  | 'tray'
  | 'trolley'
  | 'cans'
  | 'umbrella';

// One instance per person, in the same order as the torso, so the owner table applies.
const PICKABLE: ReadonlySet<PartKey> = new Set(['torso', 'head', 'pelvis']);
const PAIRED: ReadonlySet<PartKey> = new Set(['upperArm', 'forearm', 'hand', 'thigh', 'shin', 'foot']);

function clean(g: THREE.BufferGeometry) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
  return out;
}
const merge = (...parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map(clean))!;

function buildGeometries(): Record<PartKey, THREE.BufferGeometry> {
  const torso = new THREE.LatheGeometry(
    [
      [0.001, 0],
      [0.135, 0],
      [0.15, 0.08],
      [0.148, 0.2],
      [0.163, 0.32],
      [0.19, 0.42],
      [0.172, 0.48],
      [0.1, 0.515],
      [0.001, 0.53],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    20
  );
  torso.scale(1, 1, 0.62);
  const neck = new THREE.CylinderGeometry(0.045, 0.052, 0.1, 10).translate(0, 0.04, 0);
  const skull = new THREE.SphereGeometry(0.105, 18, 14).scale(0.94, 1.12, 1.02).translate(0, 0.17, 0.005);
  const nose = new THREE.SphereGeometry(0.018, 8, 6).scale(0.8, 1, 1).translate(0, 0.155, 0.105);
  const ears = merge(new THREE.SphereGeometry(0.022, 8, 6).scale(0.5, 1, 0.8).translate(0.098, 0.17, 0), new THREE.SphereGeometry(0.022, 8, 6).scale(0.5, 1, 0.8).translate(-0.098, 0.17, 0));
  const cap = () => new THREE.SphereGeometry(0.114, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.97, 1.1, 1.05).translate(0, 0.182, -0.008);
  const thigh = new THREE.CapsuleGeometry(0.068, 0.3, 4, 12).translate(0, -0.215, 0);
  thigh.scale(1, 1, 1.05);
  return {
    pelvis: new RoundedBoxGeometry(0.31, 0.17, 0.2, 3, 0.07).translate(0, 0.01, 0),
    torso,
    head: merge(neck, skull, nose, ears),
    eyes: merge(new THREE.SphereGeometry(0.014, 8, 6).translate(0.036, 0.19, 0.096), new THREE.SphereGeometry(0.014, 8, 6).translate(-0.036, 0.19, 0.096)),
    hairShort: cap(),
    hairLong: merge(cap(), new RoundedBoxGeometry(0.2, 0.24, 0.07, 2, 0.03).translate(0, 0.1, -0.085)),
    hairBun: merge(cap(), new THREE.SphereGeometry(0.052, 12, 10).translate(0, 0.27, -0.07)),
    chefCap: merge(new THREE.CylinderGeometry(0.105, 0.1, 0.13, 18).translate(0, 0.285, 0), new THREE.SphereGeometry(0.12, 16, 10).scale(1, 0.6, 1).translate(0, 0.36, 0)),
    upperArm: new THREE.CapsuleGeometry(0.05, 0.19, 4, 10).translate(0, -0.135, 0),
    forearm: new THREE.CapsuleGeometry(0.04, 0.18, 4, 10).translate(0, -0.125, 0),
    hand: new THREE.SphereGeometry(0.046, 10, 8).scale(0.8, 1.15, 0.55).translate(0, -0.045, 0),
    thigh,
    shin: new THREE.CapsuleGeometry(0.052, 0.31, 4, 10).translate(0, -0.205, 0),
    foot: new RoundedBoxGeometry(0.1, 0.075, 0.25, 2, 0.03).translate(0, -0.03, 0.055),
    backpack: new RoundedBoxGeometry(0.27, 0.34, 0.13, 3, 0.05),
    phone: new RoundedBoxGeometry(0.07, 0.14, 0.012, 2, 0.006),
    tray: merge(
      new RoundedBoxGeometry(0.44, 0.025, 0.32, 2, 0.01),
      new THREE.CylinderGeometry(0.09, 0.08, 0.025, 16).translate(-0.09, 0.025, 0),
      new THREE.CylinderGeometry(0.05, 0.045, 0.06, 12).translate(0.12, 0.04, -0.06),
      new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.09, 0.035, 0)
    ),
    trolley: merge(
      new RoundedBoxGeometry(0.5, 0.04, 0.7, 2, 0.015).translate(0, 0.22, 0),
      new RoundedBoxGeometry(0.5, 0.04, 0.7, 2, 0.015).translate(0, 0.62, 0),
      ...[-0.22, 0.22].flatMap((x) => [-0.32, 0.32].map((z) => new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6).translate(x, 0.45, z))),
      ...[-0.2, 0.2].flatMap((x) => [-0.28, 0.28].map((z) => new THREE.SphereGeometry(0.045, 8, 6).translate(x, 0.045, z))),
      new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6).rotateZ(Math.PI / 2).translate(0, 0.92, -0.34)
    ),
    cans: merge(
      new THREE.CylinderGeometry(0.15, 0.15, 0.38, 14).translate(-0.12, 0.84, 0.12),
      new THREE.CylinderGeometry(0.15, 0.15, 0.38, 14).translate(0.12, 0.84, -0.14),
      new THREE.CylinderGeometry(0.13, 0.13, 0.5, 14).translate(0.1, 0.5, 0.18)
    ),
    umbrella: merge(new THREE.ConeGeometry(0.55, 0.22, 10, 1, true).translate(0, 0.3, 0), new THREE.CylinderGeometry(0.01, 0.01, 0.6, 6)),
  };
}

const COLORS = { eyes: 0x1a1210, phone: 0x111827, tray: 0x8b5e34, trolley: 0x9aa1a9, cans: 0x2563eb, umbrella: 0x1e40af, chef: 0xf7f7f2 };

export function People() {
  const geos = useMemo(buildGeometries, []);
  const mats = useMemo(() => {
    const cloth = new THREE.MeshStandardMaterial({ roughness: 0.82 });
    const skin = new THREE.MeshStandardMaterial({ roughness: 0.55 });
    const hair = new THREE.MeshStandardMaterial({ roughness: 0.62 });
    const shiny = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.2 });
    const metal = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.75 });
    const fabric = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
    return { cloth, skin, hair, shiny, metal, fabric };
  }, []);
  const meshes = useRef<Partial<Record<PartKey, THREE.InstancedMesh>>>({});
  const owner = useRef(new Int32Array(MAX));
  const youRing = useRef<THREE.Mesh>(null);
  const youArrow = useRef<THREE.Mesh>(null);

  const partMat: Record<PartKey, THREE.Material> = {
    pelvis: mats.cloth,
    torso: mats.cloth,
    head: mats.skin,
    eyes: mats.shiny,
    hairShort: mats.hair,
    hairLong: mats.hair,
    hairBun: mats.hair,
    chefCap: mats.cloth,
    upperArm: mats.cloth,
    forearm: mats.skin,
    hand: mats.skin,
    thigh: mats.cloth,
    shin: mats.cloth,
    foot: mats.shiny,
    backpack: mats.cloth,
    phone: mats.shiny,
    tray: mats.shiny,
    trolley: mats.metal,
    cans: mats.shiny,
    umbrella: mats.fabric,
  };

  useEffect(() => {
    const c = new THREE.Color(1, 1, 1);
    for (const m of Object.values(meshes.current)) {
      if (!m) continue;
      for (let i = 0; i < m.instanceMatrix.count; i++) m.setColorAt(i, c);
      m.count = 0;
    }
  }, []);

  const scratch = useMemo(
    () => ({
      pose: createPose(),
      base: new THREE.Matrix4(),
      pelvis: new THREE.Matrix4(),
      torso: new THREE.Matrix4(),
      head: new THREE.Matrix4(),
      sh: new THREE.Matrix4(),
      el: new THREE.Matrix4(),
      hip: new THREE.Matrix4(),
      kn: new THREE.Matrix4(),
      out: new THREE.Matrix4(),
      local: new THREE.Matrix4(),
      scale: new THREE.Matrix4(),
      euler: new THREE.Euler(),
      color: new THREE.Color(),
    }),
    []
  );

  useFrame(() => {
    const sim = getSim();
    const m = meshes.current;
    const s = scratch;
    const counts: Record<string, number> = {};
    const raining = useUi.getState().weather === 'rain';
    let you: Agent | null = null;

    const local = (out: THREE.Matrix4, parent: THREE.Matrix4, tx: number, ty: number, tz: number, rx: number, ry: number, rz: number, order: THREE.EulerOrder) => {
      s.local.makeRotationFromEuler(s.euler.set(rx, ry, rz, order));
      s.local.setPosition(tx, ty, tz);
      out.multiplyMatrices(parent, s.local);
    };
    const put = (key: PartKey, frameM: THREE.Matrix4, sx: number, sy: number, sz: number, hex: number) => {
      const mesh = m[key];
      if (!mesh) return -1;
      const i = counts[key] ?? 0;
      if (i >= mesh.instanceMatrix.count) return -1;
      counts[key] = i + 1;
      s.scale.makeScale(sx, sy, sz);
      s.out.multiplyMatrices(frameM, s.scale);
      mesh.setMatrixAt(i, s.out);
      mesh.setColorAt(i, s.color.setHex(hex));
      return i;
    };

    const alpha = frame.alpha;
    for (const a of sim.agents) {
      if (!a.alive) continue;
      if ((counts.torso ?? 0) >= MAX) break;
      if (a.role === 'you') you = a;
      const L = a.looks;
      const sc = L.height / 1.72;
      const bw = L.build;
      const x = a.px + (a.x - a.px) * alpha;
      const z = a.pz + (a.z - a.pz) * alpha;
      let dh = a.heading - a.pheading;
      if (dh > Math.PI) dh -= Math.PI * 2;
      if (dh < -Math.PI) dh += Math.PI * 2;
      const heading = a.pheading + dh * alpha;
      const moving = Math.hypot(a.x - a.px, a.z - a.pz) > 0.0008;
      const p = poseFor(s.pose, a.anim, a.phase, sim.time + a.id * 1.37, a.seatY, sc, moving);
      if (a.carry === 'tray' && p.prop !== 'tray') {
        p.shL = p.shR = 0.72;
        p.elL = p.elR = 1.2;
        p.prop = 'tray';
      }

      s.base.makeRotationY(heading).setPosition(x, 0, z);
      local(s.pelvis, s.base, 0, p.pelvisY * sc, 0, 0, 0, 0, 'XYZ');
      // The pelvis stays level; the torso leans and twists above it.
      local(s.torso, s.pelvis, 0, 0.04 * sc, 0, p.lean, p.twist, 0, 'XYZ');
      const ti = put('torso', s.torso, sc * bw, sc, sc * bw, L.shirt);
      if (ti >= 0) owner.current[ti] = a.id;
      put('pelvis', s.pelvis, sc * bw, sc, sc * bw, L.pants);
      local(s.head, s.torso, 0, RIG.torso * sc, 0, p.headPitch, p.headYaw, 0, 'XYZ');
      put('head', s.head, sc, sc, sc, L.skin);
      put('eyes', s.head, sc, sc, sc, COLORS.eyes);
      const hairKey: PartKey | null = L.hair === 0 ? 'hairShort' : L.hair === 1 ? 'hairLong' : L.hair === 2 ? 'hairBun' : L.hair === 3 ? 'chefCap' : null;
      if (hairKey) put(hairKey, s.head, sc, sc, sc, L.hair === 3 ? COLORS.chef : L.hairColor);
      if (L.backpack && a.seatY === 0) {
        local(s.out, s.torso, 0, 0.3 * sc, -0.17 * sc * bw, 0, 0, 0, 'XYZ');
        s.el.copy(s.out);
        put('backpack', s.el, sc, sc, sc, L.backpackColor);
      }

      for (const side of [1, -1] as const) {
        const left = side === 1;
        const sh = left ? p.shL : p.shR;
        const ab = left ? p.abL : p.abR;
        const el = left ? p.elL : p.elR;
        local(s.sh, s.torso, side * RIG.shoulderX * sc * bw, RIG.shoulderY * sc, 0, -sh, 0, side * ab, 'ZXY');
        put('upperArm', s.sh, sc * bw, sc, sc * bw, L.shirt);
        local(s.el, s.sh, 0, -RIG.upperArm * sc, 0, -el, 0, 0, 'XYZ');
        put('forearm', s.el, sc, sc, sc, L.skin);
        local(s.out, s.el, 0, -RIG.forearm * sc, 0, 0, 0, 0, 'XYZ');
        s.kn.copy(s.out);
        put('hand', s.kn, sc, sc, sc, L.skin);
        if (!left && p.prop === 'phone') {
          local(s.out, s.kn, 0, -0.07 * sc, 0.03 * sc, -0.5, 0, 0, 'XYZ');
          s.hip.copy(s.out);
          put('phone', s.hip, sc, sc, sc, COLORS.phone);
        }

        const hip = left ? p.hipL : p.hipR;
        const kn = left ? p.knL : p.knR;
        local(s.hip, s.pelvis, side * RIG.hipX * sc * bw, 0, 0, -hip, 0, 0, 'XYZ');
        put('thigh', s.hip, sc * bw, sc, sc * bw, L.pants);
        local(s.kn, s.hip, 0, -RIG.thigh * sc, 0, kn, 0, 0, 'XYZ');
        put('shin', s.kn, sc, sc, sc, L.pants);
        // Keep feet flat: undo the leg's net pitch.
        local(s.out, s.kn, 0, -RIG.shin * sc, 0, hip - kn, 0, 0, 'XYZ');
        s.el.copy(s.out);
        put('foot', s.el, sc, sc, sc, L.shoes);
      }

      if (p.prop === 'tray') {
        // Between the hands, level with the floor.
        local(s.out, s.base, 0, (p.pelvisY + 0.36) * sc, 0.38 * sc, 0, 0, 0, 'XYZ');
        put('tray', s.out, 1, 1, 1, COLORS.tray);
      }
      if (a.carry === 'trolley' || a.carry === 'cans') {
        local(s.out, s.base, 0, 0, 0.78, 0, 0, 0, 'XYZ');
        put('trolley', s.out, 1, 1, 1, COLORS.trolley);
        if (a.carry === 'cans') put('cans', s.out, 1, 1, 1, COLORS.cans);
      }
      if (raining && z > 12.05 && a.seatY === 0) {
        local(s.out, s.base, 0.12, 1.95 * sc, 0.05, 0, 0, 0, 'XYZ');
        put('umbrella', s.out, 1, 1, 1, a.id % 3 ? COLORS.umbrella : 0xb91c1c);
      }
    }

    for (const [key, mesh] of Object.entries(m) as Array<[PartKey, THREE.InstancedMesh]>) {
      mesh.count = counts[key] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // Saffron ring and floating marker over "You".
    const ring = youRing.current;
    const arrow = youArrow.current;
    if (ring && arrow) {
      ring.visible = arrow.visible = you !== null;
      if (you) {
        const x = you.px + (you.x - you.px) * alpha;
        const z = you.pz + (you.z - you.pz) * alpha;
        ring.position.set(x, 0.02, z);
        ring.scale.setScalar(1 + Math.sin(frame.t * 3) * 0.08);
        arrow.position.set(x, 2.25 + (you.seatY > 0 ? -0.35 : 0) + Math.sin(frame.t * 2.4) * 0.08, z);
        arrow.rotation.y = frame.t * 1.6;
      }
    }
  });

  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const id = owner.current[e.instanceId]!;
    useUi.getState().select({ kind: 'person', id });
  };
  const hover = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const id = owner.current[e.instanceId]!;
    const h = useUi.getState().hover;
    if (h?.kind !== 'person' || h.id !== id) useUi.getState().set({ hover: { kind: 'person', id } });
    document.body.style.cursor = 'pointer';
  };
  const unhover = () => {
    if (useUi.getState().hover?.kind === 'person') useUi.getState().set({ hover: null });
    document.body.style.cursor = '';
  };

  return (
    <group>
      {(Object.keys(geos) as PartKey[]).map((key) => (
        <instancedMesh
          key={key}
          ref={(el) => {
            if (el) meshes.current[key] = el;
          }}
          args={[geos[key], partMat[key], PAIRED.has(key) ? MAX * 2 : MAX]}
          castShadow={key !== 'eyes' && key !== 'phone'}
          receiveShadow={false}
          frustumCulled={false}
          onClick={PICKABLE.has(key) ? pick : undefined}
          onPointerMove={PICKABLE.has(key) ? hover : undefined}
          onPointerOut={PICKABLE.has(key) ? unhover : undefined}
        />
      ))}
      <mesh ref={youRing} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.42, 0.56, 40]} />
        <meshBasicMaterial color={[3, 1.3, 0.3]} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      <mesh ref={youArrow} visible={false} rotation-x={Math.PI}>
        <coneGeometry args={[0.13, 0.3, 4]} />
        <meshBasicMaterial color={[3.2, 1.4, 0.35]} toneMapped={false} />
      </mesh>
    </group>
  );
}
