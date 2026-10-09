-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "tariffVersionId" TEXT;

-- CreateTable
CREATE TABLE "TariffVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "meterBaseFareFcfa" INTEGER NOT NULL,
    "meterPerKmFcfa" INTEGER NOT NULL,
    "meterPerMinuteFcfa" INTEGER NOT NULL,
    "meterMinimumFareFcfa" INTEGER NOT NULL,
    "estimatedAvgSpeedKmh" DOUBLE PRECISION NOT NULL,
    "autorouteTollFcfa" INTEGER NOT NULL,
    "pmrVehicleSurchargeRate" DOUBLE PRECISION NOT NULL,
    "vipSurchargeRate" DOUBLE PRECISION NOT NULL,
    "defaultAccompanimentFeeFcfa" INTEGER NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TariffVersion_version_key" ON "TariffVersion"("version");

-- AddForeignKey
ALTER TABLE "TariffVersion" ADD CONSTRAINT "TariffVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tariffVersionId_fkey" FOREIGN KEY ("tariffVersionId") REFERENCES "TariffVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

