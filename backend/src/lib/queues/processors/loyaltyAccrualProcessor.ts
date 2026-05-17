/**
 * Loyalty Accrual Background Job Processor
 * Processes loyalty point accrual asynchronously after transaction completion
 * Prevents blocking checkout while loyalty updates process
 *
 * Updated to use loyalty_customers (current Prisma schema) instead of legacy loyalty_members.
 */

import { Job } from 'bull';
import { registerProcessor, JobType, enqueueJob } from '../jobQueue';
import prisma from '../../../db/prisma';
import { logger } from '../../monitoring/logger';

export interface LoyaltyAccrualJobData {
  transactionId: string;
  storeId: number;
  loyaltyMemberId: string; // maps to loyalty_customers.id
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

    // Ensure loyalty customer exists
    const loyaltyCustomer = await prisma.loyalty_customers.findUnique({
      where: { id: loyaltyMemberId },
    });

    if (!loyaltyCustomer) {
      logger.warn({
        message: 'Loyalty customer not found',
        loyaltyMemberId,
        transactionId,
      });
      return {
        status: 'skipped',
        reason: 'member_not_found',
        transactionId,
      };
    }

    // Idempotency check — see if we already processed this transaction
    const existing = await prisma.loyalty_transactions.findFirst({
      where: {
        loyalty_customer_id: loyaltyMemberId,
        reference_id: transactionId,
        type: 'earn',
      },
    });

    if (existing) {
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
    await prisma.loyalty_transactions.create({
      data: {
        loyalty_customer_id: loyaltyMemberId,
        type: 'earn',
        points_amount: pointsEarned,
        reference_type: 'order',
        reference_id: transactionId,
        description: `Points earned from transaction ${transactionId}`,
      },
    });

    // Update loyalty customer total points
    const updatedCustomer = await prisma.loyalty_customers.update({
      where: { id: loyaltyMemberId },
      data: {
        points_balance: { increment: pointsEarned },
        lifetime_points_earned: { increment: pointsEarned },
        lifetime_spend: { increment: totalAmount },
        last_purchase_at: new Date(job.data.timestamp),
      },
    });

    logger.info({
      message: 'Loyalty accrual processed successfully',
      transactionId,
      pointsEarned,
      newBalance: Number(updatedCustomer.points_balance),
      jobId: job.id,
      durationMs: Date.now() - startTime,
    });

    // Check if tier upgrade needed
    const tierUpgradeNeeded = shouldUpgradeTier(Number(updatedCustomer.lifetime_spend));

    if (tierUpgradeNeeded) {
      logger.info({
        message: 'Loyalty tier upgrade triggered',
        loyaltyMemberId,
        lifetimeSpend: Number(updatedCustomer.lifetime_spend),
      });

      try {
        await enqueueJob(
          JobType.PROCESS_LOYALTY_TIER_UPGRADE,
          {
            loyaltyMemberId,
            currentPoints: Number(updatedCustomer.points_balance),
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
      totalPoints: Number(updatedCustomer.points_balance),
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
 * Tiers: Bronze (0), Silver (500), Gold (1500), Platinum (3000)
 */
function shouldUpgradeTier(lifetimeSpend: number): boolean {
  const tierThresholds = [0, 500, 1500, 3000];
  return tierThresholds.some(threshold => lifetimeSpend >= threshold);
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

    const customer = await prisma.loyalty_customers.findUnique({
      where: { id: loyaltyMemberId },
    });

    if (!customer) return { status: 'skipped', reason: 'not_found' };

    const spend = Number(customer.lifetime_spend);
    let newTier = 'bronze';
    if (spend >= 3000) newTier = 'platinum';
    else if (spend >= 1500) newTier = 'gold';
    else if (spend >= 500) newTier = 'silver';

    if (newTier === customer.tier) {
      return { status: 'skipped', reason: 'already_at_tier' };
    }

    await prisma.loyalty_customers.update({
      where: { id: loyaltyMemberId },
      data: { tier: newTier },
    });

    logger.info({
      message: 'Loyalty tier upgraded',
      loyaltyMemberId,
      oldTier: customer.tier,
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
    const loyaltyTxn = await prisma.loyalty_transactions.findFirst({
      where: {
        reference_id: transactionId,
        type: 'earn',
      },
    });

    if (!loyaltyTxn) {
      logger.info({
        message: 'No loyalty accrual to reverse',
        transactionId,
      });
      return;
    }

    // Reverse the points
    await prisma.loyalty_customers.update({
      where: { id: loyaltyTxn.loyalty_customer_id },
      data: {
        points_balance: { decrement: Number(loyaltyTxn.points_amount) },
      },
    });

    // Delete the earn transaction (or mark it)
    await prisma.loyalty_transactions.create({
      data: {
        loyalty_customer_id: loyaltyTxn.loyalty_customer_id,
        type: 'adjustment',
        points_amount: -Number(loyaltyTxn.points_amount),
        reference_type: 'reversal',
        reference_id: transactionId,
        description: `Reversed accrual for failed transaction ${transactionId}`,
      },
    });

    logger.info({
      message: 'Loyalty accrual reversed',
      transactionId,
      pointsReversed: Number(loyaltyTxn.points_amount),
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
