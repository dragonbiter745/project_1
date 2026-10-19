import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALL, SLOT_BY_SHOP, TABLES, TABLE_BY_ID } from '../data/layout';
import { Rng } from '../sim/rng';
import { getSim } from '../store/sim';
import { useUi } from '../store/ui';
import { FAN_SPOTS, WINDOW_BAYS, WINDOW_SILL, WINDOW_TOP, WINDOW_W } from './build/hall';
import { slotMatrix } from './build/shops';
import { frame } from './frame';
import { staticWorld } from './buildWorld';

export function Animated() {
  return (
    <>
      <Fans />
      <Flames />
      <Steam />
      <LightShafts />
      <Dust />
      <TableTrays />
    </>
  );
}

function strip(g: THREE.BufferGeometry) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  return out;
}

function Fans() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.11, 0.09, 0.12, 18), new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10).translate(0, -0.08, 0)];
    for (let i = 0; i < 4; i++) parts.push(new RoundedBoxGeometry(0.62, 0.012, 0.13, 2, 0.005).translate(0.4, -0.02, 0).rotateX(0.08).rotateY((i / 4) * Math.PI * 2));
    return mergeGeometries(parts.map(strip))!;
  }, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#efece6', roughness: 0.45, metalness: 0.15 }), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const angle = useRef(0);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    angle.current += dt * (useUi.getState().weather === 'heatwave' ? 7.5 : 3.2);
    FAN_SPOTS.forEach(([x, z], i) => {
      m.makeRotationY(angle.current + i).setPosition(x, HALL.height - 0.6, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, material, FAN_SPOTS.length]} castShadow frustumCulled={false} />;
}

function worldPoints(kind: 'flames' | 'steam') {
  const v = new THREE.Vector3();
  return staticWorld().fx.flatMap(({ shopId, fx }) => {
    const m = slotMatrix(SLOT_BY_SHOP[shopId]!);
    return fx[kind].map(([x, y, z]) => v.set(x, y, z).applyMatrix4(m).toArray() as [number, number, number]);
  });
}

function Flames() {
  const points = useMemo(() => worldPoints('flames'), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.ConeGeometry(0.11, 0.32, 12, 1, true).translate(0, 0.16, 0), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.9, 0.45), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    []
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    points.forEach(([x, y, z], i) => {
      const t = frame.t * 9 + i * 2.1;
      const f = 0.75 + 0.25 * Math.sin(t) * Math.sin(t * 1.7 + 1) + 0.1 * Math.sin(t * 5.3);
      s.set(1 + 0.15 * Math.sin(t * 2.3), f, 1 + 0.15 * Math.cos(t * 1.9));
      mesh.setMatrixAt(i, m.compose(p.set(x, y - 0.05, z), q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, material, points.length]} frustumCulled={false} renderOrder={3} />;
}

const particleVertex = /* glsl */ `
  attribute float life;
  attribute float size;
  varying float vLife;
  uniform float uProj;
  void main() {
    vLife = life;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (0.5 + life) * uProj / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const particleFragment = /* glsl */ `
  varying float vLife;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFlat;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float fade = mix(sin(vLife * 3.14159), 1.0, uFlat);
    gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * fade * uOpacity);
  }
