import { Job } from 'bull';
import { loyaltyService } from '../../../modules/loyalty/loyalty.service';
import { logger } from '../../monitoring/logger';

/**
 * Process loyalty points for an order
 * Called when order is completed
 */
export async function loyaltyProcessPointsProcessor(job: Job) {
  try {
    const { loyaltyId, orderId, amount, items } = job.data;

    logger.info({
      type: 'loyalty_process_points',
      loyaltyId,
      orderId,
      amount,
    });

    const result = await loyaltyService.processPointsForOrder({
      loyaltyId,
      orderId,
      amount,
      items,
    });

    logger.info({
      type: 'loyalty_points_processed',
      orderId,
      pointsEarned: result.pointsEarned,
    });
    return result;
  } catch (error: any) {
    logger.error({
      type: 'loyalty_process_error',
      orderId: job.data.orderId,
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Check and upgrade customer tier monthly
 */
export async function loyaltyCheckTierUpgradeProcessor(job: Job) {
  try {
    const { loyaltyId } = job.data;

    logger.info({
      type: 'loyalty_tier_check',
      loyaltyId,
    });

    await loyaltyService.checkAndUpgradeTier(loyaltyId);

    logger.info({
      type: 'loyalty_tier_check_complete',
      loyaltyId,
    });
  } catch (error: any) {
    logger.error({
      type: 'loyalty_tier_check_error',
      loyaltyId: job.data.loyaltyId,
      errorMessage: error.message,
    });
    throw error;
  }
}

export const loyaltyProcessors = {
  loyaltyProcessPointsProcessor,
  loyaltyCheckTierUpgradeProcessor,
};
