import prisma from '../../db/prisma';

export type ComplaintStatus = 'Chờ xử lý' | 'Đang xử lý' | 'Đã giải quyết' | 'Từ chối';

export type ListComplaintsParams = {
  q?: string;
  status?: string;
  employeeName?: string;
  storeId?: number;
  take?: number;
  skip?: number;
};

const normalizeTakeSkip = (take?: unknown, skip?: unknown) => {
  const takeNum = Number(take);
  const skipNum = Number(skip);
  return {
    take: Number.isFinite(takeNum) ? Math.min(Math.max(takeNum, 1), 200) : 50,
    skip: Number.isFinite(skipNum) ? Math.max(skipNum, 0) : 0,
  };
};

const mapComplaintToDto = (c: any) => {
  const id = c.code || `CPL-${String(c.id).padStart(6, '0')}`;
  return {
    id,
    storeId: c.store_id ?? null,
    storeName: c.store_name,
    employeeName: c.employee_name,
    reason: c.reason,
    description: c.description,
    image: c.image ?? null,
    date: c.created_at,
    status: c.status,
    adminNote: c.admin_note ?? null,
  };
};

const findByIdOrCode = async (idOrCode: string) => {
  const trimmed = String(idOrCode || '').trim();
  if (!trimmed) return null;

  if (trimmed.toUpperCase().startsWith('CPL-')) {
    return prisma.complaints.findFirst({ where: { code: trimmed } });
  }

  const idNum = Number(trimmed);
  if (Number.isFinite(idNum)) {
    return prisma.complaints.findUnique({ where: { id: idNum } });
  }

  return prisma.complaints.findFirst({ where: { code: trimmed } });
};

export const ComplaintsService = {
  async list(params: ListComplaintsParams) {
    const q = String(params.q ?? '').trim();
    const status = params.status ? String(params.status).trim() : '';
    const employeeName = params.employeeName ? String(params.employeeName).trim() : '';
    const { take, skip } = normalizeTakeSkip(params.take, params.skip);

    const where: any = {
      ...(status ? { status } : {}),
      ...(employeeName ? { employee_name: employeeName } : {}),
      ...(params.storeId !== undefined && params.storeId !== null && Number.isFinite(Number(params.storeId))
        ? { store_id: String(params.storeId) }
        : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { store_name: { contains: q, mode: 'insensitive' } },
              { employee_name: { contains: q, mode: 'insensitive' } },
              { reason: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.complaints.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take,
        skip,
      }),
      prisma.complaints.count({ where }),
    ]);

    return {
      items: items.map(mapComplaintToDto),
      total,
      take,
      skip,
    };
  },

  async get(idOrCode: string) {
    const c = await findByIdOrCode(idOrCode);
    if (!c) return null;
    return mapComplaintToDto(c);
  },

  async create(input: {
    storeName: string;
    employeeName: string;
    reason: string;
    description: string;
    image?: string | null;
    storeId?: string | null;
    employeeId?: string | null;
  }) {
    const storeName = String(input.storeName ?? '').trim();
    const employeeName = String(input.employeeName ?? '').trim();
    const reason = String(input.reason ?? '').trim();
    const description = String(input.description ?? '').trim();

    if (!storeName || !employeeName || !reason || !description) {
      throw new Error('storeName, employeeName, reason, description are required');
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.complaints.create({
        data: {
          store_id: input.storeId ? String(input.storeId) : null,
          employee_id: input.employeeId ? String(input.employeeId) : null,
          store_name: storeName,
          employee_name: employeeName,
          reason,
          description,
          image: input.image ?? null,
          status: 'Chờ xử lý',
        },
      });

      const code = `CPL-${String(row.id).padStart(6, '0')}`;
      return tx.complaints.update({ where: { id: row.id }, data: { code } });
    });

    return mapComplaintToDto(created);
  },

  async updateStatus(idOrCode: string, status: ComplaintStatus, adminNote?: string | null) {
    const existing = await findByIdOrCode(idOrCode);
    if (!existing) return null;

    const resolvedAt = status === 'Đã giải quyết' || status === 'Từ chối' ? new Date() : null;

    const updated = await prisma.complaints.update({
      where: { id: existing.id },
      data: {
        status,
        admin_note: adminNote ?? existing.admin_note,
        resolved_at: resolvedAt,
      },
    });

    return mapComplaintToDto(updated);
  },

  async remove(idOrCode: string) {
    const existing = await findByIdOrCode(idOrCode);
    if (!existing) return false;

    await prisma.complaints.delete({ where: { id: existing.id } });
    return true;
  },
};