`;

function particleMaterial(color: THREE.Color, opacity: number, flat: boolean, additive: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: { uProj: { value: 600 }, uColor: { value: color }, uOpacity: { value: opacity }, uFlat: { value: flat ? 1 : 0 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function useProjScale(material: THREE.ShaderMaterial) {
  const { camera, size } = useThree();
  useFrame(() => {
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 45;
    material.uniforms.uProj!.value = (size.height * Math.min(window.devicePixelRatio, 2)) / (2 * Math.tan((fov * Math.PI) / 360));
  });
}

const PER_PUFF = 16;

function Steam() {
  const sources = useMemo(() => worldPoints('steam'), []);
  const { geometry, seeds } = useMemo(() => {
    const n = sources.length * PER_PUFF;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('life', new THREE.BufferAttribute(new Float32Array(n), 1));
    const rng = new Rng(9);
    const size = new Float32Array(n).map(() => rng.range(0.12, 0.22));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    return { geometry: g, seeds: Array.from({ length: n }, () => ({ offset: rng.next(), dx: rng.range(-0.05, 0.05), dz: rng.range(-0.05, 0.05), speed: rng.range(0.22, 0.34) })) };
  }, [sources]);
  const material = useMemo(() => particleMaterial(new THREE.Color('#f4f4f4'), 0.32, false, false), []);
  useProjScale(material);
  useFrame(() => {
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const life = geometry.attributes.life as THREE.BufferAttribute;
    for (let i = 0; i < seeds.length; i++) {
      const src = sources[Math.floor(i / PER_PUFF)]!;
      const sd = seeds[i]!;
      const l = (frame.t * sd.speed + sd.offset) % 1;
      const rise = l * 0.9;
      pos.setXYZ(i, src[0] + sd.dx * (1 + rise * 6) + Math.sin(frame.t + i) * 0.03 * l, src[1] + rise, src[2] + sd.dz * (1 + rise * 6));
      life.setX(i, l);
    }
    pos.needsUpdate = true;
    life.needsUpdate = true;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={4} />;
}

const shaftVertex = /* glsl */ `
  attribute float along;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vAlong = along;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const shaftFragment = /* glsl */ `
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform float uIntensity;
  uniform vec3 uColor;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float a = pow(1.0 - vAlong, 1.7) * uIntensity * (0.35 + 0.65 * facing);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** Sunbeams through the courtyard windows, re-aimed as the sun moves. */
function LightShafts() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: shaftVertex,
        fragmentShader: shaftFragment,
        uniforms: { uIntensity: { value: 0.1 }, uColor: { value: new THREE.Color('#ffe6bf') } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    []
  );
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  const last = useRef({ x: 0, y: 0, z: 0 });
  const mesh = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const sun = frame.sun;
    const into = sun.x > 0.08 && sun.y > 0.05; // sun on the courtyard side
    material.uniforms.uIntensity!.value = THREE.MathUtils.lerp(material.uniforms.uIntensity!.value as number, into ? 0.11 * frame.daylight : 0, 0.05);
    if (mesh.current) mesh.current.visible = (material.uniforms.uIntensity!.value as number) > 0.004;
    const l = last.current;
    if (Math.abs(l.x - sun.x) + Math.abs(l.y - sun.y) + Math.abs(l.z - sun.z) < 0.01) return;
    l.x = sun.x;
    l.y = sun.y;
    l.z = sun.z;
    // Light travels away from the sun; stop where it meets the floor.
    const d = new THREE.Vector3(-sun.x, -sun.y, -sun.z).normalize();
    const pos: number[] = [];
    const along: number[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, e: THREE.Vector3, ta: number, tb: number) => {
      pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...e.toArray());
      along.push(ta, ta, tb, ta, tb, tb);
    };
    const x = HALL.maxX - 0.06;
    for (const z of WINDOW_BAYS) {
      const corners = [
        new THREE.Vector3(x, WINDOW_SILL, z - WINDOW_W / 2),
        new THREE.Vector3(x, WINDOW_SILL, z + WINDOW_W / 2),
        new THREE.Vector3(x, WINDOW_TOP, z + WINDOW_W / 2),
        new THREE.Vector3(x, WINDOW_TOP, z - WINDOW_W / 2),
      ];
      const far = corners.map((c) => {
        const t = d.y < -0.05 ? Math.min(14, c.y / -d.y) : 9;
        return c.clone().addScaledVector(d, t);
      });
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        quad(corners[i]!, corners[j]!, far[j]!, far[i]!, 0, 1);
      }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />;
}

function Dust() {
  const n = 420;
  const { geometry, seeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const rng = new Rng(4);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('life', new THREE.BufferAttribute(new Float32Array(n).fill(0.5), 1));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n).map(() => rng.range(0.012, 0.03)), 1));
    const seeds = Array.from({ length: n }, () => ({ x: rng.range(11, 17.9), y: rng.range(0.4, 3.2), z: rng.range(-11, 11), p: rng.range(0, 6), s: rng.range(0.05, 0.16) }));
    return { geometry: g, seeds };
  }, []);
  const material = useMemo(() => particleMaterial(new THREE.Color('#ffe2b3'), 0.9, true, true), []);
  useProjScale(material);
  useFrame(() => {
    material.uniforms.uOpacity!.value = frame.sun.x > 0.08 ? 0.9 * frame.daylight : 0;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const sd = seeds[i]!;
      const t = frame.t * sd.s + sd.p;
      pos.setXYZ(i, sd.x + Math.sin(t) * 0.35, sd.y + Math.sin(t * 0.7) * 0.25, sd.z + Math.cos(t * 0.8) * 0.35);
    }
    pos.needsUpdate = true;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={6} />;
}

const TRAY_SPOTS = [
  [0.0, -0.18],
  [0.0, 0.2],
  [-0.2, 0.0],
] as const;

function TableTrays() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () =>
      mergeGeometries(
        [
          new RoundedBoxGeometry(0.42, 0.022, 0.3, 2, 0.01),
          new THREE.CylinderGeometry(0.085, 0.075, 0.022, 16).translate(-0.08, 0.02, 0),
          new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.08, 0.03, 0),
          new THREE.CylinderGeometry(0.045, 0.04, 0.09, 12).translate(0.12, 0.055, -0.06),
          new THREE.CylinderGeometry(0.06, 0.055, 0.03, 12).translate(0.11, 0.025, 0.07),
        ].map(strip)
      )!,
    []
  );
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.4 }), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let n = 0;
    for (const t of getSim().tables) {
      const def = TABLE_BY_ID[t.id]!;
      const count = Math.min(def.kind === 'high' ? 2 : 3, t.trays);
      for (let i = 0; i < count; i++) {
        const [dx, dz] = def.kind === 'high' ? [0, i === 0 ? -0.22 : 0.22] : TRAY_SPOTS[i]!;
        m.makeRotationY(i * 1.3 + (def.kind === 'high' ? Math.PI / 2 : 0)).setPosition(def.x + dx, def.top + 0.012, def.z + dz);
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, c.set(t.status === 'dirty' || t.status === 'cleaning' ? '#7c6a58' : i % 2 ? '#0f766e' : '#8b5e34'));
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={(el) => {
        ref.current = el;
        if (el && !el.instanceColor) for (let i = 0; i < TABLES.length * 3; i++) el.setColorAt(i, c.set('#8b5e34'));
      }}
      args={[geometry, material, TABLES.length * 3]}
      castShadow
      frustumCulled={false}
    />
  );
}
