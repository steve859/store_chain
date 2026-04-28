# Phase 2: Loyalty Program Implementation Plan
## Store Chain Management System - Revenue Feature #1

**Duration:** Months 4-6 (3 months)
**Expected Impact:** +15-30% customer lifetime value
**Priority:** CRITICAL (ROI-critical feature)
**Status:** Planning Phase

---

## Executive Summary

A **points-based loyalty program** designed to increase customer retention and lifetime value by 15-30%. Customers earn points on purchases, redeem for discounts, and receive personalized offers based on purchase history.

### Business Goals
- 5,000+ enrolled members by month 6
- 25%+ redemption rate
- 20% increase in repeat purchase frequency
- <2 month payback period

---

## Feature Breakdown

### 1. Customer Loyalty Account (Tier 1)

#### Database Schema
```sql
-- Customer loyalty accounts
CREATE TABLE loyalty_customers (
  id UUID PRIMARY KEY,
  store_id BIGINT NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  tier VARCHAR(50) DEFAULT 'bronze', -- bronze, silver, gold, platinum
  points_balance BIGINT DEFAULT 0,
  lifetime_spend DECIMAL(12,2) DEFAULT 0,
  lifetime_points_earned BIGINT DEFAULT 0,
  lifetime_points_redeemed BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_purchase_at TIMESTAMP,
  INDEX(store_id, email)
);

-- Points transactions (audit trail)
CREATE TABLE loyalty_transactions (
  id UUID PRIMARY KEY,
  loyalty_customer_id UUID NOT NULL,
  type VARCHAR(50), -- earn, redeem, expire, bonus, adjustment
  points_amount BIGINT,
  reference_type VARCHAR(50), -- order, promotion, manual
  reference_id VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY(loyalty_customer_id) REFERENCES loyalty_customers(id),
  INDEX(loyalty_customer_id, created_at)
);
```

#### APIs
```typescript
// Enroll customer
POST /api/v1/loyalty/enroll
{
  "email": "customer@example.com",
  "phone": "555-1234",
  "firstName": "John",
  "lastName": "Doe"
}
Response: { loyaltyId, points, tier }

// Check balance
GET /api/v1/loyalty/balance/:loyaltyId
Response: { points, tier, totalSpend, nextTierAt, memberSince }

// Get transaction history
GET /api/v1/loyalty/transactions/:loyaltyId?limit=20&offset=0
Response: { transactions: [...], total }
```

---

### 2. Points Earning Rules (Tier 2)

#### Earning Logic
```typescript
// Points per dollar spent
const POINTS_PER_DOLLAR = {
  bronze: 1,    // 1 point = $1 spent
  silver: 1.2,  // 20% bonus
  gold: 1.5,    // 50% bonus
  platinum: 2   // 100% bonus (double points)
};

// Category multipliers
const CATEGORY_MULTIPLIERS = {
  pharmacy: 2,      // Health products: 2x points
  organics: 1.5,    // Premium items: 1.5x points
  alcohol: 0.5,     // Restricted: 0.5x points (regulatory)
  default: 1        // Regular items: 1x
};

// Bonus points
const BONUS_POINTS = {
  firstPurchase: 100,
  birthday: 50,
  anniversary: 50,
  referral: 100
};
```

#### Implementation (Enqueue Job)
```typescript
// In order completion webhook
await enqueueJob(JobType.LOYALTY_PROCESS_POINTS, {
  loyaltyId: customer.loyaltyId,
  orderId: order.id,
  amount: order.total,
  items: order.items.map(i => ({ sku: i.sku, category: i.category })),
  timestamp: new Date()
});

// Job processor calculates points
function loyaltyProcessPointsProcessor(job) {
  const { loyaltyId, amount, items, category } = job.data;
  
  let points = 0;
  for (const item of items) {
    const basePoints = amount * POINTS_PER_DOLLAR[tier];
    const multiplier = CATEGORY_MULTIPLIERS[item.category] || 1;
    points += Math.floor(basePoints * multiplier);
  }
  
  // Update balance
  await prisma.loyaltyCustomer.update({
    where: { id: loyaltyId },
    data: {
      points_balance: { increment: points },
      lifetime_points_earned: { increment: points },
      lifetime_spend: { increment: amount }
    }
  });
  
  // Log transaction
  await prisma.loyaltyTransaction.create({
    data: {
      loyalty_customer_id: loyaltyId,
      type: 'earn',
      points_amount: points,
      reference_type: 'order',
      reference_id: job.data.orderId
    }
  });
}
```

