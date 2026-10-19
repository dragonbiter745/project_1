import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  CreateCheckoutSchema,
  computeOrderTotals,
  getIstDateKey,
  formatVendorToken,
  type GlobalConfig,
  type VendorMenu,
  type VendorAvailability,
} from '@foodcourt/shared';

import { db } from '../db';

export const createCheckout = onCall(
  {
    region: 'asia-south1',
    cors: true,
  },
  async (request) => {
    const parseResult = CreateCheckoutSchema.safeParse(request.data);
    if (!parseResult.success) {
      throw new HttpsError('invalid-argument', parseResult.error.message);
    }

    const { sessionId, checkoutKey, items, customerPhone } = parseResult.data;
    const uid = request.auth?.uid || (sessionId ? `guest_${sessionId}` : `guest_${Date.now()}`);

    // 1. Check idempotency using checkoutKey
    const existingOrderSnap = await db
      .collection('orders')
      .where('checkoutKey', '==', checkoutKey)
      .limit(1)
      .get();

    if (!existingOrderSnap.empty) {
      const order = existingOrderSnap.docs[0].data();
      return {
        orderId: existingOrderSnap.docs[0].id,
        paymentSessionId: order.payment?.paymentSessionId,
        status: order.status,
      };
    }

    // 2. Validate or initialize session
    let sessionData: any;
    if (sessionId) {
      const sessionDoc = await db.collection('sessions').doc(sessionId).get();
      if (sessionDoc.exists) {
        sessionData = sessionDoc.data();
      }
    }
    if (!sessionData) {
      sessionData = {
        tableId: 'tbl-1',
        tableLabel: 'Table T14',
        displayName: 'Campus Diner',
        dailyNo: 1,
      };
      const sessId = sessionId || `sess_${Date.now()}`;
      await db.collection('sessions').doc(sessId).set({
        uid,
        ...sessionData,
        dateKey: getIstDateKey(),
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 3 * 3600 * 1000,
      }, { merge: true });
    }

    // 3. Load global config
    const configDoc = await db.collection('config').doc('global').get();
    const config: GlobalConfig = configDoc.exists
      ? (configDoc.data() as GlobalConfig)
      : {
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
        };

    if (config.flags.maintenance) {
      throw new HttpsError('unavailable', 'FoodCourt ordering is temporarily paused for maintenance.');
    }

    // 4. Server-authoritative price & availability verification from menus/*
    const uniqueVendorIds = [...new Set(items.map((i) => i.vendorId))];
    const vendorMenus: Record<string, VendorMenu> = {};
    const vendorAvailabilities: Record<string, VendorAvailability> = {};

    for (const vId of uniqueVendorIds) {
      const menuDoc = await db.collection('menus').doc(vId).get();
      if (!menuDoc.exists) {
        throw new HttpsError('failed-precondition', `Vendor ${vId} menu is unavailable.`);
      }
      vendorMenus[vId] = menuDoc.data() as VendorMenu;

      const availDoc = await db.collection('availability').doc(vId).get();
      vendorAvailabilities[vId] = availDoc.exists
        ? (availDoc.data() as VendorAvailability)
        : { vendorId: vId, unavailable: {}, updatedAt: 0 };
    }

    // Recompute items using verified database prices
    const verifiedItems = items.map((cartItem) => {
      const menu = vendorMenus[cartItem.vendorId];
      const availability = vendorAvailabilities[cartItem.vendorId];

      if (availability?.unavailable[cartItem.itemId]) {
        throw new HttpsError(
          'failed-precondition',
          `"${cartItem.name}" is currently out of stock. Please adjust your cart.`
        );
      }

      let foundItem = null;
      for (const cat of menu.categories) {
        const item = cat.items.find((i) => i.id === cartItem.itemId);
        if (item) {
          foundItem = item;
          break;
        }
      }

      if (!foundItem) {
        throw new HttpsError('not-found', `Item "${cartItem.name}" was not found in the live menu.`);
      }

      return {
        itemId: foundItem.id,
        vendorId: cartItem.vendorId,
        name: foundItem.name,
        pricePaise: foundItem.pricePaise, // Server-authoritative integer paise
        veg: foundItem.veg,
        qty: cartItem.qty,
        note: cartItem.note || null,
      };
    });

    // 5. Compute authoritative order totals
    const totals = computeOrderTotals({
      items: verifiedItems,
      config,
    });

    const now = Date.now();
    const dateKey = getIstDateKey();
    const orderRef = db.collection('orders').doc();

    // Check if payments are enabled
    const paymentsEnabled = config.flags.paymentsEnabled;

    if (!paymentsEnabled) {
      // Pay at counter mode: Directly mark PAID and create subOrders immediately
      await db.runTransaction(async (transaction) => {
        transaction.set(orderRef, {
          sessionId,
          uid,
          customerPhone: customerPhone || null,
          tableId: sessionData.tableId,
          tableLabel: sessionData.tableLabel,
          dateKey,
          items: verifiedItems,
          totals,
          payment: {
            status: 'SUCCESS',
            paidAt: now,
            method: 'COUNTER_PILOT',
          },
          status: 'PAID',
          checkoutKey,
          createdAt: now,
        });

        // Group by vendor and create subOrders
        for (const vId of uniqueVendorIds) {
          const vendorItems = verifiedItems.filter((i) => i.vendorId === vId);
          const vendorSubtotalPaise = vendorItems.reduce((acc, i) => acc + i.pricePaise * i.qty, 0);

          const vendorCounterRef = db.collection('counters').doc(`${dateKey}_${vId}`);
          const vendorCounterDoc = await transaction.get(vendorCounterRef);
          const currentSeq = vendorCounterDoc.exists ? (vendorCounterDoc.data()?.count || 0) : 0;
          const nextSeq = currentSeq + 1;

          transaction.set(vendorCounterRef, { count: nextSeq }, { merge: true });

          const vendorDoc = await db.collection('vendors').doc(vId).get();
          const vendorCode = vendorDoc.data()?.code || 'RM';
          const token = formatVendorToken(vendorCode, nextSeq);

          const subOrderRef = db.collection('subOrders').doc();
          transaction.set(subOrderRef, {
            orderId: orderRef.id,
            vendorId: vId,
            vendorName: vendorDoc.data()?.name || '',
            token,
            tableLabel: sessionData.tableLabel,
            customerDisplay: `${sessionData.displayName} · #${String(sessionData.dailyNo).padStart(3, '0')}`,
            items: vendorItems,
            subtotalPaise: vendorSubtotalPaise,
            status: 'NEW',
            ts: {
              placed: now,
            },
          });
        }
      });

      return {
        orderId: orderRef.id,
        status: 'PAID',
        mode: 'COUNTER_PILOT',
      };
    }

    // Cashfree PG flow: Create order in PENDING_PAYMENT
    await orderRef.set({
      sessionId,
      uid,
      customerPhone: customerPhone || null,
      tableId: sessionData.tableId,
      tableLabel: sessionData.tableLabel,
      dateKey,
      items: verifiedItems,
      totals,
      payment: {
        status: 'PENDING',
      },
      status: 'PENDING_PAYMENT',
      checkoutKey,
      createdAt: now,
    });

    const cashfreeAppId = process.env.CASHFREE_APP_ID;
    const cashfreeSecret = process.env.CASHFREE_SECRET_KEY;
    const cashfreeEnv = process.env.CASHFREE_ENV || 'SANDBOX';
    const baseUrl = cashfreeEnv === 'PRODUCTION' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';

    let paymentSessionId = `session_${orderRef.id}_${now}`;
    let cfOrderId = `cf_${orderRef.id}`;

    if (cashfreeAppId && cashfreeSecret) {
      try {
        const cfRes = await fetch(`${baseUrl}/pg/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': cashfreeAppId,
            'x-client-secret': cashfreeSecret,
            'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
          },
          body: JSON.stringify({
            order_id: orderRef.id,
            order_amount: totals.totalPaise / 100,
            order_currency: 'INR',
            customer_details: {
              customer_id: uid,
              customer_phone: customerPhone || '9999999999',
              customer_name: sessionData.displayName || 'Campus Diner',
            },
            order_meta: {
              return_url: `https://reva-nest-foodcourt.web.app/?order_id=${orderRef.id}`,
              notify_url: 'https://asia-south1-reva-nest-foodcourt.cloudfunctions.net/cashfreeWebhook',
            },
          }),
        });

        const cfData: any = await cfRes.json();
        if (cfRes.ok && cfData.payment_session_id) {
          paymentSessionId = cfData.payment_session_id;
          cfOrderId = cfData.cf_order_id;
        } else {
          console.error('Cashfree order creation error:', cfData);
        }
      } catch (err) {
        console.error('Cashfree API request error:', err);
      }
    }

    await orderRef.update({
      'payment.paymentSessionId': paymentSessionId,
      'payment.cfOrderId': cfOrderId,
    });

    return {
      orderId: orderRef.id,
      paymentSessionId,
      status: 'PENDING_PAYMENT',
      totalPaise: totals.totalPaise,
    };
  }
);
