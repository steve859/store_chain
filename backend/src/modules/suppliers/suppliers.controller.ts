import { Request, Response } from 'express';
import { SuppliersService } from './suppliers.service';

export const SuppliersController = {
  getAllSuppliers: async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;

      const result = await SuppliersService.getAllSuppliers({ page, limit, search });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  getSupplierById: async (req: Request, res: Response) => {
    try {
      const supplier = await SuppliersService.getSupplierById(req.params.id);
      res.json(supplier);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  },

  createSupplier: async (req: Request, res: Response) => {
    try {
      if (!req.body.name || !req.body.phone) {
        return res.status(400).json({ error: 'Name and Phone are required' });
      }

      const newSupplier = await SuppliersService.createSupplier(req.body);
      res.status(201).json(newSupplier);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  updateSupplier: async (req: Request, res: Response) => {
    try {
      const updatedSupplier = await SuppliersService.updateSupplier(req.params.id, req.body);
      res.json(updatedSupplier);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  deleteSupplier: async (req: Request, res: Response) => {
    try {
      await SuppliersService.deleteSupplier(req.params.id);
      res.json({ message: 'Supplier deleted successfully' });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
};
