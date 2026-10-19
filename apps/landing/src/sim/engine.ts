import { canTransitionSubOrder, type SubOrderStatus } from '@foodcourt/shared';
import {
  QUEUE_SLOTS,
  SHOP_POINTS,
  SHOP_SLOTS,
  SLOT_BY_SHOP,
  SPAWN,
  STATIONS,
  TABLES,
  TABLE_BY_ID,
  obstacles,
  shopFacing,
  shopToWorld,
  type TableDef,
  type Vec2,
} from '../data/layout';
import { SHOPS, SHOP_BY_ID, type MenuItem } from '../data/shops';
import { NavGrid } from './navgrid';
import { Rng } from './rng';
import type { Agent, AnimKind, Crowd, Group, Kitchen, Looks, OrderLine, Role, SimOrder, Speed, TableState } from './types';

export const DT = 1 / 30;
/** Court-clock seconds that pass per simulated second, so a lunch hour plays out in a few minutes. */
export const CLOCK_SCALE = 20;
const MAX_DINERS = 70;
const WALK_SPEED = 1.25;
const STEP_LENGTH = 0.68;
const BUCKET = 1;
const BUCKET_COLS = 38;
const BUCKET_ROWS = 30;
const KITCHEN_CAPACITY = 3;
const MAX_WAITING_GROUPS = 2;

const CROWD_FACTOR: Record<Crowd, number> = { quiet: 0.32, normal: 0.68, rush: 1 };

const SKIN = [0x8d5524, 0xa0673b, 0xc68642, 0xd9a066, 0xe0ac69, 0x7a4a2a, 0xb5784a, 0x9c6b43];
const SHIRTS = [0x2563eb, 0xdc2626, 0x16a34a, 0xf59e0b, 0x7c3aed, 0xdb2777, 0x0891b2, 0xf8fafc, 0x1f2937, 0xea580c, 0x65a30d, 0x9333ea, 0x0f766e, 0xfacc15, 0x64748b, 0xbe123c];
const PANTS = [0x1e3a8a, 0x1f2937, 0x334155, 0x78716c, 0x3f3f46, 0x1d4ed8, 0xa8a29e, 0x44403c];
const SHOES = [0xf8fafc, 0x111827, 0x7c2d12, 0x374151, 0xe5e7eb];
const HAIR = [0x111111, 0x1c1410, 0x2b1d14, 0x3b2a1e, 0x4a3426, 0x6b6b6b];
const BAGS = [0x111827, 0x1e40af, 0x7f1d1d, 0x14532d, 0xa16207];

export type Selection =
  | { kind: 'shop'; id: string }
  | { kind: 'table'; id: string }
  | { kind: 'person'; id: number }
  | { kind: 'station'; id: 'tokenBoard' | 'kiosks' | 'trayReturn' | 'helpdesk' };

export interface CartLine {
  shopId: string;
  itemId: string;
  qty: number;
}

export type PlaceResult =
  | { ok: true; groupId: number; agentId: number; tableId: string; orderIds: number[] }
  | { ok: false; reason: string };

export class Sim {
  readonly grid: NavGrid;
  readonly rng: Rng;
  time = 0;
  speed: Speed = 1;
  crowd: Crowd = 'normal';
  paused = false;
  agents: Agent[] = [];
  readonly groups = new Map<number, Group>();
  readonly orders = new Map<number, SimOrder>();
  readonly tables: TableState[];
  readonly tableById = new Map<string, TableState>();
  readonly kitchens = new Map<string, Kitchen>();
  /** Orders placed per court hour (index = hour of day). */
  readonly hourly = new Array<number>(24).fill(0);
  revenuePaise = 0;
  tablesCleaned = 0;

  private readonly startClock: number;
  private acc = 0;
  private nextAgent = 1;
  private nextGroup = 1;
  private nextOrder = 1;
  private spawnIn = 0;
  private supplierIn = 35;
  private soldOutIn = 90;
  private readonly soldOutUntil = new Map<string, number>();
  private readonly runnerQueue: number[] = [];
  private readonly buckets: number[][] = Array.from({ length: BUCKET_COLS * BUCKET_ROWS }, () => []);
  private readonly byId = new Map<number, Agent>();
  private youGroup: number | null = null;

  constructor(opts: { seed?: number; startHour?: number; warmup?: number } = {}) {
    this.rng = new Rng(opts.seed ?? 20251019);
    this.startClock = (opts.startHour ?? 12.35) * 3600;
    this.grid = new NavGrid(obstacles());
    this.tables = TABLES.map((t) => ({ id: t.id, status: 'free', groupId: null, seats: t.seats.map(() => null), trays: 0, cleaner: null, orderIds: [] }));
    for (const t of this.tables) this.tableById.set(t.id, t);
    for (const shop of SHOPS) {
      this.kitchens.set(shop.id, {
        shopId: shop.id,
        queue: [],
        incoming: [],
        waiting: [],
        cooking: [],
        ready: [],
        tokenSeq: this.rng.int(18, 64),
        soldOut: new Set(),
        servedToday: this.rng.int(40, 120),
        revenuePaise: 0,
      });
    }
    this.spawnStaff();
    const warm = opts.warmup ?? 60;
    for (let i = 0; i < warm / DT; i++) this.step();
  }

  // ─── Clock ───────────────────────────────────────────────────────────────

  /** Court clock in minutes since midnight. */
  clockMinutes(): number {
    return ((this.startClock + this.time * CLOCK_SCALE) / 60) % 1440;
  }

  /** Runs whole fixed steps for the real time that passed; returns the render blend factor. */
  advance(realDt: number): number {
    if (this.paused) return 1;
    this.acc += Math.min(realDt, 0.1) * this.speed;
    let steps = Math.floor(this.acc / DT);
    if (steps > 48) {
      steps = 48;
      this.acc = 0;
    } else {
      this.acc -= steps * DT;
    }
    for (let i = 0; i < steps; i++) this.step();
    return this.acc / DT;
  }

