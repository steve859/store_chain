/**
 * ASR-A2: POS Sync Engine
 *
 * Orchestrates the synchronization of offline transactions to the backend.
 * Features:
 * - Automatic sync when connection is restored
 * - Exponential backoff retry
 * - Batch processing
 * - Conflict detection
 * - Catalog cache refresh
 */

import axiosClient from '../services/axiosClient';
import {
  getPendingTransactions,
  updateTransactionStatus,
  saveCatalogCache,
  setSyncMeta,
  getSyncMeta,
  cleanupSyncedTransactions,
} from './offlineStorage';

// ─── Connection Detection ────────────────────────────────────────────────────

let isOnline = navigator.onLine;
let syncInProgress = false;
let syncListeners = [];

/**
 * Register a listener for sync status changes
 * @param {Function} listener - (event: {type, data}) => void
 * @returns {Function} unsubscribe
 */
export function onSyncEvent(listener) {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener);
  };
}

function emitSyncEvent(type, data = {}) {
  const event = { type, data, timestamp: new Date().toISOString() };
  for (const listener of syncListeners) {
    try {
      listener(event);
    } catch (e) {
      console.error('[SyncEngine] Listener error:', e);
    }
  }
}

/**
 * Check if we have network connectivity (navigator.onLine + API ping)
 */
export async function checkConnectivity() {
  if (!navigator.onLine) {
    isOnline = false;
    return false;
  }

  try {
    // Quick health check to the backend
    await axiosClient.get('/../../health', { timeout: 5000 });
    isOnline = true;
    return true;
  } catch {
    // navigator.onLine may lie, fallback to offline mode
    isOnline = false;
    return false;
  }
}

/**
 * Get current online status
 */
export function getOnlineStatus() {
  return isOnline;
}

// ─── Sync Logic ──────────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

/**
 * Calculate exponential backoff delay
 */
function getRetryDelay(retryCount) {
  return Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), 30000); // Max 30s
}

/**
 * Main sync function: push all pending transactions to server
 * @returns {{ synced: number, failed: number, skipped: number }}
 */
export async function syncPendingTransactions() {
  if (syncInProgress) {
    console.log('[SyncEngine] Sync already in progress, skipping');
    return { synced: 0, failed: 0, skipped: 0, reason: 'already_syncing' };
  }

  syncInProgress = true;
  emitSyncEvent('sync_start');

  try {
    const pending = await getPendingTransactions();

    if (pending.length === 0) {
      emitSyncEvent('sync_complete', { synced: 0, failed: 0, message: 'No pending transactions' });
      return { synced: 0, failed: 0, skipped: 0 };
    }

    // Filter out transactions that have exceeded max retries
    const toSync = [];
    const toSkip = [];

    for (const txn of pending) {
      if (txn.retryCount >= MAX_RETRIES) {
        toSkip.push(txn);
        await updateTransactionStatus(txn.idempotencyKey, 'failed', {
          lastError: `Exceeded max retries (${MAX_RETRIES})`,
        });
      } else {
        toSync.push(txn);
      }
    }

    if (toSync.length === 0) {
      emitSyncEvent('sync_complete', { synced: 0, failed: toSkip.length, message: 'All pending exceeded retry limit' });
      return { synced: 0, failed: toSkip.length, skipped: toSkip.length };
    }

    emitSyncEvent('sync_progress', { total: toSync.length, processed: 0 });

    // Process in batches
    let synced = 0;
    let failed = 0;

    for (let i = 0; i < toSync.length; i += BATCH_SIZE) {
      const batch = toSync.slice(i, i + BATCH_SIZE);

      // Mark as syncing
      for (const txn of batch) {
        await updateTransactionStatus(txn.idempotencyKey, 'syncing');
      }

      try {
        const response = await axiosClient.post('/pos/offline/sync', {
          transactions: batch.map((txn) => ({
            idempotencyKey: txn.idempotencyKey,
            storeId: txn.storeId,
            cashierId: txn.cashierId,
            customerId: txn.customerId,
            paymentMethod: txn.paymentMethod,
            items: txn.items,
            discount: txn.discount,
            tax: txn.tax,
            totalAmount: txn.totalAmount,
            paidAmount: txn.paidAmount,
            createdAt: txn.createdAt,
          })),
        });

        const results = response.data?.results || [];

        for (const result of results) {
          if (result.status === 'created' || result.status === 'duplicate') {
            await updateTransactionStatus(result.idempotencyKey, 'synced', {
              syncedAt: new Date().toISOString(),
              invoiceId: result.invoiceId,
            });
            synced++;
          } else {
            const txn = batch.find((t) => t.idempotencyKey === result.idempotencyKey);
            await updateTransactionStatus(result.idempotencyKey, 'pending', {
              retryCount: (txn?.retryCount || 0) + 1,
              lastError: result.error || 'Unknown error',
            });
            failed++;
          }
        }
      } catch (networkError) {
        // Network error — mark batch as pending for retry
        for (const txn of batch) {
          await updateTransactionStatus(txn.idempotencyKey, 'pending', {
            retryCount: (txn.retryCount || 0) + 1,
            lastError: networkError?.message || 'Network error',
          });
          failed++;
        }

        // Stop syncing if network is down
        isOnline = false;
        emitSyncEvent('sync_error', { error: 'Network lost during sync' });
        break;
      }

      emitSyncEvent('sync_progress', {
        total: toSync.length,
        processed: Math.min(i + BATCH_SIZE, toSync.length),
        synced,
        failed,
      });
    }

    // Cleanup old synced transactions
    try {
      await cleanupSyncedTransactions(7);
    } catch {
      // Non-critical
    }

    const summary = { synced, failed, skipped: toSkip.length };
    emitSyncEvent('sync_complete', summary);
    return summary;
  } catch (error) {
    emitSyncEvent('sync_error', { error: error?.message || 'Unknown sync error' });
    return { synced: 0, failed: 0, skipped: 0, error: error?.message };
  } finally {
    syncInProgress = false;
  }
}

