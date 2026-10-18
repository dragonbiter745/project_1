/**
 * Local Realtime Reactive Store for FoodCourt.
 * Enables zero-dependency local simulation across multiple tabs
 * using BroadcastChannel and LocalStorage with the exact same data contracts.
 * SSE bridge syncs across ports (5173 customer ↔ 5174 vendor ↔ 5175 master).
 */
import type {
  Venue,
  Vendor,
  VendorMenu,
  VendorAvailability,
  Table,
  Session,
  Order,
  SubOrder,
  UserProfile,
  PointsLedgerEntry,
  GlobalConfig,
} from '@foodcourt/shared';

import rollMeMenu from '../../../docs/menus/roll-me.json';
import siddiVinayakaMenu from '../../../docs/menus/siddi-vinayaka.json';

export interface FoodCourtDataState {
  venue: Venue;
  vendors: Vendor[];
  menus: Record<string, VendorMenu>;
  availability: Record<string, VendorAvailability>;
  tables: Table[];
  sessions: Record<string, Session>;
  orders: Record<string, Order>;
  subOrders: Record<string, SubOrder>;
  users: Record<string, UserProfile>;
  pointsLedger: Record<string, PointsLedgerEntry>;
  config: GlobalConfig;
  dailyCounter: Record<string, number>; // dateKey -> number
  vendorCounters: Record<string, number>; // dateKey_vendorId -> number
}

const STORAGE_KEY = 'fc_local_state_v1';
const CHANNEL_NAME = 'fc_realtime_events';

export const INITIAL_DATA_STATE: FoodCourtDataState = {
  venue: {
    id: 'venue-reva',
    name: 'REVA Food Court',
    timezone: 'Asia/Kolkata',
    taxConfig: { gstPct: 5, taxInclusive: true },
    sessionTtlMin: 180,
  },
  vendors: [
    {
      id: 'vendor-roll-me',
      name: 'Roll Me',
      code: 'RM',
      status: 'active',
      acceptingOrders: true,
      defaultPrepMin: 12,
      fulfilmentMode: 'pickup',
      acceptSlaSec: 180,
      feePct: 3,
      perOrderFeePaise: 100,
      hours: { open: '09:00', close: '22:00' },
    },
    {
      id: 'vendor-siddi-vinayaka',
      name: 'Siddi Vinayaka Garden',
      code: 'SV',
      status: 'active',
      acceptingOrders: true,
      defaultPrepMin: 10,
      fulfilmentMode: 'pickup',
      acceptSlaSec: 180,
      feePct: 3,
      perOrderFeePaise: 100,
      hours: { open: '08:00', close: '21:30' },
    },
  ],
  menus: {
    'vendor-roll-me': rollMeMenu as any,
    'vendor-siddi-vinayaka': siddiVinayakaMenu as any,
  },
  availability: {
    'vendor-roll-me': {
      vendorId: 'vendor-roll-me',
      unavailable: {},
      updatedAt: Date.now(),
    },
    'vendor-siddi-vinayaka': {
      vendorId: 'vendor-siddi-vinayaka',
      unavailable: {},
      updatedAt: Date.now(),
    },
  },
  tables: [
    { id: 'tbl-1', code: 'T14', label: 'T-14', zone: 'Central Courtyard', active: true },
    { id: 'tbl-2', code: 'T15', label: 'T-15', zone: 'Central Courtyard', active: true },
    { id: 'tbl-3', code: 'T01', label: 'T-01', zone: 'Terrace Garden', active: true },
    { id: 'tbl-4', code: 'T02', label: 'T-02', zone: 'Terrace Garden', active: true },
  ],
  sessions: {},
  orders: {},
  subOrders: {},
  users: {},
  pointsLedger: {},
  config: {
    pointsPerRupee: 0.1,
    pointsExpiryDays: 90,
    gstPct: 5,
    taxInclusive: true,
    platformFeePaise: 0,
    flags: {
      paymentsEnabled: true,
      loyaltyEnabled: true,
      maintenance: false,
    },
  },
  dailyCounter: {},
  vendorCounters: {},
};

