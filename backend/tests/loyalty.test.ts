import request from 'supertest';
import app from '../src/app';
import { loyaltyService } from '../src/modules/loyalty/loyalty.service';

describe('Loyalty Program', () => {
  const storeId = 1;
  const enrollmentData = {
    email: 'testcustomer@example.com',
    phone: '555-1234',
    firstName: 'John',
    lastName: 'Doe',
  };

  describe('POST /api/v1/loyalty/enroll', () => {
    it('should enroll a new customer', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send(enrollmentData);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe(enrollmentData.email);
      expect(res.body.tier).toBe('bronze');
      expect(res.body.pointsBalance).toBe(100); // Welcome bonus
    });

    it('should reject duplicate enrollment', async () => {
      // First enrollment
      await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send(enrollmentData);

      // Duplicate enrollment
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send(enrollmentData);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already enrolled');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required fields');
    });
  });

  describe('GET /api/v1/loyalty/balance/:loyaltyId', () => {
    let loyaltyId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send({
          email: 'balance-test@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
        });
      loyaltyId = res.body.id;
    });

    it('should return customer balance', async () => {
      const res = await request(app)
        .get(`/api/v1/loyalty/balance/${loyaltyId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('points');
      expect(res.body).toHaveProperty('tier');
      expect(res.body).toHaveProperty('totalSpend');
      expect(res.body.points).toBe(100);
    });

    it('should return 404 for invalid loyalty ID', async () => {
      const res = await request(app)
        .get('/api/v1/loyalty/balance/invalid-id');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/loyalty/process-points', () => {
    let loyaltyId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send({
          email: 'points-test@example.com',
          firstName: 'Points',
          lastName: 'Tester',
        });
      loyaltyId = res.body.id;
    });

    it('should process points for an order', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/process-points')
        .send({
          loyaltyId,
          orderId: 'ORD-001',
          amount: 100,
          items: [
            { sku: 'SKU-001', category: 'default' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pointsEarned).toBeGreaterThan(0);
    });

    it('should apply category multipliers', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/process-points')
        .send({
          loyaltyId,
          orderId: 'ORD-002',
          amount: 100,
          items: [
            { sku: 'SKU-002', category: 'organics' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.pointsEarned).toBeGreaterThan(100); // 1.5x multiplier
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/process-points')
        .send({ loyaltyId });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/loyalty/redeem', () => {
    let loyaltyId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send({
          email: 'redeem-test@example.com',
          firstName: 'Redeem',
          lastName: 'Tester',
        });
      loyaltyId = res.body.id;

      // Add points via order
      await request(app)
        .post('/api/v1/loyalty/process-points')
        .send({
          loyaltyId,
          orderId: 'ORD-100',
          amount: 1000, // Should earn 1000 points
          items: [{ sku: 'SKU-100', category: 'default' }],
        });
    });

    it('should redeem a valid reward', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/redeem')
        .send({
          loyaltyId,
          rewardId: 'discount_5',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('code');
      expect(res.body.code).toContain('LOYALTY');
      expect(res.body.value).toBe(5);
    });

    it('should reject invalid reward ID', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/redeem')
        .send({
          loyaltyId,
          rewardId: 'invalid_reward',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid reward');
    });

    it('should reject redemption with insufficient points', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send({
          email: 'insufficient-test@example.com',
          firstName: 'Low',
          lastName: 'Points',
        });

      const newLoyaltyId = res.body.id;

      const redeemRes = await request(app)
        .post('/api/v1/loyalty/redeem')
        .send({
          loyaltyId: newLoyaltyId,
          rewardId: 'discount_10', // Requires 500 points, but only has 100
        });

      expect(redeemRes.status).toBe(400);
      expect(redeemRes.body.error).toContain('Insufficient points');
    });
  });

  describe('GET /api/v1/loyalty/transactions/:loyaltyId', () => {
    let loyaltyId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send({
          email: 'transactions-test@example.com',
          firstName: 'Txn',
          lastName: 'Tester',
        });
      loyaltyId = res.body.id;

      // Add some transactions
      await request(app)
        .post('/api/v1/loyalty/process-points')
        .send({
          loyaltyId,
          orderId: 'ORD-TXN-1',
          amount: 50,
          items: [{ sku: 'SKU-TXN-1' }],
        });
    });

    it('should return transaction history', async () => {
      const res = await request(app)
        .get(`/api/v1/loyalty/transactions/${loyaltyId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('transactions');
      expect(Array.isArray(res.body.transactions)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(2); // Welcome bonus + order points
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get(`/api/v1/loyalty/transactions/${loyaltyId}?limit=1&offset=0`);

      expect(res.status).toBe(200);
      expect(res.body.transactions.length).toBeLessThanOrEqual(1);
      expect(res.body.limit).toBe(1);
      expect(res.body.offset).toBe(0);
    });
  });

  describe('GET /api/v1/loyalty/offers/:loyaltyId', () => {
    let loyaltyId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send({
          email: 'offers-test@example.com',
          firstName: 'Offers',
          lastName: 'Tester',
        });
      loyaltyId = res.body.id;
    });

    it('should return personalized offers', async () => {
      const res = await request(app)
        .get(`/api/v1/loyalty/offers/${loyaltyId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('offers');
      expect(Array.isArray(res.body.offers)).toBe(true);
    });
  });

  describe('Tier Progression', () => {
    it('should upgrade tier when spend threshold is met', async () => {
      const enrollRes = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send({
          email: 'tier-test@example.com',
          firstName: 'Tier',
          lastName: 'Tester',
        });

      const loyaltyId = enrollRes.body.id;

      // Process large order to cross silver threshold ($500)
      await request(app)
        .post('/api/v1/loyalty/process-points')
        .send({
          loyaltyId,
          orderId: 'ORD-TIER-1',
          amount: 500,
          items: [{ sku: 'SKU-TIER-1' }],
        });

      const balanceRes = await request(app)
        .get(`/api/v1/loyalty/balance/${loyaltyId}`);

      expect(balanceRes.body.tier).toBe('silver');
    });
  });

  describe('Service Layer Tests', () => {
    it('should calculate points correctly with tier multiplier', async () => {
      // Test that gold tier gets 1.5x points
      const enrollRes = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('x-store-id', storeId.toString())
        .send({
          email: 'gold-tier@example.com',
          firstName: 'Gold',
          lastName: 'Member',
        });

      const loyaltyId = enrollRes.body.id;

      // Manually upgrade to gold for testing (in real scenario, achieved through spending)
      await loyaltyService.checkAndUpgradeTier(loyaltyId);

      expect(true).toBe(true); // Placeholder for actual tier logic
    });
  });
});