  agent(id: number): Agent | undefined {
    return this.byId.get(id);
  }

  step() {
    for (const a of this.agents) {
      a.px = a.x;
      a.pz = a.z;
      a.pheading = a.heading;
    }
    this.time += DT;
    this.fillBuckets();
    this.spawnCrowd();
    this.updateKitchens();
    this.updateSoldOut();
    for (const a of this.agents) {
      if (!a.alive) continue;
      switch (a.role) {
        case 'diner':
        case 'you':
          this.updateDiner(a);
          break;
        case 'cook':
          this.updateCook(a);
          break;
        case 'assistant':
          this.updateAssistant(a);
          break;
        case 'runner':
          this.updateRunner(a);
          break;
        case 'cleaner':
          this.updateCleaner(a);
          break;
        case 'supplier':
          this.updateSupplier(a);
          break;
      }
      this.move(a);
    }
    this.updateGroups();
    if (Math.round(this.time / DT) % 150 === 0) this.compact();
  }

  // ─── Population ──────────────────────────────────────────────────────────

  /** Lunch and dinner peaks on a quiet base, open 08:00 to 23:00. */
  demand(): number {
    const h = this.clockMinutes() / 60;
    if (h < 8 || h > 23) return 0.04;
    const lunch = Math.exp(-((h - 13.2) ** 2) / (2 * 1.05 ** 2));
    const dinner = 0.72 * Math.exp(-((h - 20) ** 2) / (2 * 1.2 ** 2));
    const snack = 0.28 * Math.exp(-((h - 17) ** 2) / (2 * 0.8 ** 2));
    const curve = Math.min(1, 0.14 + lunch + dinner + snack);
    return this.crowd === 'rush' ? Math.max(0.88, curve) : curve;
  }

  dinerCount(): number {
    let n = 0;
    for (const a of this.agents) if (a.alive && (a.role === 'diner' || a.role === 'you')) n++;
    return n;
  }

  private spawnCrowd() {
    this.spawnIn -= DT;
    if (this.spawnIn > 0) return;
    const target = Math.round(MAX_DINERS * this.demand() * CROWD_FACTOR[this.crowd]);
    this.spawnIn = this.rng.range(0.9, 2.2) * (this.crowd === 'quiet' ? 1.8 : 1);
    let waitingGroups = 0;
    for (const g of this.groups.values()) if (g.phase === 'waitingTable') waitingGroups++;
    if (this.dinerCount() < target && waitingGroups < MAX_WAITING_GROUPS) this.spawnGroup();

    this.supplierIn -= DT;
    if (this.supplierIn <= 0) {
      this.supplierIn = this.rng.range(80, 140);
      this.spawnSupplier();
    }
  }

  private makeLooks(role: Role, shopColor?: number): Looks {
    const r = this.rng;
    const looks: Looks = {
      height: r.range(1.56, 1.86),
      build: r.range(0.9, 1.14),
      skin: r.pick(SKIN),
      shirt: r.pick(SHIRTS),
      pants: r.pick(PANTS),
      shoes: r.pick(SHOES),
      hair: r.pick([0, 0, 0, 1, 1, 2, 4] as const),
      hairColor: r.pick(HAIR),
      backpack: r.chance(0.32),
      backpackColor: r.pick(BAGS),
    };
    if (role === 'cook') Object.assign(looks, { shirt: 0xf4f4f0, pants: 0x18181b, shoes: 0x111827, hair: 3, backpack: false });
    if (role === 'assistant') Object.assign(looks, { shirt: shopColor ?? 0xe4570f, pants: 0x1f2937, backpack: false });
    if (role === 'runner') Object.assign(looks, { shirt: 0xe4570f, pants: 0x1f2937, backpack: false });
    if (role === 'cleaner') Object.assign(looks, { shirt: 0x0f766e, pants: 0x134e4a, backpack: false });
    if (role === 'supplier') Object.assign(looks, { shirt: 0x1d4ed8, pants: 0x1e3a8a, backpack: false, hair: 0 });
    if (role === 'you') Object.assign(looks, { shirt: 0xe4570f, pants: 0x1f2937, backpack: true, backpackColor: 0x111827, height: 1.74 });
    return looks;
  }

  private spawnAgent(role: Role, x: number, z: number, heading: number, looks: Looks): Agent {
    const a: Agent = {
      id: this.nextAgent++,
      alive: true,
      role,
      x,
      z,
      px: x,
      pz: z,
      heading,
      pheading: heading,
      seatY: 0,
      maxSpeed: role === 'runner' ? WALK_SPEED * 1.15 : WALK_SPEED * this.rng.range(0.85, 1.12),
      speed: 0,
      path: [],
      pathIdx: 0,
      faceOnArrive: null,
      state: 'idle',
      timer: 0,
      blockedFor: 0,
      anim: 'idle',
      phase: this.rng.range(0, Math.PI * 2),
      looks,
      groupId: 0,
      shopId: null,
      seat: null,
      carry: 'none',
      task: null,
      home: { x, z },
      homeHeading: heading,
    };
    this.agents.push(a);
    this.byId.set(a.id, a);
    return a;
  }

