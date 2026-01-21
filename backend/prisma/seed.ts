import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

import prisma from '../src/db/prisma';
import { Prisma } from '../src/generated/prisma';

dotenv.config();

type IdRow = { id: string };

const upsertRole = async (name: string, description: string | null) => {
  const rows = await prisma.$queryRaw<IdRow[]>(Prisma.sql`
    INSERT INTO roles (name, description)
    VALUES (${name}, ${description})
    ON CONFLICT (name)
    DO UPDATE SET description = EXCLUDED.description
    RETURNING id::text as id
  `);
  return rows[0].id;
};

const upsertStore = async (code: string, name: string) => {
  const rows = await prisma.$queryRaw<IdRow[]>(Prisma.sql`
    INSERT INTO stores (code, name, address, phone, is_active, timezone)
    VALUES (${code}, ${name}, 'Demo address', '0000000000', true, 'Asia/Ho_Chi_Minh')
    ON CONFLICT (code)
    DO UPDATE SET name = EXCLUDED.name, is_active = true
    RETURNING id::text as id
  `);
  return rows[0].id;
};

const upsertUser = async (email: string, name: string, passwordHash: string, roleId: string, storeId: string | null) => {
  const rows = await prisma.$queryRaw<IdRow[]>(Prisma.sql`
    INSERT INTO users (email, name, password_hash, role_id, store_id)
    VALUES (${email}, ${name}, ${passwordHash}, ${roleId}::uuid, ${storeId ? Prisma.sql`${storeId}::uuid` : Prisma.sql`NULL`})
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      role_id = EXCLUDED.role_id,
      store_id = EXCLUDED.store_id
    RETURNING id::text as id
  `);
  return rows[0].id;
};

const getOrCreateProduct = async (name: string, description: string | null = null) => {
  const existing = await prisma.$queryRaw<IdRow[]>(Prisma.sql`
    SELECT id::text as id FROM products WHERE name = ${name} LIMIT 1
  `);
  if (existing.length) return existing[0].id;

  const rows = await prisma.$queryRaw<IdRow[]>(Prisma.sql`
    INSERT INTO products (name, description)
    VALUES (${name}, ${description})
    RETURNING id::text as id
  `);
  return rows[0].id;
};

const upsertSku = async (productId: string, skuCode: string, barcode: string | null, unit: string, cost: number, price: number) => {
  const rows = await prisma.$queryRaw<IdRow[]>(Prisma.sql`
    INSERT INTO skus (product_id, sku_code, barcode, unit, cost, price)
    VALUES (${productId}::uuid, ${skuCode}, ${barcode}, ${unit}, ${cost}, ${price})
    ON CONFLICT (sku_code)
    DO UPDATE SET
      product_id = EXCLUDED.product_id,
      barcode = EXCLUDED.barcode,
      unit = EXCLUDED.unit,
      cost = EXCLUDED.cost,
      price = EXCLUDED.price
    RETURNING id::text as id
  `);
  return rows[0].id;
};

const upsertInventory = async (storeId: string, skuId: string, quantity: number) => {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO inventory_levels (store_id, sku_id, quantity, reserved)
    VALUES (${storeId}::uuid, ${skuId}::uuid, ${quantity}, 0)
    ON CONFLICT (store_id, sku_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, reserved = 0, updated_at = CURRENT_TIMESTAMP
  `);
};

async function main() {
  console.log('🌱 Starting seeding...');

  const [adminRoleId, cashierRoleId] = await Promise.all([
    upsertRole('admin', 'Quản trị viên hệ thống'),
    upsertRole('cashier', 'Nhân viên thu ngân'),
  ]);

  const storeId = await upsertStore('SHP-001', 'Cửa hàng Demo');

  const [adminHash, cashierHash] = await Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('cashier123', 10),
  ]);

  await upsertUser('admin@storechain.com', 'Super Admin', adminHash, adminRoleId, storeId);
  await upsertUser('cashier@storechain.com', 'Cashier Demo', cashierHash, cashierRoleId, storeId);

  // Seed a small SKU catalog for POS
  const demoSkus = [
    { skuCode: 'SKU-001', barcode: '8934673001014', name: 'Sữa tươi Vinamilk 1L', unit: 'chai', cost: 28000, price: 35000, qty: 50 },
    { skuCode: 'SKU-002', barcode: '5449000000996', name: 'Coca-Cola 330ml', unit: 'lon', cost: 8000, price: 12000, qty: 100 },
    { skuCode: 'SKU-003', barcode: '8935024111111', name: 'Bánh Oreo', unit: 'gói', cost: 18000, price: 25000, qty: 30 },
    { skuCode: 'SKU-004', barcode: '8934563001012', name: 'Mì gói Hảo Hảo', unit: 'gói', cost: 3500, price: 5000, qty: 200 },
    { skuCode: 'SKU-005', barcode: '6920152410012', name: 'Nước suối Aquafina', unit: 'chai', cost: 5000, price: 8000, qty: 80 },
  ];

  for (const it of demoSkus) {
    const productId = await getOrCreateProduct(it.name, null);
    const skuId = await upsertSku(productId, it.skuCode, it.barcode, it.unit, it.cost, it.price);
    await upsertInventory(storeId, skuId, it.qty);
  }

  console.log('✅ Seeded roles/users/store/products/skus/inventory');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });