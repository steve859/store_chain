/**
 * ASR-A2: Offline-aware POS Sales Service
 *
 * Wraps the existing posSales.js with offline-first logic:
 * 1. Try online checkout first
 * 2. If offline, save to IndexedDB queue
 * 3. Auto-sync when connection is restored
 */

import axiosClient from './axiosClient';
import {
  saveOfflineTransaction,
  generateIdempotencyKey,
  getPendingTransactions,
  getCachedCatalog,
} from '../lib/offlineStorage';
import { getOnlineStatus, syncPendingTransactions } from '../lib/syncEngine';

/**
 * List POS catalog — offline-first
 * Tries backend first, falls back to IndexedDB cache
 */
export async function listPosCatalogOffline({ q = '', barcode = '', take = 200, skip = 0 } = {}) {
  const isOnline = getOnlineStatus();

  if (isOnline) {
    try {
      const res = await axiosClient.get('/products/catalog', {
        params: {
          q: q || undefined,
          barcode: barcode || undefined,
          take,
          skip,
        },
        timeout: 5000,
      });
      return res.data;
    } catch (error) {
      // Network error — fall through to cached catalog
      console.warn('[POS Offline] Online catalog failed, using cache:', error?.message);
    }
  }

  // Offline or network error: use cached catalog
  const cached = await getCachedCatalog();

  if (cached.length === 0) {
    return { items: [], total: 0, _source: 'offline_empty' };
  }

  // Apply client-side filtering
  let filtered = cached;

  if (q) {
    const query = q.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.name?.toLowerCase().includes(query) ||
        item.sku?.toLowerCase().includes(query) ||
        item.barcode?.includes(q)
    );
  }

  if (barcode) {
    filtered = filtered.filter((item) => item.barcode === barcode);
  }

  // Map to the same shape as the backend response
  const mapped = filtered.slice(skip, skip + take).map((item) => ({
    variant: {
      id: item.variantId,
      variant_code: item.variantCode,
      barcode: item.barcode,
      price: item.price,
      name: item.name?.split(' - ').slice(1).join(' - ') || '',
    },
    product: {
      name: item.name?.split(' - ')[0] || item.name,
      sku: item.sku,
      category: item.category,
      unit: item.unit,
    },
    inventory: {
      quantity: item.stock,
    },
  }));

  return {
    items: mapped,
    total: filtered.length,
    _source: 'offline_cache',
  };
}

/**
 * Checkout sale — offline-first
 *
 * If online: send to backend directly
 * If offline: queue in IndexedDB for later sync
 *
 * @returns {{ invoice?, offline?, idempotencyKey? }}
 */
export async function checkoutSaleOffline({
  paymentMethod,
  paidAmount = null,
  totalAmount = null,
  discount = null,
  items = [],
} = {}) {
  const isOnline = getOnlineStatus();
  const storeId = Number(localStorage.getItem('activeStoreId'));
  const idempotencyKey = generateIdempotencyKey();

  if (isOnline) {
    try {
      // Try online checkout
      const res = await axiosClient.post(
        '/pos/checkout',
        {
          paymentMethod,
          paidAmount,
          totalAmount,
          discount,
          items,
        },
        { timeout: 10000 }
      );
      return {
        ...res.data,
        _mode: 'online',
        idempotencyKey,
      };
    } catch (error) {
      // If it's a network error (not a business error), queue offline
      if (!error?.response) {
        console.warn('[POS Offline] Network error during checkout, queuing offline');
        // Fall through to offline logic below
      } else {
        // Business error (400, 409, etc.) — throw as-is
        throw error;
      }
    }
  }

  // Offline mode: save to local queue
  const offlineTxn = await saveOfflineTransaction({
    idempotencyKey,
    storeId,
    cashierId: Number(
      JSON.parse(localStorage.getItem('user') || '{}')?.userId || 0
    ),
    customerId: null,
    paymentMethod,
    items,
    discount: discount || 0,
    tax: 0,
    totalAmount: totalAmount || 0,
    paidAmount: paidAmount || totalAmount || 0,
    createdAt: new Date().toISOString(),
  });

  return {
    _mode: 'offline',
    idempotencyKey: offlineTxn.idempotencyKey,
    offlineTransaction: offlineTxn,
    message: 'Giao dịch đã được lưu offline. Sẽ tự động đồng bộ khi có kết nối.',
  };
}

/**
 * Get count of pending offline transactions
 */
export async function getPendingCount() {
  try {
    const pending = await getPendingTransactions();
    return pending.length;
  } catch {
    return 0;
  }
}

/**
 * Force sync now
 */
export async function forceSyncNow() {
  return syncPendingTransactions();
}
