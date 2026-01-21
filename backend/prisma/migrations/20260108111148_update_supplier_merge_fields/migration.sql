/*
  Warnings:

  - Made the column `phone` on table `suppliers` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contact_person" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "tax_code" TEXT,
ALTER COLUMN "phone" SET NOT NULL;
