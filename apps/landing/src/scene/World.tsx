import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
// SMAA keeps edges clean, so 1.5x on retina screens is indistinguishable from 2x at half the fill cost.
const DPR: Record<Quality, [number, number]> = { high: [1, 1.5], medium: [1, 1.25], low: [0.75, 1] };

/**
 * Frame-rate driven tuning: pixel density moves first (barely visible), and the quality preset
 * only steps down once density is already at its floor and frames are still slow.
 */
function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const quality = useUi((s) => s.quality);
  const [lo, hi] = DPR[quality];
  return (
    <PerformanceMonitor
      flipflops={4}
      onChange={({ factor }) => setDpr(Math.round((lo + (hi - lo) * factor) * 20) / 20)}
      onDecline={({ factor }) => {
        const s = useUi.getState();
        if (s.autoQuality && factor <= 0.05) s.set({ quality: DOWN[s.quality] });
      }}
      onIncline={({ factor }) => {
        const s = useUi.getState();
        if (s.autoQuality && factor >= 0.95) s.set({ quality: UP[s.quality] });
      }}
    />
  );
}

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
    // Off-screen, nothing reads the court: skip the snapshot work too.
    const publish = () => {
      if (useUi.getState().heroVisible) useUi.setState({ snapshot: takeSnapshot(sim, useUi.getState().selection) });
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
    const sim = getSim();
    // The opening crowd builds up over the first frames instead of blocking the page.
    if (sim.time < WARMUP_SECONDS) {
      for (let i = 0; i < WARMUP_STEPS_PER_FRAME && sim.time < WARMUP_SECONDS; i++) sim.step();
      frame.alpha = 1;
      return;
    }
    frame.t += dt;
    frame.alpha = sim.advance(dt);
  }, -2);
  return null;
}

const WARMUP_SECONDS = 75;
const WARMUP_STEPS_PER_FRAME = 260;

/** Compiles every shader once up front and reveals the scene when the crowd has settled in. */
function Ready() {
  const { gl, scene, camera } = useThree();
  const [compiled, setCompiled] = useState(false);
  useEffect(() => {
    let live = true;
    const done = () => live && setCompiled(true);
    gl.compileAsync(scene, camera).then(done, done);
    return () => {
      live = false;
    };
  }, [gl, scene, camera]);
  useFrame(() => {
    const ui = useUi.getState();
    if (ui.sceneReady) return;
    // The scene chunk has loaded by now (0.35); the rest is shader compile and crowd warm-up.
    const progress = 0.35 + 0.45 * Math.min(1, getSim().time / WARMUP_SECONDS) + (compiled ? 0.2 : 0);
    if (progress - ui.sceneProgress > 0.04) useUi.setState({ sceneProgress: progress });
    if (compiled && getSim().time >= WARMUP_SECONDS) useUi.setState({ sceneReady: true, sceneProgress: 1 });
  });
  return null;
}

/** Shadows from the moving crowd refresh every other frame (every third on Low): half the cost of the biggest pass. */
function ShadowCadence() {
  const gl = useThree((s) => s.gl);
  const quality = useUi((s) => s.quality);
  const n = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(() => {
    n.current++;
    if (n.current % (quality === 'low' ? 3 : 2) === 0) gl.shadowMap.needsUpdate = true;
  });
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
      <AdaptiveQuality />
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
        <ShadowCadence />
        <Ready />
      </Suspense>
    </Canvas>
  );
}