// ─── Catalog Sync ────────────────────────────────────────────────────────────

/**
 * Refresh the offline catalog cache from the backend
 */
export async function refreshCatalogCache() {
  try {
    const response = await axiosClient.get('/pos/offline/catalog');
    const { catalog, generatedAt, count } = response.data;

    if (catalog && Array.isArray(catalog)) {
      await saveCatalogCache(catalog);
      await setSyncMeta('catalog_last_sync', generatedAt);

      emitSyncEvent('catalog_refreshed', { count, generatedAt });
      return { success: true, count };
    }

    return { success: false, error: 'Invalid catalog response' };
  } catch (error) {
    emitSyncEvent('catalog_error', { error: error?.message });
    return { success: false, error: error?.message };
  }
}

/**
 * Check if catalog cache is stale (older than N hours)
 */
export async function isCatalogStale(maxAgeHours = 4) {
  const lastSync = await getSyncMeta('catalog_last_sync');
  if (!lastSync) return true;

  const lastSyncTime = new Date(lastSync).getTime();
  const now = Date.now();
  return now - lastSyncTime > maxAgeHours * 60 * 60 * 1000;
}

// ─── Auto-Sync Setup ─────────────────────────────────────────────────────────

let autoSyncInterval = null;

/**
 * Initialize automatic background sync
 * - Syncs when connection is restored (online event)
 * - Periodically checks for pending transactions
 * - Refreshes catalog when stale
 */
export function initAutoSync(intervalMs = 30000) {
  // Listen for online/offline events
  window.addEventListener('online', async () => {
    console.log('[SyncEngine] Connection restored, starting sync...');
    isOnline = true;
    emitSyncEvent('connection_restored');

    // Small delay to ensure connection is stable
    setTimeout(async () => {
      await syncPendingTransactions();

      // Also refresh catalog if stale
      if (await isCatalogStale()) {
        await refreshCatalogCache();
      }
    }, 1000);
  });

  window.addEventListener('offline', () => {
    console.log('[SyncEngine] Connection lost, switching to offline mode');
    isOnline = false;
    emitSyncEvent('connection_lost');
  });

  // Periodic sync check
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  autoSyncInterval = setInterval(async () => {
    if (isOnline && !syncInProgress) {
      const pending = await getPendingTransactions();
      if (pending.length > 0) {
        console.log(`[SyncEngine] Auto-sync: ${pending.length} pending transactions`);
        await syncPendingTransactions();
      }
    }
  }, intervalMs);

  // Initial catalog cache if online
  if (isOnline) {
    isCatalogStale().then((stale) => {
      if (stale) refreshCatalogCache();
    });
  }

  console.log('[SyncEngine] Auto-sync initialized');
  emitSyncEvent('init', { intervalMs });
}

/**
 * Stop auto-sync
 */
export function stopAutoSync() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
}

export { syncInProgress };
