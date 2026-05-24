import { Request, Router } from 'express';
import { ComplaintsService } from './complaints.service';
import prisma from '../../db/prisma';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';
import { AuditLogsService } from '../audit_logs/audit_logs.service';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveStoreUnlessAdmin);

const complaintListRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'admin', 'district_manager', 'manager', 'store_manager'];
const complaintSubmitRoles = ['ADMIN', 'STORE_MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'admin', 'manager', 'store_manager', 'cashier', 'inventory_staff'];
const complaintDetailRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER', 'admin', 'district_manager', 'manager', 'store_manager'];
const complaintStatusRoles = ['ADMIN', 'STORE_MANAGER', 'admin', 'manager', 'store_manager'];
const complaintDeleteRoles = ['ADMIN', 'admin'];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getActorUserId = (req: Request): number | undefined => {
  const userId = Number(asRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : undefined;
};

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const writeAuditLog = async (params: Parameters<typeof AuditLogsService.createLog>[0]) => {
  try {
    await AuditLogsService.createLog(params);
  } catch {
    // Audit logging is best-effort for this phase.
  }
};

const preview = (value: unknown, length = 80): string | undefined => {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text ? text.slice(0, length) : undefined;
};

const complaintStatusSnapshot = (complaint: unknown) => {
  const row = asRecord(complaint);
  const adminNotePreview = preview(row.adminNote);
  return {
    id: row.id,
    storeId: row.storeId,
    status: row.status,
    adminNotePresent: adminNotePreview !== undefined,
    adminNotePreview,
  };
};

const complaintDeleteSnapshot = (complaint: unknown) => {
  const row = asRecord(complaint);
  const reasonPreview = preview(row.reason);
  return {
    id: row.id,
    storeId: row.storeId,
    status: row.status,
    reasonPresent: reasonPreview !== undefined,
    reasonPreview,
    date: row.date,
  };
};

// GET /api/v1/complaints?take&skip&q&status&employeeName
router.get('/', authorizeRoles(complaintListRoles), async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const status = req.query.status ? String(req.query.status).trim() : undefined;
    const employeeName = req.query.employeeName ? String(req.query.employeeName).trim() : undefined;
    const queryStoreId = req.query.storeId ? Number(req.query.storeId) : NaN;
    const take = req.query.take ? Number(req.query.take) : undefined;
    const skip = req.query.skip ? Number(req.query.skip) : undefined;

    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const storeId = isAdmin && Number.isFinite(queryStoreId) ? queryStoreId : activeStoreId;

    const result = await ComplaintsService.list({ q, status, employeeName, storeId, take, skip });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/complaints/my?employeeName=...
router.get('/my', authorizeRoles(complaintSubmitRoles), async (req, res, next) => {
  try {
    const employeeName = String(req.query.employeeName ?? '').trim();
    if (!employeeName) {
      return res.status(400).json({ error: 'employeeName is required' });
    }

    const take = req.query.take ? Number(req.query.take) : 200;
    const skip = req.query.skip ? Number(req.query.skip) : 0;
    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const storeId = !isAdmin && Number.isFinite(activeStoreId) ? activeStoreId : undefined;

    const result = await ComplaintsService.list({ employeeName, storeId, take, skip });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/complaints/:id
router.get('/:id', authorizeRoles(complaintDetailRoles), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const complaint = await ComplaintsService.get(id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const complaintStoreId = complaint?.storeId !== undefined && complaint?.storeId !== null ? Number(complaint.storeId) : NaN;
    if (!isAdmin) {
      if (!Number.isFinite(activeStoreId) || !Number.isFinite(complaintStoreId) || complaintStoreId !== activeStoreId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    res.json(complaint);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/complaints
router.post('/', authorizeRoles(complaintSubmitRoles), async (req, res, next) => {
  try {
    const storeName = req.body?.storeName;
    const employeeName = req.body?.employeeName;
    const reason = req.body?.reason;
    const description = req.body?.description;
    const image = req.body?.image ?? null;

    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const bodyStoreId = req.body?.storeId !== undefined ? Number(req.body.storeId) : NaN;
    const storeId = isAdmin && Number.isFinite(bodyStoreId) ? String(bodyStoreId) : Number.isFinite(activeStoreId) ? String(activeStoreId) : null;
    const employeeId = req.body?.employeeId !== undefined ? String(req.body.employeeId) : null;

    let resolvedStoreName = storeName;
    if ((!resolvedStoreName || String(resolvedStoreName).trim() === '') && storeId) {
      const storeRow = await prisma.stores.findUnique({ where: { id: Number(storeId) } });
      resolvedStoreName = storeRow?.name ?? storeRow?.code ?? null;
    }

    const created = await ComplaintsService.create({
      storeName: resolvedStoreName,
      employeeName,
      reason,
      description,
      image,
      storeId,
      employeeId,
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/complaints/:id/status
router.patch('/:id/status', authorizeRoles(complaintStatusRoles), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const statusRaw = String(req.body?.status ?? '').trim();
    const adminNote = req.body?.adminNote !== undefined ? String(req.body.adminNote) : undefined;

    const allowed = ['Chờ xử lý', 'Đang xử lý', 'Đã giải quyết', 'Từ chối'] as const;

    const stripDiacritics = (input: string) =>
      input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');

    const norm = stripDiacritics(statusRaw).toLowerCase();

    const statusMap: Record<string, (typeof allowed)[number]> = {
      // English-ish
      pending: 'Chờ xử lý',
      new: 'Chờ xử lý',
      open: 'Chờ xử lý',
      processing: 'Đang xử lý',
      in_progress: 'Đang xử lý',
      inprogress: 'Đang xử lý',
      resolved: 'Đã giải quyết',
      done: 'Đã giải quyết',
      closed: 'Đã giải quyết',
      rejected: 'Từ chối',
      denied: 'Từ chối',

      // Vietnamese without diacritics
      'cho xu ly': 'Chờ xử lý',
      'dang xu ly': 'Đang xử lý',
      'da giai quyet': 'Đã giải quyết',
      'tu choi': 'Từ chối',
    };

    const normalizedStatus =
      (allowed as readonly string[]).includes(statusRaw)
        ? (statusRaw as (typeof allowed)[number])
        : statusMap[norm];

    if (!normalizedStatus) {
      return res.status(400).json({
        error: `Invalid status. Allowed: ${allowed.join(', ')} (or pending/processing/resolved/rejected)`,
      });
    }

    const existing = await ComplaintsService.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const complaintStoreId = existing?.storeId !== undefined && existing?.storeId !== null ? Number(existing.storeId) : NaN;
    if (!isAdmin) {
      if (!Number.isFinite(activeStoreId) || !Number.isFinite(complaintStoreId) || complaintStoreId !== activeStoreId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const updated = await ComplaintsService.updateStatus(id, normalizedStatus as any, adminNote ?? null);
    if (!updated) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const adminNotePreview = preview(adminNote);
    await writeAuditLog({
      action: 'COMPLAINT_STATUS_UPDATED',
      objectType: 'complaint',
      objectId: id,
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        storeId: existing.storeId,
        before: complaintStatusSnapshot(existing),
        after: complaintStatusSnapshot(updated),
        metadata: {
          requestedStatus: statusRaw,
          normalizedStatus,
          adminNotePresent: adminNotePreview !== undefined,
          adminNotePreview,
        },
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/complaints/:id
router.delete('/:id', authorizeRoles(complaintDeleteRoles), async (req, res, next) => {
  try {
    const id = String(req.params.id ?? '').trim();

    const existing = await ComplaintsService.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const complaintStoreId = existing?.storeId !== undefined && existing?.storeId !== null ? Number(existing.storeId) : NaN;
    if (!isAdmin) {
      if (!Number.isFinite(activeStoreId) || !Number.isFinite(complaintStoreId) || complaintStoreId !== activeStoreId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const ok = await ComplaintsService.remove(id);
    if (!ok) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    await writeAuditLog({
      action: 'COMPLAINT_DELETED',
      objectType: 'complaint',
      objectId: id,
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        storeId: existing.storeId,
        before: complaintDeleteSnapshot(existing),
        metadata: {
          employeeNamePresent: preview(existing.employeeName) !== undefined,
          descriptionPresent: preview(existing.description) !== undefined,
          imagePresent: preview(existing.image) !== undefined,
        },
      },
    });
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
