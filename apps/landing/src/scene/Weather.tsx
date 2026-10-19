import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOOR, HALL } from '../data/layout';
import { Rng } from '../sim/rng';
import { useUi } from '../store/ui';
import { frame } from './frame';

export function Weather() {
  const weather = useUi((s) => s.weather);
  return (
    <>
      {weather === 'rain' && (
        <>
          <Rain />
          <WetFloor />
        </>
      )}
      {weather === 'festival' && <Festival />}
    </>
  );
}

const DROPS = 2600;

/** Streaks falling outside the hall: over the courtyard and the front plaza. */
function Rain() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const drops = useMemo(() => {
    const rng = new Rng(77);
    return Array.from({ length: DROPS }, () => {
      const front = rng.chance(0.35);
      return {
        x: front ? rng.range(-18, 30) : rng.range(18.4, 44),
        z: front ? rng.range(12.4, 26) : rng.range(-24, 24),
        y: rng.range(0, 12),
        v: rng.range(9, 13),
      };
    });
  }, []);
  const geometry = useMemo(() => new THREE.BoxGeometry(0.012, 0.42, 0.012), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.45, depthWrite: false }), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < DROPS; i++) {
      const d = drops[i]!;
      d.y -= d.v * Math.min(dt, 0.05);
      if (d.y < 0) d.y += 12;
      m.makeRotationZ(0.08).setPosition(d.x + d.y * 0.08, d.y, d.z);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, material, DROPS]} frustumCulled={false} renderOrder={4} />;
}

/** A darker, glossier patch and muddy footprints just inside the door. */
function WetFloor() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d')!;
    const rng = new Rng(5);
    const g = ctx.createRadialGradient(256, 512, 20, 256, 512, 420);
    g.addColorStop(0, 'rgba(60,70,80,0.5)');
    g.addColorStop(1, 'rgba(60,70,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 70; i++) {
      const x = 256 + rng.range(-160, 160) + Math.sin(i) * 40;
      const y = 500 - i * 6.5 + rng.range(-8, 8);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng.range(-0.4, 0.4));
      ctx.fillStyle = `rgba(70,58,46,${0.4 - i * 0.004})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -24, 7, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh position={[DOOR.x, 0.012, HALL.maxZ - 3]} rotation-x={-Math.PI / 2} renderOrder={6}>
      <planeGeometry args={[6, 6]} />
      <meshStandardMaterial map={tex} transparent depthWrite={false} roughness={0.08} metalness={0.1} />
    </mesh>
  );
}

const FLAG_COLORS = ['#e4570f', '#f59e0b', '#16a34a', '#dc2626', '#0891b2', '#db2777', '#7c3aed', '#facc15'];

/** Bunting and string lights criss-crossing under the ceiling. */
function Festival() {
  const flags = useRef<THREE.InstancedMesh>(null);
  const bulbs = useRef<THREE.InstancedMesh>(null);
  const lines = useMemo(() => {
    const runs: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(-13, 3.9, -6.5), new THREE.Vector3(16, 3.9, 10)],
      [new THREE.Vector3(-13, 3.9, 10), new THREE.Vector3(16, 3.9, -6.5)],
      [new THREE.Vector3(-13, 3.8, 2), new THREE.Vector3(16, 3.8, 2)],
      [new THREE.Vector3(1.5, 3.9, -6.5), new THREE.Vector3(1.5, 3.9, 11)],
    ];
    const pts: Array<{ p: THREE.Vector3; dir: THREE.Vector3 }> = [];
    for (const [a, b] of runs) {
      const n = Math.round(a.distanceTo(b) / 0.42);
      const dir = b.clone().sub(a).normalize();
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.55;
        pts.push({ p, dir });
      }
    }
    return pts;
  }, []);
  const flagGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.15, 0, 0, 0.15, 0, 0, 0, -0.3, 0], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const flagMat = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), []);
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(0.035, 8, 6), []);
  const bulbMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const up = useMemo(() => new THREE.Vector3(1, 0, 0), []);

  useFrame(() => {
    if (flags.current) {
      lines.forEach(({ p, dir }, i) => {
        q.setFromUnitVectors(up, dir);
        const sway = new THREE.Quaternion().setFromAxisAngle(dir, Math.sin(frame.t * 1.6 + i) * 0.18);
        flags.current!.setMatrixAt(i, m.compose(p, sway.multiply(q), one));
        flags.current!.setColorAt(i, c.set(FLAG_COLORS[i % FLAG_COLORS.length]!));
      });
      flags.current.instanceMatrix.needsUpdate = true;
      if (flags.current.instanceColor) flags.current.instanceColor.needsUpdate = true;
    }
    if (bulbs.current) {
      lines.forEach(({ p }, i) => {
        m.makeTranslation(p.x, p.y + 0.02, p.z + 0.001);
        bulbs.current!.setMatrixAt(i, m);
        const twinkle = 2.2 + 1.4 * Math.sin(frame.t * 3 + i * 1.7);
        bulbs.current!.setColorAt(i, c.setRGB(twinkle, twinkle * 0.72, twinkle * 0.3));
      });
      bulbs.current.instanceMatrix.needsUpdate = true;
      if (bulbs.current.instanceColor) bulbs.current.instanceColor.needsUpdate = true;
    }
  });
  return (
    <>
      <instancedMesh ref={flags} args={[flagGeo, flagMat, lines.length]} frustumCulled={false} />
      <instancedMesh ref={bulbs} args={[bulbGeo, bulbMat, lines.length]} frustumCulled={false} />
    </>
  );
}
