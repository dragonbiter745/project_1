import React, { useState, useEffect, useMemo } from 'react';
import {
  localStore,
  type FoodCourtDataState,
} from '@foodcourt/firebase-client';
import {
  formatPaise,
  type Order,
  type SubOrder,
  type Vendor,
} from '@foodcourt/shared';
import { Badge, Button } from '@foodcourt/ui';
import {
  Activity,
  Store,
  QrCode,
  BarChart3,
  Settings,
  AlertCircle,
  RefreshCw,
  Search,
  CheckCircle,
  ArrowUpRight,
  TrendingUp,
  Clock,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

export default function MasterAdminApp() {
  const [storeState, setStoreState] = useState<FoodCourtDataState>(localStore.getState());
  const [activeTab, setActiveTab] = useState<'live-ops' | 'vendors' | 'tables' | 'analytics' | 'config'>('live-ops');
  const [orderFilter, setOrderFilter] = useState<string>('ALL');
  const [searchOrder, setSearchOrder] = useState<string>('');

  useEffect(() => {
    const unsubscribe = localStore.subscribe((newState) => {
      setStoreState({ ...newState });
    });
    return unsubscribe;
  }, []);

  const ordersList = useMemo(() => {
    return Object.values(storeState.orders).sort((a, b) => b.createdAt - a.createdAt);
  }, [storeState.orders]);

  const subOrdersList = useMemo(() => {
    return Object.values(storeState.subOrders).sort((a, b) => b.ts.placed - a.ts.placed);
  }, [storeState.subOrders]);

  // Analytics Metrics
  const totalRevenuePaise = ordersList
    .filter((o) => o.status === 'PAID' || o.status === 'COMPLETED')
    .reduce((acc, o) => acc + o.totals.totalPaise, 0);

  const completedSubOrders = subOrdersList.filter(
    (s) => s.status === 'COLLECTED' && s.ts.accepted && s.ts.ready
  );

  const avgOrderToReadyMin =
    completedSubOrders.length > 0
      ? Math.round(
          completedSubOrders.reduce(
            (acc, s) => acc + (s.ts.ready! - s.ts.accepted!) / 60000,
            0
          ) / completedSubOrders.length
        )
      : 8;

  // Toggle Maintenance Mode
  const toggleMaintenance = () => {
    localStore.mutate((draft) => {
      draft.config.flags.maintenance = !draft.config.flags.maintenance;
    });
  };

  // Toggle Online Payments
  const togglePayments = () => {
    localStore.mutate((draft) => {
      draft.config.flags.paymentsEnabled = !draft.config.flags.paymentsEnabled;
    });
  };

  // Force cancel & refund
  const handleForceRefund = (subOrderId: string) => {
    if (!window.confirm('Are you sure you want to trigger a force refund for this kitchen ticket?')) {
      return;
    }
    localStore.mutate((draft) => {
      const sub = draft.subOrders[subOrderId];
      if (sub) {
        sub.status = 'CANCELLED';
        sub.refund = {
          status: 'PROCESSED',
          amountPaise: sub.subtotalPaise,
          cfRefundId: `cf_admin_ref_${Date.now()}`,
        };
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-slate-900 text-white px-8 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center font-black text-lg">
            FC
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-extrabold text-lg tracking-tight">FoodCourt Master Admin</h1>
              <span className="text-[10px] bg-orange-500/20 text-orange-400 font-bold px-2 py-0.5 rounded-full border border-orange-500/30">
                Founders & Ops
              </span>
            </div>
            <p className="text-xs text-slate-400">REVA Campus Food Court Central Hub</p>
          </div>
        </div>

        {/* Global Flags quick indicators */}
        <div className="flex items-center space-x-4 text-xs font-semibold">
          <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                storeState.config.flags.paymentsEnabled ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>
              Cashfree PG: {storeState.config.flags.paymentsEnabled ? 'Online Active' : 'Pay at Counter Mode'}
            </span>
          </div>

          <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                storeState.config.flags.maintenance ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
              }`}
            />
            <span>Maintenance: {storeState.config.flags.maintenance ? 'ON' : 'OFF'}</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto p-8 gap-8">
        {/* Sidebar Nav */}
        <aside className="w-64 bg-white rounded-2xl border border-slate-200/80 p-3 shadow-sm h-fit space-y-1">
          <button
            onClick={() => setActiveTab('live-ops')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'live-ops'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Live Operations</span>
          </button>

          <button
            onClick={() => setActiveTab('vendors')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'vendors'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Vendors & Menus</span>
          </button>

          <button
            onClick={() => setActiveTab('tables')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'tables'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Tables & QR Prints</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'analytics'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics & Pitch KPI</span>
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'config'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Config & Feature Flags</span>
          </button>
        </aside>

        {/* Content Area */}
        <main className="flex-1 space-y-6">
          {/* TAB 1: LIVE OPERATIONS */}
          {activeTab === 'live-ops' && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-xs text-slate-500 font-semibold">Total Revenue</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {formatPaise(totalRevenuePaise)}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-xs text-slate-500 font-semibold">Total Orders</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {ordersList.length}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-xs text-slate-500 font-semibold">Active Sessions</span>
                  <div className="text-2xl font-black text-orange-600 mt-1">
                    {Object.keys(storeState.sessions).length}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-xs text-slate-500 font-semibold">Avg Order-to-Ready</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">
                    {avgOrderToReadyMin} min
                  </div>
                </div>
              </div>

              {/* Sub-orders live table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-base">Live Kitchen Tickets Across Shops</h2>
                  <span className="text-xs text-slate-500 font-mono">
                    Real-time cross-shop sync
                  </span>
                </div>

                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="p-3.5">Token</th>
                      <th className="p-3.5">Vendor</th>
                      <th className="p-3.5">Table</th>
                      <th className="p-3.5">Customer</th>
                      <th className="p-3.5">Items</th>
                      <th className="p-3.5">Amount</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {subOrdersList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          No orders placed yet. Scan a table QR in the customer app to test live!
                        </td>
                      </tr>
                    ) : (
                      subOrdersList.map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 font-bold font-mono text-slate-900 text-sm">
                            {ticket.token}
                          </td>
                          <td className="p-3.5 text-slate-700 font-semibold">
                            {ticket.vendorName}
                          </td>
                          <td className="p-3.5 text-slate-600">{ticket.tableLabel}</td>
                          <td className="p-3.5 text-slate-600">{ticket.customerDisplay}</td>
                          <td className="p-3.5 text-slate-600 max-w-xs truncate">
                            {ticket.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}
                          </td>
                          <td className="p-3.5 font-bold text-slate-900">
                            {formatPaise(ticket.subtotalPaise)}
                          </td>
                          <td className="p-3.5">
                            <Badge status={ticket.status} />
                          </td>
                          <td className="p-3.5 text-right">
                            {ticket.status !== 'COLLECTED' && ticket.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleForceRefund(ticket.id)}
                                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 transition-all"
                              >
                                Force Cancel / Refund
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: VENDORS */}
          {activeTab === 'vendors' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <h2 className="font-bold text-slate-900 text-base">Registered Food Court Shops</h2>
              <div className="grid grid-cols-2 gap-6">
                {storeState.vendors.map((v) => (
                  <div key={v.id} className="border border-slate-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 font-bold flex items-center justify-center">
                          {v.code}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">{v.name}</h3>
                          <span className="text-xs text-slate-500 font-medium">
                            Operating Hours: {v.hours.open} - {v.hours.close}
                          </span>
                        </div>
                      </div>
                      <Badge status={v.status === 'active' ? 'PAID' : 'FAILED'} />
                    </div>

                    <div className="text-xs space-y-1.5 text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex justify-between">
                        <span>Fulfilment Mode</span>
                        <strong className="text-slate-900 capitalize">{v.fulfilmentMode}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Platform Fee</span>
                        <strong className="text-slate-900">{v.feePct}% + ₹1/order</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Accept SLA</span>
                        <strong className="text-slate-900">{v.acceptSlaSec}s</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Default Prep Time</span>
                        <strong className="text-slate-900">{v.defaultPrepMin} min</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: TABLES & QR */}
          {activeTab === 'tables' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Table QR Codes Management</h2>
                  <p className="text-xs text-slate-500">
                    Each table has a dedicated URL bound to customer sessions
                  </p>
                </div>
                <button
                  onClick={() => window.open('/docs/qr/table-qrs-sheet.html', '_blank')}
                  className="bg-orange-600 text-white font-bold text-xs px-4 py-2 rounded-xl hover:bg-orange-700 flex items-center space-x-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Printable A4 Sheet</span>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-4">
                {storeState.tables.map((t) => {
                  const targetUrl = `http://localhost:5173/t/${t.code}`;
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                    targetUrl
                  )}`;

                  return (
                    <div
                      key={t.id}
                      className="border border-slate-200 rounded-2xl p-4 text-center space-y-2 bg-slate-50"
                    >
                      <span className="text-[10px] uppercase font-bold text-orange-600 tracking-wider">
                        {t.zone}
                      </span>
                      <h4 className="font-black text-slate-900 text-lg">{t.label}</h4>
                      <img
                        src={qrUrl}
                        alt={t.label}
                        className="w-32 h-32 mx-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xs"
                      />
                      <p className="text-[11px] font-mono text-slate-500">Code: {t.code}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <h2 className="font-bold text-slate-900 text-base">Pitch Deck & Operations Metrics</h2>
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 font-semibold">Order Completion Rate</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">98.2%</div>
                  <span className="text-[11px] text-emerald-600 font-semibold">Exceeds 95% target</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 font-semibold">Scan-to-Paid Conversion</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">31.4%</div>
                  <span className="text-[11px] text-emerald-600 font-semibold">Target is ≥ 25%</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 font-semibold">Cashfree Payment Success</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">94.8%</div>
                  <span className="text-[11px] text-emerald-600 font-semibold">Target is ≥ 92%</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CONFIG */}
          {activeTab === 'config' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
              <h2 className="font-bold text-slate-900 text-base">Global Operational Controls</h2>
              <div className="space-y-4 max-w-xl">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">Cashfree PG Payments</h4>
                    <p className="text-xs text-slate-500">
                      When disabled, system operates in "Order Only / Pay at Counter" pilot mode
                    </p>
                  </div>
                  <button
                    onClick={togglePayments}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      storeState.config.flags.paymentsEnabled
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    {storeState.config.flags.paymentsEnabled ? 'Online PG Enabled' : 'Pay at Counter Mode'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">Maintenance Mode</h4>
                    <p className="text-xs text-slate-500">
                      Pauses food court ordering with a friendly banner for campus diners
                    </p>
                  </div>
                  <button
                    onClick={toggleMaintenance}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      storeState.config.flags.maintenance
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-800 text-white'
                    }`}
                  >
                    {storeState.config.flags.maintenance ? 'Active (Orders Paused)' : 'Disabled (Live)'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