---

### 3. Redemption & Rewards (Tier 3)

#### Reward Catalog
```typescript
const REWARD_CATALOG = {
  discount_5: {
    points: 250,      // 250 points = $5 off
    value: 5.00,
    type: 'discount',
    description: '$5 off any purchase'
  },
  discount_10: {
    points: 500,
    value: 10.00,
    type: 'discount',
    description: '$10 off any purchase'
  },
  free_item: {
    points: 750,
    value: 'variable',
    type: 'free_item',
    description: 'Free item (up to $15 value)'
  },
  free_shipping: {
    points: 100,
    value: 'variable',
    type: 'free_shipping',
    description: 'Free shipping'
  }
};
```

#### Redemption API
```typescript
// Check available rewards
GET /api/v1/loyalty/rewards?loyaltyId=xyz
Response: {
  rewards: [
    { id: 'discount_5', points: 250, description: '$5 off' }
  ],
  canRedeem: ['discount_5', 'discount_10']
}

// Redeem reward
POST /api/v1/loyalty/redeem
{
  "loyaltyId": "xyz",
  "rewardId": "discount_5"
}
Response: { code: 'LOYALTY-5OFF-ABC123', expiresAt, value }

// Apply reward at checkout
POST /api/v1/orders/checkout
{
  "items": [...],
  "loyaltyCode": "LOYALTY-5OFF-ABC123"
}
Response: { subtotal, discount: 5, total }
```

#### Job Processor
```typescript
function loyaltyRedeemRewardProcessor(job) {
  const { loyaltyId, rewardId } = job.data;
  
  // Verify customer has enough points
  const customer = await prisma.loyaltyCustomer.findUnique({
    where: { id: loyaltyId }
  });
  
  const reward = REWARD_CATALOG[rewardId];
  if (customer.points_balance < reward.points) {
    throw new Error('Insufficient points');
  }
  
  // Deduct points
  await prisma.loyaltyCustomer.update({
    where: { id: loyaltyId },
    data: {
      points_balance: { decrement: reward.points },
      lifetime_points_redeemed: { increment: reward.points }
    }
  });
  
  // Generate redemption code
  const code = `LOYALTY-${rewardId.toUpperCase()}-${generateCode()}`;
  
  // Create redemption record
  await prisma.loyaltyRedemption.create({
    data: {
      loyalty_customer_id: loyaltyId,
      reward_id: rewardId,
      code,
      status: 'active',
      expires_at: addDays(new Date(), 30)
    }
  });
  
  return { code, expires_at: addDays(new Date(), 30) };
}
```

---

### 4. Tier Management (Tier 4)

#### Tier Progression
```typescript
const TIER_THRESHOLDS = {
  bronze: { minSpend: 0, minPoints: 0 },
  silver: { minSpend: 500, minPoints: 500 },   // $500 spent OR 500 points earned
  gold: { minSpend: 1500, minPoints: 1500 },   // $1,500 spent
  platinum: { minSpend: 3000, minPoints: 3000 } // $3,000 spent
};

// Auto-upgrade logic (monthly check)
async function upgradeCustomerTierIfEligible(loyaltyId) {
  const customer = await prisma.loyaltyCustomer.findUnique({
    where: { id: loyaltyId }
  });
  
  let newTier = customer.tier;
  
  if (customer.lifetime_spend >= TIER_THRESHOLDS.platinum.minSpend) {
    newTier = 'platinum';
  } else if (customer.lifetime_spend >= TIER_THRESHOLDS.gold.minSpend) {
    newTier = 'gold';
  } else if (customer.lifetime_spend >= TIER_THRESHOLDS.silver.minSpend) {
    newTier = 'silver';
  }
  
  if (newTier !== customer.tier) {
    await prisma.loyaltyCustomer.update({
      where: { id: loyaltyId },
      data: { tier: newTier }
    });
    
    // Send upgrade notification
    await enqueueJob(JobType.SEND_EMAIL, {
      to: customer.email,
      subject: `You're now ${newTier.toUpperCase()} tier!`,
      html: `<p>Congratulations! You've reached ${newTier} tier.</p>`
    });
  }
}
```

---

### 5. Personalized Offers (Tier 5)

#### Offer Engine
```typescript
// Create targeted offers based on purchase history
async function generatePersonalizedOffers(loyaltyId) {
  const customer = await prisma.loyaltyCustomer.findUnique({
    where: { id: loyaltyId }
  });
  
  // Get purchase history
  const purchases = await prisma.orderItem.findMany({
    where: { order: { loyalty_customer_id: loyaltyId } },
    include: { product: true }
  });
  
  // Identify favorite categories
  const categoryFreq = {};
  purchases.forEach(p => {
    categoryFreq[p.product.category] = (categoryFreq[p.product.category] || 0) + 1;
  });
  
  // Generate offers
  const offers = [];
  
  // Offer 1: "Buy 2, get 20% off" in favorite category
  const topCategory = Object.entries(categoryFreq).sort((a, b) => b[1] - a[1])[0];
  if (topCategory) {
    offers.push({
      id: `offer_${randomId()}`,
      type: 'category_discount',
      category: topCategory[0],
      discount: 0.2,
      description: `20% off ${topCategory[0]}`,
      minPurchase: 50,
      expiresAt: addDays(new Date(), 14)
    });
  }
  
  // Offer 2: Bonus points "Triple points on your birthday month"
  if (customer.tier === 'gold' || customer.tier === 'platinum') {
    offers.push({
      id: `offer_${randomId()}`,
      type: 'bonus_points',
      multiplier: 3,
      description: 'Triple points this month',
      expiresAt: endOfMonth(new Date())
    });
  }
  
  // Offer 3: Free item threshold
  if (customer.lifetime_spend > 1000) {
    offers.push({
      id: `offer_${randomId()}`,
      type: 'free_item',
      description: 'Free item with $50+ purchase',
      minPurchase: 50,
      expiresAt: addDays(new Date(), 7)
    });
  }
  
  return offers;
}

// API endpoint
GET /api/v1/loyalty/offers/:loyaltyId
Response: {
  offers: [
    { id: 'offer_1', type: 'category_discount', discount: 0.2, expiresAt },
    { id: 'offer_2', type: 'bonus_points', multiplier: 3, expiresAt }
  ]
}
```

---

## Implementation Timeline

### Month 4 (Weeks 1-4)
**Database & Core APIs**
- [ ] Create Prisma schema (loyalty_customers, loyalty_transactions, loyalty_redemptions)
- [ ] Create loyalty enrollment API
- [ ] Create points earning processor
- [ ] Create balance checking API
- [ ] Write unit tests
- [ ] Estimated effort: 6 FTE days

### Month 4-5 (Weeks 5-8)
**Redemption & Tier Management**
- [ ] Create reward catalog system
- [ ] Create redemption API
- [ ] Create tier upgrade logic
- [ ] Create monthly tier check job
- [ ] Integration testing
- [ ] Estimated effort: 5 FTE days

### Month 5-6 (Weeks 9-12)
**Personalization & Frontend**
- [ ] Create personalized offers engine
- [ ] Build loyalty dashboard (customer view)
- [ ] Build admin loyalty management UI
- [ ] Mobile app integration
- [ ] Performance optimization
- [ ] Estimated effort: 6 FTE days

### Month 6 (Final Week)
**Testing & Deployment**
- [ ] Load testing (5,000+ members)
- [ ] UAT with pilot stores
- [ ] Gradual rollout
- [ ] Monitoring & optimization
- [ ] Estimated effort: 3 FTE days

**Total Effort: ~20 FTE days (~4 weeks)**

---

## Technical Architecture

### Data Flow
```
Customer Purchase
    ↓
Order Created Event
    ↓
