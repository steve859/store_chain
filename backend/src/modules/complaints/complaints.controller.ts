import { Request, Response, NextFunction } from 'express';
import { AuditLogsService } from '../audit_logs/audit_logs.service';
import { ComplaintsService, ComplaintStatus } from './complaints.service';
import { ComplaintsRepository } from './complaints.repository';

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

const getRole = (req: Request) => String(asRecord(req.user).role ?? '');

const isAdminRequest = (req: Request) => getRole(req).toLowerCase() === 'admin';

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

const enforceComplaintStoreScope = (req: Request, complaint: { storeId?: unknown } | null | undefined) => {
  if (isAdminRequest(req)) return true;

  const activeStoreId = Number(req.activeStoreId);
  const complaintStoreId = complaint?.storeId !== undefined && complaint?.storeId !== null ? Number(complaint.storeId) : NaN;
  return Number.isFinite(activeStoreId) && Number.isFinite(complaintStoreId) && complaintStoreId === activeStoreId;
};

const allowed = ['Chờ xử lý', 'Đang xử lý', 'Đã giải quyết', 'Từ chối'] as const;

const stripDiacritics = (input: string) =>
  input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

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

const normalizeStatus = (statusRaw: string) => {
  const norm = stripDiacritics(statusRaw).toLowerCase();
  return (allowed as readonly string[]).includes(statusRaw) ? (statusRaw as ComplaintStatus) : statusMap[norm];
};

export const ComplaintsController = {
  listComplaints: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const status = req.query.status ? String(req.query.status).trim() : undefined;
      const employeeName = req.query.employeeName ? String(req.query.employeeName).trim() : undefined;
      const queryStoreId = req.query.storeId ? Number(req.query.storeId) : NaN;
      const take = req.query.take ? Number(req.query.take) : undefined;
      const skip = req.query.skip ? Number(req.query.skip) : undefined;

      const activeStoreId = Number(req.activeStoreId);
      const storeId = isAdminRequest(req) && Number.isFinite(queryStoreId) ? queryStoreId : activeStoreId;

      const result = await ComplaintsService.list({ q, status, employeeName, storeId, take, skip });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  listMyComplaints: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employeeName = String(req.query.employeeName ?? '').trim();
      if (!employeeName) {
        return res.status(400).json({ error: 'employeeName is required' });
      }

      const take = req.query.take ? Number(req.query.take) : 200;
      const skip = req.query.skip ? Number(req.query.skip) : 0;
      const activeStoreId = Number(req.activeStoreId);
      const storeId = !isAdminRequest(req) && Number.isFinite(activeStoreId) ? activeStoreId : undefined;

      const result = await ComplaintsService.list({ employeeName, storeId, take, skip });
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  getComplaint: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id ?? '').trim();
      const complaint = await ComplaintsService.get(id);
      if (!complaint) {
        return res.status(404).json({ error: 'Complaint not found' });
      }

      if (!enforceComplaintStoreScope(req, complaint)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      return res.json(complaint);
    } catch (err) {
      return next(err);
    }
  },

  createComplaint: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeName = req.body?.storeName;
      const employeeName = req.body?.employeeName;
      const reason = req.body?.reason;
      const description = req.body?.description;
      const image = req.body?.image ?? null;

      const activeStoreId = Number(req.activeStoreId);
      const bodyStoreId = req.body?.storeId !== undefined ? Number(req.body.storeId) : NaN;
      const storeId = isAdminRequest(req) && Number.isFinite(bodyStoreId) ? String(bodyStoreId) : Number.isFinite(activeStoreId) ? String(activeStoreId) : null;
      const employeeId = req.body?.employeeId !== undefined ? String(req.body.employeeId) : null;

      let resolvedStoreName = storeName;
      if ((!resolvedStoreName || String(resolvedStoreName).trim() === '') && storeId) {
        const storeRow = await ComplaintsRepository.findStoreById(Number(storeId));
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

      return res.status(201).json(created);
    } catch (err) {
      return next(err);
    }
  },

  updateComplaintStatus: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id ?? '').trim();
      const statusRaw = String(req.body?.status ?? '').trim();
      const adminNote = req.body?.adminNote !== undefined ? String(req.body.adminNote) : undefined;
      const normalizedStatus = normalizeStatus(statusRaw);

      if (!normalizedStatus) {
        return res.status(400).json({
          error: `Invalid status. Allowed: ${allowed.join(', ')} (or pending/processing/resolved/rejected)`,
        });
      }

      const existing = await ComplaintsService.get(id);
      if (!existing) {
        return res.status(404).json({ error: 'Complaint not found' });
      }
      if (!enforceComplaintStoreScope(req, existing)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const updated = await ComplaintsService.updateStatus(id, normalizedStatus, adminNote ?? null);
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

      return res.json(updated);
    } catch (err) {
      return next(err);
    }
  },

  deleteComplaint: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id ?? '').trim();

      const existing = await ComplaintsService.get(id);
      if (!existing) {
        return res.status(404).json({ error: 'Complaint not found' });
      }
      if (!enforceComplaintStoreScope(req, existing)) {
        return res.status(403).json({ error: 'Forbidden' });
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
      return res.json({ message: 'Deleted' });
    } catch (err) {
      return next(err);
    }
  },
};
