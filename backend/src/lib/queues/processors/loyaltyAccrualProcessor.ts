/**
 * Loyalty Accrual Background Job Processor
 * Processes loyalty point accrual asynchronously after transaction completion
 * Prevents blocking checkout while loyalty updates process
 */

import { Job } from 'bull';
import { registerProcessor, JobType, enqueueJob } from '../jobQueue';
import prisma from '../../../db/prisma';
import { logger } from '../monitoring/logger';

export interface LoyaltyAccrualJobData {
  transactionId: string;
  storeId: number;
  loyaltyMemberId: string;
  totalAmount: number;
  itemCount: number;
  timestamp: number;
}

/**
 * Process loyalty point accrual
 * Called asynchronously after transaction completes
 */
export async function processLoyaltyAccrual(job: Job<LoyaltyAccrualJobData>) {
  const { transactionId, storeId, loyaltyMemberId, totalAmount, itemCount } = job.data;
  const startTime = Date.now();

  try {
    logger.info({
      message: 'Processing loyalty accrual',
      transactionId,
      loyaltyMemberId,
      totalAmount,
      jobId: job.id,
    });

    // Calculate points: 1 point per dollar spent (configurable)
    const pointsPerDollar = parseFloat(process.env.LOYALTY_POINTS_PER_DOLLAR || '1');
    const pointsEarned = Math.floor(totalAmount * pointsPerDollar);

    // Ensure loyalty member exists
    const loyaltyMember = await prisma.loyalty_members.findUnique({
      where: { id: loyaltyMemberId },
    });

    if (!loyaltyMember) {
      logger.warn({
        message: 'Loyalty member not found',
        loyaltyMemberId,
        transactionId,
      });
      return {
        status: 'skipped',
        reason: 'member_not_found',
        transactionId,
      };
    }

    // Update loyalty points (idempotent via transactionId)
    const transaction = await prisma.loyalty_transactions.findUnique({
      where: { transaction_id: transactionId },
      select: { id: true },
    });

    if (transaction) {
      logger.warn({
        message: 'Loyalty accrual already processed',
        transactionId,
      });
      return {
        status: 'skipped',
        reason: 'already_processed',
        transactionId,
      };
    }

    // Create loyalty transaction record
    const accrualRecord = await prisma.loyalty_transactions.create({
      data: {
        loyalty_member_id: loyaltyMemberId,
        store_id: storeId,
        transaction_id: transactionId,
        transaction_type: 'purchase',
        points_earned: pointsEarned,
        points_redeemed: 0,
        transaction_date: new Date(job.data.timestamp),
      },
    });

    // Update loyalty member total points
    const updatedMember = await prisma.loyalty_members.update({
      where: { id: loyaltyMemberId },
      data: {
        total_points: {
          increment: pointsEarned,
        },
        last_purchase_date: new Date(job.data.timestamp),
      },
    });

    logger.info({
      message: 'Loyalty accrual processed successfully',
      transactionId,
      pointsEarned,
      newTotal: updatedMember.total_points,
      jobId: job.id,
      durationMs: Date.now() - startTime,
    });

    // Check if tier upgrade needed
    const tierUpgradeNeeded = shouldUpgradeTier(updatedMember.total_points);

    if (tierUpgradeNeeded) {
      logger.info({
        message: 'Loyalty tier upgrade triggered',
        loyaltyMemberId,
        currentPoints: updatedMember.total_points,
      });

      // Enqueue tier upgrade as separate async job
      try {
        await enqueueJob(
          JobType.PROCESS_LOYALTY_TIER_UPGRADE,
          {
            loyaltyMemberId,
            currentPoints: updatedMember.total_points,
          },
          { priority: 5, delay: 2000 }
        );
      } catch (err) {
        logger.warn({
          message: 'Failed to enqueue tier upgrade job',
          loyaltyMemberId,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      status: 'success',
      transactionId,
      pointsEarned,
      totalPoints: updatedMember.total_points,
    };
  } catch (error: any) {
    logger.error({
      message: 'Loyalty accrual job failed',
      transactionId,
      jobId: job.id,
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Check if member should be upgraded to next tier
 * Tiers: Bronze (0), Silver (500), Gold (2000), Platinum (5000)
 */
function shouldUpgradeTier(points: number): boolean {
  const tierThresholds = [0, 500, 2000, 5000];
  return tierThresholds.some(threshold => points >= threshold);
}

/**
 * Loyalty tier upgrade job data
 */
export interface LoyaltyTierUpgradeJobData {
  loyaltyMemberId: string;
  currentPoints: number;
}

/**
 * Process loyalty tier upgrade
 */
export async function processLoyaltyTierUpgrade(job: Job<LoyaltyTierUpgradeJobData>) {
  const { loyaltyMemberId, currentPoints } = job.data;

  try {
    logger.info({
      message: 'Processing loyalty tier upgrade',
      loyaltyMemberId,
      currentPoints,
      jobId: job.id,
    });

    // Determine new tier
    let newTier = 'bronze';
    if (currentPoints >= 5000) newTier = 'platinum';
    else if (currentPoints >= 2000) newTier = 'gold';
    else if (currentPoints >= 500) newTier = 'silver';

    // Update member tier
    const updated = await prisma.loyalty_members.update({
      where: { id: loyaltyMemberId },
      data: {
        tier: newTier,
      },
    });

    logger.info({
      message: 'Loyalty tier upgraded',
      loyaltyMemberId,
      oldTier: updated.tier,
      newTier,
      jobId: job.id,
    });

    return {
      status: 'success',
      loyaltyMemberId,
      newTier,
    };
  } catch (error: any) {
    logger.error({
      message: 'Loyalty tier upgrade job failed',
      loyaltyMemberId,
      jobId: job.id,
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Compensation transaction for failed checkout
 * Reverses loyalty accrual if checkout transaction fails
 */
export async function reverseLoyaltyAccrual(transactionId: string): Promise<void> {
  try {
    const loyaltyTxn = await prisma.loyalty_transactions.findUnique({
      where: { transaction_id: transactionId },
    });

    if (!loyaltyTxn) {
      logger.info({
        message: 'No loyalty accrual to reverse',
        transactionId,
      });
      return;
    }

    // Reverse the points
    await prisma.loyalty_members.update({
      where: { id: loyaltyTxn.loyalty_member_id },
      data: {
        total_points: {
          decrement: loyaltyTxn.points_earned,
        },
      },
    });

    // Mark transaction as reversed
    await prisma.loyalty_transactions.update({
      where: { id: loyaltyTxn.id },
      data: {
        points_earned: 0,
        notes: 'Reversed due to transaction failure',
      },
    });

    logger.info({
      message: 'Loyalty accrual reversed',
      transactionId,
      pointsReversed: loyaltyTxn.points_earned,
    });
  } catch (error: any) {
    logger.error({
      message: 'Failed to reverse loyalty accrual',
      transactionId,
      errorMessage: error.message,
    });
  }
}

/**
 * Register both loyalty processors
 */
export function registerLoyaltyProcessors(): void {
  // Register accrual processor (5 concurrent workers)
  try {
    registerProcessor<LoyaltyAccrualJobData>(
      JobType.PROCESS_LOYALTY_ACCRUAL,
      processLoyaltyAccrual,
      5
    );
    logger.info({
      message: 'Registered loyalty accrual processor',
    });
  } catch (err) {
    logger.warn({
      message: 'Loyalty accrual processor already registered',
    });
  }

  // Register tier upgrade processor (3 concurrent workers)
  try {
    registerProcessor<LoyaltyTierUpgradeJobData>(
      JobType.PROCESS_LOYALTY_TIER_UPGRADE,
      processLoyaltyTierUpgrade,
      3
    );
    logger.info({
      message: 'Registered loyalty tier upgrade processor',
    });
  } catch (err) {
    logger.warn({
      message: 'Loyalty tier upgrade processor already registered',
    });
  }
}
