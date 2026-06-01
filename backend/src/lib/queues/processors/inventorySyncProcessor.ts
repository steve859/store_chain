import { Job } from 'bull';
import { registerProcessor, JobType } from '../jobQueue';
import prisma from '../../../db/prisma';
import { invalidateCatalogCache } from '../../cache/catalog';
import { logger } from '../../monitoring/logger';

interface InventorySyncJobData {
  storeId: number;
  variantId: number;
  quantity: number;
  change: number;
  movementType: string;
  timestamp: string;
}

/**
 * Process inventory sync jobs
 * - Propagate changes to related stores (if applicable)
 * - Update read replicas cache
 * - Log synchronization events
 */
const processInventorySync = async (job: Job<InventorySyncJobData>): Promise<void> => {
  const { storeId, variantId, quantity, change, movementType, timestamp } = job.data;

  try {
    logger.info({
      message: 'Processing inventory sync job',
      jobId: job.id,
      storeId,
      variantId,
      change,
      movementType,
    });

    // Verify inventory record exists and is consistent
    const inventory = await prisma.inventories.findFirst({
      where: { store_id: storeId, variant_id: variantId },
    });

    if (!inventory) {
      logger.warn({
        message: 'Inventory record not found during sync',
        storeId,
        variantId,
      });
      return;
    }

    // For high-impact movements, invalidate catalog cache
    if (movementType === 'sale' || movementType === 'return' || movementType === 'adjustment') {
      await invalidateCatalogCache(storeId);
    }

    // Log sync completion
    logger.info({
      message: 'Inventory sync completed',
      jobId: job.id,
      storeId,
      variantId,
      currentQuantity: inventory.quantity?.toString() || '0',
    });
  } catch (error) {
    logger.error({
      message: 'Inventory sync job failed',
      jobId: job.id,
      storeId,
      variantId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

// Register the processor
registerProcessor<InventorySyncJobData>(
  JobType.SYNC_INVENTORY,
  processInventorySync,
  10 // Allow up to 10 concurrent sync jobs
);