  private spawnStaff() {
    for (const slot of SHOP_SLOTS) {
      const shop = SHOP_BY_ID[slot.shopId]!;
      const color = parseInt(shop.color.slice(1), 16);
      SHOP_POINTS.cooks.forEach((p, i) => {
        const w = shopToWorld(slot, p.x, p.z);
        const a = this.spawnAgent('cook', w.x, w.z, shopFacing(slot, false), this.makeLooks('cook'));
        a.shopId = slot.shopId;
        a.phase = i * 1.7;
      });
      const w = shopToWorld(slot, SHOP_POINTS.assistant.x, SHOP_POINTS.assistant.z);
      const asst = this.spawnAgent('assistant', w.x, w.z, shopFacing(slot, true), this.makeLooks('assistant', color));
      asst.shopId = slot.shopId;
    }
    for (let i = 0; i < 3; i++) {
      const b = STATIONS.runnerBase;
      this.spawnAgent('runner', b.x + i * 0.7, b.z, Math.PI, this.makeLooks('runner'));
    }
    for (let i = 0; i < 2; i++) {
      const b = STATIONS.cleanerBase;
      const a = this.spawnAgent('cleaner', b.x + i * 0.9, b.z, Math.PI, this.makeLooks('cleaner'));
      a.carry = 'trolley';
    }
  }

  private spawnSupplier() {
    const slot = this.rng.pick(SHOP_SLOTS);
    const a = this.spawnAgent('supplier', SPAWN.x + 1.2, SPAWN.z, Math.PI, this.makeLooks('supplier'));
    a.carry = 'cans';
    a.shopId = slot.shopId;
    const drop = shopToWorld(slot, SHOP_POINTS.supplierDrop.x, SHOP_POINTS.supplierDrop.z);
    if (this.walkTo(a, drop, shopFacing(slot, false))) a.state = 'toDrop';
    else a.alive = false;
  }

  private chooseShop(): string {
    return this.rng.weighted(SHOPS, (s) => {
      const k = this.kitchens.get(s.id)!;
      return s.popularity / (1 + k.queue.length * 0.45 + k.waiting.length * 0.15);
    }).id;
  }

  spawnGroup(): Group | null {
    const size = this.rng.weighted([1, 2, 4] as const, (n) => (n === 1 ? 0.4 : n === 2 ? 0.4 : 0.2));
    const id = this.nextGroup++;
    const mode = this.rng.chance(0.38) ? 'table' : 'counter';
    const group: Group = {
      id,
      members: [],
      leader: 0,
      mode,
      shopId: this.chooseShop(),
      tableId: null,
      seats: [],
      orderIds: [],
      phase: 'arriving',
      eatUntil: 0,
      waitedFor: 0,
      isYou: false,
    };
    for (let i = 0; i < size; i++) {
      const a = this.spawnAgent('diner', SPAWN.x + (i - (size - 1) / 2) * 0.55, SPAWN.z + this.rng.range(-0.2, 0.4), Math.PI, this.makeLooks('diner'));
      a.groupId = id;
      a.shopId = group.shopId;
      group.members.push(a.id);
    }
    group.leader = group.members[0]!;
    this.groups.set(id, group);
    const res = this.reserveTable(size, id);
    if (res) {
      group.tableId = res.tableId;
      group.seats = res.seats;
      this.startGroup(group);
    } else {
      group.phase = 'waitingTable';
      group.members.forEach((m, i) => {
        const a = this.byId.get(m)!;
        a.state = 'toWaitSpot';
        this.walkTo(a, { x: 4 + this.rng.range(-1.6, 1.6) + i * 0.3, z: 10.3 + this.rng.range(-0.25, 0.35) }, Math.PI);
      });
    }
    return group;
  }

  private startGroup(group: Group) {
    group.phase = group.mode === 'counter' ? 'ordering' : 'waiting';
    for (const m of group.members) {
      const a = this.byId.get(m)!;
      if (group.mode === 'counter' && m === group.leader) {
        const slot = SLOT_BY_SHOP[group.shopId]!;
        const p = shopToWorld(slot, SHOP_POINTS.menuRead.x + this.rng.range(-0.8, 0.8), SHOP_POINTS.menuRead.z + this.rng.range(-0.3, 0.3));
        a.state = 'toMenu';
        this.walkTo(a, p, shopFacing(slot, false));
      } else {
        this.sendToSeat(a);
      }
    }
  }

  // ─── Tables ──────────────────────────────────────────────────────────────

  /** Atomically claims a whole free table for a group; never splits or double-books. */
  reserveTable(size: number, groupId: number, preferId?: string): { tableId: string; seats: number[] } | null {
    const fits = (t: TableState) => t.status === 'free' && t.seats.length >= size;
    let chosen: TableState | undefined;
    if (preferId) {
      const t = this.tableById.get(preferId);
      if (t && fits(t)) chosen = t;
      else return null;
    } else {
      const kindRank = (def: TableDef) => {
        if (size <= 2) return def.kind === 'high' ? 0 : def.kind === 'four' ? 1 : 2;
        return def.kind === 'four' ? 0 : def.kind === 'bench' ? 1 : 3;
      };
      const free = this.tables.filter(fits);
      if (free.length === 0) return null;
      free.sort((a, b) => {
        const da = TABLE_BY_ID[a.id]!;
        const db = TABLE_BY_ID[b.id]!;
        return da.seats.length - size - (db.seats.length - size) || kindRank(da) - kindRank(db);
      });
      const best = free.filter((t) => TABLE_BY_ID[t.id]!.seats.length === TABLE_BY_ID[free[0]!.id]!.seats.length);
      chosen = this.rng.pick(best.length > 0 ? best : free);
    }
    const def = TABLE_BY_ID[chosen.id]!;
    chosen.status = 'reserved';
    chosen.groupId = groupId;
    chosen.orderIds = [];
    return { tableId: chosen.id, seats: seatPlan(def, size) };
  }

  private seatPoint(tableId: string, seat: number) {
    return TABLE_BY_ID[tableId]!.seats[seat]!;
  }