const SYNC_SERVER_URL = 'http://localhost:4001';

export type SyncStatus = 'connected' | 'connecting' | 'disconnected';

class LocalRealtimeStore {
  private channel: BroadcastChannel | null = null;
  private eventSource: EventSource | null = null;
  private listeners: Set<(state: FoodCourtDataState) => void> = new Set();
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private state: FoodCourtDataState;
  private syncStatus: SyncStatus = 'connecting';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  constructor() {
    this.state = this.loadState();

    if (typeof window !== 'undefined') {
      // 1. Same-origin BroadcastChannel
      if ('BroadcastChannel' in window) {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          if (event.data?.type === 'STATE_UPDATED') {
            this.state = this.loadState();
            this.notify();
          }
        };
      }

      // 2. Cross-origin / Cross-port Server-Sent Events bridge
      this.connectSyncBridge();
    }
  }

  private connectSyncBridge() {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    // Close existing connection if any
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setSyncStatus('connecting');

    try {
      this.eventSource = new EventSource(`${SYNC_SERVER_URL}/api/events`);

      this.eventSource.onopen = () => {
        this.setSyncStatus('connected');
        this.reconnectDelay = 1000; // reset backoff on success
      };

      this.eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.state && (payload.type === 'INIT' || payload.type === 'STATE_UPDATED')) {
            this.state = {
              ...INITIAL_DATA_STATE,
              ...payload.state,
              // Always preserve fresh menu data from local imports
              menus: {
                ...INITIAL_DATA_STATE.menus,
                ...(payload.state.menus || {}),
              },
            };
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
            } catch {}
            this.notify();
          }
        } catch (err) {
          console.error('[localStore] Failed to parse SSE payload', err);
        }
      };

      this.eventSource.onerror = () => {
        this.setSyncStatus('disconnected');
        this.eventSource?.close();
        this.eventSource = null;
        this.scheduleReconnect();
      };
    } catch {
      this.setSyncStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // cap at 30s
      this.connectSyncBridge();
    }, this.reconnectDelay);
  }

  private setSyncStatus(status: SyncStatus) {
    if (this.syncStatus !== status) {
      this.syncStatus = status;
      for (const listener of this.statusListeners) {
        try { listener(status); } catch {}
      }
    }
  }

  private loadState(): FoodCourtDataState {
    if (typeof window === 'undefined') return INITIAL_DATA_STATE;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...INITIAL_DATA_STATE,
          ...parsed,
          // Always use fresh menu data from bundled imports
          menus: {
            ...INITIAL_DATA_STATE.menus,
            ...(parsed.menus || {}),
          },
        };
      }
    } catch {
      // Fallback
    }
    return INITIAL_DATA_STATE;
  }

  private saveState() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.channel?.postMessage({ type: 'STATE_UPDATED', timestamp: Date.now() });

      // Broadcast across ports via dev sync server
      fetch(`${SYNC_SERVER_URL}/api/mutate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state),
      }).catch(() => {
        // Sync server might not be running
      });
    } catch (e) {
      console.error('[localStore] Failed to save local state', e);
    }
    this.notify();
  }

  public getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  public subscribeSyncStatus(listener: (status: SyncStatus) => void) {
    this.statusListeners.add(listener);
    listener(this.syncStatus);
    return () => this.statusListeners.delete(listener);
  }

  public getState(): FoodCourtDataState {
    return this.state;
  }

  public subscribe(listener: (state: FoodCourtDataState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[localStore] Error in store listener', err);
      }
    }
  }

  public mutate(updater: (draft: FoodCourtDataState) => void) {
    updater(this.state);
    this.saveState();
  }

  public resetToDefaults() {
    this.state = JSON.parse(JSON.stringify(INITIAL_DATA_STATE));
    this.saveState();
  }
}

export const localStore = new LocalRealtimeStore();
