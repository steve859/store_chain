import prisma from '../../db/prisma';
import { enqueueJob, JobType } from '../../lib/queues/jobQueue';
import { logger } from '../../lib/monitoring/logger';
import { addDays } from 'date-fns';
import { privacyUtils } from '../../utils/privacy';

/**
 * Loyalty Program Service
 * Handles points earning, redemption, tier management
 */

export interface LoyaltyCustomer {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  pointsBalance: number;
  lifetimeSpend: number;
}

const POINTS_PER_DOLLAR = {
  bronze: 1,
  silver: 1.2,
  gold: 1.5,
  platinum: 2,
};

const CATEGORY_MULTIPLIERS = {
  pharmacy: 2,
  organics: 1.5,
  alcohol: 0.5,
  default: 1,
};

const TIER_THRESHOLDS = {
  bronze: { minSpend: 0 },
  silver: { minSpend: 500 },
  gold: { minSpend: 1500 },
  platinum: { minSpend: 3000 },
};

const REWARD_CATALOG = {
  discount_5: {
    points: 250,
    value: 5.0,
    type: 'discount',
    description: '$5 off any purchase',
  },
  discount_10: {
    points: 500,
    value: 10.0,
    type: 'discount',
    description: '$10 off any purchase',
  },
  free_item: {
    points: 750,
    value: 15.0,
    type: 'free_item',
    description: 'Free item (up to $15 value)',
  },
  free_shipping: {
    points: 100,
    value: 5.0,
    type: 'free_shipping',
    description: 'Free shipping',
  },
};

