import { Suspense, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { getSim, takeSnapshot } from '../store/sim';
import { useUi, type Quality } from '../store/ui';
import { Animated } from './Animated';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { frame } from './frame';
import { Interaction } from './Interaction';
import { Lighting } from './Lighting';
import { People } from './People';
import { Screens } from './Screens';
import { StaticWorld } from './StaticWorld';
import { Weather } from './Weather';

const DOWN: Record<Quality, Quality> = { high: 'medium', medium: 'low', low: 'low' };
const UP: Record<Quality, Quality> = { low: 'medium', medium: 'high', high: 'high' };
const DPR: Record<Quality, [number, number]> = { high: [1, 1.75], medium: [1, 1.3], low: [0.75, 1] };

function SimDriver() {
  useEffect(() => {
    const sim = getSim();
    const sync = () => {
      const s = useUi.getState();
      sim.speed = s.speed;
      sim.crowd = s.crowd;
    };
    sync();
    const unsub = useUi.subscribe(sync);
    const publish = () => {
      // While the canvas is paused off-screen the court keeps running for the live dashboard below.
      if (!useUi.getState().heroVisible) sim.advance(0.25);
      useUi.setState({ snapshot: takeSnapshot(sim, useUi.getState().selection) });
    };
    publish();
    const id = window.setInterval(publish, 250);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, []);
  // Runs before every other frame callback so the scene reads one consistent tick.
  useFrame((_, dt) => {
    frame.t += dt;
    frame.alpha = getSim().advance(dt);
  }, -2);
  return null;
}

function Ready() {
  useEffect(() => {
    const id = requestAnimationFrame(() => useUi.setState({ sceneReady: true }));
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}

export default function World() {
  const quality = useUi((s) => s.quality);
  const visible = useUi((s) => s.heroVisible);
  return (
    <Canvas
      shadows
      flat
      dpr={DPR[quality]}
      frameloop={visible ? 'always' : 'never'}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 40, near: 0.1, far: 1200, position: [19, 17, 23] }}
      onPointerMissed={() => useUi.getState().select(null)}
    >
      <color attach="background" args={['#d6dee4']} />
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => {
          const s = useUi.getState();
          if (s.autoQuality) s.set({ quality: DOWN[s.quality] });
        }}
        onIncline={() => {
          const s = useUi.getState();
          if (s.autoQuality) s.set({ quality: UP[s.quality] });
        }}
      />
      <SimDriver />
      <Suspense fallback={null}>
        <Lighting />
        <StaticWorld />
        <Screens />
        <Animated />
        <People />
        <Interaction />
        <Weather />
        <CameraRig />
        <Effects />
        <Ready />
      </Suspense>
    </Canvas>
  );
}
