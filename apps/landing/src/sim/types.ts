import type { SubOrderStatus } from '@foodcourt/shared';
import type { Vec2 } from '../data/layout';

export type AnimKind =
  | 'idle'
  | 'walk'
  | 'carry'
  | 'push'
  | 'sit'
  | 'eat'
  | 'phone'
  | 'sitPhone'
  | 'wave'
  | 'cook'
  | 'flip'
  | 'stir'
  | 'wipe'
  | 'handover';

export type Role = 'diner' | 'you' | 'cook' | 'assistant' | 'runner' | 'cleaner' | 'supplier';

export type HairStyle = 0 | 1 | 2 | 3 | 4; // short, long, bun, chef cap, bald

export interface Looks {
  height: number;
  build: number;
  skin: number;
  shirt: number;
  pants: number;
  shoes: number;
  hair: HairStyle;
  hairColor: number;
  backpack: boolean;
  backpackColor: number;
}

export type Carry = 'none' | 'tray' | 'trolley' | 'cans';

export interface Agent {
  id: number;
  alive: boolean;
  role: Role;
  x: number;
  z: number;
  /** Previous tick, for render interpolation. */
  px: number;
  pz: number;
  heading: number;
  pheading: number;
  /** Sitting height when seated, 0 when standing. */
  seatY: number;
  maxSpeed: number;
  speed: number;
  path: Vec2[];
  pathIdx: number;
  faceOnArrive: number | null;
  state: string;
  timer: number;
  blockedFor: number;
  anim: AnimKind;
  /** Animation phase in radians; walking advances with distance so the stride matches speed. */
  phase: number;
  looks: Looks;
  groupId: number;
  shopId: string | null;
  seat: { tableId: string; seat: number } | null;
  carry: Carry;
  task: number | null;
  home: Vec2;
  homeHeading: number;
}

export interface Group {
  id: number;
  members: number[];
  leader: number;
  mode: 'counter' | 'table';
  shopId: string;
  tableId: string | null;
  seats: number[];
  orderIds: number[];
  phase: 'arriving' | 'waitingTable' | 'ordering' | 'waiting' | 'eating' | 'leaving';
  eatUntil: number;
  waitedFor: number;
  isYou: boolean;
}

export interface OrderLine {
  itemId: string;
  name: string;
  qty: number;
  pricePaise: number;
  prepMin: number;
}

export interface SimOrder {
  id: number;
  token: string;
  shopId: string;
  lines: OrderLine[];
  subtotalPaise: number;
  status: SubOrderStatus;
  mode: 'counter' | 'table';
  tableId: string | null;
  groupId: number;
  isYou: boolean;
  /** Court clock minutes for each step. */
  at: { placed: number; accepted?: number; cooking?: number; ready?: number; served?: number; cleared?: number };
  /** Sim seconds when placed, for kitchen timing. */
  placedT: number;
  cookLeft: number;
  runner: number | null;
}

export type TableStatus = 'free' | 'reserved' | 'occupied' | 'dirty' | 'cleaning';

export interface TableState {
  id: string;
  status: TableStatus;
  groupId: number | null;
  seats: Array<number | null>;
  trays: number;
  cleaner: number | null;
  orderIds: number[];
}

export interface Kitchen {
  shopId: string;
  queue: number[];
  /** Placed, not yet accepted. */
  incoming: number[];
  waiting: number[];
  cooking: number[];
  ready: number[];
  tokenSeq: number;
  soldOut: Set<string>;
  servedToday: number;
  revenuePaise: number;
}

export type Crowd = 'quiet' | 'normal' | 'rush';
export type Speed = 1 | 4 | 12;
