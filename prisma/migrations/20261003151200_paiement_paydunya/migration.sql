-- DropIndex
DROP INDEX "Payment_bookingId_key";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "receiptUrl" TEXT,
ALTER COLUMN "method" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

