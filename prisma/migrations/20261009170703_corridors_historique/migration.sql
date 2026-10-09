-- CreateEnum
CREATE TYPE "RouteChangeKind" AS ENUM ('CREATED', 'UPDATED', 'DEACTIVATED', 'REACTIVATED');

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "RouteChange" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "kind" "RouteChangeKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "oldBasePriceFcfa" INTEGER,
    "oldPriceMinFcfa" INTEGER,
    "oldPriceMaxFcfa" INTEGER,
    "oldEstimatedDurationMin" INTEGER,
    "oldIsActive" BOOLEAN,
    "basePriceFcfa" INTEGER NOT NULL,
    "priceMinFcfa" INTEGER NOT NULL,
    "priceMaxFcfa" INTEGER NOT NULL,
    "estimatedDurationMin" INTEGER,
    "isActive" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteChange_routeId_idx" ON "RouteChange"("routeId");

-- AddForeignKey
ALTER TABLE "RouteChange" ADD CONSTRAINT "RouteChange_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteChange" ADD CONSTRAINT "RouteChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

