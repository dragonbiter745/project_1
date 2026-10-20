// Canvas-drawn rupee notes and coins for the login scene. They follow the colours of the current
// Mahatma Gandhi New Series notes but carry the court's name, not RBI marks or portraits: they are
// decoration, not replicas.

export interface Denomination {
  value: 500 | 200 | 100 | 50;
  words: string;
  paper: string;
  light: string;
  ink: string;
  /** Share of the notes in the air. */
  weight: number;
}

export const DENOMINATIONS: Denomination[] = [
  { value: 500, words: 'पाँच सौ रुपये', paper: '#b9baa6', light: '#dcddcc', ink: '#3f4434', weight: 0.36 },
  { value: 200, words: 'दो सौ रुपये', paper: '#f2b93b', light: '#fbdc8a', ink: '#6e4405', weight: 0.24 },
  { value: 100, words: 'एक सौ रुपये', paper: '#b2a3d6', light: '#d9cff0', ink: '#3f3170', weight: 0.24 },
  { value: 50, words: 'पचास रुपये', paper: '#79cbd2', light: '#bfe9ec', ink: '#18545d', weight: 0.16 },
];

export const NOTE_W = 768;
export const NOTE_H = 336;
const SANS = '"Geist Variable", system-ui, -apple-system, "Segoe UI", sans-serif';
const DEVANAGARI = '"Noto Sans Devanagari", "Kohinoor Devanagari", "Nirmala UI", "Mangal", sans-serif';

