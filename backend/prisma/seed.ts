import 'dotenv/config';
import bcrypt from 'bcrypt';

import prisma from '../src/db/prisma';
import { Prisma } from '../src/generated/prisma';

type Rng = () => number;

const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randInt = (rng: Rng, minInclusive: number, maxInclusive: number) => {
  const min = Math.ceil(minInclusive);
  const max = Math.floor(maxInclusive);
  return Math.floor(rng() * (max - min + 1)) + min;
};

const pick = <T>(rng: Rng, arr: T[]): T => arr[randInt(rng, 0, arr.length - 1)];

const shuffleInPlace = <T>(rng: Rng, arr: T[]) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

const ean13CheckDigit = (base12: string) => {
  // EAN-13 check digit for 12-digit base
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(base12[i]);
    sum += (i % 2 === 0 ? 1 : 3) * digit;
  }
  const mod = sum % 10;
  return String((10 - mod) % 10);
};

const ean13FromIndex = (idx: number) => {
  // VN-ish prefix 893 + 9 digits = 12 digits
  const base = `893${String(idx).padStart(9, '0')}`.slice(0, 12);
  return base + ean13CheckDigit(base);
};

const numEnv = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
};

const boolEnv = (name: string, fallback: boolean) => {
  const raw = (process.env[name] ?? '').toString().trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
};

const seedConfig = {
  reset: boolEnv('SEED_RESET', true),
  seed: numEnv('SEED_RANDOM_SEED', 20260122),
  stores: numEnv('SEED_STORES', 3),
  products: numEnv('SEED_PRODUCTS', 160),
  invoicesPerStore: numEnv('SEED_INVOICES_PER_STORE', 90),
  purchaseOrdersPerStore: numEnv('SEED_POS_PER_STORE', 8),
  customers: numEnv('SEED_CUSTOMERS', 180),
};

const resetDatabase = async () => {
  // Guardrails
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
    throw new Error('Refusing to reset/seed in production');
  }

  // Delete dependents first
  await prisma.return_items.deleteMany();
  await prisma.returns.deleteMany();

  await prisma.cash_movements.deleteMany();
  await prisma.pos_shifts.deleteMany();

  await prisma.invoice_items.deleteMany();
  await prisma.invoices.deleteMany();

  await prisma.purchase_order_receipt_items.deleteMany();
  await prisma.purchase_order_receipts.deleteMany();

  await prisma.purchase_items.deleteMany();
  await prisma.purchase_orders.deleteMany();

  await prisma.store_transfer_items.deleteMany();
  await prisma.store_transfers.deleteMany();

  await prisma.stock_movements.deleteMany();
  await prisma.stock_lots.deleteMany();

  await prisma.inventories.deleteMany();
  await prisma.variant_prices.deleteMany();

  await prisma.promotions.deleteMany();
  await prisma.complaints.deleteMany();

  await prisma.loyalty_points.deleteMany();
  await prisma.customers.deleteMany();

  await prisma.user_stores.deleteMany();
  await prisma.users.deleteMany();

  await prisma.roles.deleteMany();

  await prisma.product_variants.deleteMany();
  await prisma.products.deleteMany();
  await prisma.brands.deleteMany();
  await prisma.categories.deleteMany();

  await prisma.suppliers.deleteMany();
  await prisma.stores.deleteMany();

  await prisma.audit_logs.deleteMany();
};

const upsertRole = async (name: string, description?: string | null) => {
  return prisma.roles.upsert({
    where: { name },
    update: { description: description ?? null },
    create: { name, description: description ?? null },
  });
};

const upsertStore = async (code: string, data: { name: string; address?: string | null; phone?: string | null }) => {
  return prisma.stores.upsert({
    where: { code },
    update: { name: data.name, address: data.address ?? null, phone: data.phone ?? null, is_active: true },
    create: {
      code,
      name: data.name,
      address: data.address ?? null,
      phone: data.phone ?? null,
      timezone: 'Asia/Ho_Chi_Minh',
      is_active: true,
    },
  });
};

const upsertUser = async (where: { username: string }, data: {
  email: string;
  fullName: string;
  passwordPlain: string;
  roleId: number;
  primaryStoreId?: number | null;
}) => {
  const password_hash = await bcrypt.hash(data.passwordPlain, 10);
  return prisma.users.upsert({
    where,
    update: {
      email: data.email,
      full_name: data.fullName,
      password_hash,
      role_id: data.roleId,
      store_id: data.primaryStoreId ?? null,
      is_active: true,
      updated_at: new Date(),
    },
    create: {
      username: where.username,
      email: data.email,
      full_name: data.fullName,
      password_hash,
      role_id: data.roleId,
      store_id: data.primaryStoreId ?? null,
      is_active: true,
    },
  });
};

