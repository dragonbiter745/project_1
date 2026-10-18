import React, { useState, useEffect, useMemo } from 'react';
import {
  localStore,
  type FoodCourtDataState,
  type SyncStatus,
} from '@foodcourt/firebase-client';
import {
  formatPaise,
  formatDailyCustomerNo,
  type SubOrder,
  type SubOrderStatus,
} from '@foodcourt/shared';
import { Badge, Button } from '@foodcourt/ui';
import {
  ChefHat,
  Bell,
  Clock,
  PauseCircle,
  PlayCircle,
  PackageX,
  CheckCircle2,
  AlertTriangle,
  X,
  Volume2,
  VolumeX,
  Flame,
  Store,
  Wifi,
  WifiOff,
  Loader2,
  RotateCcw,
} from 'lucide-react';

export default function VendorDashboard() {
  const [storeState, setStoreState] = useState<FoodCourtDataState>(localStore.getState());
  const [activeVendorId, setActiveVendorId] = useState<string>('vendor-roll-me');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [rejectingSubOrder, setRejectingSubOrder] = useState<SubOrder | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('Out of ingredients');
  const [isStockModalOpen, setIsStockModalOpen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(localStore.getSyncStatus());

  // Listen to store changes
  useEffect(() => {
    const unsubscribe = localStore.subscribe((newState) => {
      setStoreState({ ...newState });
    });
    return unsubscribe;
  }, []);

  // Listen to sync status changes
  useEffect(() => {
    const unsubscribe = localStore.subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Timer tick for ticket elapsed time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const activeVendor = storeState.vendors.find((v) => v.id === activeVendorId);
  const activeMenu = storeState.menus[activeVendorId];
  const availability = storeState.availability[activeVendorId]?.unavailable || {};

  // Active sub-orders scoped to this vendor
  const vendorSubOrders = useMemo(() => {
    return Object.values(storeState.subOrders).filter(
      (s) => s.vendorId === activeVendorId
    );
  }, [storeState.subOrders, activeVendorId]);

  // Group tickets into KDS columns
  const newOrders = vendorSubOrders.filter((s) => s.status === 'NEW');
  const preparingOrders = vendorSubOrders.filter(
    (s) => s.status === 'ACCEPTED' || s.status === 'PREPARING'
  );
  const readyOrders = vendorSubOrders.filter((s) => s.status === 'READY');
  const collectedOrders = vendorSubOrders.filter((s) => s.status === 'COLLECTED');

  // Play repeating beep alert if there are unacknowledged NEW orders
  useEffect(() => {
    if (!soundEnabled || newOrders.length === 0) return;

    const playBeep = () => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      } catch {
        // AudioContext browser policy
      }
    };

    const interval = setInterval(playBeep, 4000);
    return () => clearInterval(interval);
  }, [newOrders.length, soundEnabled]);

  // Status transitions
  const updateStatus = (subOrderId: string, nextStatus: SubOrderStatus, reason?: string) => {
    localStore.mutate((draft) => {
      const order = draft.subOrders[subOrderId];
      if (!order) return;
      order.status = nextStatus;
      const now = Date.now();
      if (nextStatus === 'ACCEPTED') order.ts.accepted = now;
      if (nextStatus === 'PREPARING') order.ts.preparing = now;
      if (nextStatus === 'READY') order.ts.ready = now;
      if (nextStatus === 'COLLECTED') order.ts.collected = now;
      if (nextStatus === 'REJECTED') {
        order.ts.rejected = now;
        order.rejectReason = reason || 'Vendor declined';
        order.refund = {
          status: 'PROCESSED',
          amountPaise: order.subtotalPaise,
          cfRefundId: `ref_${Date.now()}`,
        };
      }
    });
  };

  // Availability toggle
  const toggleItemStock = (itemId: string) => {
    localStore.mutate((draft) => {
      if (!draft.availability[activeVendorId]) {
        draft.availability[activeVendorId] = {
          vendorId: activeVendorId,
          unavailable: {},
          updatedAt: Date.now(),
        };
      }
      const unavail = draft.availability[activeVendorId].unavailable;
      unavail[itemId] = !unavail[itemId];
      draft.availability[activeVendorId].updatedAt = Date.now();
    });
  };

  // Pause / Resume vendor orders
  const togglePauseOrders = () => {
    if (!activeVendor) return;
    localStore.mutate((draft) => {
      const v = draft.vendors.find((item) => item.id === activeVendorId);
      if (v) {
        v.acceptingOrders = !v.acceptingOrders;
      }
    });
  };

  // Helper for elapsed minutes and color escalation
  const getElapsedMinutes = (placedTs: number) => {
    return Math.floor((currentTime - placedTs) / 60000);
  };

  const getEscalationColor = (mins: number) => {
    if (mins >= 10) return 'text-rose-400 bg-rose-950/40 border-rose-800';
    if (mins >= 5) return 'text-amber-400 bg-amber-950/40 border-amber-800';
    return 'text-emerald-400 bg-emerald-950/40 border-emerald-800';
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="bg-[#111827] border-b border-slate-800 px-6 py-3.5 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-orange-900/30">
            <ChefHat className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-lg text-white">{activeVendor?.name}</h1>
              <span className="text-xs bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded-md border border-slate-700">
                KDS
              </span>
            </div>
            <div className="flex items-center space-x-3 text-xs text-slate-400">
              <span>REVA Food Court</span>
              <span>•</span>
              {syncStatus === 'connected' && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Wifi className="w-3 h-3" /> Live
                </span>
              )}
              {syncStatus === 'connecting' && (
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" /> Connecting…
                </span>
              )}
              {syncStatus === 'disconnected' && (
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <WifiOff className="w-3 h-3" /> Offline — orders may be delayed
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls & Vendor Switcher */}
        <div className="flex items-center space-x-3">
          {/* Shop Switcher */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700">
            {storeState.vendors.map((v) => (
              <button
                key={v.id}
                onClick={() => setActiveVendorId(v.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                  activeVendorId === v.id
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition-all ${
              soundEnabled
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                : 'bg-rose-950/40 border-rose-800 text-rose-400'
            }`}
            title={soundEnabled ? 'Mute Alert Sound' : 'Unmute Sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Stock Toggles Modal button */}
          <button
            onClick={() => setIsStockModalOpen(true)}
            className="flex items-center space-x-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-xl transition-all"
          >
            <PackageX className="w-4 h-4 text-orange-400" />
            <span>Stock Availability</span>
          </button>

          {/* Pause Orders Toggle */}
          <button
            onClick={togglePauseOrders}
            className={`flex items-center space-x-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
              activeVendor?.acceptingOrders
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                : 'bg-rose-600 text-white border-rose-500 animate-pulse'
            }`}
          >
            {activeVendor?.acceptingOrders ? (
              <>
                <PauseCircle className="w-4 h-4 text-amber-400" />
                <span>Pause Orders</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4 text-white" />
                <span>Orders Paused (Resume)</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Quick Metrics Bar */}
      <div className="bg-[#0e1424] border-b border-slate-800/80 px-6 py-2.5 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center space-x-6">
          <div>
            <span>Active Tickets: </span>
            <strong className="text-white font-mono text-sm">
              {newOrders.length + preparingOrders.length + readyOrders.length}
            </strong>
          </div>
          <div>
            <span>Completed Today: </span>
            <strong className="text-white font-mono text-sm">{collectedOrders.length}</strong>
          </div>
          <div>
            <span>Default Prep: </span>
            <strong className="text-white font-mono text-sm">
              {activeVendor?.defaultPrepMin} min
            </strong>
          </div>
        </div>

        <div className="text-slate-500 font-mono">
          Last sync: {new Date(currentTime).toLocaleTimeString()}
        </div>
      </div>

      {/* KDS Three Column Board */}
      <main className="flex-1 p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-x-auto">
        {/* Column 1: NEW ORDERS */}
        <div className="flex flex-col bg-[#111726] rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="bg-blue-950/40 border-b border-blue-900/50 p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 animate-ping" />
              <h2 className="font-bold text-white text-sm uppercase tracking-wider">
                New Tickets ({newOrders.length})
              </h2>
            </div>
            {newOrders.length > 0 && (
              <span className="bg-blue-600 text-white font-extrabold text-xs px-2 py-0.5 rounded-full">
                Action Required
              </span>
            )}
          </div>

          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {newOrders.length === 0 ? (
              <div className="text-center py-16 text-slate-600">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No new orders waiting</p>
              </div>
            ) : (
              newOrders.map((ticket) => {
                const mins = getElapsedMinutes(ticket.ts.placed);
                const esc = getEscalationColor(mins);

                return (
                  <div
                    key={ticket.id}
                    className="bg-[#182032] border-2 border-blue-600/50 rounded-2xl p-4 shadow-lg space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-black text-white tracking-tight">
                          {ticket.token}
                        </div>
                        <div className="text-xs text-orange-400 font-bold">
                          {ticket.tableLabel} • {ticket.customerDisplay}
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${esc}`}>
                        {mins}m ago
                      </div>
                    </div>

                    {/* Ticket Items */}
                    <div className="space-y-1.5 border-t border-slate-700/60 pt-2.5 text-sm">
                      {ticket.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start">
                          <div>
                            <span className="font-extrabold text-white text-base mr-2">
                              {item.qty}x
                            </span>
                            <span className="font-medium text-slate-200">{item.name}</span>
                            {item.note && (
                              <div className="text-xs text-amber-300 font-semibold bg-amber-950/40 px-2 py-0.5 rounded-md mt-0.5">
                                Note: {item.note}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 font-mono">
                            {formatPaise(item.pricePaise * item.qty)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/60">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRejectingSubOrder(ticket)}
                        className="text-xs font-bold"
                      >
                        Reject
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => updateStatus(ticket.id, 'PREPARING')}
                        className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700"
                      >
                        Accept & Cook
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 2: PREPARING */}
        <div className="flex flex-col bg-[#111726] rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="bg-amber-950/40 border-b border-amber-900/50 p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-500" />
              <h2 className="font-bold text-white text-sm uppercase tracking-wider">
                Preparing ({preparingOrders.length})
              </h2>
            </div>
          </div>

          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {preparingOrders.length === 0 ? (
              <div className="text-center py-16 text-slate-600">
                <ChefHat className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Kitchen is clear</p>
              </div>
            ) : (
              preparingOrders.map((ticket) => {
                const mins = getElapsedMinutes(ticket.ts.placed);
                const esc = getEscalationColor(mins);

                return (
                  <div
                    key={ticket.id}
                    className="bg-[#182032] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-black text-white tracking-tight">
                          {ticket.token}
                        </div>
                        <div className="text-xs text-orange-400 font-bold">
                          {ticket.tableLabel} • {ticket.customerDisplay}
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${esc}`}>
                        {mins}m elapsed
                      </div>
                    </div>

                    <div className="space-y-1.5 border-t border-slate-700/60 pt-2.5 text-sm">
                      {ticket.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start">
                          <div>
                            <span className="font-extrabold text-white text-base mr-2">
                              {item.qty}x
                            </span>
                            <span className="font-medium text-slate-200">{item.name}</span>
                            {item.note && (
                              <div className="text-xs text-amber-300 font-semibold bg-amber-950/40 px-2 py-0.5 rounded-md mt-0.5">
                                Note: {item.note}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-700/60">
                      <Button
                        variant="primary"
                        size="md"
                        fullWidth
                        onClick={() => updateStatus(ticket.id, 'READY')}
                        className="bg-emerald-600 hover:bg-emerald-700 font-bold text-sm"
                      >
                        ✓ Mark Food Ready
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 3: READY FOR PICKUP */}
        <div className="flex flex-col bg-[#111726] rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="bg-emerald-950/40 border-b border-emerald-900/50 p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h2 className="font-bold text-white text-sm uppercase tracking-wider">
                Ready for Pickup ({readyOrders.length})
              </h2>
            </div>
          </div>

          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {readyOrders.length === 0 ? (
              <div className="text-center py-16 text-slate-600">
                <Store className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No food waiting for pickup</p>
              </div>
            ) : (
              readyOrders.map((ticket) => (
                <div
                  key={ticket.id}
                  className="bg-[#182032] border-2 border-emerald-500/60 rounded-2xl p-4 shadow-lg space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-black text-emerald-400 tracking-tight">
                        {ticket.token}
                      </div>
                      <div className="text-xs text-slate-300 font-bold">
                        {ticket.tableLabel} • {ticket.customerDisplay}
                      </div>
                    </div>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded-md">
                      Calling Customer
                    </span>
                  </div>

                  <div className="space-y-1 border-t border-slate-700/60 pt-2 text-xs text-slate-300">
                    {ticket.items.map((item, idx) => (
                      <div key={idx}>
                        {item.qty}x {item.name}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-700/60">
                    <Button
                      variant="secondary"
                      size="md"
                      fullWidth
                      onClick={() => updateStatus(ticket.id, 'COLLECTED')}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm"
                    >
                      ✓ Customer Collected
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Stock Availability Modal */}
      {isStockModalOpen && activeMenu && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#131b2e] border border-slate-700 rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-white">
                  Stock Availability — {activeVendor?.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Toggle items out of stock in real time
                </p>
              </div>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {activeMenu.categories.map((cat) => (
                <div key={cat.id} className="space-y-2">
                  <h4 className="text-xs uppercase font-bold text-orange-400 tracking-wider">
                    {cat.name}
                  </h4>
                  <div className="space-y-1.5">
                    {cat.items.map((item) => {
                      const isOut = Boolean(availability[item.id]);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60"
                        >
                          <div>
                            <span className="font-medium text-sm text-slate-200">
                              {item.name}
                            </span>
                            <span className="text-xs text-slate-400 ml-2">
                              {formatPaise(item.pricePaise)}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleItemStock(item.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                              isOut
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'bg-emerald-700/80 hover:bg-emerald-600 text-white'
                            }`}
                          >
                            {isOut ? 'Out of Stock' : 'In Stock'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-700">
              <Button
                variant="primary"
                fullWidth
                onClick={() => setIsStockModalOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Order Reason Modal */}
      {rejectingSubOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#131b2e] border border-slate-700 rounded-3xl max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="font-bold text-lg text-white">
                Reject Order {rejectingSubOrder.token}
              </h3>
              <p className="text-xs text-slate-400">
                This will trigger an automatic refund of {formatPaise(rejectingSubOrder.subtotalPaise)} to the customer.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Reason for Rejection
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:outline-none"
              >
                <option value="Out of ingredients">Out of ingredients</option>
                <option value="Kitchen overwhelmed / peak rush">Kitchen overwhelmed / peak rush</option>
                <option value="Closing time reached">Closing time reached</option>
                <option value="Item not available">Item not available</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setRejectingSubOrder(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  updateStatus(rejectingSubOrder.id, 'REJECTED', rejectReason);
                  setRejectingSubOrder(null);
                }}
              >
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