  /** A standing spot just behind a diner's chair, for runners and cleaners. */
  private servePoint(tableId: string, seat: number): Vec2 {
    const def = TABLE_BY_ID[tableId]!;
    const s = def.seats[seat]!;
    const dx = s.x - def.x;
    const dz = s.z - def.z;
    const d = Math.hypot(dx, dz) || 1;
    const p = { x: s.x + (dx / d) * 0.42, z: s.z + (dz / d) * 0.42 };
    if (this.grid.walkable(p.x, p.z)) return p;
    return this.grid.center(this.grid.nearestWalkable(p.x, p.z));
  }

  private sendToSeat(a: Agent) {
    const g = this.groups.get(a.groupId)!;
    const idx = g.members.indexOf(a.id);
    const seat = g.seats[idx]!;
    a.seat = { tableId: g.tableId!, seat };
    const p = this.seatPoint(g.tableId!, seat);
    a.state = 'toSeat';
    this.walkTo(a, p, p.heading);
  }

  private sitDown(a: Agent) {
    const p = this.seatPoint(a.seat!.tableId, a.seat!.seat);
    a.x = p.x;
    a.z = p.z;
    a.heading = p.heading;
    a.seatY = p.height;
    const t = this.tableById.get(a.seat!.tableId)!;
    t.seats[a.seat!.seat] = a.id;
    if (t.status === 'reserved') t.status = 'occupied';
  }

  private standUp(a: Agent) {
    if (a.seat) {
      const t = this.tableById.get(a.seat.tableId)!;
      if (t.seats[a.seat.seat] === a.id) t.seats[a.seat.seat] = null;
    }
    a.seatY = 0;
  }

  // ─── Orders ──────────────────────────────────────────────────────────────

  private setStatus(order: SimOrder, to: SubOrderStatus): boolean {
    if (!canTransitionSubOrder(order.status, to)) return false;
    order.status = to;
    const now = this.clockMinutes();
    if (to === 'ACCEPTED') order.at.accepted = now;
    if (to === 'PREPARING') order.at.cooking = now;
    if (to === 'READY') order.at.ready = now;
    if (to === 'COLLECTED') order.at.served = now;
    return true;
  }

  private createOrder(group: Group, shopId: string, lines: OrderLine[], mode: 'counter' | 'table'): SimOrder {
    const shop = SHOP_BY_ID[shopId]!;
    const k = this.kitchens.get(shopId)!;
    k.tokenSeq = (k.tokenSeq % 999) + 1;
    const subtotalPaise = lines.reduce((n, l) => n + l.pricePaise * l.qty, 0);
    const order: SimOrder = {
      id: this.nextOrder++,
      token: `${shop.code}-${String(k.tokenSeq).padStart(3, '0')}`,
      shopId,
      lines,
      subtotalPaise,
      status: 'NEW',
      mode,
      tableId: group.tableId,
      groupId: group.id,
      isYou: group.isYou,
      at: { placed: this.clockMinutes() },
      placedT: this.time,
      cookLeft: 0,
      runner: null,
    };
    this.orders.set(order.id, order);
    group.orderIds.push(order.id);
    if (group.tableId) this.tableById.get(group.tableId)!.orderIds.push(order.id);
    k.incoming.push(order.id);
    k.revenuePaise += subtotalPaise;
    this.revenuePaise += subtotalPaise;
    this.hourly[Math.floor(this.clockMinutes() / 60)]! += 1;
    return order;
  }

  private pickLines(shopId: string, count: number): OrderLine[] {
    const shop = SHOP_BY_ID[shopId]!;
    const k = this.kitchens.get(shopId)!;
    const menu = shop.menu.filter((m) => !k.soldOut.has(m.id));
    const lines = new Map<string, OrderLine>();
    for (let i = 0; i < count; i++) {
      const m: MenuItem = this.rng.pick(menu.length > 0 ? menu : shop.menu);
      const line = lines.get(m.id);
      if (line) line.qty++;
      else lines.set(m.id, { itemId: m.id, name: m.name, qty: 1, pricePaise: m.pricePaise, prepMin: m.prepMin });
    }
    return [...lines.values()];
  }

  /** Kitchen time follows the menu's prep minutes on the court clock. */
  private cookSeconds(order: SimOrder): number {
    const longest = Math.max(...order.lines.map((l) => l.prepMin));
    const qty = order.lines.reduce((n, l) => n + l.qty, 0);
    return ((longest + 0.6 * (qty - 1)) * 60) / CLOCK_SCALE;
  }

  private updateKitchens() {
    for (const k of this.kitchens.values()) {
      while (k.incoming.length > 0) {
        const order = this.orders.get(k.incoming[0]!)!;
        if (this.time - order.placedT < 2.5) break;
        k.incoming.shift();
        if (this.setStatus(order, 'ACCEPTED')) k.waiting.push(order.id);
      }
      while (k.cooking.length < KITCHEN_CAPACITY && k.waiting.length > 0) {
        const order = this.orders.get(k.waiting.shift()!)!;
        if (this.setStatus(order, 'PREPARING')) {
          order.cookLeft = this.cookSeconds(order);
          k.cooking.push(order.id);
        }
      }
      for (let i = k.cooking.length - 1; i >= 0; i--) {
        const order = this.orders.get(k.cooking[i]!)!;
        order.cookLeft -= DT;
        if (order.cookLeft <= 0 && this.setStatus(order, 'READY')) {
          k.cooking.splice(i, 1);
          k.ready.push(order.id);
          if (order.mode === 'table') this.runnerQueue.push(order.id);
        }
      }
    }
  }

  private serve(order: SimOrder) {
    if (!this.setStatus(order, 'COLLECTED')) return;
    const k = this.kitchens.get(order.shopId)!;
    k.ready = k.ready.filter((id) => id !== order.id);
    k.servedToday++;
  }

