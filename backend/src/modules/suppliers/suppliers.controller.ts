import { Request, Response } from 'express';
import { SuppliersService } from './suppliers.service';
import { AuditLogsService } from '../audit_logs/audit_logs.service';

const supplierAuditFields = ['id', 'name', 'created_at'];
const supplierPresenceFields = {
  contactNamePresent: 'contact_name',
  phonePresent: 'phone',
  emailPresent: 'email',
  addressPresent: 'address',
  notePresent: 'note',
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const toAuditValue = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) return String(value);
  return value;
};

const getActorUserId = (req: Request) => {
  const userId = Number(toRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : undefined;
};

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const writeAuditLog = async (params: Parameters<typeof AuditLogsService.createLog>[0]) => {
  try {
    await AuditLogsService.createLog(params);
  } catch (error) {
    console.error('Failed to write supplier audit log:', error);
  }
};

const safeSupplierSnapshot = (supplier: unknown) => {
  const record = toRecord(supplier);

  return supplierAuditFields.reduce<Record<string, unknown>>((snapshot, field) => {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      snapshot[field] = toAuditValue(record[field]);
    }
    return snapshot;
  }, {});
};

const getSupplierMetadata = (supplier: unknown) => {
  const record = toRecord(supplier);

  return Object.entries(supplierPresenceFields).reduce<Record<string, boolean>>((metadata, [key, field]) => {
    const value = record[field];
    metadata[key] = value !== undefined && value !== null && String(value).trim().length > 0;
    return metadata;
  }, {});
};

const getChangedFields = (before: unknown, after: unknown) => {
  const beforeRecord = toRecord(before);
  const afterRecord = toRecord(after);
  const fields = [...supplierAuditFields, ...Object.values(supplierPresenceFields)];

  return fields.filter((field) => JSON.stringify(toAuditValue(beforeRecord[field])) !== JSON.stringify(toAuditValue(afterRecord[field])));
};

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
      await writeAuditLog({
        action: 'SUPPLIER_CREATED',
        objectType: 'supplier',
        objectId: String(toRecord(newSupplier).id),
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          after: safeSupplierSnapshot(newSupplier),
          metadata: getSupplierMetadata(newSupplier),
        },
      });
      res.status(201).json(newSupplier);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  updateSupplier: async (req: Request, res: Response) => {
    try {
      const beforeSupplier = await SuppliersService.getSupplierById(req.params.id);
      const updatedSupplier = await SuppliersService.updateSupplier(req.params.id, req.body);
      await writeAuditLog({
        action: 'SUPPLIER_UPDATED',
        objectType: 'supplier',
        objectId: req.params.id,
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          before: safeSupplierSnapshot(beforeSupplier),
          after: safeSupplierSnapshot(updatedSupplier),
          metadata: {
            ...getSupplierMetadata(updatedSupplier),
            changedFields: getChangedFields(beforeSupplier, updatedSupplier),
          },
        },
      });
      res.json(updatedSupplier);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  deleteSupplier: async (req: Request, res: Response) => {
    try {
      const beforeSupplier = await SuppliersService.getSupplierById(req.params.id);
      await SuppliersService.deleteSupplier(req.params.id);
      await writeAuditLog({
        action: 'SUPPLIER_DELETED',
        objectType: 'supplier',
        objectId: req.params.id,
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          before: safeSupplierSnapshot(beforeSupplier),
          metadata: {
            deleted: true,
            ...getSupplierMetadata(beforeSupplier),
          },
        },
      });
      res.json({ message: 'Supplier deleted successfully' });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
};