function generateRedemptionCode(rewardId: string): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LOYALTY-${rewardId.toUpperCase()}-${random}`;
}

/**
 * Enroll customer in loyalty program
 */
export async function enrollCustomer(
  storeId: number,
  data: {
    email: string;
    phone?: string;
    firstName: string;
    lastName: string;
  }
) {
  const encryptedEmail = privacyUtils.encryptDeterministic(data.email);
  const encryptedPhone = privacyUtils.encryptDeterministic(data.phone);
  const encryptedFirstName = privacyUtils.encryptDeterministic(data.firstName);
  const encryptedLastName = privacyUtils.encryptDeterministic(data.lastName);

  // Check if already enrolled
  const existing = await prisma.loyalty_customers.findFirst({
    where: {
      email: encryptedEmail,
      store_id: storeId,
    },
  });

  if (existing) {
    throw new Error('Customer already enrolled in loyalty program');
  }

  const customer = await prisma.loyalty_customers.create({
    data: {
      store_id: storeId,
      email: encryptedEmail as string,
      phone: encryptedPhone,
      first_name: encryptedFirstName as string,
      last_name: encryptedLastName as string,
      tier: 'bronze',
      points_balance: 0,
    },
  });

  // Award first purchase bonus
  await prisma.loyalty_transactions.create({
    data: {
      loyalty_customer_id: customer.id,
      type: 'bonus',
      points_amount: 100,
      reference_type: 'manual',
      description: 'Welcome bonus - First purchase',
    },
  });

  // Update points balance
  await prisma.loyalty_customers.update({
    where: { id: customer.id },
    data: {
      points_balance: { increment: 100 },
      lifetime_points_earned: { increment: 100 },
    },
  });

  const decryptedEmail = privacyUtils.decrypt(customer.email);
  const decryptedFirstName = privacyUtils.decrypt(customer.first_name);
  const decryptedLastName = privacyUtils.decrypt(customer.last_name);

  return {
    id: customer.id,
    email: privacyUtils.maskEmail(decryptedEmail),
    firstName: privacyUtils.maskName(decryptedFirstName),
    lastName: privacyUtils.maskName(decryptedLastName),
    tier: customer.tier,
    pointsBalance: 100,
    lifetimeSpend: 0,
    enrolledAt: customer.created_at,
  };
}

/**
 * Get customer loyalty balance
 */
export async function getBalance(loyaltyId: string) {
  const customer = await prisma.loyalty_customers.findUnique({
    where: { id: loyaltyId },
  });

  if (!customer) {
    throw new Error('Loyalty customer not found');
  }

  const nextTierThreshold = TIER_THRESHOLDS[customer.tier as keyof typeof TIER_THRESHOLDS];
  const nextTier = customer.tier === 'platinum' ? null : 
    Object.entries(TIER_THRESHOLDS).find(([_, t]) => t.minSpend > nextTierThreshold.minSpend)?.[0];

  const decryptedEmail = privacyUtils.decrypt(customer.email);
  const decryptedFirstName = privacyUtils.decrypt(customer.first_name);
  const decryptedLastName = privacyUtils.decrypt(customer.last_name);

  return {
    loyaltyId: customer.id,
    email: privacyUtils.maskEmail(decryptedEmail),
    firstName: privacyUtils.maskName(decryptedFirstName),
    lastName: privacyUtils.maskName(decryptedLastName),
    points: Number(customer.points_balance),
    tier: customer.tier,
    totalSpend: Number(customer.lifetime_spend),
    nextTierAt: nextTier ? TIER_THRESHOLDS[nextTier as keyof typeof TIER_THRESHOLDS].minSpend : null,
    nextTier,
    memberSince: customer.created_at,
  };
}

/**
 * Process points for order
 */
export async function processPointsForOrder(data: {
  loyaltyId: string;
  orderId: string;
  amount: number;
  items: Array<{ sku: string; category?: string }>;
}) {
  const customer = await prisma.loyalty_customers.findUnique({
    where: { id: data.loyaltyId },
  });

  if (!customer) {
    throw new Error('Loyalty customer not found');
  }

  // Calculate points
  let points = 0;
  const tierMultiplier = POINTS_PER_DOLLAR[customer.tier as keyof typeof POINTS_PER_DOLLAR];

  for (const item of data.items) {
    const category = item.category || 'default';
    const categoryMultiplier = CATEGORY_MULTIPLIERS[category as keyof typeof CATEGORY_MULTIPLIERS] || 1;
    const itemPoints = Math.floor((data.amount / data.items.length) * tierMultiplier * categoryMultiplier);
    points += itemPoints;
  }

  // Update customer
  const updated = await prisma.loyalty_customers.update({
    where: { id: data.loyaltyId },
    data: {
      points_balance: { increment: points },
      lifetime_points_earned: { increment: points },
      lifetime_spend: { increment: data.amount },
      last_purchase_at: new Date(),
    },
  });

  // Create transaction record
  await prisma.loyalty_transactions.create({
    data: {
      loyalty_customer_id: data.loyaltyId,
      type: 'earn',
      points_amount: points,
      reference_type: 'order',
      reference_id: data.orderId,
      description: `Points earned from order ${data.orderId}`,
    },
  });

  // Check for tier upgrade
  await checkAndUpgradeTier(data.loyaltyId);

  // Send notification email
  await enqueueJob(JobType.SEND_EMAIL, {
    to: privacyUtils.decrypt(customer.email),
    subject: `You earned ${points} loyalty points!`,
    html: `<p>Thank you for your purchase! You earned ${points} points. Your new balance: ${updated.points_balance}</p>`,
  });

  return {
    success: true,
    pointsEarned: points,
    newBalance: Number(updated.points_balance),
  };
}

/**
 * Check and upgrade tier if eligible
 */
export async function checkAndUpgradeTier(loyaltyId: string) {
  const customer = await prisma.loyalty_customers.findUnique({
    where: { id: loyaltyId },
  });

  if (!customer) throw new Error('Customer not found');

  let newTier = customer.tier;
  const spend = Number(customer.lifetime_spend);

  if (spend >= TIER_THRESHOLDS.platinum.minSpend) {
    newTier = 'platinum';
  } else if (spend >= TIER_THRESHOLDS.gold.minSpend) {
    newTier = 'gold';
  } else if (spend >= TIER_THRESHOLDS.silver.minSpend) {
    newTier = 'silver';
  }

  if (newTier !== customer.tier) {
    await prisma.loyalty_customers.update({
      where: { id: loyaltyId },
      data: { tier: newTier },
    });

    // Send tier upgrade email
    await enqueueJob(JobType.SEND_EMAIL, {
      to: privacyUtils.decrypt(customer.email),
      subject: `Congratulations! You've reached ${newTier.toUpperCase()} tier!`,
      html: `<p>Your loyalty has been rewarded. You're now a ${newTier} member with ${POINTS_PER_DOLLAR[newTier as keyof typeof POINTS_PER_DOLLAR]}x points multiplier!</p>`,
    });
  }
}