const main = async () => {
  console.log('🌱 Seeding (schema-aligned) ...');
  console.log('Config:', seedConfig);

  if (seedConfig.reset) {
    console.log('🧹 Resetting database (deleteMany in FK-safe order)...');
    await resetDatabase();
  }

  const rng = mulberry32(seedConfig.seed);

  // 1) Roles
  const [roleAdmin, roleManager, roleStoreManager, roleCashier, roleInventory] = await Promise.all([
    upsertRole('admin', 'Quản trị viên hệ thống'),
    upsertRole('manager', 'Quản lý khu vực/chuỗi'),
    upsertRole('store_manager', 'Quản lý cửa hàng'),
    upsertRole('cashier', 'Thu ngân'),
    upsertRole('inventory', 'Nhân viên kho'),
  ]);

  // 2) Stores
  const storeTemplates = [
    { code: 'SHP-001', name: 'Cửa hàng Q1 - Nguyễn Huệ', address: '12 Nguyễn Huệ, Q1, TP.HCM', phone: '028-1111-0001' },
    { code: 'SHP-002', name: 'Cửa hàng Q7 - Phú Mỹ Hưng', address: '88 Nguyễn Văn Linh, Q7, TP.HCM', phone: '028-1111-0002' },
    { code: 'SHP-003', name: 'Cửa hàng Hà Nội - Cầu Giấy', address: '35 Trần Duy Hưng, Cầu Giấy, Hà Nội', phone: '024-2222-0003' },
    { code: 'SHP-004', name: 'Cửa hàng Đà Nẵng - Hải Châu', address: '20 Bạch Đằng, Hải Châu, Đà Nẵng', phone: '0236-3333-0004' },
    { code: 'SHP-005', name: 'Cửa hàng Bình Thạnh - Landmark', address: '5 Điện Biên Phủ, Bình Thạnh, TP.HCM', phone: '028-1111-0005' },
  ];
  const storeCount = Math.max(1, Math.min(storeTemplates.length, seedConfig.stores));
  const stores = [] as Array<Awaited<ReturnType<typeof upsertStore>>>;
  for (let i = 0; i < storeCount; i++) {
    stores.push(await upsertStore(storeTemplates[i].code, storeTemplates[i]));
  }

  // 3) Users
  const adminUser = await upsertUser(
    { username: 'admin' },
    {
      email: 'admin@storechain.com',
      fullName: 'Super Admin',
      passwordPlain: 'admin123',
      roleId: roleAdmin.id,
      primaryStoreId: stores[0]?.id ?? null,
    },
  );

  const managerUser = await upsertUser(
    { username: 'manager01' },
    {
      email: 'manager01@storechain.com',
      fullName: 'Quản lý Chuỗi',
      passwordPlain: 'manager123',
      roleId: roleManager.id,
      primaryStoreId: stores[0]?.id ?? null,
    },
  );

  const storeManagerUser = await upsertUser(
    { username: 'storemgr01' },
    {
      email: 'storemgr01@storechain.com',
      fullName: 'Quản lý Cửa hàng',
      passwordPlain: 'storemgr123',
      roleId: roleStoreManager.id,
      primaryStoreId: stores[0]?.id ?? null,
    },
  );

  const cashiers = [] as Array<Awaited<ReturnType<typeof upsertUser>>>;
  for (let i = 0; i < Math.max(2, storeCount); i++) {
    cashiers.push(
      await upsertUser(
        { username: `cashier${String(i + 1).padStart(2, '0')}` },
        {
          email: `cashier${String(i + 1).padStart(2, '0')}@storechain.com`,
          fullName: `Thu ngân ${i + 1}`,
          passwordPlain: 'cashier123',
          roleId: roleCashier.id,
          primaryStoreId: stores[i % storeCount]?.id ?? stores[0]?.id ?? null,
        },
      ),
    );
  }

  const inventoryUser = await upsertUser(
    { username: 'inventory01' },
    {
      email: 'inventory01@storechain.com',
      fullName: 'Nhân viên kho',
      passwordPlain: 'inventory123',
      roleId: roleInventory.id,
      primaryStoreId: stores[0]?.id ?? null,
    },
  );

  // user_stores mapping (multi-store)
  const userStoreRows: Prisma.user_storesCreateManyInput[] = [];
  for (const s of stores) {
    userStoreRows.push({ user_id: adminUser.id, store_id: s.id, role_id: roleAdmin.id, is_primary: s.id === (stores[0]?.id ?? s.id), is_active: true });
    userStoreRows.push({ user_id: managerUser.id, store_id: s.id, role_id: roleManager.id, is_primary: s.id === (stores[0]?.id ?? s.id), is_active: true });
  }
  userStoreRows.push({ user_id: storeManagerUser.id, store_id: stores[0].id, role_id: roleStoreManager.id, is_primary: true, is_active: true });
  userStoreRows.push({ user_id: inventoryUser.id, store_id: stores[0].id, role_id: roleInventory.id, is_primary: true, is_active: true });
  for (let i = 0; i < cashiers.length; i++) {
    const targetStore = stores[i % storeCount];
    userStoreRows.push({ user_id: cashiers[i].id, store_id: targetStore.id, role_id: roleCashier.id, is_primary: true, is_active: true });
  }
  await prisma.user_stores.createMany({ data: userStoreRows, skipDuplicates: true });

  // 4) Master data: Categories + Brands
  const categoriesSeed = [
    { code: 'CAT-FOOD', name: 'Thực phẩm', parent_id: null },
    { code: 'CAT-BEVERAGE', name: 'Đồ uống', parent_id: null },
    { code: 'CAT-HOUSE', name: 'Hàng gia dụng', parent_id: null },
    { code: 'CAT-PERSONAL', name: 'Chăm sóc cá nhân', parent_id: null },
  ];
  await prisma.categories.createMany({
    data: categoriesSeed.map((c) => ({ code: c.code, name: c.name, parent_id: null, is_active: true })),
    skipDuplicates: true,
  });
  const catRows = await prisma.categories.findMany({ orderBy: { id: 'asc' } });
  const catByCode = new Map(catRows.map((c) => [c.code, c]));

  // Add sub-categories
  const subCats = [
    { code: 'CAT-DAIRY', name: 'Sữa & chế phẩm', parent: 'CAT-FOOD' },
    { code: 'CAT-INSTANT', name: 'Đồ ăn nhanh', parent: 'CAT-FOOD' },
    { code: 'CAT-SNACK', name: 'Bánh kẹo & snack', parent: 'CAT-FOOD' },
    { code: 'CAT-WATER', name: 'Nước uống đóng chai', parent: 'CAT-BEVERAGE' },
    { code: 'CAT-SODA', name: 'Nước ngọt', parent: 'CAT-BEVERAGE' },
    { code: 'CAT-COFFEE', name: 'Cà phê & trà', parent: 'CAT-BEVERAGE' },
    { code: 'CAT-CLEAN', name: 'Tẩy rửa', parent: 'CAT-HOUSE' },
    { code: 'CAT-TISSUE', name: 'Giấy & khăn', parent: 'CAT-HOUSE' },
    { code: 'CAT-SHAMPOO', name: 'Dầu gội', parent: 'CAT-PERSONAL' },
    { code: 'CAT-SKIN', name: 'Chăm sóc da', parent: 'CAT-PERSONAL' },
  ];
  await prisma.categories.createMany({
    data: subCats.map((c) => ({ code: c.code, name: c.name, parent_id: catByCode.get(c.parent)?.id ?? null, is_active: true })),
    skipDuplicates: true,
  });
  const categories = await prisma.categories.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } });

  const brandsSeed = [
    { code: 'BR-VNM', name: 'Vinamilk' },
    { code: 'BR-TH', name: 'TH True Milk' },
    { code: 'BR-COCA', name: 'Coca-Cola' },
    { code: 'BR-PEPSI', name: 'Pepsi' },
    { code: 'BR-NES', name: 'Nestlé' },
    { code: 'BR-UNILEVER', name: 'Unilever' },
    { code: 'BR-PG', name: 'P&G' },
    { code: 'BR-OMACHI', name: 'Omachi' },
    { code: 'BR-HAOHAO', name: 'Hảo Hảo' },
    { code: 'BR-AQUA', name: 'Aquafina' },
    { code: 'BR-LAVIE', name: 'LaVie' },
    { code: 'BR-OREO', name: 'Oreo' },
    { code: 'BR-KINHDO', name: 'Kinh Đô' },
    { code: 'BR-ACE', name: 'Acecook' },
    { code: 'BR-MASAN', name: 'Masan' },
    { code: 'BR-CHIN-SU', name: 'CHIN-SU' },
    { code: 'BR-SUNLIGHT', name: 'Sunlight' },
    { code: 'BR-SAFEGUARD', name: 'Safeguard' },
    { code: 'BR-HEADSHOULDERS', name: 'Head & Shoulders' },
    { code: 'BR-DOVE', name: 'Dove' },
  ];
  await prisma.brands.createMany({
    data: brandsSeed.map((b) => ({ code: b.code, name: b.name, is_active: true })),
    skipDuplicates: true,
  });
  const brands = await prisma.brands.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } });

  // 5) Suppliers
  const suppliersSeed: Prisma.suppliersCreateManyInput[] = [
    { name: 'Công ty TM Tổng hợp Minh Long', contact_name: 'Nguyễn Văn Long', phone: '0909000001', email: 'minhlong@suppliers.vn', address: 'TP.HCM', note: 'Giao hàng trong 24h' },
    { name: 'Nhà phân phối Thực phẩm An Khang', contact_name: 'Trần Thị Hạnh', phone: '0909000002', email: 'ankhang@suppliers.vn', address: 'TP.HCM', note: 'Hàng tiêu dùng nhanh' },
    { name: 'CTY Nước giải khát Sông Xanh', contact_name: 'Phạm Quốc Bảo', phone: '0909000003', email: 'songxanh@suppliers.vn', address: 'Bình Dương', note: 'Chuyên nước uống' },
    { name: 'Kho Hàng Gia Dụng Việt', contact_name: 'Lê Minh Trí', phone: '0909000004', email: 'giadungviet@suppliers.vn', address: 'Đồng Nai', note: 'Giấy - tẩy rửa' },
    { name: 'Nhà phân phối Miền Bắc', contact_name: 'Đỗ Thanh Hà', phone: '0909000005', email: 'mienbac@suppliers.vn', address: 'Hà Nội', note: 'Giao tuyến HN' },
    { name: 'Đại lý Bánh kẹo Hương Việt', contact_name: 'Vũ Thị Mai', phone: '0909000006', email: 'huongviet@suppliers.vn', address: 'TP.HCM', note: null },
    { name: 'Nhà cung cấp Sữa & Dairy', contact_name: 'Hoàng Nam', phone: '0909000007', email: 'dairy@suppliers.vn', address: 'TP.HCM', note: 'Có hóa đơn VAT' },
    { name: 'Nhà phân phối Vận tải lạnh', contact_name: 'Nguyễn Văn Quân', phone: '0909000008', email: 'cold@suppliers.vn', address: 'TP.HCM', note: 'Giao lạnh' },
  ];
  await prisma.suppliers.createMany({ data: suppliersSeed, skipDuplicates: true });
  const suppliers = await prisma.suppliers.findMany({ orderBy: { id: 'asc' } });

  // 6) Customers
  const firstNames = ['An', 'Bình', 'Chi', 'Dung', 'Dũng', 'Hà', 'Hạnh', 'Hòa', 'Hùng', 'Khoa', 'Lan', 'Linh', 'Minh', 'Nga', 'Ngọc', 'Phúc', 'Quân', 'Sơn', 'Trang', 'Tuấn', 'Vy'];
  const lastNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Vũ', 'Đặng', 'Bùi', 'Đỗ'];
  const customersSeed: Prisma.customersCreateManyInput[] = [];
  for (let i = 0; i < seedConfig.customers; i++) {
    const name = `${pick(rng, lastNames)} ${pick(rng, firstNames)}`;
    const phone = `09${String(randInt(rng, 0, 99999999)).padStart(8, '0')}`;
    customersSeed.push({
      name,
      phone,
      email: `customer${i + 1}@mail.local`,
      loyalty_id: `LOY-${String(i + 1).padStart(6, '0')}`,
    });
  }
  await prisma.customers.createMany({ data: customersSeed, skipDuplicates: true });
  const customers = await prisma.customers.findMany({ orderBy: { id: 'asc' } });

  // 7) Products + Variants
  const units = ['chai', 'lon', 'gói', 'hộp', 'kg', 'bịch', 'cái'];
  const productNameNouns = [
    'Sữa tươi',
    'Sữa chua',
    'Mì gói',
    'Nước suối',
    'Nước ngọt',
    'Bánh quy',
    'Snack',
    'Cà phê hòa tan',
    'Trà đóng chai',
    'Nước rửa chén',
    'Bột giặt',
    'Giấy vệ sinh',
    'Khăn giấy',
    'Dầu gội',
    'Sữa tắm',
    'Xà phòng',
  ];
  const packSizes = ['330ml', '500ml', '1L', '1.5L', '180g', '350g', '500g', '1kg', '10 gói', '20 gói'];

  const productsToCreate: Prisma.productsCreateManyInput[] = [];

  for (let i = 0; i < seedConfig.products; i++) {
    const brand = pick(rng, brands);
    const category = pick(rng, categories);
    const unit = pick(rng, units);
    const noun = pick(rng, productNameNouns);
    const size = pick(rng, packSizes);
    const sku = `PRD-${String(i + 1).padStart(5, '0')}`;
    const name = `${noun} ${brand.name} ${size}`;
    productsToCreate.push({
      sku,
      name,
      brand: brand.name,
      category: category.name,
      brand_id: brand.id,
      category_id: category.id,
      description: `Sản phẩm ${noun.toLowerCase()} - ${size}.`,
      unit,
      is_active: true,
    });
  }

  // Ensure some iconic items exist
  const mustHave = [
    { sku: 'PRD-ICON-0001', name: 'Sữa tươi Vinamilk 1L', brandCode: 'BR-VNM', catCode: 'CAT-DAIRY', unit: 'chai' },
    { sku: 'PRD-ICON-0002', name: 'Coca-Cola 330ml', brandCode: 'BR-COCA', catCode: 'CAT-SODA', unit: 'lon' },
    { sku: 'PRD-ICON-0003', name: 'Nước suối Aquafina 500ml', brandCode: 'BR-AQUA', catCode: 'CAT-WATER', unit: 'chai' },
    { sku: 'PRD-ICON-0004', name: 'Mì gói Hảo Hảo tôm chua cay', brandCode: 'BR-HAOHAO', catCode: 'CAT-INSTANT', unit: 'gói' },
    { sku: 'PRD-ICON-0005', name: 'Bánh Oreo Original', brandCode: 'BR-OREO', catCode: 'CAT-SNACK', unit: 'gói' },
  ];

  const brandByCode = new Map(brands.map((b) => [b.code, b]));
  const categoryByCode = new Map(categories.map((c) => [c.code, c]));
  for (const it of mustHave) {
    const brand = brandByCode.get(it.brandCode);
    const category = categoryByCode.get(it.catCode);
    if (!brand || !category) continue;
    productsToCreate.push({
      sku: it.sku,
      name: it.name,
      brand: brand.name,
      category: category.name,
      brand_id: brand.id,
      category_id: category.id,
      description: 'Sản phẩm bán chạy',
      unit: it.unit,
      is_active: true,
    });
  }

  await prisma.products.createMany({ data: productsToCreate, skipDuplicates: true });
  const products = await prisma.products.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } });

  const variantsToCreate: Prisma.product_variantsCreateManyInput[] = [];
  let barcodeIdx = 100000; // for ean13FromIndex
  for (const p of products) {
    const variantCount = rng() < 0.18 ? 3 : rng() < 0.45 ? 2 : 1;
    for (let j = 0; j < variantCount; j++) {
      const variant_code = variantCount === 1 ? 'STD' : String(j + 1).padStart(2, '0');
      const cost = roundTo(randInt(rng, 3000, 40000) * (rng() < 0.15 ? 2 : 1), 100);
      const price = roundTo(cost * (1.15 + rng() * 0.35), 500);
      const barcode = ean13FromIndex(barcodeIdx++);
      variantsToCreate.push({
        product_id: p.id,
        variant_code,
        name: variantCount === 1 ? p.name : `${p.name} - Quy cách ${j + 1}`,
        barcode,
        price: new Prisma.Decimal(price),
        cost_price: new Prisma.Decimal(cost),
        min_stock: new Prisma.Decimal(randInt(rng, 5, 30)),
        is_active: true,
      });
    }
  }

  await prisma.product_variants.createMany({ data: variantsToCreate, skipDuplicates: true });
  const variants = await prisma.product_variants.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } });

  // 8) Inventories: one row per store + variant
  const inventoryRows: Prisma.inventoriesCreateManyInput[] = [];
  for (const s of stores) {
    for (const v of variants) {
      inventoryRows.push({
        store_id: s.id,
        variant_id: v.id,
        quantity: new Prisma.Decimal(0),
        reserved: new Prisma.Decimal(0),
        last_cost: v.cost_price,
      });
    }
  }
  // Chunk createMany to avoid huge payload
  const chunkSize = 2000;
  for (let i = 0; i < inventoryRows.length; i += chunkSize) {
    await prisma.inventories.createMany({ data: inventoryRows.slice(i, i + chunkSize), skipDuplicates: true });
  }

  // 9) Variant price windows per store (history + current)
  const variantPrices: Prisma.variant_pricesCreateManyInput[] = [];
  for (const s of stores) {
    const chosen = shuffleInPlace(rng, [...variants]).slice(0, Math.min(50, variants.length));
    for (let i = 0; i < chosen.length; i++) {
      const v = chosen[i];
      const basePrice = Number(v.price);
      const oldStart = daysAgo(10 + randInt(rng, 0, 5));
      const oldEnd = daysAgo(3 + randInt(rng, 0, 2));
      const newStart = new Date(oldEnd.getTime() + 1000 * 60 * 10);
      const oldPrice = roundTo(basePrice * (0.9 + rng() * 0.08), 500);
      const newPrice = roundTo(basePrice * (0.82 + rng() * 0.12), 500);
      variantPrices.push({
        store_id: s.id,
        variant_id: v.id,
        price: new Prisma.Decimal(oldPrice),
        start_at: oldStart,
        end_at: oldEnd,
        created_by: storeManagerUser.id,
      });
      variantPrices.push({
        store_id: s.id,
        variant_id: v.id,
        price: new Prisma.Decimal(newPrice),
        start_at: newStart,
        end_at: null,
        created_by: storeManagerUser.id,
      });
    }
  }
  // createMany might hit unique(store_id, variant_id, start_at) duplicates if re-seeded without reset
  for (let i = 0; i < variantPrices.length; i += chunkSize) {
    await prisma.variant_prices.createMany({ data: variantPrices.slice(i, i + chunkSize), skipDuplicates: true });
  }

  // Helper: effective price for store+variant at "now"
  const getEffectivePriceMap = async (storeId: number, variantIds: number[]) => {
    const now = new Date();
    const rows = await prisma.variant_prices.findMany({
      where: {
        store_id: storeId,
        variant_id: { in: variantIds },
        start_at: { lte: now },
        OR: [{ end_at: null }, { end_at: { gt: now } }],
      },
      orderBy: { start_at: 'desc' },
      distinct: ['variant_id'],
    });
    return new Map(rows.map((r) => [r.variant_id, r.price] as const));
  };

  // 10) Receiving: purchase orders + receipts => inventory up
  console.log('📦 Seeding purchase orders + receipts (receiving)...');
  for (const s of stores) {
    const clerkId = inventoryUser.id;
    const supplierPool = shuffleInPlace(rng, [...suppliers]).slice(0, Math.min(5, suppliers.length));
    const variantPool = shuffleInPlace(rng, [...variants]).slice(0, Math.min(220, variants.length));

    for (let poIdx = 0; poIdx < seedConfig.purchaseOrdersPerStore; poIdx++) {
      const supplier = pick(rng, supplierPool);
      const itemsCount = randInt(rng, 10, 18);
      const chosenVariants = shuffleInPlace(rng, [...variantPool]).slice(0, itemsCount);

      const po = await prisma.purchase_orders.create({
        data: {
          supplier_id: supplier.id,
          store_id: s.id,
          order_number: `PO-${s.code}-${String(poIdx + 1).padStart(4, '0')}`,
          status: 'approved',
          total_amount: new Prisma.Decimal(0),
          created_by: clerkId,
          created_at: daysAgo(12 - Math.min(10, poIdx)),
          updated_at: daysAgo(12 - Math.min(10, poIdx)),
        },
      });

      let poTotal = 0;
      const purchaseItems: Array<{ id: number; variantId: number; qty: number; unitCost: number; lineTotal: number }> = [];
      for (const v of chosenVariants) {
        const qty = randInt(rng, 20, 180);
        const unitCost = roundTo(Number(v.cost_price ?? 0) * (0.95 + rng() * 0.08), 100);
        const lineTotal = qty * unitCost;
        poTotal += lineTotal;
        const pi = await prisma.purchase_items.create({
          data: {
            purchase_order_id: po.id,
            variant_id: v.id,
            quantity: qty,
            received_quantity: 0,
            unit_cost: new Prisma.Decimal(unitCost),
            line_total: new Prisma.Decimal(lineTotal),
          },
        });
        purchaseItems.push({ id: pi.id, variantId: v.id, qty, unitCost, lineTotal });
      }

      await prisma.purchase_orders.update({
        where: { id: po.id },
        data: { total_amount: new Prisma.Decimal(poTotal), updated_at: new Date() },
      });

      // Create receipt (fully received)
      const receipt = await prisma.purchase_order_receipts.create({
        data: {
          purchase_order_id: po.id,
          supplier_id: supplier.id,
          store_id: s.id,
          receipt_number: `GRN-${s.code}-${String(poIdx + 1).padStart(4, '0')}`,
          supplier_invoice: `INV-${supplier.id}-${po.id}`,
          status: 'received',
          received_at: daysAgo(7 - Math.min(6, poIdx)) ,
          note: 'Nhập hàng định kỳ',
          total_cost: new Prisma.Decimal(poTotal),
          created_by: clerkId,
        },
      });

      for (const it of purchaseItems) {
        const expiry = rng() < 0.35 ? new Date(Date.now() + randInt(rng, 30, 365) * 24 * 60 * 60 * 1000) : null;
        const lotCode = `LOT-${receipt.id}-${it.variantId}-${randInt(rng, 100, 999)}`;
        const lineTotal = it.qty * it.unitCost;

        await prisma.purchase_order_receipt_items.create({
          data: {
            receipt_id: receipt.id,
            variant_id: it.variantId,
            purchase_item_id: it.id,
            quantity_received: it.qty,
            unit_cost: new Prisma.Decimal(it.unitCost),
            line_total: new Prisma.Decimal(lineTotal),
            lot_code: lotCode,
            expiry_date: expiry,
          },
        });

        await prisma.purchase_items.update({
          where: { id: it.id },
          data: { received_quantity: it.qty },
        });

        // inventory + stock movement + lot
        const inv = await prisma.inventories.findFirst({ where: { store_id: s.id, variant_id: it.variantId } });
        if (inv) {
          await prisma.inventories.update({
            where: { id: inv.id },
            data: {
              quantity: { increment: it.qty as any },
              last_cost: new Prisma.Decimal(it.unitCost),
              last_update: new Date(),
            },
          });
        }

        await prisma.stock_movements.create({
          data: {
            store_id: s.id,
            variant_id: it.variantId,
            change: it.qty as any,
            movement_type: 'receive',
            reference_id: String(receipt.id),
            reason: 'GRN receiving',
            created_by: clerkId,
            created_at: receipt.received_at ?? new Date(),
          },
        });

        await prisma.stock_lots.create({
          data: {
            store_id: s.id,
            variant_id: it.variantId,
            lot_code: lotCode,
            quantity: new Prisma.Decimal(it.qty),
            quantity_remaining: new Prisma.Decimal(it.qty),
            cost: new Prisma.Decimal(it.unitCost),
            received_at: receipt.received_at ?? new Date(),
            expiry_date: expiry,
          },
        });
      }

      await prisma.purchase_orders.update({ where: { id: po.id }, data: { status: 'received', updated_at: new Date() } });
    }
  }

  // 11) POS: open shifts + invoices + stock movements (sale)
  console.log('🧾 Seeding POS shifts + invoices...');
  for (let si = 0; si < stores.length; si++) {
    const s = stores[si];
    const cashier = cashiers[si % cashiers.length];

    const shift = await prisma.pos_shifts.create({
      data: {
        store_id: s.id,
        status: 'open',
        opened_by: cashier.id,
        opened_at: hoursAgo(8),
        opening_cash: new Prisma.Decimal(1500000 + randInt(rng, 0, 500000)),
        note: 'Ca sáng',
      },
    });

    // Opening cash movement for realism
    await prisma.cash_movements.create({
      data: {
        store_id: s.id,
        shift_id: shift.id,
        type: 'cash_in',
        amount: shift.opening_cash ?? new Prisma.Decimal(0),
        reason: 'Opening cash',
        created_by: cashier.id,
        created_at: shift.opened_at,
      },
    });

    const variantIds = variants.map((v) => v.id);
    const effectivePrice = await getEffectivePriceMap(s.id, variantIds);
    const salePool = shuffleInPlace(rng, [...variants]).slice(0, Math.min(240, variants.length));

    for (let invIdx = 0; invIdx < seedConfig.invoicesPerStore; invIdx++) {
      const itemsCount = randInt(rng, 2, 6);
      const chosen = shuffleInPlace(rng, [...salePool]).slice(0, itemsCount);
      const customer = rng() < 0.6 ? pick(rng, customers) : null;
      const payment_method = rng() < 0.7 ? 'cash' : rng() < 0.85 ? 'card' : 'ewallet';
      const createdAt = hoursAgo(randInt(rng, 1, 48));

      await prisma.$transaction(async (tx) => {
        let subtotal = 0;
        const parsed: Array<{ variantId: number; qty: number; unitPrice: Prisma.Decimal; unitCost: Prisma.Decimal | null }> = [];

        const invRows = await tx.inventories.findMany({
          where: { store_id: s.id, variant_id: { in: chosen.map((c) => c.id) } },
        });

        for (const v of chosen) {
          const invRow = invRows.find((r) => r.variant_id === v.id);
          const maxQty = Math.max(1, Math.min(4, Math.floor(Number(invRow?.quantity ?? 0) / 5) || 1));
          const qty = randInt(rng, 1, maxQty);
          const unitPrice = (effectivePrice.get(v.id) ?? v.price) as Prisma.Decimal;
          const unitCost = (invRow?.last_cost ?? v.cost_price ?? null) as Prisma.Decimal | null;
          subtotal += Number(unitPrice) * qty;
          parsed.push({ variantId: v.id, qty, unitPrice, unitCost });
        }

        const discount = rng() < 0.25 ? roundTo(subtotal * (0.02 + rng() * 0.06), 500) : 0;
        const tax = 0;
        const total = Math.max(0, subtotal + tax - discount);

        const invoice = await tx.invoices.create({
          data: {
            invoice_number: `INV-${s.code}-${String(invIdx + 1).padStart(6, '0')}`,
            store_id: s.id,
            customer_id: customer?.id ?? null,
            created_by: cashier.id,
            created_at: createdAt,
            payment_method,
            subtotal: new Prisma.Decimal(roundTo(subtotal, 1)),
            discount: new Prisma.Decimal(discount),
            tax: new Prisma.Decimal(tax),
            total: new Prisma.Decimal(roundTo(total, 1)),
          },
        });

        for (const it of parsed) {
          const invRow = invRows.find((r) => r.variant_id === it.variantId);
          if (!invRow) continue;

          await tx.invoice_items.create({
            data: {
              invoice_id: invoice.id,
              variant_id: it.variantId,
              quantity: it.qty as any,
              unit_price: it.unitPrice,
              unit_cost: it.unitCost,
              line_total: new Prisma.Decimal(Number(it.unitPrice) * it.qty),
            },
          });

          await tx.inventories.update({
            where: { id: invRow.id },
            data: { quantity: { decrement: it.qty as any }, last_update: new Date() },
          });

          await tx.stock_movements.create({
            data: {
              store_id: s.id,
              variant_id: it.variantId,
              change: (-it.qty) as any,
              movement_type: 'sale',
              reference_id: String(invoice.id),
              reason: 'Seed POS sale',
              created_by: cashier.id,
              created_at: createdAt,
            },
          });
        }
      });
    }

    // Some cash out movements (petty cash)
    await prisma.cash_movements.createMany({
      data: [
        { store_id: s.id, shift_id: shift.id, type: 'cash_out', amount: new Prisma.Decimal(50000), reason: 'Mua vật tư', created_by: cashier.id },
        { store_id: s.id, shift_id: shift.id, type: 'cash_out', amount: new Prisma.Decimal(80000), reason: 'Chi lẻ', created_by: cashier.id },
      ],
    });
  }

  // 12) Returns: create some returns for invoices
  console.log('↩️ Seeding returns...');
  const allInvoices = await prisma.invoices.findMany({
    where: { payment_method: { not: null } },
    include: { invoice_items: true },
    orderBy: { id: 'asc' },
  });

  const invoicesByStore = new Map<number, typeof allInvoices>();
  for (const inv of allInvoices) {
    const sid = inv.store_id;
    if (!sid) continue;
    if (!invoicesByStore.has(sid)) invoicesByStore.set(sid, [] as any);
    (invoicesByStore.get(sid) as any).push(inv);
  }

  for (const s of stores) {
    const list = invoicesByStore.get(s.id) ?? [];
    const sample = shuffleInPlace(rng, [...list]).slice(0, Math.min(18, list.length));
    for (let i = 0; i < sample.length; i++) {
      const inv = sample[i];
      const cashierId = inv.created_by ?? cashiers[0]?.id ?? adminUser.id;
      const items = inv.invoice_items.filter((it) => it.variant_id && Number(it.quantity) > 0);
      if (!items.length) continue;

      const restock = rng() < 0.65;
      const refundMethod = inv.payment_method === 'cash' ? 'cash' : 'store_credit';

      const chosenItems = shuffleInPlace(rng, [...items]).slice(0, rng() < 0.8 ? 1 : 2);
      let totalRefund = 0;

      const createdReturn = await prisma.returns.create({
        data: {
          return_number: `RTN-${s.code}-${String(inv.id).padStart(6, '0')}`,
          invoice_id: inv.id,
          store_id: s.id,
          customer_id: inv.customer_id ?? null,
          status: 'completed',
          reason: pick(rng, ['Đổi ý', 'Lỗi sản phẩm', 'Sai quy cách', 'Hư hỏng nhẹ']),
          note: 'Seed return',
          total_refund: new Prisma.Decimal(0),
          created_by: cashierId,
          created_at: hoursAgo(randInt(rng, 1, 36)),
          updated_at: new Date(),
        },
      });

      for (const it of chosenItems) {
        const qty = 1;
        const unitPrice = it.unit_price;
        const refundAmount = Number(unitPrice) * qty;
        totalRefund += refundAmount;
        await prisma.return_items.create({
          data: {
            return_id: createdReturn.id,
            invoice_item_id: it.id,
            variant_id: it.variant_id!,
            quantity: qty as any,
            unit_price: unitPrice,
            refund_amount: new Prisma.Decimal(refundAmount),
            reason: 'Seed return item',
          },
        });

        if (restock) {
          const invRow = await prisma.inventories.findFirst({ where: { store_id: s.id, variant_id: it.variant_id! } });
          if (invRow) {
            await prisma.inventories.update({
              where: { id: invRow.id },
              data: { quantity: { increment: qty as any }, last_update: new Date() },
            });
          }
          await prisma.stock_movements.create({
            data: {
              store_id: s.id,
              variant_id: it.variant_id!,
              change: qty as any,
              movement_type: 'return',
              reference_id: String(createdReturn.id),
              reason: 'Seed return restock',
              created_by: cashierId,
            },
          });
        }
      }

      await prisma.returns.update({
        where: { id: createdReturn.id },
        data: { total_refund: new Prisma.Decimal(totalRefund), updated_at: new Date() },
      });

      if (refundMethod === 'cash') {
        const openShift = await prisma.pos_shifts.findFirst({ where: { store_id: s.id, status: 'open' }, orderBy: { opened_at: 'desc' } });
        await prisma.cash_movements.create({
          data: {
            store_id: s.id,
            shift_id: openShift?.id ?? null,
            type: 'cash_out',
            amount: new Prisma.Decimal(totalRefund),
            reason: `Refund return ${createdReturn.id}`,
            created_by: cashierId,
          },
        });
      }
    }
  }

  // 13) Promotions (optional)
  await prisma.promotions.createMany({
    data: [
      {
        code: 'PROMO-NEWYEAR-10P',
        name: 'Tết - giảm 10%',
        description: 'Áp dụng toàn hệ thống',
        type: 'PERCENTAGE',
        value: new Prisma.Decimal(10),
        start_date: daysAgo(5),
        end_date: daysAgo(-10),
        min_order_value: new Prisma.Decimal(100000),
        max_discount: new Prisma.Decimal(50000),
        is_active: true,
        scope: 'all',
        store_codes: [],
        usage_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        code: 'PROMO-CASH-20K',
        name: 'Giảm 20k hóa đơn',
        description: 'Giảm trực tiếp 20k cho hóa đơn đủ điều kiện',
        type: 'FIXED_AMOUNT',
        value: new Prisma.Decimal(20000),
        start_date: daysAgo(2),
        end_date: daysAgo(-20),
        min_order_value: new Prisma.Decimal(200000),
        max_discount: new Prisma.Decimal(20000),
        is_active: true,
        scope: 'all',
        store_codes: [],
        usage_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Seed completed.');
  console.log('Login accounts:');
  console.log('- admin@storechain.com / admin123');
  console.log('- manager01@storechain.com / manager123');
  console.log('- storemgr01@storechain.com / storemgr123');
  console.log('- cashier01@storechain.com / cashier123');
  console.log('- inventory01@storechain.com / inventory123');
};

main()
  .catch((e) => {
    console.error('❌ Seeding failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });