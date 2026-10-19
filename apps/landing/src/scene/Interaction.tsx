import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { SHOP_SLOTS, STATIONS, TABLES, TABLE_BY_ID, shopToWorld } from '../data/layout';
import { SHOP_BY_ID } from '../data/shops';
import type { Selection } from '../sim/engine';
import { getSim } from '../store/sim';
import { sameSelection, useUi } from '../store/ui';
import { slotMatrix } from './build/shops';
import { frame } from './frame';

interface Hit {
  sel: Selection;
  matrix: THREE.Matrix4;
  size: [number, number, number];
  label: string;
}

function buildHits(): Hit[] {
  const hits: Hit[] = [];
  for (const slot of SHOP_SLOTS) {
    const m = slotMatrix(slot).multiply(new THREE.Matrix4().makeTranslation(0, 1.95, -1.75));
    hits.push({ sel: { kind: 'shop', id: slot.shopId }, matrix: m, size: [5.7, 3.9, 4.5], label: SHOP_BY_ID[slot.shopId]!.name });
  }
  for (const t of TABLES) {
    // Boxes stop just above the tabletop so diners sitting at the table stay clickable.
    const size: [number, number, number] = t.kind === 'bench' ? [2.2, 0.82, 2.2] : t.kind === 'high' ? [1.3, 1.1, 1.3] : [1.75, 0.82, 1.75];
    hits.push({ sel: { kind: 'table', id: t.id }, matrix: new THREE.Matrix4().makeTranslation(t.x - (t.kind === 'high' ? 0.3 : 0), size[1] / 2, t.z), size, label: `Table ${t.label}` });
  }
  const tb = STATIONS.tokenBoard;
  hits.push({ sel: { kind: 'station', id: 'tokenBoard' }, matrix: new THREE.Matrix4().makeTranslation(tb.x, tb.y, tb.z), size: [3.4, 1.35, 0.4], label: 'Now serving board' });
  hits.push({ sel: { kind: 'station', id: 'kiosks' }, matrix: new THREE.Matrix4().makeTranslation(8.9, 0.95, 10.9), size: [3.9, 1.9, 0.9], label: 'Self-order kiosks' });
  const tr = STATIONS.trayReturn;
  hits.push({ sel: { kind: 'station', id: 'trayReturn' }, matrix: new THREE.Matrix4().makeTranslation(tr.x, 1.1, tr.z), size: [2.7, 2.2, 1], label: 'Tray return' });
  const hd = STATIONS.helpdesk;
  hits.push({ sel: { kind: 'station', id: 'helpdesk' }, matrix: new THREE.Matrix4().makeTranslation(hd.x, 0.7, hd.z), size: [2.3, 1.4, 1.1], label: 'Helpdesk' });
  return hits;
}

const HEAT: Record<string, string> = { free: '#22c55e', reserved: '#f59e0b', occupied: '#e4570f', dirty: '#dc2626', cleaning: '#0ea5e9' };

