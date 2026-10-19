import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { SHOP_SLOTS, shopToWorld } from '../data/layout';
import { getSim } from '../store/sim';
import { useUi } from '../store/ui';
import { frame } from './frame';
import { applyNight } from './materials';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Sun direction for a court time; windows face the sun's side (+x) all day. */
export function sunAt(minutes: number) {
  const h = minutes / 60;
  const dayT = (h - 6.2) / 12.6;
  const up = dayT > 0 && dayT < 1;
  const el = up ? Math.sin(dayT * Math.PI) * 1.08 - 0.06 : -0.3;
  const az = (Math.min(1, Math.max(0, dayT)) - 0.5) * 2.3;
  return { x: Math.cos(el) * Math.cos(az), y: Math.sin(el), z: Math.cos(el) * Math.sin(az), el };
}

const SEATING_LIGHTS: Array<[number, number, number]> = [
  [-4.5, 3.6, -0.5],
  [3.5, 3.6, -0.5],
  [11, 3.6, -0.5],
  [-4.5, 3.6, 6],
  [3.5, 3.6, 6],
  [11, 3.6, 6],
];

export function Lighting() {
  const quality = useUi((s) => s.quality);
  const weather = useUi((s) => s.weather);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const interior = useRef<THREE.Group>(null);
  const { scene } = useThree();
  const [sky, setSky] = useState({ sun: [60, 50, -10] as [number, number, number], night: 0 });
  const lastSky = useRef(0);
  const warm = useMemo(() => new THREE.Color('#ffb36b'), []);
  const white = useMemo(() => new THREE.Color('#fff4e2'), []);

  const shopSpots = useMemo(
    () =>
      SHOP_SLOTS.map((slot) => {
        const pos = shopToWorld(slot, 0, 2.2);
        const aim = shopToWorld(slot, 0, -1.4);
        const target = new THREE.Object3D();
        target.position.set(aim.x, 0.6, aim.z);
        return { id: slot.shopId, pos: [pos.x, 3.5, pos.z] as [number, number, number], target };
      }),
    []
  );

  useEffect(() => {
    const fogColor = weather === 'rain' ? '#9aa4ab' : weather === 'heatwave' ? '#f1d2a4' : '#dfe8ee';
    scene.fog = weather === 'heatwave' ? new THREE.FogExp2(fogColor, 0.011) : new THREE.Fog(fogColor, weather === 'rain' ? 26 : 80, weather === 'rain' ? 120 : 320);
    return () => {
      scene.fog = null;
    };
  }, [scene, weather]);

  useFrame(() => {
    const ui = useUi.getState();
    const minutes = ui.dayMode === 'day' ? 13 * 60 + 10 : ui.dayMode === 'night' ? 21 * 60 + 20 : getSim().clockMinutes();
    const dir = sunAt(minutes);
    frame.sun = { x: dir.x, y: dir.y, z: dir.z };
    const up = smooth(-0.04, 0.22, dir.y);
    const cloud = ui.weather === 'rain' ? 0.32 : 1;
    const heat = ui.weather === 'heatwave' ? 1.18 : 1;
    frame.daylight = up * cloud;
    frame.night = 1 - smooth(-0.06, 0.18, dir.y);
    const night = frame.night;

    if (sun.current) {
      sun.current.position.set(dir.x * 60, Math.max(dir.y, 0.05) * 60, dir.z * 60);
      sun.current.intensity = 3.1 * up * cloud * heat;
      sun.current.color.copy(white).lerp(warm, 1 - smooth(0.05, 0.45, dir.y));
    }
    if (hemi.current) hemi.current.intensity = 0.18 + 0.62 * up * (0.6 + 0.4 * cloud);
    scene.environmentIntensity = 0.32 + 0.6 * up * (0.7 + 0.3 * cloud);
    applyNight(night, ui.weather === 'festival' ? 1.25 : 1);
    if (interior.current) {
      interior.current.children.forEach((l) => {
        const light = l as THREE.PointLight | THREE.SpotLight;
        if (!('intensity' in light)) return;
        const base = (light.userData.base as number) ?? 1;
        light.intensity = base * (0.5 + 1.1 * night) * (ui.weather === 'rain' ? 1.25 : 1);
      });
    }
    if (frame.t - lastSky.current > 1) {
      lastSky.current = frame.t;
      const next: [number, number, number] = [dir.x * 100, dir.y * 100, dir.z * 100];
      setSky((s) => (Math.abs(s.sun[1] - next[1]) + Math.abs(s.sun[2] - next[2]) > 0.5 || Math.abs(s.night - night) > 0.05 ? { sun: next, night } : s));
    }
  });

  const mapSize = quality === 'high' ? 2048 : quality === 'medium' ? 1536 : 1024;

  return (
    <>
      <directionalLight
        ref={sun}
        castShadow
        intensity={3}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-26}
        shadow-camera-right={30}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.00035}
        shadow-normalBias={0.035}
        shadow-radius={4}
      />
      <hemisphereLight ref={hemi} args={['#e3edf7', '#b49c7d', 0.6]} />
      <Environment resolution={128} frames={1}>
        <color attach="background" args={['#c9d1d8']} />
        <Lightformer form="rect" intensity={2.4} color="#fff7ea" position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[34, 22, 1]} />
        <Lightformer form="rect" intensity={2} color="#e2f0ff" position={[28, 3, 0]} rotation-y={-Math.PI / 2} scale={[24, 5, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#ffdcb8" position={[0, 2, -20]} scale={[30, 4, 1]} />
        <Lightformer form="ring" intensity={3} color="#ffc98f" position={[-12, 4, 12]} scale={5} />
        <Lightformer form="rect" intensity={0.7} color="#ffffff" position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[30, 30, 1]} />
      </Environment>
      <Sky distance={4000} sunPosition={sky.sun} turbidity={weather === 'rain' ? 16 : weather === 'heatwave' ? 9 : 5} rayleigh={weather === 'rain' ? 3 : 1.4} mieCoefficient={0.006} mieDirectionalG={0.86} />
      {sky.night > 0.5 && <Stars radius={260} depth={60} count={2200} factor={5} fade speed={0.4} />}
      <group ref={interior}>
        {SEATING_LIGHTS.slice(0, quality === 'low' ? 3 : 6).map((p, i) => (
          <pointLight key={i} position={p} color="#ffd6a3" distance={13} decay={1.4} userData={{ base: 7 }} intensity={7} />
        ))}
        {quality !== 'low' &&
          shopSpots.map((s) => (
            <spotLight key={s.id} position={s.pos} target={s.target} color="#ffe2bd" angle={0.95} penumbra={0.7} distance={9} decay={1.3} intensity={22} userData={{ base: 22 }} />
          ))}
      </group>
      {shopSpots.map((s) => (
        <primitive key={s.id} object={s.target} />
      ))}
    </>
  );
}
