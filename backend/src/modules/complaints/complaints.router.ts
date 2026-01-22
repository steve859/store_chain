import { Router } from 'express';
import { ComplaintsService } from './complaints.service';
import prisma from '../../db/prisma';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveStoreUnlessAdmin);

// GET /api/v1/complaints?take&skip&q&status&employeeName
router.get('/', async (req, res, next) => {
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
router.get('/my', async (req, res, next) => {
  try {
    const employeeName = String(req.query.employeeName ?? '').trim();
    if (!employeeName) {
      return res.status(400).json({ error: 'employeeName is required' });
    }

    const take = req.query.take ? Number(req.query.take) : 200;
    const skip = req.query.skip ? Number(req.query.skip) : 0;
    const result = await ComplaintsService.list({ employeeName, take, skip });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/complaints/:id
router.get('/:id', async (req, res, next) => {
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
    if (!isAdmin && Number.isFinite(activeStoreId) && Number.isFinite(complaintStoreId) && complaintStoreId !== activeStoreId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(complaint);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/complaints
router.post('/', async (req, res, next) => {
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
router.patch('/:id/status', async (req, res, next) => {
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
    if (!isAdmin && Number.isFinite(activeStoreId) && Number.isFinite(complaintStoreId) && complaintStoreId !== activeStoreId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await ComplaintsService.updateStatus(id, normalizedStatus as any, adminNote ?? null);
    if (!updated) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/complaints/:id
router.delete('/:id', async (req, res, next) => {
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
    if (!isAdmin && Number.isFinite(activeStoreId) && Number.isFinite(complaintStoreId) && complaintStoreId !== activeStoreId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ok = await ComplaintsService.remove(id);
    if (!ok) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
