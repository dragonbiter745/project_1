import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALL, TABLES } from '../data/layout';
import { NO_SHADOW, TRANSPARENT, mat } from './materials';
import { grassMap, qrMap, terrazzoMaps } from './textures';
import { staticWorld } from './buildWorld';

export function StaticWorld() {
  const { meshes, campus } = useMemo(staticWorld, []);
  return (
    <group>
      <Floor />
      <Ground />
      {meshes.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={mat(key)}
          castShadow={!NO_SHADOW.has(key)}
          receiveShadow={!TRANSPARENT.has(key)}
          renderOrder={TRANSPARENT.has(key) ? 2 : 0}
        />
      ))}
      {campus.map(({ key, geometry }) => (
        <mesh key={`campus-${key}`} geometry={geometry} material={mat(key)} renderOrder={TRANSPARENT.has(key) ? 2 : 0} />
      ))}
      <Chairs />
      <QrPlates />
    </group>
  );
}

function Floor() {
  const material = useMemo(() => {
    const { map, roughness, bump } = terrazzoMaps();
    const w = HALL.maxX - HALL.minX;
    const d = HALL.maxZ - HALL.minZ;
    // One texture holds four 60 cm tiles: 2.4 m.
    for (const t of [map, roughness, bump]) t.repeat.set(w / 2.4, d / 2.4);
    return new THREE.MeshStandardMaterial({ map, roughnessMap: roughness, bumpMap: bump, bumpScale: 1.2, roughness: 0.55, metalness: 0.02, envMapIntensity: 0.7 });
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow material={material}>
      <planeGeometry args={[HALL.maxX - HALL.minX, HALL.maxZ - HALL.minZ]} />
    </mesh>
  );
}

function Ground() {
  const material = useMemo(() => {
    const map = grassMap().clone();
    map.needsUpdate = true;
    map.repeat.set(60, 60);
    return new THREE.MeshStandardMaterial({ map, roughness: 1, color: '#d9e3c8' });
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow material={material}>
      <circleGeometry args={[260, 48]} />
    </mesh>
  );
}

const CHAIR_COLORS = ['#dde3e8', '#3A0F34', '#F6A609', '#dde3e8', '#5C1F54', '#dde3e8'];

function chairGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const seat = new RoundedBoxGeometry(0.44, 0.045, 0.42, 3, 0.02).translate(0, 0.44, 0);
  const back = new RoundedBoxGeometry(0.42, 0.36, 0.035, 3, 0.017).rotateX(-0.16).translate(0, 0.7, -0.22);
  const rail = new RoundedBoxGeometry(0.42, 0.04, 0.03, 2, 0.012).translate(0, 0.9, -0.255);
  parts.push(seat, back, rail);
  for (const [x, z] of [
    [0.19, 0.18],
    [-0.19, 0.18],
    [0.19, -0.19],
    [-0.19, -0.19],
  ] as const) {
    const leg = new THREE.CylinderGeometry(0.018, 0.024, 0.44, 8);
    leg.rotateX(z > 0 ? -0.06 : 0.06).rotateZ(x > 0 ? 0.05 : -0.05).translate(x, 0.22, z);
    parts.push(leg);
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
    for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k);
    return p;
  }))!;
}

function Chairs() {
  const { geometry, material, seats } = useMemo(() => {
    const seats = TABLES.filter((t) => t.kind === 'four').flatMap((t, ti) => t.seats.map((s, si) => ({ ...s, color: CHAIR_COLORS[(ti + si) % CHAIR_COLORS.length]! })));
    return {
      geometry: chairGeometry(),
      material: new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
      seats,
    };
  }, []);
  return (
    <instancedMesh
      args={[geometry, material, seats.length]}
      castShadow
      receiveShadow
      ref={(mesh) => {
        if (!mesh) return;
        const m = new THREE.Matrix4();
        const c = new THREE.Color();
        seats.forEach((s, i) => {
          // Chairs sit a touch behind the diner's hip point.
          const bx = s.x - Math.sin(s.heading) * 0.04;
          const bz = s.z - Math.cos(s.heading) * 0.04;
          m.makeRotationY(s.heading).setPosition(bx, 0, bz);
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, c.set(s.color));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }}
    />
  );
}

/** Acrylic stands with each table's QR card, drawn into one atlas. */
function QrPlates() {
  const { geometry, material } = useMemo(() => {
    const cols = 6;
    const rows = 4;
    const cw = 160;
    const ch = 220;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cw;
    canvas.height = rows * ch;
    const ctx = canvas.getContext('2d')!;
    TABLES.forEach((t, i) => {
      const x = (i % cols) * cw;
      const y = Math.floor(i / cols) * ch;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, cw, ch);
      ctx.fillStyle = '#F6A609';
      ctx.fillRect(x, y, cw, 34);
      ctx.fillStyle = '#fff';
      ctx.font = '600 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Scan to order', x + cw / 2, y + 23);
      const qr = qrMap(t.id).image as HTMLCanvasElement;
      ctx.drawImage(qr, x + 18, y + 44, cw - 36, cw - 36);
      ctx.fillStyle = '#111';
      ctx.font = '700 26px system-ui, sans-serif';
      ctx.fillText(t.label, x + cw / 2, y + ch - 14);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    const parts: THREE.BufferGeometry[] = [];
    TABLES.forEach((t, i) => {
      const card = new THREE.PlaneGeometry(0.075, 0.103);
      const uv = card.attributes.uv as THREE.BufferAttribute;
      const u0 = (i % cols) / cols;
      const v0 = 1 - (Math.floor(i / cols) + 1) / rows;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / cols, v0 + uv.getY(k) / rows);
      const face = t.kind === 'high' ? -Math.PI / 2 : (i % 4) * (Math.PI / 2);
      card.rotateX(-0.22).rotateY(face).translate(t.x + (t.kind === 'high' ? 0.08 : 0), t.top + 0.06, t.z);
      parts.push(card);
    });
    return { geometry: mergeGeometries(parts)!, material: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, side: THREE.DoubleSide }) };
  }, []);
  return <mesh geometry={geometry} material={material} />;
}
