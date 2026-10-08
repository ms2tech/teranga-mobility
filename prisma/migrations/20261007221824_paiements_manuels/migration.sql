-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('GATEWAY', 'MANUAL');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'OTHER';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MANAGER';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundReference" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedById" TEXT,
ADD COLUMN     "source" "PaymentSource" NOT NULL DEFAULT 'GATEWAY',
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- CreateIndex
CREATE INDEX "Payment_reference_idx" ON "Payment"("reference");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