/** Waits for the app font so the numerals are drawn in Geist, not a fallback. Never blocks for long. */
export async function fontsReady(): Promise<void> {
  try {
    await Promise.race([document.fonts.load(`700 120px ${SANS}`), new Promise((r) => setTimeout(r, 600))]);
  } catch {
    // Older browsers: draw with whatever is available.
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

/** Fine intaglio-style rosette: rings whose radius wobbles, like the guilloche on a banknote. */
function rosette(g: CanvasRenderingContext2D, cx: number, cy: number, inner: number, outer: number, colour: string, rings = 14, petals = 18) {
  g.save();
  g.strokeStyle = colour;
  g.lineWidth = 1.1;
  for (let k = 0; k < rings; k++) {
    const base = inner + ((outer - inner) * k) / (rings - 1);
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 180) {
      const r = base + Math.sin(a * petals + k * 0.6) * (outer - inner) * 0.08;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();
}

/** Wavy horizontal security lines across a band. */
function waves(g: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, colour: string, lines: number, freq: number) {
  g.save();
  g.strokeStyle = colour;
  g.lineWidth = 1;
  for (let i = 0; i < lines; i++) {
    const y = y0 + ((y1 - y0) * i) / (lines - 1);
    g.beginPath();
    for (let x = x0; x <= x1; x += 4) {
      const yy = y + Math.sin(x * freq + i * 0.9) * 4;
      if (x === x0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.restore();
}

function paper(g: CanvasRenderingContext2D, d: Denomination, w: number, h: number) {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, d.paper);
  grad.addColorStop(0.5, d.light);
  grad.addColorStop(1, d.paper);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Paper fibre: faint speckle so the note doesn't look like flat plastic.
  g.save();
  g.globalAlpha = 0.07;
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() > 0.5 ? '#ffffff' : d.ink;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
  g.restore();
}

function border(g: CanvasRenderingContext2D, d: Denomination, w: number, h: number) {
  g.save();
  g.strokeStyle = d.ink;
  g.globalAlpha = 0.55;
  g.lineWidth = 3;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.globalAlpha = 0.35;
  g.lineWidth = 1;
  g.setLineDash([2, 4]);
  g.strokeRect(22, 22, w - 44, h - 44);
  g.restore();
}

export function drawNoteFront(d: Denomination): HTMLCanvasElement {
  const [c, g] = canvas(NOTE_W, NOTE_H);
  const w = NOTE_W;
  const h = NOTE_H;
  paper(g, d, w, h);
  waves(g, 30, w - 30, 40, h - 40, hexAlpha(d.ink, 0.1), 22, 0.035);
  rosette(g, w * 0.6, h * 0.52, 34, 118, hexAlpha(d.ink, 0.28));
  border(g, d, w, h);

  // Watermark window on the left with a large rupee sign.
  g.save();
  const wm = g.createRadialGradient(w * 0.19, h * 0.52, 10, w * 0.19, h * 0.52, 104);
  wm.addColorStop(0, 'rgba(255,255,255,0.72)');
  wm.addColorStop(1, 'rgba(255,255,255,0.08)');
  g.fillStyle = wm;
  g.beginPath();
  g.ellipse(w * 0.19, h * 0.52, 92, 112, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hexAlpha(d.ink, 0.22);
  g.font = `600 150px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('₹', w * 0.19, h * 0.54);
  g.restore();

  // Windowed security thread.
  g.save();
  g.strokeStyle = hexAlpha(d.ink, 0.75);
  g.lineWidth = 7;
  g.setLineDash([18, 10]);
  g.beginPath();
  g.moveTo(w * 0.36, 24);
  g.lineTo(w * 0.36, h - 24);
  g.stroke();
  g.restore();

  g.fillStyle = d.ink;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.font = `700 40px ${SANS}`;
  g.fillText(`₹${d.value}`, 40, 66);

  g.textAlign = 'center';
  g.font = `600 19px ${SANS}`;
  g.globalAlpha = 0.85;
  g.fillText('R E V A   F O O D   C O U R T', w * 0.62, 62);
  g.font = `500 24px ${DEVANAGARI}`;
  g.fillText(d.words, w * 0.62, 96);
  g.globalAlpha = 1;

  g.textAlign = 'right';
  g.font = `800 112px ${SANS}`;
  g.fillText(String(d.value), w - 42, h - 40);

  // Rupee sign in the corner, as on the real notes.
  g.font = `700 34px ${SANS}`;
  g.fillText('₹', w - 42, 64);
  return c;
}

export function drawNoteBack(d: Denomination): HTMLCanvasElement {
  const [c, g] = canvas(NOTE_W, NOTE_H);
  const w = NOTE_W;
  const h = NOTE_H;
  paper(g, d, w, h);
  waves(g, 30, w - 30, 40, h - 40, hexAlpha(d.ink, 0.12), 18, 0.05);
  rosette(g, w * 0.5, h * 0.5, 50, 140, hexAlpha(d.ink, 0.22), 18, 24);
  border(g, d, w, h);
  g.fillStyle = d.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 150px ${SANS}`;
  g.fillText(String(d.value), w * 0.5, h * 0.52);
  g.font = `700 64px ${SANS}`;
  g.textAlign = 'left';
  g.fillText('₹', 44, h * 0.5);
  g.textAlign = 'right';
  g.fillText('₹', w - 44, h * 0.5);
  g.font = `600 18px ${SANS}`;
  g.textAlign = 'center';
  g.globalAlpha = 0.8;
  g.fillText('SHOP FINANCE  ·  2026', w * 0.5, h - 44);
  g.font = `500 22px ${DEVANAGARI}`;
  g.fillText(d.words, w * 0.5, 50);
  return c;
}

/** ₹10 bimetallic coin face: golden ring around a silver centre. */
export function drawCoinFace(): HTMLCanvasElement {
  const s = 256;
  const [c, g] = canvas(s, s);
  const ring = g.createRadialGradient(s * 0.4, s * 0.35, 20, s / 2, s / 2, s / 2);
  ring.addColorStop(0, '#f6dc8f');
  ring.addColorStop(0.6, '#d3a845');
  ring.addColorStop(1, '#9c7424');
  g.fillStyle = ring;
  g.fillRect(0, 0, s, s);
  const core = g.createRadialGradient(s * 0.42, s * 0.38, 6, s / 2, s / 2, s * 0.32);
  core.addColorStop(0, '#f4f5f7');
  core.addColorStop(0.7, '#c4c8ce');
  core.addColorStop(1, '#9aa0a8');
  g.fillStyle = core;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.31, 0, Math.PI * 2);
  g.fill();
  // Ten rays on the ring, one per rupee.
  g.strokeStyle = 'rgba(110,78,18,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.beginPath();
    g.moveTo(s / 2 + Math.cos(a) * s * 0.36, s / 2 + Math.sin(a) * s * 0.36);
    g.lineTo(s / 2 + Math.cos(a) * s * 0.45, s / 2 + Math.sin(a) * s * 0.45);
    g.stroke();
  }
  g.fillStyle = '#4b5058';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 74px ${SANS}`;
  g.fillText('₹', s / 2, s * 0.44);
  g.font = `800 40px ${SANS}`;
  g.fillText('10', s / 2, s * 0.64);
  return c;
}

/** Reeded coin edge. */
export function drawCoinEdge(): HTMLCanvasElement {
  const [c, g] = canvas(256, 16);
  g.fillStyle = '#c99d3f';
  g.fillRect(0, 0, 256, 16);
  g.fillStyle = '#8e6a20';
  for (let x = 0; x < 256; x += 4) g.fillRect(x, 0, 2, 16);
  return c;
}

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
