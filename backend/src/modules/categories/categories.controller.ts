import { NextFunction, Request, Response } from 'express';
import * as categoryService from './categories.service';

export const CategoriesController = {
  getAllCategories: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await categoryService.getAllCategories();
      res.json(categories);
    } catch (error) {
      next(error);
    }
  },

  getCategoryById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await categoryService.getCategoryById(req.params.id);
      res.json(category);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Category not found') {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  createCategory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || typeof req.user === 'string') {
        return res.status(401).json({ message: 'User context missing' });
      }

      const result = await categoryService.createCategory(req.body, String(req.user.userId));
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },

  updateCategory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || typeof req.user === 'string') {
        return res.status(401).json({ message: 'User context missing' });
      }

      const result = await categoryService.updateCategory(req.params.id, req.body, String(req.user.userId));
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  deleteCategory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || typeof req.user === 'string') {
        return res.status(401).json({ message: 'User context missing' });
      }

      await categoryService.deleteCategory(req.params.id, String(req.user.userId));
      res.json({ message: 'Category deleted successfully' });
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Cannot delete category')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },
};
