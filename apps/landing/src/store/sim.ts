import { SHOPS, SHOP_BY_ID } from '../data/shops';
import { TABLES, TABLE_BY_ID } from '../data/layout';
import { Sim, type Selection } from '../sim/engine';
import type { Agent, SimOrder, TableStatus } from '../sim/types';
import type { SubOrderStatus } from '@foodcourt/shared';

let sim: Sim | null = null;

/** One live court per page; the scene reads it every frame, the DOM through snapshots. */
export function getSim(): Sim {
  // Warm-up runs in slices inside the render loop (see World.tsx) so it never freezes the page.
  if (!sim) sim = new Sim({ warmup: 0 });
  return sim;
}

export const STATUS_LABEL: Record<SubOrderStatus, string> = {
  NEW: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Cooking',
  READY: 'Ready',
  COLLECTED: 'Served',
  REJECTED: 'Rejected',
  TIMED_OUT: 'Missed',
  CANCELLED: 'Cancelled',
};

export interface ShopStat {
  id: string;
  name: string;
  code: string;
  color: string;
  queue: number;
  cooking: number;
  ready: string[];
  preparing: string[];
  servedToday: number;
  revenuePaise: number;
  etaMin: number;
  soldOut: string[];
  rush: boolean;
}

export interface TrackStep {
  label: string;
  at: number | null;
}

export interface YouOrder {
  token: string;
  shopName: string;
  color: string;
  status: SubOrderStatus;
  label: string;
  steps: TrackStep[];
  totalPaise: number;
  lines: string[];
  etaMin: number | null;
}

export interface Detail {
  kicker: string;
  title: string;
  color?: string;
  stats: Array<{ label: string; value: string }>;
  lines: string[];
}

export interface Alert {
  id: string;
  tone: 'warn' | 'danger' | 'info';
  text: string;
  target: Selection;
}

export interface Snapshot {
  clockMinutes: number;
  ordersThisHour: number;
  avgWaitMin: number | null;
  tablesOccupied: number;
  tablesTotal: number;
  diners: number;
  revenuePaise: number;
  shops: ShopStat[];
  tableStatus: Record<string, TableStatus>;
  hourly: number[];
  alerts: Alert[];
  recent: Array<{ token: string; shop: string; color: string; status: string; table: string; totalPaise: number }>;
  you: { agentId: number; tableId: string; orders: YouOrder[]; phase: string } | null;
  detail: Detail | null;
}

const clockOf = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  const mm = Math.floor(m % 60);
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
export const formatClock = clockOf;

function shopEta(s: Sim, shopId: string): number {
  const k = s.kitchens.get(shopId)!;
  const avgPrep = SHOP_BY_ID[shopId]!.menu.reduce((n, m) => n + m.prepMin, 0) / SHOP_BY_ID[shopId]!.menu.length;
  return Math.round(avgPrep + ((k.waiting.length + k.incoming.length + k.queue.length * 0.6) / 3) * avgPrep * 0.8);
}

function trackSteps(o: SimOrder): TrackStep[] {
  return [
    { label: 'Placed', at: o.at.placed },
    { label: 'Accepted', at: o.at.accepted ?? null },
    { label: 'Cooking', at: o.at.cooking ?? null },
    { label: 'Ready', at: o.at.ready ?? null },
    { label: 'Served', at: o.at.served ?? null },
    { label: 'Cleared', at: o.at.cleared ?? null },
  ];
}

const ROLE_LABEL: Record<Agent['role'], string> = {
  diner: 'Diner',
  you: 'You',
  cook: 'Cook',
  assistant: 'Counter staff',
  runner: 'Runner',
  cleaner: 'Housekeeping',
  supplier: 'Supplier',
};

