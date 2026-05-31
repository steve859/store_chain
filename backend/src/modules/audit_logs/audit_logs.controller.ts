import { Request, Response } from 'express';
import { AuditLogsService } from './audit_logs.service';

export const AuditLogsController = {
  getLogs: async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const action = req.query.action as string;
      const objectType = req.query.objectType as string;
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

      const startDate = req.query.from ? new Date(req.query.from as string) : undefined;
      const endDate = req.query.to ? new Date(req.query.to as string) : undefined;

      const result = await AuditLogsService.getLogs({
        page,
        limit,
        action,
        objectType,
        userId,
        startDate,
        endDate,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },
};
