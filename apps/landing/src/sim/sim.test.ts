import { describe, expect, it } from 'vitest';
import type { SubOrderStatus } from '@foodcourt/shared';
import { SHOP_POINTS, SHOP_SLOTS, SPAWN, STATIONS, TABLES, obstacles, shopToWorld } from '../data/layout';
import { SHOPS } from '../data/shops';
import { Sim } from './engine';
import { NavGrid } from './navgrid';

const RANK: Partial<Record<SubOrderStatus, number>> & Record<'NEW' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COLLECTED', number> = {
  NEW: 0,
  ACCEPTED: 1,
  PREPARING: 2,
  READY: 3,
  COLLECTED: 4,
};

describe('nav grid', () => {
  const grid = new NavGrid(obstacles());

  it('reaches every queue lane, pickup shelf, seat and the tray return from the door', () => {
    const targets = [
      ...SHOP_SLOTS.flatMap((slot) => [0, 5].map((i) => shopToWorld(slot, SHOP_POINTS.queueSlot(i).x, SHOP_POINTS.queueSlot(i).z))),
      ...SHOP_SLOTS.map((slot) => shopToWorld(slot, SHOP_POINTS.pickup.x, SHOP_POINTS.pickup.z)),
      ...TABLES.flatMap((t) => t.seats),
      STATIONS.trayDrop,
    ];
    for (const t of targets) {
      const path = grid.findPath(SPAWN, t);
      expect(path, `no path to ${t.x},${t.z}`).not.toBeNull();
      expect(path!.at(-1)).toEqual({ x: t.x, z: t.z });
    }
  });

  it('never routes through walls or counters', () => {
    const slot = SHOP_SLOTS[2]!;
    const path = grid.findPath(SPAWN, shopToWorld(slot, SHOP_POINTS.queueSlot(0).x, SHOP_POINTS.queueSlot(0).z))!;
    let from = SPAWN as { x: number; z: number };
    for (const wp of path) {
      const steps = Math.ceil(Math.hypot(wp.x - from.x, wp.z - from.z) / 0.1);
      for (let s = 0; s <= steps; s++) {
        const t = s / Math.max(1, steps);
        expect(grid.walkable(from.x + (wp.x - from.x) * t, from.z + (wp.z - from.z) * t)).toBe(true);
      }
      from = wp;
    }
  });

  it('keeps people out of kitchens except through the staff gate', () => {
    const slot = SHOP_SLOTS[0]!;
    const counter = shopToWorld(slot, 0, -0.4);
    expect(grid.walkable(counter.x, counter.z)).toBe(false);
  });
});

describe('seat reservation', () => {
  it('claims whole tables and never double-books', () => {
    const sim = new Sim({ seed: 3, warmup: 0 });
    sim.crowd = 'quiet';
    const taken = new Set<string>();
    let groupId = 10_000;
    for (;;) {
      const res = sim.reserveTable(2, groupId++);
      if (!res) break;
      expect(taken.has(res.tableId)).toBe(false);
      taken.add(res.tableId);
      expect(res.seats).toHaveLength(2);
      expect(new Set(res.seats).size).toBe(2);
    }
    expect(taken.size).toBe(sim.tables.filter((t) => t.seats.length >= 2).length);
    expect(sim.reserveTable(1, groupId)).toBeNull();
  });

  it('refuses a specific table that is already taken', () => {
    const sim = new Sim({ seed: 4, warmup: 0 });
    expect(sim.reserveTable(1, 1, 'T05')?.tableId).toBe('T05');
    expect(sim.reserveTable(1, 2, 'T05')).toBeNull();
  });
});

describe('simulation', () => {
  it('runs a lunch rush without shared seats, wall clipping or illegal status changes', () => {
    const sim = new Sim({ seed: 11, warmup: 0, startHour: 12.8 });
    sim.crowd = 'rush';
    const grid = sim.grid;
    const last = new Map<number, SubOrderStatus>();
    for (let i = 0; i < 30 * 240; i++) {
      sim.step();
      if (i % 15 !== 0) continue;
      const seatsInUse = new Map<string, number>();
      for (const a of sim.agents) {
        if (!a.alive) continue;
        expect(grid.walkable(a.x, a.z), `${a.role} ${a.state} at ${a.x.toFixed(2)},${a.z.toFixed(2)}`).toBe(true);
        if (a.seatY > 0 && a.seat) {
          const key = `${a.seat.tableId}:${a.seat.seat}`;
          expect(seatsInUse.has(key), `seat ${key} shared`).toBe(false);
          seatsInUse.set(key, a.id);
        }
      }
      for (const o of sim.orders.values()) {
        const prev = last.get(o.id);
        // Every single step goes through canTransitionSubOrder in the engine; between samples orders only move forward.
        if (prev) expect(RANK[o.status] ?? -1).toBeGreaterThanOrEqual(RANK[prev] ?? 99);
        last.set(o.id, o.status);
      }
    }
    const collected = [...sim.orders.values()].filter((o) => o.status === 'COLLECTED').length;
    expect(sim.dinerCount()).toBeGreaterThan(20);
    expect(collected).toBeGreaterThan(15);
    expect(sim.tablesCleaned).toBeGreaterThan(5);
    for (const o of sim.orders.values()) expect(Number.isInteger(o.subtotalPaise)).toBe(true);
  });

  it('splits a multi-shop cart into one token per shop and delivers both to the table', () => {
    const sim = new Sim({ seed: 21, warmup: 0, startHour: 15 });
    sim.crowd = 'quiet';
    const [a, b] = [SHOPS[0]!, SHOPS[3]!];
    const res = sim.placeYouOrder([
      { shopId: a.id, itemId: a.menu[0]!.id, qty: 2 },
      { shopId: b.id, itemId: b.menu[1]!.id, qty: 1 },
      { shopId: a.id, itemId: a.menu[2]!.id, qty: 1 },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const orders = res.orderIds.map((id) => sim.orders.get(id)!);
    expect(orders.map((o) => o.shopId).sort()).toEqual([a.id, b.id].sort());
    expect(orders.find((o) => o.shopId === a.id)!.subtotalPaise).toBe(a.menu[0]!.pricePaise * 2 + a.menu[2]!.pricePaise);
    expect(new Set(orders.map((o) => o.token)).size).toBe(2);
    expect(sim.placeYouOrder([{ shopId: a.id, itemId: a.menu[0]!.id, qty: 1 }]).ok).toBe(false);

    for (let i = 0; i < 30 * 180 && !orders.every((o) => o.status === 'COLLECTED'); i++) sim.step();
    expect(orders.every((o) => o.status === 'COLLECTED')).toBe(true);
    expect(orders.every((o) => o.tableId === res.tableId)).toBe(true);
  });
});
