import * as THREE from 'three';
import { SHOPS } from '../data/shops';
import { fabricMap, grassMap, pavingMap, plasterMaps, steelMaps, wallTileMap, woodMaps, doorMatMap, noticeMap } from './textures';

export type MatKey = string;

let registry: Map<MatKey, THREE.Material> | null = null;

/** Emissive materials whose glow follows the time of day. */
export const NIGHT_GLOW = new Map<MatKey, { day: number; night: number }>();

function std(params: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial(params);
}

function glow(key: MatKey, color: string, day: number, night: number) {
  NIGHT_GLOW.set(key, { day, night });
  return std({ color: '#111', emissive: color, emissiveIntensity: day, roughness: 0.6 });
}

function build(): Map<MatKey, THREE.Material> {
  const m = new Map<MatKey, THREE.Material>();
  const steel = steelMaps();
  const oak = woodMaps('oak', [176, 128, 82]);
  const walnut = woodMaps('walnut', [104, 70, 46]);
  const cream = plasterMaps('cream', '#efe7da');
  const white = plasterMaps('white', '#f4f2ee');
  const sage = plasterMaps('sage', '#c9d3c0');

  m.set('plaster', std({ map: cream.map, bumpMap: cream.bump, bumpScale: 0.6, roughness: 0.92 }));
  m.set('plasterSage', std({ map: sage.map, bumpMap: sage.bump, bumpScale: 0.6, roughness: 0.92 }));
  m.set('ceiling', std({ map: white.map, roughness: 0.95 }));
  m.set('wallTile', std({ map: wallTileMap('white', '#f3f4f2', '#c9cbc8'), roughness: 0.28, metalness: 0 }));
  m.set('steel', std({ map: steel.map, roughnessMap: steel.roughness, metalness: 0.9, roughness: 0.42 }));
  m.set('steelDark', std({ color: '#7a7f86', map: steel.map, roughnessMap: steel.roughness, metalness: 0.85, roughness: 0.5 }));
  m.set('chrome', std({ color: '#e5e7eb', metalness: 1, roughness: 0.12 }));
  m.set('duct', std({ color: '#c7ccd1', metalness: 0.75, roughness: 0.45 }));
  m.set('oak', std({ map: oak.map, roughnessMap: oak.roughness, roughness: 0.62 }));
  m.set('walnut', std({ map: walnut.map, roughnessMap: walnut.roughness, roughness: 0.55 }));
  m.set('black', std({ color: '#1b1b1d', roughness: 0.55, metalness: 0.2 }));
  m.set('iron', std({ color: '#222326', roughness: 0.38, metalness: 0.8 }));
  m.set('rubber', std({ color: '#2a2b2e', roughness: 0.95 }));
  m.set('whiteLacquer', new THREE.MeshPhysicalMaterial({ color: '#f5f5f2', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  m.set('frame', std({ color: '#3a3f45', metalness: 0.7, roughness: 0.35 }));
  m.set(
    'glass',
    new THREE.MeshPhysicalMaterial({ color: '#dfeef2', side: THREE.DoubleSide, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, ior: 1.5, envMapIntensity: 1.6, depthWrite: false })
  );
  m.set('glassTint', new THREE.MeshPhysicalMaterial({ color: '#b9d6dc', side: THREE.DoubleSide, roughness: 0.06, transparent: true, opacity: 0.32, envMapIntensity: 1.4, depthWrite: false }));
  m.set('concrete', std({ color: '#b5b1aa', roughness: 0.9 }));
  m.set('paving', std({ map: pavingMap(), roughness: 0.85 }));
  m.set('grass', std({ map: grassMap(), roughness: 1 }));
  m.set('hedge', std({ color: '#3f6b2a', roughness: 0.9 }));
  m.set('leaf', std({ color: '#4d7c2f', roughness: 0.8 }));
  m.set('leafLight', std({ color: '#7aa63e', roughness: 0.8 }));
  m.set('bark', std({ color: '#5b4330', roughness: 0.95 }));
  m.set('soil', std({ color: '#3b2b20', roughness: 1 }));
  m.set('terracotta', std({ color: '#b85d3b', roughness: 0.85 }));
  m.set('clay', std({ color: '#c8865a', roughness: 0.9 }));
  m.set('brass', std({ color: '#c9a24a', metalness: 1, roughness: 0.3 }));
  m.set('copper', std({ color: '#b8733a', metalness: 1, roughness: 0.32 }));
  m.set('ceramic', new THREE.MeshPhysicalMaterial({ color: '#fbfbf8', roughness: 0.18, clearcoat: 0.8 }));
  m.set('plasticBlue', std({ color: '#2b6cb0', roughness: 0.4 }));
  m.set('plasticGreen', std({ color: '#2f855a', roughness: 0.45 }));
  m.set('waterBlue', new THREE.MeshPhysicalMaterial({ color: '#7cc4f0', roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
  m.set('rope', std({ color: '#8b1e2d', roughness: 0.8 }));
  m.set('mat', std({ map: doorMatMap(), roughness: 1 }));
  m.set('notice', std({ map: noticeMap(), roughness: 0.9 }));
  m.set('kitchenFloor', std({ color: '#5b5f63', roughness: 0.85 }));
  m.set('screenDark', std({ color: '#0d0f12', roughness: 0.25, metalness: 0.4 }));
  m.set('umbrellaA', std({ map: fabricMap('ua', '#e4570f'), roughness: 0.9, side: THREE.DoubleSide }));
  m.set('umbrellaB', std({ map: fabricMap('ub', '#f2efe8'), roughness: 0.9, side: THREE.DoubleSide }));
  m.set('cushion', std({ map: fabricMap('cushion', '#3f4c5a'), roughness: 0.95 }));
  m.set('food', std({ color: '#d99a3e', roughness: 0.7 }));
  m.set('foodGreen', std({ color: '#5d8c35', roughness: 0.7 }));
  m.set('foodRed', std({ color: '#b5361c', roughness: 0.6 }));
  m.set('bottleA', new THREE.MeshPhysicalMaterial({ color: '#f59e0b', roughness: 0.1, transparent: true, opacity: 0.85 }));
  m.set('bottleB', new THREE.MeshPhysicalMaterial({ color: '#16a34a', roughness: 0.1, transparent: true, opacity: 0.85 }));
  m.set('bottleC', new THREE.MeshPhysicalMaterial({ color: '#dc2626', roughness: 0.1, transparent: true, opacity: 0.85 }));
  m.set('tubeLight', glow('tubeLight', '#fff8ec', 2.2, 4.2));
  m.set('pendantGlow', glow('pendantGlow', '#ffc27a', 1.4, 5));
  m.set('heatLamp', glow('heatLamp', '#ff7a2f', 1.6, 2.8));
  m.set('ovenGlow', glow('ovenGlow', '#ff6a1a', 3.2, 4.2));
  m.set('fridgeGlow', glow('fridgeGlow', '#e6f6ff', 1.3, 2.2));
  m.set('kioskGlow', glow('kioskGlow', '#ffe3cf', 1.2, 2));
  m.set('streetGlow', glow('streetGlow', '#ffd8a0', 0.1, 6));
  m.set('exitGlow', glow('exitGlow', '#22c55e', 2, 3));

  for (const shop of SHOPS) {
    m.set(`lacquer:${shop.id}`, new THREE.MeshPhysicalMaterial({ color: shop.color, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18 }));
    m.set(`trim:${shop.id}`, glow(`trim:${shop.id}`, shop.color, 1.6, 3.4));
  }
  return m;
}

export function materials(): Map<MatKey, THREE.Material> {
  if (!registry) registry = build();
  return registry;
}

export function mat(key: MatKey): THREE.Material {
  const m = materials().get(key);
  if (!m) throw new Error(`Unknown material ${key}`);
  return m;
}

/** Fades interior glow between day and night (0 = midday, 1 = night). */
export function applyNight(night: number, boost = 1) {
  const reg = materials();
  for (const [key, { day, night: n }] of NIGHT_GLOW) {
    const m = reg.get(key) as THREE.MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = (day + (n - day) * night) * boost;
  }
}

/** Transparent materials draw after opaque ones and skip shadow casting. */
export const TRANSPARENT = new Set(['glass', 'glassTint', 'waterBlue', 'bottleA', 'bottleB', 'bottleC']);
export const NO_SHADOW = new Set([...TRANSPARENT, 'tubeLight', 'pendantGlow', 'heatLamp', 'ovenGlow', 'fridgeGlow', 'kioskGlow', 'streetGlow', 'exitGlow', 'ceiling']);