  private updateSoldOut() {
    this.soldOutIn -= DT;
    for (const [itemId, until] of this.soldOutUntil) {
      if (this.time > until) {
        this.soldOutUntil.delete(itemId);
        for (const k of this.kitchens.values()) k.soldOut.delete(itemId);
      }
    }
    if (this.soldOutIn > 0) return;
    this.soldOutIn = this.rng.range(110, 200);
    const shop = this.rng.pick(SHOPS);
    const item = this.rng.pick(shop.menu);
    this.kitchens.get(shop.id)!.soldOut.add(item.id);
    this.soldOutUntil.set(item.id, this.time + this.rng.range(60, 120));
  }

  setSoldOut(shopId: string, itemId: string, soldOut: boolean) {
    const k = this.kitchens.get(shopId);
    if (!k) return;
    if (soldOut) k.soldOut.add(itemId);
    else {
      k.soldOut.delete(itemId);
      this.soldOutUntil.delete(itemId);
    }
  }

  /** The visitor's own order from the landing page demo: dine-in at a table, one sub-order per shop. */
  placeYouOrder(cart: CartLine[], tableId?: string): PlaceResult {
    if (this.youGroup !== null && this.groups.has(this.youGroup)) return { ok: false, reason: 'Your last order is still on its way.' };
    const byShop = new Map<string, OrderLine[]>();
    for (const line of cart) {
      const shop = SHOP_BY_ID[line.shopId];
      const item = shop?.menu.find((m) => m.id === line.itemId);
      if (!shop || !item || line.qty < 1) return { ok: false, reason: 'That dish is no longer on the menu.' };
      if (this.kitchens.get(shop.id)!.soldOut.has(item.id)) return { ok: false, reason: `${item.name} just sold out.` };
      const lines = byShop.get(shop.id) ?? [];
      lines.push({ itemId: item.id, name: item.name, qty: Math.min(10, Math.floor(line.qty)), pricePaise: item.pricePaise, prepMin: item.prepMin });
      byShop.set(shop.id, lines);
    }
    if (byShop.size === 0) return { ok: false, reason: 'Add a dish first.' };

    const id = this.nextGroup++;
    const res = this.reserveTable(1, id, tableId) ?? (tableId ? null : this.reserveTable(1, id));
    if (!res) return { ok: false, reason: tableId ? `${tableId} is taken right now. Pick another table.` : 'Every table is taken right now. Try again in a minute.' };

    const firstShop = byShop.keys().next().value as string;
    const group: Group = {
      id,
      members: [],
      leader: 0,
      mode: 'table',
      shopId: firstShop,
      tableId: res.tableId,
      seats: res.seats,
      orderIds: [],
      phase: 'waiting',
      eatUntil: 0,
      waitedFor: 0,
      isYou: true,
    };
    const a = this.spawnAgent('you', SPAWN.x, SPAWN.z - 0.3, Math.PI, this.makeLooks('you'));
    a.groupId = id;
    a.maxSpeed = WALK_SPEED * 1.05;
    group.members.push(a.id);
    group.leader = a.id;
    this.groups.set(id, group);
    this.youGroup = id;
    for (const [shopId, lines] of byShop) this.createOrder(group, shopId, lines, 'table');
    this.sendToSeat(a);
    return { ok: true, groupId: id, agentId: a.id, tableId: res.tableId, orderIds: [...group.orderIds] };
  }

  youGroupId(): number | null {
    return this.youGroup !== null && this.groups.has(this.youGroup) ? this.youGroup : null;
  }

  // ─── Groups ──────────────────────────────────────────────────────────────

  private updateGroups() {
    for (const g of this.groups.values()) {
      const members = g.members.map((m) => this.byId.get(m)).filter((a): a is Agent => a !== undefined && a.alive);
      if (members.length === 0) {
        this.groups.delete(g.id);
        continue;
      }
      if (g.phase === 'waitingTable') {
        g.waitedFor += DT;
        if (Math.round(g.waitedFor / DT) % 45 === 0) {
          const res = this.reserveTable(g.members.length, g.id);
          if (res) {
            g.tableId = res.tableId;
            g.seats = res.seats;
            this.startGroup(g);
          } else if (g.waitedFor > 40) {
            g.phase = 'leaving';
            for (const a of members) this.leave(a);
          }
        }
        continue;
      }
      if (g.phase === 'waiting' && g.orderIds.length > 0) {
        const served = g.orderIds.every((id) => this.orders.get(id)!.status === 'COLLECTED');
        const seated = members.every((a) => a.state === 'seated');
        if (served && seated) {
          g.phase = 'eating';
          g.eatUntil = this.time + this.rng.range(24, 44) + (g.isYou ? 10 : 0);
          for (const a of members) {
            a.state = 'eat';
            a.timer = 0;
          }
        }
      }
      if (g.phase === 'eating' && this.time > g.eatUntil) {
        g.phase = 'leaving';
        const table = this.tableById.get(g.tableId!)!;
        for (const a of members) {
          this.standUp(a);
          if (g.mode === 'counter' && a.id === g.leader) {
            a.carry = 'tray';
            table.trays = Math.max(0, table.trays - 1);
            a.state = 'toTrayReturn';
            this.walkTo(a, STATIONS.trayDrop, 0);
          } else {
            this.leave(a);
          }
        }
        table.status = 'dirty';
        table.groupId = null;
      }
    }
  }

  private leave(a: Agent) {
    this.standUp(a);
    a.seat = null;
    a.state = 'toExit';
    if (!this.walkTo(a, { x: SPAWN.x + this.rng.range(-1, 1), z: SPAWN.z + 0.4 }, null)) a.alive = false;
  }

  // ─── Diners ──────────────────────────────────────────────────────────────

