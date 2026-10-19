import React, { useState, useEffect, useMemo } from 'react';
import {
  localStore,
  initFirebase,
  getFunctions,
  httpsCallable,
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type FoodCourtDataState,
} from '@foodcourt/firebase-client';
import {
  formatPaise,
  formatVendorToken,
  formatDailyCustomerNo,
  generateDisplayName,
  computeOrderTotals,
  getIstDateKey,
  type CartItem,
  type Order,
  type SubOrder,
  type MenuItem,
} from '@foodcourt/shared';
import { VegDot, Badge, Button } from '@foodcourt/ui';
import {
  Search,
  ShoppingBag,
  Sparkles,
  MapPin,
  Clock,
  ArrowRight,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  X,
  ChefHat,
  UtensilsCrossed,
  Info,
  Gift,
  User,
  LogIn,
  LogOut,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function CustomerApp() {
  const [storeState, setStoreState] = useState<FoodCourtDataState>(localStore.getState());
  const [activeVendorId, setActiveVendorId] = useState<string>('vendor-roll-me');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [vegOnly, setVegOnly] = useState<boolean>(false);

  // Firebase auth user (anonymous sign-in)
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);

  useEffect(() => {
    const { app } = initFirebase();
    const auth = getAuth(app);
    // Listen for auth state; sign in anonymously if not already signed in.
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setFirebaseUid(user.uid);
      } else {
        signInAnonymously(auth)
          .then((cred) => setFirebaseUid(cred.user.uid))
          .catch((err: unknown) => console.warn('Anonymous sign-in failed:', err));
      }
    });
    return unsub;
  }, []);
  
  // Cart state: itemId -> CartItem
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);

  // Active tracked order
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [hasTriggeredReadyAlert, setHasTriggeredReadyAlert] = useState<boolean>(false);

  // Customer Profile & Optional Login
  const [customerUser, setCustomerUser] = useState<{
    name: string;
    phone: string;
    studentId?: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('fc_customer_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [loginPhone, setLoginPhone] = useState<string>('');
  const [loginName, setLoginName] = useState<string>('');
  const [loginStudentId, setLoginStudentId] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = loginPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setLoginError('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    const cleanName = loginName.trim() || `Diner ${cleanPhone.slice(-4)}`;
    const profile = {
      name: cleanName,
      phone: cleanPhone,
      studentId: loginStudentId.trim() || undefined,
    };
    setCustomerUser(profile);
    localStorage.setItem('fc_customer_profile', JSON.stringify(profile));

    if (session) {
      setSession((prev) => (prev ? { ...prev, displayName: cleanName } : null));
      localStore.mutate((draft) => {
        const targetSession = draft.sessions[session.id];
        if (targetSession) {
          targetSession.displayName = cleanName;
        }
      });
    }

    setIsLoginModalOpen(false);
    setLoginError('');
  };

  const handleLogout = () => {
    setCustomerUser(null);
    localStorage.removeItem('fc_customer_profile');
    setIsAccountModalOpen(false);
  };

  // Subscribe to real-time store changes
  useEffect(() => {
    const unsubscribe = localStore.subscribe((newState) => {
      setStoreState({ ...newState });
    });
    return unsubscribe;
  }, []);

  // Initialize or fetch table session
  const [currentTableCode, setCurrentTableCode] = useState<string>('T14');
  const [session, setSession] = useState<{
    id: string;
    displayName: string;
    dailyNo: number;
    tableLabel: string;
  } | null>(null);

  useEffect(() => {
    // Generate or retrieve session bound to this table
    const dateKey = getIstDateKey();
    const existingSessions = Object.values(storeState.sessions);
    const existing = existingSessions.find((s) => s.tableLabel.includes(currentTableCode));

    if (existing) {
      setSession({
        id: existing.id,
        displayName: existing.displayName,
        dailyNo: existing.dailyNo,
        tableLabel: existing.tableLabel,
      });
    } else {
      // Create session
      const nextNo = (storeState.dailyCounter[dateKey] || 0) + 1;
      const name = generateDisplayName(nextNo);
      const newSessionId = `sess_${Date.now()}`;
      const newSession = {
        id: newSessionId,
        uid: `guest_${Date.now()}`,
        tableId: 'tbl-1',
        tableLabel: `Table ${currentTableCode}`,
        dateKey,
        dailyNo: nextNo,
        displayName: name,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 3 * 3600 * 1000,
      };

      localStore.mutate((draft) => {
        draft.dailyCounter[dateKey] = nextNo;
        draft.sessions[newSessionId] = newSession;
      });

      setSession({
        id: newSessionId,
        displayName: name,
        dailyNo: nextNo,
        tableLabel: `Table ${currentTableCode}`,
      });
    }
  }, [currentTableCode]);

  // Active menu and availability
  const activeMenu = storeState.menus[activeVendorId];
  const activeAvailability = storeState.availability[activeVendorId]?.unavailable || {};
  const activeVendor = storeState.vendors.find((v) => v.id === activeVendorId);

  // Filtered menu items
  const filteredCategories = useMemo(() => {
    if (!activeMenu) return [];
    return activeMenu.categories
      .map((cat) => {
        const items = cat.items.filter((item) => {
          if (vegOnly && !item.veg) return false;
          if (
            searchQuery.trim() &&
            !item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !cat.name.toLowerCase().includes(searchQuery.toLowerCase())
          ) {
            return false;
          }
          return true;
        });
        return { ...cat, items };
      })
      .filter((cat) => {
        if (selectedCategory !== 'ALL' && cat.id !== selectedCategory) return false;
        return cat.items.length > 0;
      });
  }, [activeMenu, selectedCategory, searchQuery, vegOnly]);

  // Cart operations
  const addToCart = (item: MenuItem, vendorId: string) => {
    setCart((prev) => {
      const existing = prev[item.id];
      if (existing) {
        return {
          ...prev,
          [item.id]: { ...existing, qty: existing.qty + 1 },
        };
      }
      return {
        ...prev,
        [item.id]: {
          id: item.id,
          itemId: item.id,
          vendorId,
          name: item.name,
          pricePaise: item.pricePaise,
          veg: item.veg,
          qty: 1,
        },
      };
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.qty <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return {
        ...prev,
        [itemId]: { ...existing, qty: existing.qty - 1 },
      };
    });
  };

  const updateItemNote = (itemId: string, note: string) => {
    setCart((prev) => {
      if (!prev[itemId]) return prev;
      return {
        ...prev,
        [itemId]: { ...prev[itemId], note },
      };
    });
  };

  const cartItems = Object.values(cart);
  const totalCartCount = cartItems.reduce((acc, i) => acc + i.qty, 0);

  // Totals computation
  const totals = useMemo(() => {
    return computeOrderTotals({
      items: cartItems,
      config: storeState.config,
    });
  }, [cartItems, storeState.config]);

  // Checkout execution — calls createCheckout callable so the Firestore order ID
  // matches what Cashfree sends back in the PAYMENT_SUCCESS_WEBHOOK.
  const handleCheckout = async () => {
    if (cartItems.length === 0 || !session) return;
    setIsCheckingOut(true);

    const dateKey = getIstDateKey();
    const now = Date.now();
    const checkoutKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ck_${now}`;

    // finalizeOrder updates local UI state after payment is confirmed.
    // orderId comes from the server (Firestore doc ID) so the webhook can find it.
    const finalizeOrder = (orderId: string) => {
      localStore.mutate((draft) => {
        // The real order/subOrders are written by the webhook server-side.
        // We track orderId locally to show the order-tracking UI.
        if (!draft.orders[orderId]) {
          // Optimistic placeholder so the tracker shows immediately;
          // Firestore listener will overwrite with the real data.
          const optimisticOrder: Order = {
            id: orderId,
            sessionId: session.id,
            uid: `guest_${session.dailyNo}`,
            tableId: 'tbl-1',
            tableLabel: session.tableLabel,
            dateKey,
            items: cartItems.map((i) => ({
              itemId: i.itemId,
              vendorId: i.vendorId,
              name: i.name,
              pricePaise: i.pricePaise,
              veg: i.veg,
              qty: i.qty,
              note: i.note,
            })),
            totals,
            payment: { status: 'PENDING' },
            status: 'PENDING_PAYMENT',
            checkoutKey,
            createdAt: now,
          };
          draft.orders[orderId] = optimisticOrder;
        }
      });

      setCart({});
      setIsCartOpen(false);
      setIsCheckingOut(false);
      setActiveOrderId(orderId);
      setHasTriggeredReadyAlert(false);
    };

    let cashfreeModalTriggered = false;

    try {
      // 1. Call the server-side createCheckout callable.
      //    It creates the Firestore order doc and returns the Cashfree payment_session_id.
      const { app } = initFirebase();
      const fns = getFunctions(app, 'asia-south1');
      const createCheckoutFn = httpsCallable<
        {
          sessionId: string;
          checkoutKey: string;
          items: Array<{
            itemId: string;
            vendorId: string;
            name: string;
            pricePaise: number;
            veg: boolean;
            qty: number;
            note?: string;
          }>;
          customerPhone?: string;
        },
        { orderId: string; paymentSessionId: string; status: string; totalPaise?: number }
      >(fns, 'createCheckout');

      const result = await createCheckoutFn({
        sessionId: session.id,
        checkoutKey,
        items: cartItems.map((i) => ({
          itemId: i.itemId,
          vendorId: i.vendorId,
          name: i.name,
          pricePaise: i.pricePaise,
          veg: i.veg,
          qty: i.qty,
          note: i.note || undefined,
        })),
        customerPhone: customerUser?.phone || '9876543210',
      });

      const { orderId, paymentSessionId } = result.data;

      // 2. Open Cashfree modal with the server-issued payment session.
      if (typeof (window as any).Cashfree !== 'undefined' && paymentSessionId) {
        const cashfree = (window as any).Cashfree({ mode: 'sandbox' });
        cashfreeModalTriggered = true;
        cashfree.checkout({
          paymentSessionId,
          redirectTarget: '_modal',
        }).then((cfResult: any) => {
          console.log('Cashfree checkout result:', cfResult);
          finalizeOrder(orderId);
        }).catch((err: any) => {
          console.warn('Cashfree modal error:', err);
          // Still finalize locally — webhook will confirm on server side.
          finalizeOrder(orderId);
        });
      } else {
        // Cashfree SDK not loaded or no session — finalize optimistically.
        finalizeOrder(orderId);
      }
    } catch (err: any) {
      console.error('createCheckout callable failed:', err);
      // Fallback: close cart and show error.
      setIsCheckingOut(false);
      alert(`Could not initiate payment: ${err?.message || 'Please try again.'}`);
      return;
    }

    if (!cashfreeModalTriggered) {
      // Modal not triggered (SDK unavailable) — already finalized above.
    }
  };

  // Sub-orders for active tracked order
  const activeSubOrders = useMemo(() => {
    if (!activeOrderId) return [];
    return Object.values(storeState.subOrders).filter((s) => s.orderId === activeOrderId);
  }, [activeOrderId, storeState.subOrders]);

  // Audio & confetti when order becomes READY
  useEffect(() => {
    const isAnyReady = activeSubOrders.some((s) => s.status === 'READY');
    if (isAnyReady && !hasTriggeredReadyAlert) {
      setHasTriggeredReadyAlert(true);
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ea580c', '#16a34a', '#f59e0b'],
      });
      // Web Audio API beep alert
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } catch {
        // AudioContext autoplay restrictions
      }
    }
  }, [activeSubOrders, hasTriggeredReadyAlert]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto shadow-2xl relative pb-28">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              FC
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-slate-900 text-sm">
                  {customerUser ? customerUser.name : (session ? session.displayName : 'Guest Diner')}
                </span>
                <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {session ? formatDailyCustomerNo(session.dailyNo) : '#...'}
                </span>
              </div>
              <div className="flex items-center text-xs text-slate-500 space-x-1">
                <MapPin className="w-3 h-3 text-orange-600" />
                <span>{session?.tableLabel || 'Table T-14'}</span>
                <span>• REVA Food Court</span>
              </div>
            </div>
          </div>

          {/* User Login/Profile & Table Switcher */}
          <div className="flex items-center space-x-1.5">
            {customerUser ? (
              <button
                onClick={() => setIsAccountModalOpen(true)}
                className="bg-orange-50 border border-orange-200 text-orange-900 text-xs px-2.5 py-1.5 rounded-xl flex items-center space-x-1 font-bold hover:bg-orange-100 transition-all shadow-2xs"
                title="View Profile & Orders"
              >
                <div className="w-4 h-4 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px]">
                  {customerUser.name.charAt(0).toUpperCase()}
                </div>
                <span className="max-w-[70px] truncate">{customerUser.name}</span>
              </button>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-xl flex items-center space-x-1 font-bold shadow-xs transition-all"
              >
                <LogIn className="w-3 h-3 text-orange-400" />
                <span>Log In</span>
              </button>
            )}

            {/* Table Switcher across all 155 tables */}
            <select
              value={currentTableCode}
              onChange={(e) => setCurrentTableCode(e.target.value)}
              className="text-xs bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-xl px-2 py-1.5 focus:outline-none max-w-[85px]"
              title="Select your table number"
            >
              <optgroup label="4-Seater Tables (T-01 to T-95)">
                {storeState.tables
                  .filter((t) => (t.capacity || 4) === 4)
                  .map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.label} (4S)
                    </option>
                  ))}
              </optgroup>
              <optgroup label="6-Seater Tables (T-96 to T-155)">
                {storeState.tables
                  .filter((t) => t.capacity === 6)
                  .map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.label} (6S)
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Multi-Vendor Tabs */}
        <div className="flex mt-3 bg-slate-100 p-1 rounded-xl">
          {storeState.vendors.map((vendor) => {
            const isActive = vendor.id === activeVendorId;
            return (
              <button
                key={vendor.id}
                onClick={() => {
                  setActiveVendorId(vendor.id);
                  setSelectedCategory('ALL');
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                  isActive
                    ? 'bg-white text-orange-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{vendor.name}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    vendor.code === 'RM' ? 'bg-amber-600' : 'bg-emerald-600'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Search & Veg toggle */}
        <div className="flex items-center space-x-2 mt-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={`Search ${activeVendor?.name}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 border border-transparent rounded-xl focus:bg-white focus:border-orange-500 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Veg Only switch */}
          <button
            onClick={() => setVegOnly(!vegOnly)}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              vegOnly
                ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            <VegDot veg={true} size="sm" />
            <span>Veg</span>
          </button>
        </div>

        {/* Categories Bar */}
        {activeMenu && (
          <div className="flex space-x-2 overflow-x-auto no-scrollbar mt-3 pb-0.5">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Items
            </button>
            {activeMenu.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main Menu List */}
      <main className="px-4 py-4 space-y-6">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <UtensilsCrossed className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No items found matching your filter</p>
          </div>
        ) : (
          filteredCategories.map((category) => (
            <section key={category.id} className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
                <span>{category.name}</span>
                <span className="text-xs font-normal text-slate-400">
                  {category.items.length} items
                </span>
              </h2>

              <div className="space-y-2.5">
                {category.items.map((item) => {
                  const isOutOfStock = Boolean(activeAvailability[item.id]);
                  const inCart = cart[item.id];

                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs flex items-center justify-between transition-all ${
                        isOutOfStock ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex-1 pr-3">
                        <div className="flex items-center space-x-2">
                          <VegDot veg={item.veg} size="sm" />
                          <h3 className="font-semibold text-slate-900 text-sm leading-snug">
                            {item.name}
                          </h3>
                        </div>

                        {item.desc && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {item.desc}
                          </p>
                        )}

                        <div className="text-sm font-bold text-slate-900 mt-2">
                          {formatPaise(item.pricePaise)}
                        </div>
                      </div>

                      {/* Add Button or Stepper */}
                      <div>
                        {isOutOfStock ? (
                          <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg">
                            Sold Out
                          </span>
                        ) : inCart ? (
                          <div className="flex items-center bg-orange-600 text-white rounded-xl shadow-xs font-bold text-xs">
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="px-2.5 py-1.5 hover:bg-orange-700 active:scale-95 transition-all"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-1.5 min-w-[20px] text-center">
                              {inCart.qty}
                            </span>
                            <button
                              onClick={() => addToCart(item, activeVendorId)}
                              className="px-2.5 py-1.5 hover:bg-orange-700 active:scale-95 transition-all"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(item, activeVendorId)}
                            className="bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold px-4 py-2 rounded-xl active:scale-95 transition-all"
                          >
                            ADD +
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Floating Active Order Pill if tracking */}
      {activeOrderId && activeSubOrders.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-30">
          <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-700 flex items-center justify-between animate-fade-in">
            <div className="flex items-center space-x-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <div>
                <p className="text-xs font-bold">
                  Order #{activeOrderId.slice(-4)} Active
                </p>
                <div className="flex items-center space-x-2 text-[11px] text-slate-300">
                  {activeSubOrders.map((s) => (
                    <span key={s.id} className="font-semibold text-orange-400">
                      {s.token}: {s.status}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsCartOpen(false)}
              className="text-xs bg-slate-800 hover:bg-slate-700 font-bold px-3 py-1.5 rounded-xl border border-slate-600"
            >
              Live Status
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Cart Bar */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-3 left-4 right-4 max-w-md mx-auto z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-gradient-to-r from-orange-600 to-amber-600 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between font-semibold active:scale-[0.99] transition-all"
          >
            <div className="flex items-center space-x-2.5">
              <div className="bg-white/20 p-2 rounded-xl">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-xs uppercase tracking-wider text-orange-100 font-bold">
                  {totalCartCount} {totalCartCount === 1 ? 'item' : 'items'} in cart
                </div>
                <div className="text-base font-extrabold leading-none">
                  {formatPaise(totals.totalPaise)}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-1 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-2 rounded-xl">
              <span>View Cart</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer / Bottom Sheet */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-w-md mx-auto w-full max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Your Food Court Cart</h3>
                <p className="text-xs text-slate-500">
                  {session?.tableLabel} • One payment across shops
                </p>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items Grouped by Shop */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {['vendor-roll-me', 'vendor-siddi-vinayaka'].map((vId) => {
                const vendorItems = cartItems.filter((i) => i.vendorId === vId);
                if (vendorItems.length === 0) return null;
                const vendor = storeState.vendors.find((v) => v.id === vId);

                return (
                  <div key={vId} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2 mb-2">
                      <div className="flex items-center space-x-1.5 font-bold text-xs text-slate-900">
                        <ChefHat className="w-4 h-4 text-orange-600" />
                        <span>{vendor?.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Prep ~{vendor?.defaultPrepMin}m
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {vendorItems.map((item) => (
                        <div key={item.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-800">
                              <VegDot veg={item.veg} size="sm" />
                              <span>{item.name}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-slate-900">
                                {formatPaise(item.pricePaise * item.qty)}
                              </span>
                              <div className="flex items-center bg-white border border-slate-200 rounded-lg text-xs font-bold">
                                <button
                                  onClick={() => removeFromCart(item.id)}
                                  className="px-1.5 py-0.5 text-slate-600 hover:text-orange-600"
                                >
                                  -
                                </button>
                                <span className="px-1 text-[11px]">{item.qty}</span>
                                <button
                                  onClick={() => addToCart(item as any, item.vendorId)}
                                  className="px-1.5 py-0.5 text-slate-600 hover:text-orange-600"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Custom note */}
                          <input
                            type="text"
                            placeholder="Add cooking note (e.g. less spicy)..."
                            value={item.note || ''}
                            onChange={(e) => updateItemNote(item.id, e.target.value)}
                            maxLength={120}
                            className="w-full text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none focus:border-orange-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Bill Details */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Item Subtotal</span>
                  <span>{formatPaise(totals.subtotalPaise)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GST (5% Inclusive)</span>
                  <span>{formatPaise(totals.taxPaise)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-2 border-t border-slate-100">
                  <span>Total Amount</span>
                  <span>{formatPaise(totals.totalPaise)}</span>
                </div>
              </div>

              {/* Loyalty Reward Callout */}
              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3 flex items-center space-x-2.5 text-xs text-amber-900">
                <Gift className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  You will earn <strong>{Math.floor(totals.totalPaise / 1000)} REVA Points</strong> on this order!
                </span>
              </div>

              {/* Optional Login Callout */}
              {!customerUser && (
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/80 rounded-2xl p-3 flex items-center justify-between text-xs text-orange-950">
                  <div className="flex items-center space-x-2">
                    <LogIn className="w-4 h-4 text-orange-600 shrink-0" />
                    <div>
                      <strong className="block text-slate-900">Want to save your order history?</strong>
                      <span className="text-[11px] text-slate-600">Log in with your mobile number</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsLoginModalOpen(true)}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs shrink-0 shadow-xs transition-all"
                  >
                    Log In
                  </button>
                </div>
              )}
            </div>

            {/* Footer Pay Button */}
            <div className="p-4 border-t border-slate-200">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isCheckingOut}
                onClick={handleCheckout}
                className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700"
              >
                Pay {formatPaise(totals.totalPaise)} via UPI / Cashfree
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Live Order Status Screen Modal */}
      {activeOrderId && activeSubOrders.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-w-md mx-auto w-full max-h-[90vh] flex flex-col shadow-2xl p-5 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] uppercase font-bold text-orange-600 tracking-wider">
                  Live Kitchen Order
                </span>
                <h3 className="font-extrabold text-slate-900 text-lg">
                  Order #{activeOrderId.slice(-4)}
                </h3>
              </div>
              <button
                onClick={() => setActiveOrderId(null)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-orders Timeline */}
            <div className="py-4 space-y-4">
              {activeSubOrders.map((subOrder) => {
                const isReady = subOrder.status === 'READY';
                const isPreparing = subOrder.status === 'PREPARING';
                const isCollected = subOrder.status === 'COLLECTED';

                return (
                  <div
                    key={subOrder.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isReady
                        ? 'bg-emerald-50 border-emerald-300 shadow-md ring-2 ring-emerald-500/20'
                        : isPreparing
                        ? 'bg-amber-50/50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase">
                          {subOrder.vendorName}
                        </span>
                        <div className="text-xl font-black text-slate-900 tracking-tight">
                          Token: {subOrder.token}
                        </div>
                      </div>
                      <Badge status={subOrder.status} />
                    </div>

                    {/* Notification Callout if READY */}
                    {isReady && (
                      <div className="bg-emerald-600 text-white p-3 rounded-xl mb-3 flex items-center space-x-2 animate-bounce">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span className="text-xs font-bold">
                          {session?.displayName}, your food is ready at the counter!
                        </span>
                      </div>
                    )}

                    {/* Items */}
                    <div className="space-y-1 text-xs border-t border-slate-200/60 pt-2 text-slate-700">
                      {subOrder.items.map((i, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {i.qty}x {i.name}
                          </span>
                          <span className="font-semibold">{formatPaise(i.pricePaise * i.qty)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="md"
              fullWidth
              onClick={() => setActiveOrderId(null)}
            >
              Order More Items
            </Button>
          </div>
        </div>
      )}

      {/* Optional Customer Sign In Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-w-md mx-auto w-full p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  FC
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Customer Sign In</h3>
                  <span className="text-xs text-slate-500">Optional · Order anytime without login</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsLoginModalOpen(false);
                  setLoginError('');
                }}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden focus-within:border-orange-500 focus-within:bg-white transition-all">
                  <span className="px-3 text-xs font-bold text-slate-500 border-r border-slate-200">
                    +91
                  </span>
                  <input
                    type="tel"
                    placeholder="98765 43210"
                    maxLength={10}
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                    required
                    className="w-full px-3 py-2.5 text-sm bg-transparent text-slate-900 font-semibold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Your Full Name <span className="text-slate-400 font-normal">(Used on food tokens)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Manash Bhusal"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  REVA University Student / Staff ID <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. R20EA123"
                  value={loginStudentId}
                  onChange={(e) => setLoginStudentId(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-900 focus:outline-none focus:border-orange-500 focus:bg-white transition-all uppercase"
                />
              </div>

              {loginError && (
                <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-xl border border-rose-100">
                  {loginError}
                </p>
              )}

              <div className="pt-2 space-y-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 shadow-md"
                >
                  Sign In & Link Session
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setIsLoginModalOpen(false);
                    setLoginError('');
                  }}
                  className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 text-center"
                >
                  Continue as Guest (No login needed)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Account & Order History Modal */}
      {isAccountModalOpen && customerUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-w-md mx-auto w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white font-bold text-base shadow-sm">
                  {customerUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">{customerUser.name}</h3>
                  <span className="text-xs text-slate-500 font-mono">+91 {customerUser.phone}</span>
                </div>
              </div>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Active Table</span>
                <strong className="text-slate-900">{session?.tableLabel}</strong>
              </div>
              {customerUser.studentId && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Student/Staff ID</span>
                  <strong className="text-slate-900">{customerUser.studentId}</strong>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Loyalty Status</span>
                <span className="font-bold text-emerald-600 flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Eligible for Points</span>
                </span>
              </div>
            </div>

            {/* Orders placed by this customer */}
            <div>
              <h4 className="font-bold text-slate-900 text-xs mb-2">Orders in this Session</h4>
              {Object.values(storeState.orders).length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center bg-slate-50 rounded-xl">
                  No orders placed yet in this session.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {Object.values(storeState.orders)
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((ord) => (
                      <div
                        key={ord.id}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center"
                      >
                        <div>
                          <div className="font-bold text-slate-900">Order #{ord.id.slice(-4)}</div>
                          <span className="text-[10px] text-slate-500 block">
                            {ord.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900">{formatPaise(ord.totals.totalPaise)}</div>
                          <Badge status={ord.status} />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={handleLogout}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center space-x-1 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