function describeAgent(s: Sim, a: Agent): Detail {
  const g = s.groups.get(a.groupId);
  const order = g?.orderIds.map((id) => s.orders.get(id)).find(Boolean);
  const shop = a.shopId ? SHOP_BY_ID[a.shopId] : g ? SHOP_BY_ID[g.shopId] : undefined;
  const table = a.seat?.tableId ?? g?.tableId ?? null;
  const k = shop ? s.kitchens.get(shop.id) : undefined;
  const doing: Record<string, string> = {
    toWaitSpot: 'Waiting for a free table',
    toMenu: `Walking to ${shop?.name}`,
    readMenu: `Reading the menu at ${shop?.name}`,
    queue: `In line at ${shop?.name}, number ${(k?.queue.indexOf(a.id) ?? 0) + 1}`,
    ordering: `Ordering at ${shop?.name}`,
    paying: 'Paying by UPI',
    toSeat: a.carry === 'tray' ? `Carrying the tray to ${table}` : `Heading to ${table}`,
    qrOrder: `Ordering from the QR on ${table}`,
    seated: order ? `Waiting for ${order.token}` : `Sitting at ${table}`,
    toPickup: order ? `Collecting ${order.token}` : 'Collecting the tray',
    collect: 'Picking up the tray',
    eat: `Eating at ${table}`,
    toTrayReturn: 'Returning the tray',
    dropTray: 'Dropping the tray',
    toExit: 'Heading out',
    idle: a.role === 'runner' ? 'Waiting for the next delivery' : a.role === 'cleaner' ? 'Waiting for a table to clean' : 'At the station',
    toTable: a.role === 'cleaner' ? 'Going to wipe a table' : 'Delivering to a table',
    grab: 'Picking up from the hand-off shelf',
    serve: 'Serving at the table',
    wipe: 'Wiping the table',
    toBase: 'Back to the station',
    toDrop: 'Bringing water cans and gas',
    unload: 'Unloading supplies',
  };
  const stats: Detail['stats'] = [];
  if (order) stats.push({ label: 'Token', value: order.token }, { label: 'Status', value: STATUS_LABEL[order.status] });
  if (table) stats.push({ label: 'Table', value: table });
  if (g && (a.role === 'diner' || a.role === 'you')) stats.push({ label: 'Party', value: String(g.members.length) });
  return {
    kicker: ROLE_LABEL[a.role] + (shop && a.role !== 'diner' && a.role !== 'you' ? ` · ${shop.name}` : ''),
    title: a.role === 'you' ? 'You' : doing[a.state] ?? 'Around the court',
    color: shop?.color,
    stats,
    lines: a.role === 'you' ? [doing[a.state] ?? ''] : [],
  };
}

function describe(s: Sim, sel: Selection, shops: ShopStat[]): Detail | null {
  if (sel.kind === 'person') {
    const a = s.agent(sel.id);
    return a && a.alive ? describeAgent(s, a) : null;
  }
  if (sel.kind === 'shop') {
    const st = shops.find((x) => x.id === sel.id)!;
    const shop = SHOP_BY_ID[sel.id]!;
    return {
      kicker: `Shop · tokens ${shop.code}`,
      title: shop.name,
      color: shop.color,
      stats: [
        { label: 'In line', value: String(st.queue) },
        { label: 'Cooking', value: String(st.cooking) },
        { label: 'Wait now', value: `${st.etaMin} min` },
        { label: 'Served today', value: String(st.servedToday) },
      ],
      lines: [
        st.ready.length ? `Ready: ${st.ready.join(', ')}` : 'Nothing waiting on the shelf',
        st.soldOut.length ? `Sold out: ${st.soldOut.join(', ')}` : shop.tagline,
      ],
    };
  }
  if (sel.kind === 'table') {
    const t = s.tableById.get(sel.id)!;
    const def = TABLE_BY_ID[sel.id]!;
    const seated = t.seats.filter((x) => x !== null).length;
    const tokens = t.orderIds.map((id) => s.orders.get(id)).filter((o): o is SimOrder => Boolean(o));
    const kind = def.kind === 'four' ? 'Four-seat table' : def.kind === 'bench' ? 'Six-seat bench' : 'Window bar, two stools';
    const label: Record<TableStatus, string> = { free: 'Free', reserved: 'Reserved', occupied: 'Occupied', dirty: 'Needs cleaning', cleaning: 'Being cleaned' };
    return {
      kicker: `${kind} · QR ${def.label}`,
      title: `Table ${def.label}`,
      stats: [
        { label: 'Status', value: label[t.status] },
        { label: 'Seated', value: `${seated}/${def.seats.length}` },
        { label: 'Trays', value: String(t.trays) },
      ],
      lines: tokens.length ? tokens.map((o) => `${o.token} · ${STATUS_LABEL[o.status]}`) : ['Scan the plate on this table to order from every shop.'],
    };
  }
  const stations: Record<string, Detail> = {
    tokenBoard: { kicker: 'Wall screen', title: 'Now serving', stats: [], lines: ['Every ready token in the court, shop by shop.', 'Diners also get a ping on their phone.'] },
    kiosks: { kicker: 'Self-order', title: 'Kiosks', stats: [], lines: ['For diners without a phone: same menu, same single payment.'] },
    trayReturn: { kicker: 'Support', title: 'Tray return', stats: [], lines: ['Counter-pickup diners drop trays here on the way out.'] },
    helpdesk: { kicker: 'Support', title: 'Helpdesk', stats: [], lines: ['Refunds, lost items and order questions.'] },
  };
  return stations[sel.id] ?? null;
}

