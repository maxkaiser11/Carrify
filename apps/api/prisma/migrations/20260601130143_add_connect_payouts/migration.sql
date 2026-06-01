-- AlterTable
ALTER TABLE "BoosterProfile" ADD COLUMN     "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "chargeId" TEXT,
ADD COLUMN     "payoutTransferId" TEXT;
