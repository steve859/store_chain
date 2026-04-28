import { prisma } from '../../db/client';
import { enqueueJob, JobType } from '../../lib/queues/jobQueue';

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
  // Check if already enrolled
  // Note: Will implement with actual Prisma schema

  return {
    id: `loyalty_${Date.now()}`,
    ...data,
    tier: 'bronze',
    pointsBalance: 0,
    lifetimeSpend: 0,
    enrolledAt: new Date(),
  };
}

/**
 * Get customer loyalty balance
 */
export async function getBalance(loyaltyId: string) {
  return {
    loyaltyId,
    points: 0,
    tier: 'bronze',
    totalSpend: 0,
    nextTierAt: 500,
  };
}

/**
 * Process points for order
 */
export async function processPointsForOrder(data: {
  loyaltyId: string;
  orderId: string;
  amount: number;
  items: Array<{ sku: string; category: string }>;
}) {
  await enqueueJob(JobType.SEND_EMAIL, {
    to: 'loyalty@store.com',
    subject: 'Points processed for order',
    html: `<p>Order ${data.orderId} earned points</p>`,
  });

  return { success: true };
}

/**
 * Redeem reward
 */
export async function redeemReward(loyaltyId: string, rewardId: string) {
  const reward = REWARD_CATALOG[rewardId as keyof typeof REWARD_CATALOG];
  if (!reward) {
    throw new Error('Invalid reward');
  }

  const code = `LOYALTY-${rewardId.toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  return {
    code,
    reward: reward.description,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Get personalized offers
 */
export async function getPersonalizedOffers(loyaltyId: string) {
  return [
    {
      id: 'offer_1',
      type: 'category_discount',
      category: 'organics',
      discount: 0.2,
      description: '20% off organics',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'offer_2',
      type: 'bonus_points',
      multiplier: 2,
      description: 'Double points this week',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  ];
}

export const loyaltyService = {
  enrollCustomer,
  getBalance,
  processPointsForOrder,
  redeemReward,
  getPersonalizedOffers,
};