export function Interaction() {
  const hits = useMemo(buildHits, []);
  const hover = useUi((s) => s.hover);
  const selection = useUi((s) => s.selection);
  const heatmap = useUi((s) => s.heatmap);
  const invisible = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  const hoverLines = useRef<THREE.LineSegments>(null);
  const selectLines = useRef<THREE.LineSegments>(null);
  const ring = useRef<THREE.Mesh>(null);
  const label = useRef<THREE.Group>(null);

  const hoverHit = hover && hover.kind !== 'person' ? hits.find((h) => sameSelection(h.sel, hover)) : undefined;
  const selHit = selection && selection.kind !== 'person' ? hits.find((h) => sameSelection(h.sel, selection)) : undefined;

  const place = (obj: THREE.Object3D | null, hit: Hit | undefined, grow: number) => {
    if (!obj) return;
    obj.visible = Boolean(hit);
    if (!hit) return;
    obj.matrixAutoUpdate = false;
    obj.matrix.copy(hit.matrix).multiply(new THREE.Matrix4().makeScale(hit.size[0] * grow, hit.size[1] * grow, hit.size[2] * grow));
    obj.matrixWorldNeedsUpdate = true;
  };

  useFrame(() => {
    place(hoverLines.current, sameSelection(hover, selection) ? undefined : hoverHit, 1.01);
    place(selectLines.current, selHit, 1.015 + Math.sin(frame.t * 4) * 0.006);
    const r = ring.current;
    const l = label.current;
    if (!r || !l) return;
    let anchor: THREE.Vector3 | null = null;
    let radius = 1;
    if (selection?.kind === 'person') {
      const a = getSim().agent(selection.id);
      if (a && a.alive) {
        anchor = new THREE.Vector3(a.px + (a.x - a.px) * frame.alpha, 0, a.pz + (a.z - a.pz) * frame.alpha);
        radius = 0.55;
        l.position.set(anchor.x, 2.25, anchor.z);
      }
    } else if (selHit) {
      anchor = new THREE.Vector3().setFromMatrixPosition(selHit.matrix);
      radius = Math.max(selHit.size[0], selHit.size[2]) * 0.62;
      l.position.set(anchor.x, anchor.y + selHit.size[1] / 2 + 0.5, anchor.z);
      anchor.y = 0;
    }
    if (hover?.kind === 'person' && !sameSelection(hover, selection)) {
      // Persons have no hit box; show the ring under the hovered one instead.
      const a = getSim().agent(hover.id);
      if (a && a.alive && !anchor) {
        anchor = new THREE.Vector3(a.x, 0, a.z);
        radius = 0.5;
      }
    }
    r.visible = Boolean(anchor);
    l.visible = selection?.kind === 'person' && Boolean(anchor);
    if (anchor) {
      r.position.set(anchor.x, 0.03, anchor.z);
      r.scale.setScalar(radius * (1 + Math.sin(frame.t * 3.2) * 0.05));
    }
  });

  const over = (sel: Selection) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!sameSelection(useUi.getState().hover, sel)) useUi.getState().set({ hover: sel });
    document.body.style.cursor = 'pointer';
  };
  const out = (sel: Selection) => () => {
    if (sameSelection(useUi.getState().hover, sel)) useUi.getState().set({ hover: null });
    document.body.style.cursor = '';
  };
  const click = (sel: Selection) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useUi.getState().select(sel);
  };

  const selectionLabel =
    selection?.kind === 'person'
      ? getSim().agent(selection.id)?.role === 'you'
        ? 'You'
        : 'Person'
      : (selHit?.label ?? '');

  return (
    <group>
      {hits.map((h) => (
        <mesh
          key={`${h.sel.kind}-${h.sel.id}`}
          geometry={unitBox}
          material={invisible}
          matrixAutoUpdate={false}
          matrix={h.matrix.clone().multiply(new THREE.Matrix4().makeScale(...h.size))}
          onPointerMove={over(h.sel)}
          onPointerOut={out(h.sel)}
          onClick={click(h.sel)}
        />
      ))}
      <lineSegments ref={hoverLines} geometry={edges} visible={false}>
        <lineBasicMaterial color={[2.4, 1.1, 0.35]} toneMapped={false} transparent opacity={0.85} />
      </lineSegments>
      <lineSegments ref={selectLines} geometry={edges} visible={false}>
        <lineBasicMaterial color={[3.6, 1.6, 0.45]} toneMapped={false} />
      </lineSegments>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false} renderOrder={8}>
        <ringGeometry args={[0.86, 1, 64]} />
        <meshBasicMaterial color={[3.2, 1.45, 0.4]} toneMapped={false} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <group ref={label} visible={false}>
        {/* Only people get a floating label; shops and tables are named in the detail panel. */}
        {selection?.kind === 'person' && (
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="scene-label">{selectionLabel}</div>
          </Html>
        )}
      </group>
      {heatmap &&
        TABLES.map((t) => <HeatDisc key={t.id} id={t.id} />)}
      <ShopHeat />
    </group>
  );
}

function HeatDisc({ id }: { id: string }) {
  const status = useUi((s) => s.snapshot?.tableStatus[id] ?? 'free');
  const t = TABLE_BY_ID[id]!;
  const r = t.kind === 'bench' ? 1.35 : t.kind === 'high' ? 0.7 : 1.05;
  return (
    <mesh position={[t.x - (t.kind === 'high' ? 0.3 : 0), 0.015, t.z]} rotation-x={-Math.PI / 2} renderOrder={7}>
      <circleGeometry args={[r, 40]} />
      <meshBasicMaterial color={HEAT[status]} transparent opacity={0.42} depthWrite={false} />
    </mesh>
  );
}

/** A soft glow pool in front of shops with a long line, visible while the heatmap is on. */
function ShopHeat() {
  const heatmap = useUi((s) => s.heatmap);
  const shops = useUi((s) => s.snapshot?.shops);
  if (!heatmap || !shops) return null;
  return (
    <>
      {shops.map((s) => {
        const slot = SHOP_SLOTS.find((x) => x.shopId === s.id)!;
        const p = shopToWorld(slot, -1.3, 2.4);
        const k = Math.min(1, s.queue / 6);
        return (
          <mesh key={s.id} position={[p.x, 0.016, p.z]} rotation-x={-Math.PI / 2} renderOrder={7}>
            <circleGeometry args={[0.9 + k * 1.2, 40]} />
            <meshBasicMaterial color={k > 0.6 ? '#dc2626' : k > 0.3 ? '#f59e0b' : '#22c55e'} transparent opacity={0.28 + k * 0.25} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}
