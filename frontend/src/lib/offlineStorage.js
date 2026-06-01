/**
 * ASR-A2: POS Offline Storage Layer
 *
 * IndexedDB-based local database for offline POS operations.
 * Stores: pending transactions, product catalog cache, sync metadata.
 *
 * Uses the browser's native IndexedDB API (no external dependencies).
 */

const DB_NAME = 'pos_offline_db';
const DB_VERSION = 1;

// Store names
const STORES = {
  PENDING_TRANSACTIONS: 'pending_transactions',
  CATALOG_CACHE: 'catalog_cache',
  SYNC_META: 'sync_meta',
};

/**
 * Open (or create) the IndexedDB database
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Pending transactions outbox
      if (!db.objectStoreNames.contains(STORES.PENDING_TRANSACTIONS)) {
        const txnStore = db.createObjectStore(STORES.PENDING_TRANSACTIONS, {
          keyPath: 'idempotencyKey',
        });
        txnStore.createIndex('status', 'status', { unique: false });
        txnStore.createIndex('createdAt', 'createdAt', { unique: false });
        txnStore.createIndex('storeId', 'storeId', { unique: false });
      }

      // Product catalog cache
      if (!db.objectStoreNames.contains(STORES.CATALOG_CACHE)) {
        const catalogStore = db.createObjectStore(STORES.CATALOG_CACHE, {
          keyPath: 'variantId',
        });
        catalogStore.createIndex('barcode', 'barcode', { unique: false });
        catalogStore.createIndex('category', 'category', { unique: false });
      }

      // Sync metadata (last sync time, etc.)
      if (!db.objectStoreNames.contains(STORES.SYNC_META)) {
        db.createObjectStore(STORES.SYNC_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic helper: run a transaction on a store
 */
async function withStore(storeName, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(storeName, mode);
    const store = txn.objectStore(storeName);
    const result = callback(store);

    txn.oncomplete = () => {
      db.close();
      resolve(result);
    };
    txn.onerror = () => {
      db.close();
      reject(txn.error);
    };
  });
}

// ─── Transaction Queue (Outbox Pattern) ──────────────────────────────────────

/**
 * Generate a unique idempotency key
 */
export function generateIdempotencyKey() {
  return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2)}`;
}

/**
 * Save a transaction to the offline queue
 * Status: 'pending' | 'syncing' | 'synced' | 'failed'
 */
export async function saveOfflineTransaction(transaction) {
  const entry = {
    idempotencyKey: transaction.idempotencyKey || generateIdempotencyKey(),
    storeId: transaction.storeId,
    cashierId: transaction.cashierId,
    customerId: transaction.customerId || null,
    paymentMethod: transaction.paymentMethod,
    items: transaction.items,
    discount: transaction.discount || 0,
    tax: transaction.tax || 0,
    totalAmount: transaction.totalAmount,
    paidAmount: transaction.paidAmount,
    createdAt: transaction.createdAt || new Date().toISOString(),
    status: 'pending',
    retryCount: 0,
    lastError: null,
    syncedAt: null,
    invoiceId: null,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.PENDING_TRANSACTIONS, 'readwrite');
    const store = txn.objectStore(STORES.PENDING_TRANSACTIONS);
    store.put(entry);

    txn.oncomplete = () => {
      db.close();
      resolve(entry);
    };
    txn.onerror = () => {
      db.close();
      reject(txn.error);
    };
  });
}

/**
 * Get all pending transactions (not yet synced)
 */
export async function getPendingTransactions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.PENDING_TRANSACTIONS, 'readonly');
    const store = txn.objectStore(STORES.PENDING_TRANSACTIONS);
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Get all transactions (any status)
 */
export async function getAllTransactions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.PENDING_TRANSACTIONS, 'readonly');
    const store = txn.objectStore(STORES.PENDING_TRANSACTIONS);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Update transaction status after sync attempt
 */
export async function updateTransactionStatus(idempotencyKey, status, extra = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.PENDING_TRANSACTIONS, 'readwrite');
    const store = txn.objectStore(STORES.PENDING_TRANSACTIONS);
    const getReq = store.get(idempotencyKey);

    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (!entry) {
        txn.abort();
        reject(new Error('Transaction not found'));
        return;
      }

      const updated = {
        ...entry,
        status,
        ...extra,
      };
      store.put(updated);
    };

    txn.oncomplete = () => {
      db.close();
      resolve(true);
    };
    txn.onerror = () => {
      db.close();
      reject(txn.error);
    };
  });
}

/**
 * Remove synced transactions older than N days (cleanup)
 */
export async function cleanupSyncedTransactions(daysOld = 7) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.PENDING_TRANSACTIONS, 'readwrite');
    const store = txn.objectStore(STORES.PENDING_TRANSACTIONS);
    const request = store.openCursor();
    let deleted = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (entry.status === 'synced' && entry.syncedAt && entry.syncedAt < cutoff) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      }
    };

    txn.oncomplete = () => {
      db.close();
      resolve(deleted);
    };
    txn.onerror = () => {
      db.close();
      reject(txn.error);
    };
  });
}

// ─── Catalog Cache ───────────────────────────────────────────────────────────

/**
 * Save catalog snapshot to IndexedDB
 */
export async function saveCatalogCache(catalogItems) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.CATALOG_CACHE, 'readwrite');
    const store = txn.objectStore(STORES.CATALOG_CACHE);

    // Clear old cache
    store.clear();

    // Add all items
    for (const item of catalogItems) {
      store.put(item);
    }

    txn.oncomplete = () => {
      db.close();
      resolve(catalogItems.length);
    };
    txn.onerror = () => {
      db.close();
      reject(txn.error);
    };
  });
}

/**
 * Get cached catalog
 */
export async function getCachedCatalog() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.CATALOG_CACHE, 'readonly');
    const store = txn.objectStore(STORES.CATALOG_CACHE);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Search cached catalog by barcode
 */
export async function searchCatalogByBarcode(barcode) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.CATALOG_CACHE, 'readonly');
    const store = txn.objectStore(STORES.CATALOG_CACHE);
    const index = store.index('barcode');
    const request = index.getAll(barcode);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// ─── Sync Metadata ───────────────────────────────────────────────────────────

/**
 * Save sync metadata (e.g., last sync time)
 */
export async function setSyncMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.SYNC_META, 'readwrite');
    const store = txn.objectStore(STORES.SYNC_META);
    store.put({ key, value, updatedAt: new Date().toISOString() });

    txn.oncomplete = () => {
      db.close();
      resolve(true);
    };
    txn.onerror = () => {
      db.close();
      reject(txn.error);
    };
  });
}

/**
 * Get sync metadata
 */
export async function getSyncMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORES.SYNC_META, 'readonly');
    const store = txn.objectStore(STORES.SYNC_META);
    const request = store.get(key);

    request.onsuccess = () => {
      db.close();
      resolve(request.result?.value ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export { STORES, DB_NAME };
