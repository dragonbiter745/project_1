import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import * as THREE from 'three';
import { AREAS, SLOT_BY_SHOP, STATIONS, TABLE_BY_ID, shopToWorld } from '../data/layout';
import { getSim } from '../store/sim';
import { useUi } from '../store/ui';
import { frame } from './frame';

type Shot = { position: [number, number, number]; target: [number, number, number] };

const OVERVIEW = AREAS[0]!;
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The cinematic tour: wide establishing shots mixed with close looks at the counters.
const TOUR: Shot[] = [
  { position: [21, 15, 21], target: [0, 0, -1] },
  { position: [52, 30, 62], target: [0, 5, -14] },
  { position: [6, 4, 44], target: [4, 5, 10] },
  { position: [6.5, 2.4, -2.5], target: [1.2, 1.6, -8.6] },
  { position: [-7.5, 3.2, 9.5], target: [-14, 1.4, 2] },
  { position: [14.2, 1.7, 7.5], target: [17.6, 1.2, 0] },
  { position: [0, 22, 6], target: [0, 0, 0] },
  { position: [9, 3.5, 6.5], target: [4, 1, 11.6] },
  { position: [-3, 5.5, 4], target: [7.2, 1.6, -9] },
];

export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const explore = useUi((s) => s.explore);
  const fly = useUi((s) => s.fly);
  const selection = useUi((s) => s.selection);
  const cameraMode = useUi((s) => s.cameraMode);
  const tour = useRef({ index: 0, next: 0 });

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.setLookAt(...OVERVIEW.position, ...OVERVIEW.target, false);
    c.maxPolarAngle = Math.PI / 2 - 0.12;
    c.minDistance = 1.6;
    c.maxDistance = 110;
    c.smoothTime = 0.55;
    c.draggingSmoothTime = 0.14;
    c.dollyToCursor = true;
    c.setBoundary(new THREE.Box3(new THREE.Vector3(-75, 0.2, -65), new THREE.Vector3(85, 20, 65)));
  }, []);

  // Outside explore mode the page keeps the wheel and single-finger scroll.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const A = CameraControlsImpl.ACTION;
    c.mouseButtons.left = A.ROTATE;
    c.mouseButtons.right = explore ? A.TRUCK : A.NONE;
    c.mouseButtons.middle = explore ? A.DOLLY : A.NONE;
    c.mouseButtons.wheel = explore ? A.DOLLY : A.NONE;
    c.touches.one = explore ? A.TOUCH_ROTATE : A.NONE;
    c.touches.two = explore ? A.TOUCH_DOLLY_TRUCK : A.NONE;
    c.touches.three = explore ? A.TOUCH_TRUCK : A.NONE;
    // camera-controls sets touch-action: none; the hero fills the screen, so phones must still scroll past it.
    (c as unknown as { _domElement?: HTMLElement })._domElement?.style.setProperty('touch-action', explore ? 'none' : 'pan-y');
    if (!explore) c.setLookAt(...OVERVIEW.position, ...OVERVIEW.target, true);
  }, [explore]);

  useEffect(() => {
    if (fly) ref.current?.setLookAt(...fly.position, ...fly.target, true);
  }, [fly]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !selection) return;
    if (selection.kind === 'shop') {
      const slot = SLOT_BY_SHOP[selection.id]!;
      const eye = shopToWorld(slot, 1.6, 6.2);
      const look = shopToWorld(slot, 0, -1.2);
      c.setLookAt(eye.x, 3.4, eye.z, look.x, 1.5, look.z, true);
    } else if (selection.kind === 'table') {
      const t = TABLE_BY_ID[selection.id]!;
      const side = t.kind === 'high' ? -1 : 1;
      c.setLookAt(t.x - 3.2 * side, 3.4, t.z + 3.4, t.x, 0.7, t.z, true);
    } else if (selection.kind === 'station') {
      const spot =
        selection.id === 'tokenBoard'
          ? { x: STATIONS.tokenBoard.x, y: STATIONS.tokenBoard.y, z: STATIONS.tokenBoard.z }
          : selection.id === 'kiosks'
            ? { x: 8.9, y: 1.2, z: 10.9 }
            : selection.id === 'trayReturn'
              ? { x: STATIONS.trayReturn.x, y: 1.2, z: STATIONS.trayReturn.z }
              : { x: STATIONS.helpdesk.x, y: 1, z: STATIONS.helpdesk.z };
      const back = selection.id === 'tokenBoard' ? 6 : -4.5;
      c.setLookAt(spot.x + 1.5, spot.y + 1.6, spot.z + back, spot.x, spot.y, spot.z, true);
    }
  }, [selection]);

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    const ui = useUi.getState();
    const dragging = c.currentAction !== CameraControlsImpl.ACTION.NONE;

    if (ui.follow !== null) {
      const a = getSim().agent(ui.follow);
      if (!a || !a.alive) {
        ui.set({ follow: null });
        return;
      }
      const x = a.px + (a.x - a.px) * frame.alpha;
      const z = a.pz + (a.z - a.pz) * frame.alpha;
      if (!dragging) c.moveTo(x, 0.9 + a.seatY * 0.5, z, true);
      return;
    }

    if (REDUCED_MOTION) return;

    if (ui.explore && ui.cameraMode === 'cinematic') {
      if (frame.t > tour.current.next) {
        const shot = TOUR[tour.current.index % TOUR.length]!;
        tour.current.index++;
        tour.current.next = frame.t + 8;
        c.smoothTime = 1.6;
        c.setLookAt(...shot.position, ...shot.target, true);
      }
      if (!dragging) c.rotate(dt * 0.025, 0, true);
      return;
    }
    // The camera only moves when the visitor moves it (or picks Cinematic).
    c.smoothTime = 0.55;
  });

  useEffect(() => {
    if (cameraMode !== 'cinematic') tour.current.next = 0;
  }, [cameraMode]);

  return <CameraControls ref={ref} makeDefault />;
}
