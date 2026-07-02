-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'SHIPPED';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "canceledBy" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refundStatus" TEXT;
