import * as THREE from 'three';
import { Rng } from '../sim/rng';

// Every surface texture is painted on a canvas at start-up: no image files are fetched.

type Paint = (ctx: CanvasRenderingContext2D, size: number, rng: Rng) => void;

const cache = new Map<string, THREE.CanvasTexture>();

function canvasTexture(key: string, size: number, paint: Paint, opts: { color?: boolean; repeat?: [number, number] } = {}) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  paint(ctx, size, new Rng(hash(key)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (opts.color !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) tex.repeat.set(...opts.repeat);
  cache.set(key, tex);
  return tex;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const shade = (v: number) => `rgb(${v},${v},${v})`;

function noise(ctx: CanvasRenderingContext2D, size: number, rng: Rng, amount: number, alpha: number) {
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    img.data[i] = clamp255(img.data[i]! + n);
    img.data[i + 1] = clamp255(img.data[i + 1]! + n);
    img.data[i + 2] = clamp255(img.data[i + 2]! + n);
    img.data[i + 3] = Math.round(img.data[i + 3]! * alpha + 255 * (1 - alpha));
  }
  ctx.putImageData(img, 0, 0);
}
const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

// ─── Terrazzo floor: 60 cm tiles, four to a texture ───────────────────────

const TILE_PX = 256;

function terrazzoChips(ctx: CanvasRenderingContext2D, size: number, rng: Rng, palette: string[], count: number) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng.pick(palette);
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = rng.range(1.2, rng.chance(0.08) ? 9 : 4.5);
    ctx.beginPath();
    const sides = rng.int(4, 7);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const rr = r * rng.range(0.6, 1.3);
      if (s === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
}

export function terrazzoMaps() {
  const size = 1024;
  const map = canvasTexture('terrazzo', size, (ctx, s, rng) => {
    for (let ty = 0; ty < s / TILE_PX; ty++) {
      for (let tx = 0; tx < s / TILE_PX; tx++) {
        const tint = rng.range(-7, 7);
        ctx.fillStyle = `rgb(${232 + tint},${226 + tint},${216 + tint})`;
        ctx.fillRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
      }
    }
    terrazzoChips(ctx, s, rng, ['#8a8580', '#b9b2a8', '#5d5a57', '#c9846a', '#a8b3a0', '#f7f4ee', '#2f2d2b', '#d7c3a5'], 9000);
    noise(ctx, s, rng, 14, 1);
    // Wear: a few darker scuff clouds.
    for (let i = 0; i < 26; i++) {
      const g = ctx.createRadialGradient(rng.next() * s, rng.next() * s, 0, rng.next() * s, rng.next() * s, rng.range(40, 140));
      g.addColorStop(0, 'rgba(90,80,70,0.06)');
      g.addColorStop(1, 'rgba(90,80,70,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
    ctx.fillStyle = '#9d968c';
    for (let i = 0; i <= s; i += TILE_PX) {
      ctx.fillRect(i - 2, 0, 4, s);
      ctx.fillRect(0, i - 2, s, 4);
    }
  });
  const roughness = canvasTexture(
    'terrazzo-r',
    512,
    (ctx, s, rng) => {
      ctx.fillStyle = shade(96);
      ctx.fillRect(0, 0, s, s);
      noise(ctx, s, rng, 40, 1);
      ctx.fillStyle = shade(225);
      const t = s / (1024 / TILE_PX);
      for (let i = 0; i <= s; i += t) {
        ctx.fillRect(i - 1, 0, 2, s);
        ctx.fillRect(0, i - 1, s, 2);
      }
    },
    { color: false }
  );
  const bump = canvasTexture(
    'terrazzo-b',
    512,
    (ctx, s) => {
      ctx.fillStyle = shade(200);
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = shade(40);
      const t = s / (1024 / TILE_PX);
      for (let i = 0; i <= s; i += t) {
        ctx.fillRect(i - 1.5, 0, 3, s);
        ctx.fillRect(0, i - 1.5, s, 3);
      }
    },
    { color: false }
  );
  return { map, roughness, bump };
}

// ─── Wood ─────────────────────────────────────────────────────────────────

export function woodMaps(key: string, base: [number, number, number]) {
  const map = canvasTexture(`wood-${key}`, 512, (ctx, s, rng) => {
    const [r, g, b] = base;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) {
      const y0 = rng.next() * s;
      const dark = rng.range(0.72, 0.95);
      ctx.strokeStyle = `rgba(${r * dark},${g * dark},${b * dark},${rng.range(0.25, 0.6)})`;
      ctx.lineWidth = rng.range(0.6, 2.6);
      ctx.beginPath();
      const amp = rng.range(2, 9);
      const freq = rng.range(0.006, 0.02);
      const ph = rng.range(0, 6);
      for (let x = 0; x <= s; x += 8) {
        const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1) * amp * 0.25;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Knots.
    for (let i = 0; i < 3; i++) {
      const x = rng.next() * s;
      const y = rng.next() * s;
      for (let k = 6; k > 0; k--) {
        ctx.strokeStyle = `rgba(${r * 0.6},${g * 0.55},${b * 0.5},0.35)`;
        ctx.beginPath();
        ctx.ellipse(x, y, k * 3.2, k * 1.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    noise(ctx, s, rng, 12, 1);
  });
  const roughness = canvasTexture(
    `wood-${key}-r`,
    256,
    (ctx, s, rng) => {
      ctx.fillStyle = shade(120);
      ctx.fillRect(0, 0, s, s);
      noise(ctx, s, rng, 50, 1);
    },
    { color: false }
  );
  return { map, roughness };
}

// ─── Brushed steel ────────────────────────────────────────────────────────

export function steelMaps() {
  const map = canvasTexture('steel', 512, (ctx, s, rng) => {
    ctx.fillStyle = '#b9bdc2';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) {
      const v = Math.round(rng.range(150, 225));
      ctx.strokeStyle = `rgba(${v},${v + 2},${v + 5},${rng.range(0.15, 0.45)})`;
      ctx.lineWidth = rng.range(0.4, 1.4);
      const y = rng.next() * s;
      const x = rng.next() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.range(40, 260), y + rng.range(-0.6, 0.6));
      ctx.stroke();
    }
  });
  const roughness = canvasTexture(
    'steel-r',
    256,
    (ctx, s, rng) => {
      ctx.fillStyle = shade(80);
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = shade(Math.round(rng.range(50, 140)));
        ctx.fillRect(rng.next() * s, rng.next() * s, rng.range(20, 90), 1);
      }
      // Fingerprint smudges.
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = 'rgba(200,200,200,0.15)';
        ctx.beginPath();
        ctx.arc(rng.next() * s, rng.next() * s, rng.range(6, 20), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { color: false }
  );
  return { map, roughness };
}

// ─── Plaster, fabric, paving, grass ───────────────────────────────────────

export function plasterMaps(key: string, base: string) {
  const map = canvasTexture(`plaster-${key}`, 512, (ctx, s, rng) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, rng, 10, 1);
    for (let i = 0; i < 40; i++) {
      const g = ctx.createRadialGradient(rng.next() * s, rng.next() * s, 0, rng.next() * s, rng.next() * s, rng.range(30, 120));
      g.addColorStop(0, 'rgba(0,0,0,0.035)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  });
  const bump = canvasTexture(
    `plaster-${key}-b`,
    256,
    (ctx, s, rng) => {
      ctx.fillStyle = shade(128);
      ctx.fillRect(0, 0, s, s);
      noise(ctx, s, rng, 70, 1);
    },
    { color: false }
  );
  return { map, bump };
}

export function wallTileMap(key: string, color: string, grout: string) {
  return canvasTexture(`walltile-${key}`, 512, (ctx, s, rng) => {
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, s, s);
    const tw = s / 8;
    const th = s / 16;
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 8; c++) {
        const off = r % 2 ? tw / 2 : 0;
        const v = rng.range(-8, 8);
        ctx.fillStyle = color;
        ctx.globalAlpha = 1;
        ctx.fillRect(c * tw + off + 1.5, r * th + 1.5, tw - 3, th - 3);
        ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 60})` : `rgba(0,0,0,${-v / 60})`;
        ctx.fillRect(c * tw + off + 1.5, r * th + 1.5, tw - 3, th - 3);
        if (off) {
          ctx.fillStyle = color;
          ctx.fillRect(-tw / 2 + 1.5, r * th + 1.5, tw - 3, th - 3);
        }
      }
    }
    noise(ctx, s, rng, 8, 1);
  });
}

export function fabricMap(key: string, base: string) {
  return canvasTexture(`fabric-${key}`, 256, (ctx, s, rng) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < s; i += 3) {
      ctx.fillStyle = i % 6 ? '#000' : '#fff';
      ctx.fillRect(i, 0, 1, s);
      ctx.fillRect(0, i, s, 1);
    }
    ctx.globalAlpha = 1;
    noise(ctx, s, rng, 18, 1);
  });
}

export function pavingMap() {
  return canvasTexture('paving', 512, (ctx, s, rng) => {
    ctx.fillStyle = '#8f8a83';
    ctx.fillRect(0, 0, s, s);
    const n = 4;
    const t = s / n;
    for (let r = 0; r < n * 2; r++) {
      for (let c = 0; c < n; c++) {
        const off = r % 2 ? t / 2 : 0;
        const v = Math.round(rng.range(170, 205));
        ctx.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        ctx.fillRect(c * t + off + 3, (r * t) / 2 + 3, t - 6, t / 2 - 6);
        ctx.fillRect(c * t + off - s + 3, (r * t) / 2 + 3, t - 6, t / 2 - 6);
      }
    }
    noise(ctx, s, rng, 22, 1);
  });
}

export function grassMap() {
  return canvasTexture('grass', 512, (ctx, s, rng) => {
    ctx.fillStyle = '#5f8f3e';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 26000; i++) {
      const g = Math.round(rng.range(110, 175));
      ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.55)`;
      ctx.fillRect(rng.next() * s, rng.next() * s, 1, rng.range(2, 5));
    }
  });
}

export function doorMatMap() {
  return canvasTexture('doormat', 256, (ctx, s, rng) => {
    ctx.fillStyle = '#3b3a37';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 6) {
      ctx.fillStyle = y % 12 ? '#2d2c2a' : '#46443f';
      ctx.fillRect(0, y, s, 3);
    }
    ctx.strokeStyle = '#e4570f';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, s - 20, s - 20);
    noise(ctx, s, rng, 30, 1);
  });
}

/** A QR-looking pattern for the table plates (decorative, encodes nothing). */
export function qrMap(seed: string) {
  return canvasTexture(`qr-${seed}`, 128, (ctx, s, rng) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, s, s);
    const n = 21;
    const c = (s - 16) / n;
    ctx.fillStyle = '#111';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rng.chance(0.48)) ctx.fillRect(8 + x * c, 8 + y * c, c, c);
    for (const [fx, fy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ] as const) {
      ctx.fillStyle = '#111';
      ctx.fillRect(8 + fx * c, 8 + fy * c, c * 7, c * 7);
      ctx.fillStyle = '#fff';
      ctx.fillRect(8 + (fx + 1) * c, 8 + (fy + 1) * c, c * 5, c * 5);
      ctx.fillStyle = '#111';
      ctx.fillRect(8 + (fx + 2) * c, 8 + (fy + 2) * c, c * 3, c * 3);
    }
  });
}

export function noticeMap() {
  return canvasTexture('notice', 256, (ctx, s, rng) => {
    ctx.fillStyle = '#b08d5c';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, rng, 30, 1);
    const papers = ['#fff7e6', '#fde68a', '#bfdbfe', '#fecaca', '#ffffff', '#bbf7d0'];
    for (let i = 0; i < 9; i++) {
      ctx.save();
      ctx.translate(rng.range(30, s - 30), rng.range(30, s - 30));
      ctx.rotate(rng.range(-0.25, 0.25));
      ctx.fillStyle = rng.pick(papers);
      const w = rng.range(50, 90);
      const h = rng.range(60, 100);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = 'rgba(40,40,40,0.5)';
      for (let l = 0; l < 6; l++) ctx.fillRect(-w / 2 + 8, -h / 2 + 12 + l * 11, w * rng.range(0.4, 0.8), 3);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(0, -h / 2 + 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

export function clearTextureCache() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