/**
 * Redeem reward
 */
export async function redeemReward(loyaltyId: string, rewardId: string) {
  const reward = REWARD_CATALOG[rewardId as keyof typeof REWARD_CATALOG];
  if (!reward) {
    throw new Error('Invalid reward');
  }

  const customer = await prisma.loyalty_customers.findUnique({
    where: { id: loyaltyId },
  });

  if (!customer) {
    throw new Error('Loyalty customer not found');
  }

  if (Number(customer.points_balance) < reward.points) {
    throw new Error('Insufficient points');
  }

  // Deduct points
  await prisma.loyalty_customers.update({
    where: { id: loyaltyId },
    data: {
      points_balance: { decrement: reward.points },
      lifetime_points_redeemed: { increment: reward.points },
    },
  });

  // Create redemption record
  const code = generateRedemptionCode(rewardId);
  const expiresAt = addDays(new Date(), 30);

  const redemption = await prisma.loyalty_redemptions.create({
    data: {
      loyalty_customer_id: loyaltyId,
      reward_id: rewardId,
      code,
      status: 'active',
      value: reward.value,
      expires_at: expiresAt,
    },
  });

  // Create transaction record
  await prisma.loyalty_transactions.create({
    data: {
      loyalty_customer_id: loyaltyId,
      type: 'redeem',
      points_amount: reward.points,
      reference_type: 'redemption',
      reference_id: redemption.id,
      description: `Redeemed ${reward.description}`,
    },
  });

  // Send confirmation email
  await enqueueJob(JobType.SEND_EMAIL, {
    to: privacyUtils.decrypt(customer.email),
    subject: 'Your reward code is ready!',
    html: `<p>Reward: ${reward.description}</p><p>Code: <strong>${code}</strong></p><p>Expires: ${expiresAt.toDateString()}</p>`,
  });

  return {
    code,
    reward: reward.description,
    value: reward.value,
    expiresAt,
  };
}

/**
 * Get transaction history
 */
export async function getTransactionHistory(
  loyaltyId: string,
  limit = 20,
  offset = 0
) {
  const customer = await prisma.loyalty_customers.findUnique({
    where: { id: loyaltyId },
  });

  if (!customer) {
    throw new Error('Loyalty customer not found');
  }

  const transactions = await prisma.loyalty_transactions.findMany({
    where: { loyalty_customer_id: loyaltyId },
    orderBy: { created_at: 'desc' },
    take: limit,
    skip: offset,
  });

  const total = await prisma.loyalty_transactions.count({
    where: { loyalty_customer_id: loyaltyId },
  });

  return {
    transactions: transactions.map(t => ({
      id: t.id,
      type: t.type,
      pointsAmount: Number(t.points_amount),
      description: t.description,
      referenceType: t.reference_type,
      referenceId: t.reference_id,
      createdAt: t.created_at,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Get personalized offers
 */
export async function getPersonalizedOffers(loyaltyId: string) {
  const customer = await prisma.loyalty_customers.findUnique({
    where: { id: loyaltyId },
  });

  if (!customer) {
    throw new Error('Loyalty customer not found');
  }

  // Get active offers from database
  const offers = await prisma.loyalty_offers.findMany({
    where: {
      OR: [
        { loyalty_customer_id: loyaltyId },
        { store_id: customer.store_id },
      ],
      expires_at: { gt: new Date() },
      is_used: false,
    },
    orderBy: { created_at: 'desc' },
  });

  return offers.map(offer => ({
    id: offer.id,
    type: offer.offer_type,
    category: offer.category,
    discountPercent: offer.discount_percent ? Number(offer.discount_percent) : null,
    bonusMultiplier: offer.bonus_multiplier,
    minPurchase: offer.min_purchase ? Number(offer.min_purchase) : null,
    description: offer.description,
    expiresAt: offer.expires_at,
  }));
}

export const loyaltyService = {
  enrollCustomer,
  getBalance,
  processPointsForOrder,
  checkAndUpgradeTier,
  redeemReward,
  getTransactionHistory,
  getPersonalizedOffers,
};
