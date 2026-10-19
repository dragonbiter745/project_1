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
  Users,
} from 'lucide-react';

export default function MasterAdminApp() {
  const [storeState, setStoreState] = useState<FoodCourtDataState>(localStore.getState());
  const [activeTab, setActiveTab] = useState<'live-ops' | 'vendors' | 'tables' | 'analytics' | 'config'>('live-ops');
  const [orderFilter, setOrderFilter] = useState<string>('ALL');
  const [searchOrder, setSearchOrder] = useState<string>('');

  // Table management states
  const [tableCapacityFilter, setTableCapacityFilter] = useState<'ALL' | '4' | '6'>('ALL');
  const [tableZoneFilter, setTableZoneFilter] = useState<string>('ALL');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tablePage, setTablePage] = useState<number>(1);
  const tablesPerPage = 24;

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

  // Table Statistics
  const fourSeaterTables = useMemo(
    () => storeState.tables.filter((t) => (t.capacity || 4) === 4),
    [storeState.tables]
  );
  const sixSeaterTables = useMemo(
    () => storeState.tables.filter((t) => t.capacity === 6),
    [storeState.tables]
  );
  const totalSeatingCapacity = (fourSeaterTables.length * 4) + (sixSeaterTables.length * 6);

  const availableZones = useMemo(() => {
    return Array.from(new Set(storeState.tables.map((t) => t.zone)));
  }, [storeState.tables]);

  const filteredTables = useMemo(() => {
    return storeState.tables.filter((t) => {
      const cap = t.capacity || 4;
      if (tableCapacityFilter === '4' && cap !== 4) return false;
      if (tableCapacityFilter === '6' && cap !== 6) return false;
      if (tableZoneFilter !== 'ALL' && t.zone !== tableZoneFilter) return false;
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        if (
          !t.label.toLowerCase().includes(q) &&
          !t.code.toLowerCase().includes(q) &&
          !t.zone.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [storeState.tables, tableCapacityFilter, tableZoneFilter, tableSearch]);

  const totalPages = Math.ceil(filteredTables.length / tablesPerPage) || 1;
  const paginatedTables = useMemo(() => {
    const start = (tablePage - 1) * tablesPerPage;
    return filteredTables.slice(start, start + tablesPerPage);
  }, [filteredTables, tablePage, tablesPerPage]);

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

          {/* TAB 3: TABLES & CAPACITY MANAGEMENT */}
          {activeTab === 'tables' && (
            <div className="space-y-6">
              {/* Seating Capacity Overview KPIs */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-semibold">Total Floor Tables</span>
                    <QrCode className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="text-3xl font-black text-slate-900">{storeState.tables.length}</div>
                  <span className="text-xs font-semibold text-emerald-600 mt-1 inline-block">
                    100% Active in Floor Map
                  </span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/40 to-white shadow-xs">
                  <div className="flex items-center justify-between text-amber-700 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide">4-Seater Tables</span>
                    <Users className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-3xl font-black text-slate-900">{fourSeaterTables.length}</div>
                  <span className="text-xs text-slate-600 mt-1 inline-block">
                    <strong>{fourSeaterTables.length * 4}</strong> diners capacity (T-01 – T-95)
                  </span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/40 to-white shadow-xs">
                  <div className="flex items-center justify-between text-indigo-700 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide">6-Seater Tables</span>
                    <Users className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-3xl font-black text-slate-900">{sixSeaterTables.length}</div>
                  <span className="text-xs text-slate-600 mt-1 inline-block">
                    <strong>{sixSeaterTables.length * 6}</strong> diners capacity (T-96 – T-155)
                  </span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/40 to-white shadow-xs">
                  <div className="flex items-center justify-between text-emerald-700 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide">Total Seating Capacity</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-3xl font-black text-emerald-700">{totalSeatingCapacity}</div>
                  <span className="text-xs text-slate-600 mt-1 inline-block">
                    Diners across all food court zones
                  </span>
                </div>
              </div>

              {/* Main Content Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="font-bold text-slate-900 text-lg">Table QR Codes & Seating Grid</h2>
                    <p className="text-xs text-slate-500">
                      Manage 155 physical tables across REVA Nest Food Court with instant QR links
                    </p>
                  </div>
                  <button
                    onClick={() => window.open('/table-qrs-sheet.html', '_blank')}
                    className="bg-orange-600 text-white font-bold text-xs px-4 py-2 rounded-xl hover:bg-orange-700 flex items-center space-x-1.5 shadow-sm transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open Printable A4 Sheet (All 155)</span>
                  </button>
                </div>

                {/* Filters & Search Toolbar */}
                <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 flex-wrap">
                  {/* Capacity Filter Pills */}
                  <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-slate-200 text-xs font-semibold">
                    <button
                      onClick={() => { setTableCapacityFilter('ALL'); setTablePage(1); }}
                      className={`px-3 py-1.5 rounded-md transition-all ${
                        tableCapacityFilter === 'ALL'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All Tables ({storeState.tables.length})
                    </button>
                    <button
                      onClick={() => { setTableCapacityFilter('4'); setTablePage(1); }}
                      className={`px-3 py-1.5 rounded-md flex items-center space-x-1 transition-all ${
                        tableCapacityFilter === '4'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-amber-700'
                      }`}
                    >
                      <span>4-Seater ({fourSeaterTables.length})</span>
                    </button>
                    <button
                      onClick={() => { setTableCapacityFilter('6'); setTablePage(1); }}
                      className={`px-3 py-1.5 rounded-md flex items-center space-x-1 transition-all ${
                        tableCapacityFilter === '6'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-indigo-700'
                      }`}
                    >
                      <span>6-Seater ({sixSeaterTables.length})</span>
                    </button>
                  </div>

                  {/* Zone Filter */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500 font-medium">Zone:</span>
                    <select
                      value={tableZoneFilter}
                      onChange={(e) => { setTableZoneFilter(e.target.value); setTablePage(1); }}
                      className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none"
                    >
                      <option value="ALL">All Zones ({availableZones.length})</option>
                      {availableZones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search Input */}
                  <div className="relative min-w-[200px] flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search Table T-14, T95..."
                      value={tableSearch}
                      onChange={(e) => { setTableSearch(e.target.value); setTablePage(1); }}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Table Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                  {paginatedTables.map((t) => {
                    const isFour = (t.capacity || 4) === 4;
                    const hostUrl =
                      typeof window !== 'undefined' && window.location.hostname === 'localhost'
                        ? 'http://localhost:5173'
                        : 'https://reva-nest-foodcourt.web.app';
                    const targetUrl = `${hostUrl}/t/${t.code}`;
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                      targetUrl
                    )}`;

                    return (
                      <div
                        key={t.id}
                        className={`border rounded-2xl p-3 text-center space-y-2 bg-white transition-all hover:shadow-md ${
                          isFour
                            ? 'border-slate-200 hover:border-amber-300'
                            : 'border-indigo-100 hover:border-indigo-300 bg-gradient-to-b from-indigo-50/20 to-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                              isFour
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {isFour ? '4 Seater' : '6 Seater'}
                          </span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Active"></span>
                        </div>

                        <h4 className="font-black text-slate-900 text-lg tracking-tight">{t.label}</h4>

                        <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-100 inline-block">
                          <img
                            src={qrUrl}
                            alt={t.label}
                            className="w-24 h-24 mx-auto rounded-lg bg-white p-1 shadow-xs"
                            loading="lazy"
                          />
                        </div>

                        <p className="text-[10px] text-slate-500 truncate" title={t.zone}>
                          {t.zone}
                        </p>

                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1 text-[10px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded-lg w-full justify-center transition-all"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Test Order</span>
                        </a>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                  <span>
                    Showing {paginatedTables.length} of {filteredTables.length} tables (Page {tablePage} of {totalPages})
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      disabled={tablePage <= 1}
                      onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Previous
                    </button>
                    <span className="font-bold text-slate-800 px-2">{tablePage}</span>
                    <button
                      disabled={tablePage >= totalPages}
                      onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                      Next
                    </button>
                  </div>
                </div>
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