  private updateDiner(a: Agent) {
    const g = this.groups.get(a.groupId);
    a.timer += DT;
    const arrived = this.arrived(a);
    switch (a.state) {
      case 'toWaitSpot':
        a.anim = arrived ? 'phone' : 'walk';
        break;
      case 'toMenu':
        if (arrived) {
          a.state = 'readMenu';
          a.timer = 0;
        }
        break;
      case 'readMenu': {
        a.anim = 'idle';
        if (a.timer < 2.6) break;
        const k = this.kitchens.get(g!.shopId)!;
        if (k.queue.length >= QUEUE_SLOTS) {
          if (a.timer > 9) {
            g!.shopId = this.chooseShop();
            a.shopId = g!.shopId;
            a.state = 'toMenu';
            const slot = SLOT_BY_SHOP[g!.shopId]!;
            this.walkTo(a, shopToWorld(slot, SHOP_POINTS.menuRead.x, SHOP_POINTS.menuRead.z), shopFacing(slot, false));
          }
          break;
        }
        k.queue.push(a.id);
        a.task = -1;
        a.state = 'queue';
        break;
      }
      case 'queue': {
        const k = this.kitchens.get(g!.shopId)!;
        const index = k.queue.indexOf(a.id);
        const slot = SLOT_BY_SHOP[g!.shopId]!;
        if (index !== a.task) {
          a.task = index;
          const p = shopToWorld(slot, SHOP_POINTS.queueSlot(index).x, SHOP_POINTS.queueSlot(index).z);
          this.walkTo(a, p, shopFacing(slot, false));
        }
        if (this.arrived(a)) {
          a.anim = index > 1 && Math.floor((this.time + a.id) / 7) % 3 === 0 ? 'phone' : 'idle';
          if (index === 0) {
            a.state = 'ordering';
            a.timer = 0;
            a.anim = 'idle';
          }
        }
        break;
      }
      case 'ordering':
        a.anim = 'idle';
        if (a.timer > 3.4) {
          const lines = this.pickLines(g!.shopId, Math.max(1, Math.round(g!.members.length * this.rng.range(0.8, 1.3))));
          this.createOrder(g!, g!.shopId, lines, 'counter');
          a.state = 'paying';
          a.timer = 0;
        }
        break;
      case 'paying':
        a.anim = 'phone';
        if (a.timer > 1.5) {
          const k = this.kitchens.get(g!.shopId)!;
          k.queue = k.queue.filter((id) => id !== a.id);
          a.task = null;
          this.sendToSeat(a);
        }
        break;
      case 'toSeat':
        a.anim = a.carry === 'tray' ? 'carry' : 'walk';
        if (arrived) {
          this.sitDown(a);
          if (a.carry === 'tray') {
            a.carry = 'none';
            const t = this.tableById.get(a.seat!.tableId)!;
            t.trays += Math.max(1, Math.ceil(g!.members.length / 2));
          }
          if (g!.mode === 'table' && a.id === g!.leader && g!.orderIds.length === 0) {
            a.state = 'qrOrder';
          } else {
            a.state = 'seated';
          }
          a.timer = 0;
        }
        break;
      case 'qrOrder':
        a.anim = 'sitPhone';
        if (a.timer > 3) {
          const shops = g!.members.length > 1 && this.rng.chance(0.55) ? [g!.shopId, this.chooseShop()] : [g!.shopId];
          for (const shopId of new Set(shops)) {
            this.createOrder(g!, shopId, this.pickLines(shopId, Math.max(1, Math.round(g!.members.length * this.rng.range(0.6, 1)))), 'table');
          }
          a.state = 'seated';
          a.timer = 0;
        }
        break;
      case 'seated': {
        if (a.timer > 4 && this.rng.chance(0.01)) {
          a.anim = a.anim === 'sitPhone' ? 'sit' : 'sitPhone';
        } else if (a.anim !== 'sit' && a.anim !== 'sitPhone') a.anim = 'sitPhone';
        if (g && g.mode === 'counter' && a.id === g.leader) {
          const order = this.orders.get(g.orderIds[0]!);
          if (order && order.status === 'READY') {
            this.standUp(a);
            const slot = SLOT_BY_SHOP[order.shopId]!;
            const p = shopToWorld(slot, SHOP_POINTS.pickup.x + this.rng.range(-0.25, 0.25), SHOP_POINTS.pickup.z);
            a.state = 'toPickup';
            a.task = order.id;
            this.walkTo(a, p, shopFacing(slot, false));
          }
        }
        break;
      }
      case 'toPickup':
        a.anim = 'walk';
        if (arrived) {
          a.state = 'collect';
          a.timer = 0;
        }
        break;
      case 'collect':
        a.anim = 'idle';
        if (a.timer > 1.2) {
          const order = this.orders.get(a.task!);
          if (order) this.serve(order);
          a.carry = 'tray';
          a.task = null;
          this.sendToSeat(a);
        }
        break;
      case 'eat':
        // Mostly eating, with the odd pause to talk or check the phone.
        a.anim = Math.floor((a.timer + a.id * 1.3) / 5) % 5 === 4 ? (a.id % 2 ? 'sitPhone' : 'sit') : 'eat';
        break;
      case 'toTrayReturn':
        a.anim = 'carry';
        if (arrived) {
          a.state = 'dropTray';
          a.timer = 0;
        }
        break;
      case 'dropTray':
        a.anim = 'handover';
        if (a.timer > 1) {
          a.carry = 'none';
          this.leave(a);
        }
        break;
      case 'toExit':
        a.anim = 'walk';
        if (arrived) a.alive = false;
        break;
    }
    if (!this.arrived(a) && a.seatY === 0) a.anim = a.carry === 'tray' ? 'carry' : 'walk';
  }

  // ─── Staff ───────────────────────────────────────────────────────────────

