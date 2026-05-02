import { Request, Response, NextFunction } from 'express';
import { loyaltyService } from './loyalty.service';

/**
 * Loyalty Program Controller
 * Handles HTTP requests for loyalty endpoints
 */

export async function enrollHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = (req as any).storeId;
    if (!storeId) {
      return res.status(400).json({ error: 'Store ID required' });
    }

    const { email, phone, firstName, lastName } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ 
        error: 'Missing required fields: email, firstName, lastName' 
      });
    }

    const result = await loyaltyService.enrollCustomer(storeId, {
      email,
      phone,
      firstName,
      lastName,
    });

    res.status(201).json(result);
  } catch (error: any) {
    if (error.message.includes('already enrolled')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
}

export async function getBalanceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { loyaltyId } = req.params;
    if (!loyaltyId) {
      return res.status(400).json({ error: 'Loyalty ID required' });
    }

    const result = await loyaltyService.getBalance(loyaltyId);
    res.json(result);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
}

export async function getTransactionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { loyaltyId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!loyaltyId) {
      return res.status(400).json({ error: 'Loyalty ID required' });
    }

    const result = await loyaltyService.getTransactionHistory(
      loyaltyId,
      parseInt(limit as string),
      parseInt(offset as string)
    );

    res.json(result);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
}

export async function getOffersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { loyaltyId } = req.params;
    if (!loyaltyId) {
      return res.status(400).json({ error: 'Loyalty ID required' });
    }

    const offers = await loyaltyService.getPersonalizedOffers(loyaltyId);
    res.json({ offers });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
}

export async function redeemRewardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { loyaltyId, rewardId } = req.body;
    if (!loyaltyId || !rewardId) {
      return res.status(400).json({ 
        error: 'Missing required fields: loyaltyId, rewardId' 
      });
    }

    const result = await loyaltyService.redeemReward(loyaltyId, rewardId);
    res.status(201).json(result);
  } catch (error: any) {
    if (error.message.includes('Insufficient')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
}

export async function processPointsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { loyaltyId, orderId, amount, items } = req.body;
    
    if (!loyaltyId || !orderId || !amount || !items) {
      return res.status(400).json({ 
        error: 'Missing required fields: loyaltyId, orderId, amount, items' 
      });
    }

    const result = await loyaltyService.processPointsForOrder({
      loyaltyId,
      orderId,
      amount: parseFloat(amount),
      items,
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export const loyaltyController = {
  enrollHandler,
  getBalanceHandler,
  getTransactionsHandler,
  getOffersHandler,
  redeemRewardHandler,
  processPointsHandler,
};