export function takeSnapshot(s: Sim, selection: Selection | null): Snapshot {
  const now = s.clockMinutes();
  const shops: ShopStat[] = SHOPS.map((shop) => {
    const k = s.kitchens.get(shop.id)!;
    const tokens = (ids: number[]) => ids.map((id) => s.orders.get(id)?.token).filter((t): t is string => Boolean(t));
    return {
      id: shop.id,
      name: shop.name,
      code: shop.code,
      color: shop.color,
      queue: k.queue.length,
      cooking: k.cooking.length,
      ready: tokens(k.ready),
      preparing: tokens([...k.cooking, ...k.waiting]),
      servedToday: k.servedToday,
      revenuePaise: k.revenuePaise,
      etaMin: shopEta(s, shop.id),
      soldOut: shop.menu.filter((m) => k.soldOut.has(m.id)).map((m) => m.name),
      rush: k.queue.length >= 4,
    };
  });

  let ordersThisHour = 0;
  let waitSum = 0;
  let waitN = 0;
  const recentOrders: SimOrder[] = [];
  for (const o of s.orders.values()) {
    const age = (now - o.at.placed + 1440) % 1440;
    if (age <= 60) ordersThisHour++;
    if (o.at.served !== undefined && (now - o.at.served + 1440) % 1440 <= 45) {
      waitSum += (o.at.served - o.at.placed + 1440) % 1440;
      waitN++;
    }
    recentOrders.push(o);
  }
  recentOrders.sort((a, b) => b.id - a.id);

  const tableStatus: Record<string, TableStatus> = {};
  let tablesOccupied = 0;
  for (const t of s.tables) {
    tableStatus[t.id] = t.status;
    if (t.status === 'occupied' || t.status === 'reserved') tablesOccupied++;
  }

  const alerts: Alert[] = [];
  for (const t of s.tables) if (t.status === 'dirty') alerts.push({ id: `dirty-${t.id}`, tone: 'warn', text: `${t.id} needs cleaning`, target: { kind: 'table', id: t.id } });
  for (const st of shops) {
    if (st.queue >= 5) alerts.push({ id: `q-${st.id}`, tone: 'danger', text: `Long line at ${st.name} (${st.queue})`, target: { kind: 'shop', id: st.id } });
    for (const item of st.soldOut) alerts.push({ id: `so-${st.id}-${item}`, tone: 'info', text: `${item} sold out at ${st.name}`, target: { kind: 'shop', id: st.id } });
  }

  let you: Snapshot['you'] = null;
  const yg = s.youGroupId();
  if (yg !== null) {
    const g = s.groups.get(yg)!;
    const a = s.agent(g.leader);
    you = {
      agentId: g.leader,
      tableId: g.tableId!,
      phase: a ? a.state : 'gone',
      orders: g.orderIds
        .map((id) => s.orders.get(id))
        .filter((o): o is SimOrder => Boolean(o))
        .map((o) => {
          const shop = SHOP_BY_ID[o.shopId]!;
          const left = o.status === 'PREPARING' ? Math.max(1, Math.round((o.cookLeft * 20) / 60)) : o.status === 'NEW' || o.status === 'ACCEPTED' ? shopEta(s, o.shopId) : null;
          return {
            token: o.token,
            shopName: shop.name,
            color: shop.color,
            status: o.status,
            label: STATUS_LABEL[o.status],
            steps: trackSteps(o),
            totalPaise: o.subtotalPaise,
            lines: o.lines.map((l) => `${l.qty} × ${l.name}`),
            etaMin: o.status === 'READY' ? 1 : left,
          };
        }),
    };
  }

  return {
    clockMinutes: now,
    ordersThisHour,
    avgWaitMin: waitN ? waitSum / waitN : null,
    tablesOccupied,
    tablesTotal: TABLES.length,
    diners: s.dinerCount(),
    revenuePaise: s.revenuePaise,
    shops,
    tableStatus,
    hourly: [...s.hourly],
    alerts: alerts.slice(0, 6),
    recent: recentOrders.slice(0, 10).map((o) => ({
      token: o.token,
      shop: SHOP_BY_ID[o.shopId]!.name,
      color: SHOP_BY_ID[o.shopId]!.color,
      status: STATUS_LABEL[o.status],
      table: o.tableId ?? 'Pickup',
      totalPaise: o.subtotalPaise,
    })),
    you,
    detail: selection ? describe(s, selection, shops) : null,
  };
}