  private updateCook(a: Agent) {
    const k = this.kitchens.get(a.shopId!)!;
    const busy = k.cooking.length > 0 || k.waiting.length > 0;
    a.timer += DT;
    if (a.timer > 3.5) {
      a.timer = 0;
      const eq = SHOP_BY_ID[a.shopId!]!.equipment;
      const work: AnimKind[] =
        eq === 'dosa' || eq === 'burger' ? ['flip', 'cook', 'stir'] : eq === 'juice' || eq === 'pizza' ? ['cook', 'handover', 'cook'] : ['stir', 'cook', 'stir'];
      a.anim = busy ? this.rng.pick(work) : this.rng.pick(['idle', 'wipe', 'idle'] as AnimKind[]);
    }
  }

  private updateAssistant(a: Agent) {
    const k = this.kitchens.get(a.shopId!)!;
    const front = k.queue[0] !== undefined ? this.byId.get(k.queue[0]) : undefined;
    const handing = front?.state === 'ordering' || this.agents.some((d) => d.alive && d.state === 'collect' && d.task !== null && this.orders.get(d.task)?.shopId === a.shopId);
    a.anim = handing ? 'handover' : 'idle';
  }

  private updateRunner(a: Agent) {
    a.timer += DT;
    const arrived = this.arrived(a);
    switch (a.state) {
      case 'idle': {
        a.anim = 'idle';
        const next = this.runnerQueue.shift();
        if (next === undefined) break;
        const order = this.orders.get(next)!;
        order.runner = a.id;
        a.task = next;
        const slot = SLOT_BY_SHOP[order.shopId]!;
        a.state = 'toPickup';
        this.walkTo(a, shopToWorld(slot, SHOP_POINTS.pickup.x + 0.45, SHOP_POINTS.pickup.z), shopFacing(slot, false));
        break;
      }
      case 'toPickup':
        if (arrived) {
          a.state = 'grab';
          a.timer = 0;
        }
        break;
      case 'grab':
        a.anim = 'idle';
        if (a.timer > 0.8) {
          const order = this.orders.get(a.task!)!;
          a.carry = 'tray';
          const g = this.groups.get(order.groupId);
          const seat = g?.seats[0] ?? 0;
          a.state = 'toTable';
          if (!order.tableId || !this.walkTo(a, this.servePoint(order.tableId, seat), null)) a.state = 'serve';
        }
        break;
      case 'toTable':
        if (arrived) {
          const order = this.orders.get(a.task!)!;
          const def = TABLE_BY_ID[order.tableId!]!;
          a.heading = Math.atan2(def.x - a.x, def.z - a.z);
          a.state = 'serve';
          a.timer = 0;
        }
        break;
      case 'serve':
        a.anim = 'handover';
        if (a.timer > 1.1) {
          const order = this.orders.get(a.task!)!;
          this.serve(order);
          if (order.tableId) this.tableById.get(order.tableId)!.trays += 1;
          a.carry = 'none';
          a.task = null;
          a.state = 'toBase';
          this.walkTo(a, a.home, a.homeHeading);
        }
        break;
      case 'toBase':
        if (arrived) a.state = 'idle';
        break;
    }
    if (!arrived) a.anim = a.carry === 'tray' ? 'carry' : 'walk';
  }

  private updateCleaner(a: Agent) {
    a.timer += DT;
    const arrived = this.arrived(a);
    switch (a.state) {
      case 'idle': {
        a.anim = 'idle';
        const dirty = this.tables.find((t) => t.status === 'dirty' && t.cleaner === null);
        if (!dirty) break;
        dirty.status = 'cleaning';
        dirty.cleaner = a.id;
        a.task = this.tables.indexOf(dirty);
        a.state = 'toTable';
        if (!this.walkTo(a, this.servePoint(dirty.id, 0), null)) a.state = 'wipe';
        break;
      }
      case 'toTable':
        if (arrived) {
          const def = TABLES[a.task!]!;
          a.heading = Math.atan2(def.x - a.x, def.z - a.z);
          a.state = 'wipe';
          a.timer = 0;
        }
        break;
      case 'wipe':
        a.anim = 'wipe';
        if (a.timer > 4.5) {
          const t = this.tables[a.task!]!;
          for (const id of t.orderIds) {
            const o = this.orders.get(id);
            if (o) o.at.cleared = this.clockMinutes();
          }
          Object.assign(t, { status: 'free', groupId: null, trays: 0, cleaner: null, orderIds: [] });
          t.seats.fill(null);
          this.tablesCleaned++;
          a.task = null;
          a.state = 'toBase';
          this.walkTo(a, a.home, a.homeHeading);
        }
        break;
      case 'toBase':
        if (arrived) a.state = 'idle';
        break;
    }
    if (!arrived) a.anim = 'push';
  }

  private updateSupplier(a: Agent) {
    a.timer += DT;
    const arrived = this.arrived(a);
    if (a.state === 'toDrop' && arrived) {
      a.state = 'unload';
      a.timer = 0;
    } else if (a.state === 'unload') {
      a.anim = 'handover';
      if (a.timer > 3) {
        a.carry = 'trolley';
        a.state = 'toExit';
        this.walkTo(a, { x: SPAWN.x + 1.5, z: SPAWN.z + 0.5 }, null);
      }
    } else if (a.state === 'toExit' && arrived) {
      a.alive = false;
    }
    if (!arrived) a.anim = 'push';
  }

  // ─── Movement ────────────────────────────────────────────────────────────

  private walkTo(a: Agent, target: Vec2, face: number | null): boolean {
    const path = this.grid.findPath({ x: a.x, z: a.z }, target);
    a.faceOnArrive = face;
    a.blockedFor = 0;
    if (!path) {
      a.path = [];
      a.pathIdx = 0;
      return false;
    }
    a.path = path;
    a.pathIdx = 0;
    return true;
  }

