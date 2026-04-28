import { Request, Response, NextFunction } from 'express';
import { loyaltyService } from './loyalty.service';

/**
 * Loyalty Program Controller
 * Handles HTTP requests for loyalty endpoints
 */

export async function enrollHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = (req as any).storeId;
    const result = await loyaltyService.enrollCustomer(storeId, req.body);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getBalanceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { loyaltyId } = req.params;
    const result = await loyaltyService.getBalance(loyaltyId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getOffersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { loyaltyId } = req.params;
    const offers = await loyaltyService.getPersonalizedOffers(loyaltyId);
    res.json({ offers });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function redeemRewardHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { loyaltyId, rewardId } = req.body;
    const result = await loyaltyService.redeemReward(loyaltyId, rewardId);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export const loyaltyController = {
  enrollHandler,
  getBalanceHandler,
  getOffersHandler,
  redeemRewardHandler,
};
