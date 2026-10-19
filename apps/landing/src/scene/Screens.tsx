import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { formatPaise } from '@foodcourt/shared';
import { SHOP_SLOTS, STATIONS } from '../data/layout';
import { SHOPS, SHOP_BY_ID, type ShopDef } from '../data/shops';
import { getSim } from '../store/sim';
import { slotMatrix } from './build/shops';
import { frame } from './frame';

const FONT = '"Geist Variable", "Geist", system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"Geist Mono Variable", "Geist Mono", ui-monospace, Menlo, monospace';

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx: canvas.getContext('2d')!, tex };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawSign(ctx: CanvasRenderingContext2D, shop: ShopDef, w: number, h: number) {
  // A dark backlit panel keeps the name readable on every fascia colour, without bloom haze.
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1d1e22');
  g.addColorStop(1, '#0f1012');
  ctx.fillStyle = g;
  roundRect(ctx, 6, 6, w - 12, h - 12, 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Token-code badge in the shop colour.
  ctx.fillStyle = shop.color;
  roundRect(ctx, 26, 22, 116, h - 44, 22);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 50px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(shop.code, 84, h / 2 + 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `750 70px ${FONT}`;
  ctx.fillText(shop.name, 172, h / 2 - 14, w - 220);
  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(shop.tagline, 174, h / 2 + 40, w - 220);
  // Accent underline in the shop colour.
  ctx.fillStyle = shop.color;
  ctx.fillRect(174, h - 22, 120, 5);
}

function drawMenu(ctx: CanvasRenderingContext2D, shop: ShopDef, soldOut: Set<string>, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#16181c');
  g.addColorStop(1, '#0b0c0e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = shop.color;
  ctx.fillRect(0, 0, w, 10);
  const cols = 3;
  const items = shop.menu;
  const colW = (w - 80) / cols;
  const rowsPer = Math.ceil(items.length / cols);
  const rowH = (h - 70) / rowsPer;
  items.forEach((item, i) => {
    const c = Math.floor(i / rowsPer);
    const r = i % rowsPer;
    const x = 40 + c * colW;
    const y = 50 + r * rowH;
    const out = soldOut.has(item.id);
    ctx.globalAlpha = out ? 0.38 : 1;
    // Veg / non-veg mark.
    ctx.strokeStyle = item.veg ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y - 15, 30, 30);
    ctx.fillStyle = item.veg ? '#22c55e' : '#ef4444';
    ctx.beginPath();
    ctx.arc(x + 15, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8f6f1';
    ctx.font = `600 38px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, x + 48, y - 2, colW - 200);
    ctx.fillStyle = '#ffcf99';
    ctx.font = `700 38px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(out ? 'Sold out' : formatPaise(item.pricePaise), x + colW - 30, y - 2);
    ctx.fillStyle = 'rgba(248,246,241,0.5)';
    ctx.font = `500 24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${item.prepMin} min`, x + 48, y + 32);
    ctx.globalAlpha = 1;
  });
}

function drawTokenScreen(ctx: CanvasRenderingContext2D, shop: ShopDef, ready: string[], preparing: string[], w: number, h: number) {
  ctx.fillStyle = '#0a0b0d';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = shop.color;
  ctx.fillRect(0, 0, w, 46);
  ctx.fillStyle = '#fff';
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('NOW SERVING', 18, 24);
  ctx.textAlign = 'right';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(shop.code, w - 18, 24);
  ctx.textAlign = 'left';
  const list = ready.slice(0, 3);
  list.forEach((t, i) => {
    ctx.fillStyle = '#4ade80';
    ctx.font = `700 46px ${MONO}`;
    ctx.fillText(t, 18 + (i % 2) * (w / 2), 92 + Math.floor(i / 2) * 58);
  });
  if (list.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText('Next token soon', 18, 96);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(`Cooking: ${preparing.slice(0, 4).join('  ') || 'none'}`, 18, h - 22, w - 36);
}

function drawWallBoard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sim = getSim();
  ctx.fillStyle = '#08090b';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e4570f';
  ctx.fillRect(0, 0, w, 70);
  ctx.fillStyle = '#fff';
  ctx.font = `800 42px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('NOW SERVING', 30, 36);
  ctx.textAlign = 'right';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('REVA Food Court', w - 30, 36);
  const colW = w / 4;
  SHOPS.forEach((shop, i) => {
    const c = i % 4;
    const r = Math.floor(i / 4);
    const x = c * colW + 22;
    const y = 96 + r * 128;
    const k = sim.kitchens.get(shop.id)!;
    ctx.fillStyle = shop.color;
    ctx.fillRect(x, y, 8, 108);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(shop.name, x + 22, y + 18, colW - 50);
    const ready = k.ready.slice(-2).map((id) => sim.orders.get(id)?.token).filter(Boolean) as string[];
    ctx.font = `700 40px ${MONO}`;
    ctx.fillStyle = '#4ade80';
    ready.forEach((t, j) => ctx.fillText(t, x + 22, y + 60 + j * 40));
    if (!ready.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `500 24px ${FONT}`;
      ctx.fillText('No tokens waiting', x + 22, y + 62);
    }
  });
}

export function Screens() {
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([document.fonts.load(`700 40px ${FONT}`), document.fonts.load(`700 40px ${MONO}`)])
      .catch(() => undefined)
      .then(() => live && setFontsReady(true));
    return () => {
      live = false;
    };
  }, []);

  const boards = useMemo(
    () =>
      SHOP_SLOTS.map((slot) => {
        const shop = SHOP_BY_ID[slot.shopId]!;
        const sign = makeCanvas(1280, 160);
        const menu = makeCanvas(1600, 290);
        const token = makeCanvas(320, 190);
        return { slot, shop, sign, menu, token, matrix: slotMatrix(slot) };
      }),
    []
  );
  const wall = useMemo(() => makeCanvas(1024, 352), []);
  const lastSoldOut = useRef(new Map<string, string>());
  const nextTick = useRef(0);
  const minuteHand = useRef<THREE.Group>(null);
  const hourHand = useRef<THREE.Group>(null);
  const clockFace = useMemo(() => {
    const c = makeCanvas(256, 256);
    const ctx = c.ctx;
    ctx.fillStyle = '#fbfaf7';
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1b1d';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.save();
      ctx.translate(128 + Math.sin(a) * 104, 128 - Math.cos(a) * 104);
      ctx.rotate(a);
      ctx.fillRect(-3, -10, 6, i % 3 ? 14 : 22);
      ctx.restore();
    }
    ctx.fillStyle = '#e4570f';
    ctx.font = '700 20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('REVA', 128, 175);
    c.tex.needsUpdate = true;
    return c.tex;
  }, []);

  useEffect(() => {
    for (const b of boards) {
      drawSign(b.sign.ctx, b.shop, 1280, 160);
      b.sign.tex.needsUpdate = true;
    }
  }, [boards, fontsReady]);

  useFrame(() => {
    const sim = getSim();
    if (frame.t >= nextTick.current) {
      nextTick.current = frame.t + 0.5;
      for (const b of boards) {
        const k = sim.kitchens.get(b.shop.id)!;
        const soldKey = [...k.soldOut].sort().join(',') + (fontsReady ? '1' : '0');
        if (lastSoldOut.current.get(b.shop.id) !== soldKey) {
          lastSoldOut.current.set(b.shop.id, soldKey);
          drawMenu(b.menu.ctx, b.shop, k.soldOut, 1600, 290);
          b.menu.tex.needsUpdate = true;
        }
        const tokens = (ids: number[]) => ids.map((id) => sim.orders.get(id)?.token).filter(Boolean) as string[];
        drawTokenScreen(b.token.ctx, b.shop, tokens(k.ready).reverse(), tokens(k.cooking), 320, 190);
        b.token.tex.needsUpdate = true;
      }
      drawWallBoard(wall.ctx, 1024, 352);
      wall.tex.needsUpdate = true;
    }
    const minutes = sim.clockMinutes();
    if (minuteHand.current) minuteHand.current.rotation.z = -((minutes % 60) / 60) * Math.PI * 2;
    if (hourHand.current) hourHand.current.rotation.z = -(((minutes / 60) % 12) / 12) * Math.PI * 2;
  });

  const tb = STATIONS.tokenBoard;
  return (
    <group>
      {boards.map((b) => (
        <group key={b.shop.id} matrixAutoUpdate={false} matrix={b.matrix}>
          <mesh position={[0, 3.36, 0.006]}>
            <planeGeometry args={[5.4, 0.675]} />
            <meshBasicMaterial map={b.sign.tex} transparent toneMapped={false} />
          </mesh>
          <mesh position={[0, 2.45, -0.826]}>
            <planeGeometry args={[4.8, 0.87]} />
            <meshBasicMaterial map={b.menu.tex} toneMapped={false} color={[1.15, 1.15, 1.15]} />
          </mesh>
          <mesh position={[2.05, 1.86, -0.12]}>
            <planeGeometry args={[0.56, 0.33]} />
            <meshBasicMaterial map={b.token.tex} toneMapped={false} color={[1.3, 1.3, 1.3]} />
          </mesh>
        </group>
      ))}
      {[0, Math.PI].map((ry) => (
        <group key={ry} position={[tb.x, tb.y, tb.z]} rotation-y={ry}>
          <mesh position={[0, 0, 0.062]}>
            <planeGeometry args={[3.15, 1.08]} />
            <meshBasicMaterial map={wall.tex} toneMapped={false} color={[1.25, 1.25, 1.25]} />
          </mesh>
        </group>
      ))}
      <group position={[-9.4, 3.05, 11.91]} rotation-y={Math.PI}>
        <mesh>
          <circleGeometry args={[0.33, 40]} />
          <meshStandardMaterial map={clockFace} roughness={0.4} />
        </mesh>
        {/* Hands pivot at the centre of the face. */}
        <group ref={hourHand} position={[0, 0, 0.01]}>
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[0.026, 0.2, 0.01]} />
            <meshStandardMaterial color="#1b1b1d" />
          </mesh>
        </group>
        <group ref={minuteHand} position={[0, 0, 0.016]}>
          <mesh position={[0, 0.13, 0]}>
            <boxGeometry args={[0.016, 0.28, 0.01]} />
            <meshStandardMaterial color="#1b1b1d" />
          </mesh>
        </group>
      </group>
    </group>
  );
}