  private arrived(a: Agent): boolean {
    return a.pathIdx >= a.path.length;
  }

  private fillBuckets() {
    for (const b of this.buckets) b.length = 0;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i]!;
      if (!a.alive || a.seatY > 0) continue;
      const bi = bucketOf(a.x, a.z);
      if (bi >= 0) this.buckets[bi]!.push(i);
    }
  }

  private move(a: Agent) {
    if (this.arrived(a)) {
      a.speed = 0;
      if (a.faceOnArrive !== null && a.seatY === 0) a.heading = turnToward(a.heading, a.faceOnArrive, 7 * DT);
      return;
    }
    const wp = a.path[a.pathIdx]!;
    const dx = wp.x - a.x;
    const dz = wp.z - a.z;
    const d = Math.hypot(dx, dz);
    const last = a.pathIdx === a.path.length - 1;
    if (d < (last ? 0.06 : 0.2)) {
      a.pathIdx++;
      if (last) {
        a.x = wp.x;
        a.z = wp.z;
      }
      return;
    }
    const dirX = dx / d;
    const dirZ = dz / d;
    const carrying = a.carry === 'tray' || a.carry === 'trolley' || a.carry === 'cans';
    const cruise = a.maxSpeed * (carrying ? 0.85 : 1) * (last ? Math.min(1, d / 0.7 + 0.25) : 1);

    let slow = 1;
    let pushX = 0;
    let pushZ = 0;
    const bc = Math.floor((a.x + 19) / BUCKET);
    const br = Math.floor((a.z + 13) / BUCKET);
    for (let r = br - 1; r <= br + 1; r++) {
      if (r < 0 || r >= BUCKET_ROWS) continue;
      for (let c = bc - 1; c <= bc + 1; c++) {
        if (c < 0 || c >= BUCKET_COLS) continue;
        for (const i of this.buckets[r * BUCKET_COLS + c]!) {
          const b = this.agents[i]!;
          if (b === a) continue;
          const rx = b.x - a.x;
          const rz = b.z - a.z;
          const dd = Math.hypot(rx, rz);
          if (dd > 1 || dd < 1e-4) continue;
          const ahead = (rx * dirX + rz * dirZ) / dd;
          const lateral = Math.abs(rx * dirZ - rz * dirX);
          if (ahead > 0.5 && dd < 0.75 && lateral < 0.42) slow = Math.min(slow, clamp((dd - 0.36) / 0.34, 0, 1));
          if (dd < 0.48) {
            const push = (0.48 - dd) / 0.48;
            pushX -= (rx / dd) * push;
            pushZ -= (rz / dd) * push;
          }
        }
      }
    }
    a.blockedFor = slow < 0.3 ? a.blockedFor + DT : Math.max(0, a.blockedFor - DT * 2);
    let sideX = 0;
    let sideZ = 0;
    if (a.blockedFor > 0.5) {
      // Step around whoever is in the way; everyone sidesteps the same way so head-on pairs pass.
      sideX = dirZ * 0.7;
      sideZ = -dirX * 0.7;
      slow = Math.max(slow, 0.5);
      if (a.blockedFor > 4) {
        const goal = a.path[a.path.length - 1]!;
        this.walkTo(a, goal, a.faceOnArrive);
        return;
      }
    }
    a.speed += (cruise * slow - a.speed) * Math.min(1, DT * 7);
    const vx = dirX * a.speed + (sideX + pushX * 0.6) * Math.max(a.speed, 0.4);
    const vz = dirZ * a.speed + (sideZ + pushZ * 0.6) * Math.max(a.speed, 0.4);
    let nx = a.x + vx * DT;
    let nz = a.z + vz * DT;
    // The last few centimetres onto a chair or counter spot may cross a soft edge cell.
    const finishing = last && d < 0.45;
    if (!finishing && !this.grid.walkable(nx, nz)) {
      nx = a.x + dirX * a.speed * DT;
      nz = a.z + dirZ * a.speed * DT;
      if (!this.grid.walkable(nx, nz)) return;
    }
    const moved = Math.hypot(nx - a.x, nz - a.z);
    a.x = nx;
    a.z = nz;
    if (moved > 1e-4) a.heading = turnToward(a.heading, Math.atan2(vx, vz), 8 * DT);
    a.phase += (moved / STEP_LENGTH) * Math.PI;
  }

  private compact() {
    // Finished orders older than two court hours are no longer needed for stats or screens.
    const cutoff = this.clockMinutes() - 120;
    for (const [id, o] of this.orders) {
      if (o.status === 'COLLECTED' && o.at.placed < cutoff && !this.groups.has(o.groupId)) this.orders.delete(id);
    }
    if (this.agents.every((a) => a.alive)) return;
    this.agents = this.agents.filter((a) => {
      if (!a.alive) this.byId.delete(a.id);
      return a.alive;
    });
  }
}

function seatPlan(def: TableDef, size: number): number[] {
  if (def.kind === 'four') return size === 1 ? [0] : size === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, size);
  if (def.kind === 'bench') return size === 1 ? [1] : size === 2 ? [1, 4] : [0, 2, 3, 5, 1, 4].slice(0, size);
  return [0, 1].slice(0, size);
}

function bucketOf(x: number, z: number): number {
  const c = Math.floor((x + 19) / BUCKET);
  const r = Math.floor((z + 13) / BUCKET);
  if (c < 0 || r < 0 || c >= BUCKET_COLS || r >= BUCKET_ROWS) return -1;
  return r * BUCKET_COLS + c;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function turnToward(from: number, to: number, maxStep: number): number {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + clamp(delta, -maxStep, maxStep);
}
