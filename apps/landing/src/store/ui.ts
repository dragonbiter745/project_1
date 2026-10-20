import { create } from 'zustand';
import type { Selection } from '../sim/engine';
import type { Crowd, Speed } from '../sim/types';
import type { Snapshot } from './sim';

export type Quality = 'low' | 'medium' | 'high';
export type Weather = 'clear' | 'rain' | 'heatwave' | 'festival';
export type DayMode = 'auto' | 'day' | 'night';
export type CameraMode = 'orbit' | 'follow' | 'cinematic';

export interface FlyRequest {
  id: number;
  position: [number, number, number];
  target: [number, number, number];
}

interface UiState {
  explore: boolean;
  /** The hero canvas is on screen; the 3D pauses when it is not. */
  heroVisible: boolean;
  sceneReady: boolean;
  /** WebGL is unavailable or the 3D scene crashed; the hero falls back to a static backdrop. */
  sceneFailed: boolean;
  /** 0..1 while the 3D scene loads and the opening crowd settles in. */
  sceneProgress: number;
  quality: Quality;
  autoQuality: boolean;
  weather: Weather;
  dayMode: DayMode;
  cameraMode: CameraMode;
  speed: Speed;
  crowd: Crowd;
  sound: boolean;
  selection: Selection | null;
  hover: Selection | null;
  fly: FlyRequest | null;
  follow: number | null;
  heatmap: boolean;
  orderOpen: boolean;
  dataOpen: boolean;
  controlsOpen: boolean;
  /** Table from a QR deep link (?table=T12). */
  presetTable: string | null;
  orderShop: string;
  snapshot: Snapshot | null;
  set: (patch: Partial<Omit<UiState, 'set' | 'flyTo' | 'select'>>) => void;
  flyTo: (position: [number, number, number], target: [number, number, number]) => void;
  select: (sel: Selection | null) => void;
}

let flyId = 0;

// Phones and small screens start light; the performance monitor raises quality when there is headroom.
function initialQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse || window.innerWidth < 768) return 'low';
  return (navigator.hardwareConcurrency ?? 8) <= 4 ? 'medium' : 'high';
}

export const useUi = create<UiState>((set) => ({
  explore: false,
  heroVisible: true,
  sceneReady: false,
  sceneFailed: false,
  sceneProgress: 0,
  quality: initialQuality(),
  autoQuality: true,
  weather: 'clear',
  dayMode: 'auto',
  cameraMode: 'orbit',
  speed: 1,
  crowd: 'normal',
  sound: false,
  selection: null,
  hover: null,
  fly: null,
  follow: null,
  heatmap: false,
  orderOpen: false,
  dataOpen: false,
  controlsOpen: false,
  presetTable: null,
  orderShop: 'dosa-corner',
  snapshot: null,
  set: (patch) => set(patch),
  flyTo: (position, target) => set({ fly: { id: ++flyId, position, target } }),
  select: (selection) => set({ selection, follow: selection?.kind === 'person' ? selection.id : null }),
}));

export const sameSelection = (a: Selection | null, b: Selection | null) =>
  a !== null && b !== null && a.kind === b.kind && a.id === b.id;