Enqueue Job: LOYALTY_PROCESS_POINTS
    ↓
Calculate Points (category, tier multipliers)
    ↓
Update loyalty_customers table
    ↓
Create loyalty_transaction record
    ↓
Check for tier upgrade
    ↓
Send confirmation email
    ↓
Cache invalidation (loyalty balance)
    ↓
Send real-time update to mobile app
```

### Caching Strategy
```typescript
// Cache keys
const CACHE_KEYS = {
  loyalty_balance: `loyalty:balance:${loyaltyId}`,
  loyalty_offers: `loyalty:offers:${loyaltyId}`,
  reward_catalog: 'loyalty:rewards:catalog',
  tier_config: 'loyalty:tiers:config'
};

// TTL values
const CACHE_TTL = {
  loyalty_balance: 300,    // 5 minutes (frequent reads)
  loyalty_offers: 3600,    // 1 hour (less frequent)
  reward_catalog: 86400,   // 1 day (rarely changes)
  tier_config: 86400       // 1 day
};
```

### Metrics & Monitoring
```typescript
// Track in Prometheus
export const loyaltyMetrics = {
  enrollments_total: new Counter({
    name: 'loyalty_enrollments_total',
    labelNames: ['store_id']
  }),
  points_earned_total: new Counter({
    name: 'loyalty_points_earned_total',
    labelNames: ['store_id', 'tier']
  }),
  points_redeemed_total: new Counter({
    name: 'loyalty_points_redeemed_total',
    labelNames: ['store_id']
  }),
  tier_upgrades_total: new Counter({
    name: 'loyalty_tier_upgrades_total',
    labelNames: ['from_tier', 'to_tier']
  }),
  member_count: new Gauge({
    name: 'loyalty_members_total',
    labelNames: ['tier']
  })
};
```

---

## Success Metrics (KPIs)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Enrollment Rate | 30% of customers | Monthly signups |
| Active Members | 5,000+ by M6 | Quarterly dashboard |
| Redemption Rate | 25%+ | Points redeemed / points earned |
| Repeat Purchase Freq | +20% | Orders from loyalty customers vs. non-loyalty |
| Average Order Value | +15% | AOV for loyalty customers |
| Customer Retention | +25% | Churn rate reduction |
| Member Lifetime Value | +30% | Total revenue per member |
| System Performance | < 200ms | API response time (P95) |

---

## Risk & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Points fraud/exploitation | Medium | High | Audit trail, limits, manual review |
| Database performance | Low | High | Proper indexing, archival strategy |
| Member fatigue | Medium | Medium | Smart offer frequency capping |
| Tier system too complex | Low | Medium | Clear communication, simplified UI |
| Redemption abuse | Low | High | Code expiry, one-time use, limits |

---

## Files to Create

**Backend:**
- `backend/src/modules/loyalty/loyalty.controller.ts`
- `backend/src/modules/loyalty/loyalty.service.ts`
- `backend/src/modules/loyalty/loyalty.router.ts`
- `backend/src/lib/queues/processors/loyaltyProcessor.ts`
- `backend/src/lib/loyalty/offerEngine.ts`
- `backend/src/lib/loyalty/tierManager.ts`
- `backend/prisma/migrations/loyalty.sql`

**Frontend:**
- `frontend/src/pages/loyalty/dashboard.jsx`
- `frontend/src/pages/loyalty/enroll.jsx`
- `frontend/src/pages/loyalty/rewards.jsx`
- `frontend/src/services/loyaltyService.js`

**Tests:**
- `backend/tests/loyalty.test.ts`
- `backend/tests/loyaltyProcessor.test.ts`

---

## Dependencies Required

```json
{
  "date-fns": "^2.30.0"           // Date calculations
}
```

---

## Next: Phase 2 Features

After Loyalty Program:
1. **Dynamic Pricing Engine** (M6-M7)
2. **Promotions & Discounts** (M7-M8)
3. **Mobile App** (M8-M9)

---

**Status: ✅ READY FOR IMPLEMENTATION**

Next Step: Start Month 4, Week 1 implementation

Co-authored-by: Copilot
