import { enqueueJob, JobType } from '../queues/jobQueue';
import { InventoryUpdateEvent } from './eventBus';
import type { IOServer } from '../../events/socket';

/**
 * Broadcast inventory update to connected clients in store room
 */
export const broadcastInventoryUpdate = (io: IOServer, event: InventoryUpdateEvent): void => {
  const roomName = `store_${event.storeId}`;

  io.to(roomName).emit('inventory_updated', {
    variantId: event.variantId,
    quantity: String(event.quantity),
    reserved: String(event.reserved),
    change: event.change,
    movementType: event.movementType,
    reason: event.reason || '',
    timestamp: event.timestamp.toISOString(),
  });
};

/**
 * Enqueue inventory sync job for cross-store synchronization
 */
export const enqueueInventorySyncJob = async (event: InventoryUpdateEvent): Promise<void> => {
  try {
    await enqueueJob(
      JobType.SYNC_INVENTORY,
      {
        storeId: event.storeId,
        variantId: event.variantId,
        quantity: event.quantity,
        change: event.change,
        movementType: event.movementType,
        timestamp: event.timestamp.toISOString(),
      },
      {
        priority: event.movementType === 'sale' ? 10 : 5,
        delay: 0,
      }
    );
  } catch (error) {
    console.error('Failed to enqueue inventory sync job:', error);
  }
};
