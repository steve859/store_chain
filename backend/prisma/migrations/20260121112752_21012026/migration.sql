/*
  Warnings:

  - The primary key for the `audit_logs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `detail` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `entity` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `entity_id` on the `audit_logs` table. All the data in the column will be lost.
  - The `id` column on the `audit_logs` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `user_id` column on the `audit_logs` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `categories` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `description` on the `categories` table. All the data in the column will be lost.
  - The `id` column on the `categories` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `products` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `products` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `category_id` column on the `products` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `purchase_orders` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `total_cost` on the `purchase_orders` table. All the data in the column will be lost.
  - The `id` column on the `purchase_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `supplier_id` column on the `purchase_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `store_id` column on the `purchase_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `roles` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `roles` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `stores` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `stores` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `suppliers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `contact_person` on the `suppliers` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `suppliers` table. All the data in the column will be lost.
  - You are about to drop the column `tax_code` on the `suppliers` table. All the data in the column will be lost.
  - The `id` column on the `suppliers` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `deleted_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `users` table. All the data in the column will be lost.
  - The `id` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `store_id` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `role_id` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `Permission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_PermissionToRole` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `inventory_levels` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `pos_line_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `pos_sales` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `skus` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `system_settings` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[code]` on the table `categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sku]` on the table `products` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[order_number]` on the table `purchase_orders` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[username]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "_PermissionToRole" DROP CONSTRAINT "_PermissionToRole_A_fkey";

-- DropForeignKey
ALTER TABLE "_PermissionToRole" DROP CONSTRAINT "_PermissionToRole_B_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_levels" DROP CONSTRAINT "inventory_levels_sku_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_levels" DROP CONSTRAINT "inventory_levels_store_id_fkey";

-- DropForeignKey
ALTER TABLE "pos_line_items" DROP CONSTRAINT "pos_line_items_sale_id_fkey";

-- DropForeignKey
ALTER TABLE "pos_line_items" DROP CONSTRAINT "pos_line_items_sku_id_fkey";

-- DropForeignKey
ALTER TABLE "pos_sales" DROP CONSTRAINT "pos_sales_cashier_id_fkey";

-- DropForeignKey
ALTER TABLE "pos_sales" DROP CONSTRAINT "pos_sales_store_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_store_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "skus" DROP CONSTRAINT "skus_product_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_role_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_store_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_pkey",
DROP COLUMN "detail",
DROP COLUMN "entity",
DROP COLUMN "entity_id",
ADD COLUMN     "object_id" TEXT,
ADD COLUMN     "object_type" TEXT,
ADD COLUMN     "payload" JSONB,
DROP COLUMN "id",
ADD COLUMN     "id" BIGSERIAL NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" INTEGER,
ALTER COLUMN "created_at" DROP NOT NULL,
ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "categories" DROP CONSTRAINT "categories_pkey",
DROP COLUMN "description",
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "is_active" BOOLEAN DEFAULT true,
ADD COLUMN     "parent_id" INTEGER,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "created_at" DROP NOT NULL,
ALTER COLUMN "updated_at" DROP NOT NULL,
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "complaints" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "products" DROP CONSTRAINT "products_pkey",
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "brand_id" INTEGER,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "is_active" BOOLEAN DEFAULT true,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "unit" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "created_at" DROP NOT NULL,
DROP COLUMN "category_id",
ADD COLUMN     "category_id" INTEGER,
ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_pkey",
DROP COLUMN "total_cost",
ADD COLUMN     "created_by" INTEGER,
ADD COLUMN     "order_number" TEXT,
ADD COLUMN     "total_amount" DECIMAL(18,2) DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "supplier_id",
ADD COLUMN     "supplier_id" INTEGER,
DROP COLUMN "store_id",
ADD COLUMN     "store_id" INTEGER,
ALTER COLUMN "status" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'draft',
ALTER COLUMN "created_at" DROP NOT NULL,
ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "roles" DROP CONSTRAINT "roles_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "stores" DROP CONSTRAINT "stores_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "created_at" DROP NOT NULL,
ALTER COLUMN "is_active" DROP NOT NULL,
ALTER COLUMN "timezone" DROP NOT NULL,
ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_pkey",
DROP COLUMN "contact_person",
DROP COLUMN "deleted_at",
DROP COLUMN "tax_code",
ADD COLUMN     "contact_name" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "created_at" DROP NOT NULL,
ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "deleted_at",
DROP COLUMN "name",
ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "is_active" BOOLEAN DEFAULT true,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "username" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "store_id",
ADD COLUMN     "store_id" INTEGER,
DROP COLUMN "role_id",
ADD COLUMN     "role_id" INTEGER,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "created_at" DROP NOT NULL,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "Permission";

-- DropTable
DROP TABLE "_PermissionToRole";

-- DropTable
DROP TABLE "inventory_levels";

-- DropTable
DROP TABLE "pos_line_items";

-- DropTable
DROP TABLE "pos_sales";

-- DropTable
DROP TABLE "skus";

-- DropTable
DROP TABLE "system_settings";

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "loyalty_id" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventories" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER,
    "variant_id" INTEGER,
    "quantity" DECIMAL DEFAULT 0,
    "reserved" DECIMAL DEFAULT 0,
    "last_cost" DECIMAL(14,2),
    "last_update" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER,
    "variant_id" INTEGER,
    "quantity" DECIMAL NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "unit_cost" DECIMAL(14,2),
    "line_total" DECIMAL(18,2),

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" TEXT,
    "store_id" INTEGER,
    "customer_id" INTEGER,
    "subtotal" DECIMAL(18,2) DEFAULT 0,
    "tax" DECIMAL(14,2) DEFAULT 0,
    "discount" DECIMAL(14,2) DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "payment_method" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_points" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER,
    "points" INTEGER NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER,
    "variant_code" TEXT,
    "name" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_price" DECIMAL(14,2) DEFAULT 0,
    "min_stock" DECIMAL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER,
    "variant_id" INTEGER,
    "quantity" DECIMAL NOT NULL,
    "received_quantity" DECIMAL NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(18,2),

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" SERIAL NOT NULL,
    "variant_id" INTEGER,
    "store_id" INTEGER,
    "lot_code" TEXT,
    "quantity" DECIMAL NOT NULL,
    "quantity_remaining" DECIMAL NOT NULL,
    "cost" DECIMAL(14,2),
    "received_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "expiry_date" DATE,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" BIGSERIAL NOT NULL,
    "store_id" INTEGER,
    "variant_id" INTEGER,
    "change" DECIMAL NOT NULL,
    "movement_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reason" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_transfer_items" (
    "id" SERIAL NOT NULL,
    "transfer_id" INTEGER,
    "variant_id" INTEGER,
    "quantity" DECIMAL NOT NULL,
    "received_quantity" DECIMAL NOT NULL DEFAULT 0,

    CONSTRAINT "store_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_transfers" (
    "id" SERIAL NOT NULL,
    "transfer_number" TEXT,
    "from_store_id" INTEGER,
    "to_store_id" INTEGER,
    "status" TEXT DEFAULT 'pending',
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stores" (
    "user_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "role_id" INTEGER,
    "is_primary" BOOLEAN DEFAULT false,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_stores_pkey" PRIMARY KEY ("user_id","store_id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_prices" (
    "id" BIGSERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_receipts" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "supplier_id" INTEGER,
    "store_id" INTEGER,
    "receipt_number" TEXT,
    "supplier_invoice" TEXT,
    "status" TEXT DEFAULT 'received',
    "received_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "total_cost" DECIMAL(18,2) DEFAULT 0,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_receipt_items" (
    "id" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "purchase_item_id" INTEGER,
    "quantity_received" DECIMAL NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(18,2),
    "lot_code" TEXT,
    "expiry_date" DATE,

    CONSTRAINT "purchase_order_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" SERIAL NOT NULL,
    "return_number" TEXT,
    "invoice_id" INTEGER,
    "store_id" INTEGER,
    "customer_id" INTEGER,
    "status" TEXT DEFAULT 'draft',
    "reason" TEXT,
    "note" TEXT,
    "total_refund" DECIMAL(18,2) DEFAULT 0,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" SERIAL NOT NULL,
    "return_id" INTEGER NOT NULL,
    "invoice_item_id" INTEGER,
    "variant_id" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unit_price" DECIMAL(14,2),
    "refund_amount" DECIMAL(18,2),
    "reason" TEXT,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_shifts" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "status" TEXT DEFAULT 'open',
    "opened_by" INTEGER NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash" DECIMAL(14,2) DEFAULT 0,
    "closed_by" INTEGER,
    "closed_at" TIMESTAMPTZ(6),
    "closing_cash" DECIMAL(14,2),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" BIGSERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "shift_id" INTEGER,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_customers_phone" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "idx_inventories_store" ON "inventories"("store_id");

-- CreateIndex
CREATE INDEX "idx_inventories_store_variant" ON "inventories"("store_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventories_store_id_variant_id_key" ON "inventories"("store_id", "variant_id");

-- CreateIndex
CREATE INDEX "idx_invoice_items_variant" ON "invoice_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "idx_invoices_created_at" ON "invoices"("created_at");

-- CreateIndex
CREATE INDEX "idx_invoices_store" ON "invoices"("store_id");

-- CreateIndex
CREATE INDEX "idx_invoices_store_created_at" ON "invoices"("store_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode");

-- CreateIndex
CREATE INDEX "idx_variants_barcode" ON "product_variants"("barcode");

-- CreateIndex
CREATE INDEX "idx_variants_variant_code" ON "product_variants"("variant_code");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_variant_code_key" ON "product_variants"("product_id", "variant_code");

-- CreateIndex
CREATE INDEX "idx_stock_lots_variant_store" ON "stock_lots"("variant_id", "store_id");

-- CreateIndex
CREATE INDEX "idx_stock_movements_store_time" ON "stock_movements"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_stock_movements_variant" ON "stock_movements"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_transfers_transfer_number_key" ON "store_transfers"("transfer_number");

-- CreateIndex
CREATE INDEX "idx_store_transfers_from_store_created_at" ON "store_transfers"("from_store_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_store_transfers_to_store_created_at" ON "store_transfers"("to_store_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_user_stores_store" ON "user_stores"("store_id");

-- CreateIndex
CREATE INDEX "idx_user_stores_user" ON "user_stores"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "brands_code_key" ON "brands"("code");

-- CreateIndex
CREATE INDEX "idx_brands_name" ON "brands"("name");

-- CreateIndex
CREATE INDEX "idx_variant_prices_store_variant" ON "variant_prices"("store_id", "variant_id");

-- CreateIndex
CREATE INDEX "idx_variant_prices_store_start" ON "variant_prices"("store_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "variant_prices_store_id_variant_id_start_at_key" ON "variant_prices"("store_id", "variant_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_receipts_receipt_number_key" ON "purchase_order_receipts"("receipt_number");

-- CreateIndex
CREATE INDEX "idx_po_receipts_purchase_order" ON "purchase_order_receipts"("purchase_order_id");

-- CreateIndex
CREATE INDEX "idx_po_receipts_store_received_at" ON "purchase_order_receipts"("store_id", "received_at");

-- CreateIndex
CREATE INDEX "idx_po_receipt_items_receipt" ON "purchase_order_receipt_items"("receipt_id");

-- CreateIndex
CREATE INDEX "idx_po_receipt_items_variant" ON "purchase_order_receipt_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "returns_return_number_key" ON "returns"("return_number");

-- CreateIndex
CREATE INDEX "idx_returns_store_created_at" ON "returns"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_returns_invoice" ON "returns"("invoice_id");

-- CreateIndex
CREATE INDEX "idx_return_items_return" ON "return_items"("return_id");

-- CreateIndex
CREATE INDEX "idx_return_items_variant" ON "return_items"("variant_id");

-- CreateIndex
CREATE INDEX "idx_pos_shifts_store_opened_at" ON "pos_shifts"("store_id", "opened_at");

-- CreateIndex
CREATE INDEX "idx_pos_shifts_status" ON "pos_shifts"("status");

-- CreateIndex
CREATE INDEX "idx_cash_movements_store_created_at" ON "cash_movements"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_cash_movements_shift" ON "cash_movements"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE INDEX "idx_categories_parent" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "idx_categories_name" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "idx_products_name" ON "products"("name");

-- CreateIndex
CREATE INDEX "idx_products_brand_id" ON "products"("brand_id");

-- CreateIndex
CREATE INDEX "idx_products_category_id" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "idx_promotions_code" ON "promotions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_order_number_key" ON "purchase_orders"("order_number");

-- CreateIndex
CREATE INDEX "idx_purchase_orders_store" ON "purchase_orders"("store_id");

-- CreateIndex
CREATE INDEX "idx_purchase_orders_supplier" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "idx_purchase_orders_store_created_at" ON "purchase_orders"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_suppliers_name" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "store_transfer_items" ADD CONSTRAINT "store_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "store_transfers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "store_transfer_items" ADD CONSTRAINT "store_transfer_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "store_transfers" ADD CONSTRAINT "store_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "store_transfers" ADD CONSTRAINT "store_transfers_from_store_id_fkey" FOREIGN KEY ("from_store_id") REFERENCES "stores"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "store_transfers" ADD CONSTRAINT "store_transfers_to_store_id_fkey" FOREIGN KEY ("to_store_id") REFERENCES "stores"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "variant_prices" ADD CONSTRAINT "variant_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "variant_prices" ADD CONSTRAINT "variant_prices_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "variant_prices" ADD CONSTRAINT "variant_prices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_receipt_items" ADD CONSTRAINT "purchase_order_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_order_receipts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_receipt_items" ADD CONSTRAINT "purchase_order_receipt_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_order_receipt_items" ADD CONSTRAINT "purchase_order_receipt_items_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "pos_shifts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
