import { DOOR, HALL, type Rect, type Vec2 } from '../data/layout';

export const CELL = 0.25;
// The grid reaches past the front wall so people can walk in from the street.
const MIN_X = HALL.minX;
const MIN_Z = HALL.minZ;
const MAX_X = HALL.maxX;
const MAX_Z = HALL.maxZ + 3.5;
const WALL_INSET = 0.3;

export class NavGrid {
  readonly cols = Math.round((MAX_X - MIN_X) / CELL);
  readonly rows = Math.round((MAX_Z - MIN_Z) / CELL);
  /** 0 = blocked, otherwise the cost of stepping into the cell. */
  readonly cost: Uint8Array;

  // A* scratch buffers, reused across searches.
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private searchId = 0;

  constructor(blocks: Rect[]) {
    const n = this.cols * this.rows;
    this.cost = new Uint8Array(n).fill(1);
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);

    // Walls: inside the hall plus a strip of pavement outside the front door.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { x, z } = this.center(r * this.cols + c);
        const inside = x > HALL.minX + WALL_INSET && x < HALL.maxX - WALL_INSET && z > HALL.minZ + WALL_INSET && z < HALL.maxZ - 0.2;
        const doorway = Math.abs(x - DOOR.x) < DOOR.width / 2 - 0.2 && z >= HALL.maxZ - 0.3;
        const street = z > HALL.maxZ + 0.35 && x > DOOR.x - 6 && x < DOOR.x + 6;
        if (!inside && !doorway && !street) this.cost[r * this.cols + c] = 0;
      }
    }
    for (const b of blocks) this.paint(b);
  }

  private paint(b: Rect) {
    const c0 = Math.max(0, Math.floor((b.minX - MIN_X) / CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((b.maxX - MIN_X - 1e-6) / CELL));
    const r0 = Math.max(0, Math.floor((b.minZ - MIN_Z) / CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((b.maxZ - MIN_Z - 1e-6) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * this.cols + c;
        if (this.cost[i] === 0) continue;
        this.cost[i] = b.cost ? Math.max(this.cost[i]!, Math.min(250, b.cost)) : 0;
      }
    }
  }

  index(x: number, z: number): number {
    const c = Math.floor((x - MIN_X) / CELL);
    const r = Math.floor((z - MIN_Z) / CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  center(i: number): Vec2 {
    const c = i % this.cols;
    const r = (i - c) / this.cols;
    return { x: MIN_X + (c + 0.5) * CELL, z: MIN_Z + (r + 0.5) * CELL };
  }

  walkable(x: number, z: number): boolean {
    const i = this.index(x, z);
    return i >= 0 && this.cost[i]! > 0;
  }

  /** Hard-blocked or soft (chairs) cells both count as "not open floor". */
  open(x: number, z: number): boolean {
    const i = this.index(x, z);
    return i >= 0 && this.cost[i] === 1;
  }

  nearestWalkable(x: number, z: number): number {
    const start = this.index(x, z);
    if (start >= 0 && this.cost[start]! > 0) return start;
    for (let radius = 1; radius < 24; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          const i = this.index(x + dc * CELL, z + dr * CELL);
          if (i >= 0 && this.cost[i]! > 0) return i;
        }
      }
    }
    return -1;
  }

  /** True when a straight walk between two points stays on open floor. */
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / (CELL * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!this.open(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /**
   * A* over 8-connected cells. Returns smoothed waypoints ending exactly at the goal,
   * or null when the goal cannot be reached.
   */
  findPath(from: Vec2, to: Vec2): Vec2[] | null {
    const start = this.nearestWalkable(from.x, from.z);
    const goal = this.nearestWalkable(to.x, to.z);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: to.x, z: to.z }];

    const id = ++this.searchId;
    const goalPos = this.center(goal);
    const heap = new MinHeap();
    this.g[start] = 0;
    this.stamp[start] = id;
    this.parent[start] = -1;
    heap.push(start, 0);
    const cols = this.cols;
    let found = false;

    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      const cc = cur % cols;
      const cr = (cur - cc) / cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
          const ni = nr * cols + nc;
          const stepCost = this.cost[ni]!;
          if (stepCost === 0 || this.closed[ni] === id) continue;
          // No corner cutting past blocked cells.
          if (dr !== 0 && dc !== 0 && (this.cost[cr * cols + nc] === 0 || this.cost[nr * cols + cc] === 0)) continue;
          const g = this.g[cur]! + (dr !== 0 && dc !== 0 ? 1.4142 : 1) * (ni === goal ? 1 : stepCost);
          if (this.stamp[ni] === id && g >= this.g[ni]!) continue;
          this.stamp[ni] = id;
          this.g[ni] = g;
          this.parent[ni] = cur;
          const p = this.center(ni);
          heap.push(ni, g + Math.hypot(p.x - goalPos.x, p.z - goalPos.z) / CELL);
        }
      }
    }
    if (!found) return null;

    const cells: Vec2[] = [];
    for (let i = goal; i !== -1; i = this.parent[i]!) cells.push(this.center(i));
    cells.reverse();
    cells[cells.length - 1] = { x: to.x, z: to.z };
    return this.smooth(from, cells);
  }

  // String-pulling: drop waypoints that can be skipped in a straight line.
  private smooth(from: Vec2, cells: Vec2[]): Vec2[] {
    const out: Vec2[] = [];
    let anchor = from;
    let i = 0;
    while (i < cells.length) {
      let far = i;
      for (let j = cells.length - 1; j > i; j--) {
        if (this.lineOfSight(anchor.x, anchor.z, cells[j]!.x, cells[j]!.z)) {
          far = j;
          break;
        }
      }
      out.push(cells[far]!);
      anchor = cells[far]!;
      i = far + 1;
    }
    return out;
  }
}

class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const items = this.items;
    const keys = this.keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      items[i] = items[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }
  pop(): number {
    const items = this.items;
    const keys = this.keys;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && keys[r]! < keys[l]! ? r : l;
        if (keys[m]! >= lastKey) break;
        items[i] = items[m]!;
        keys[i] = keys[m]!;
        i = m;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}
