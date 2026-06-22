-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FLAT', 'METERED');

-- CreateEnum
CREATE TYPE "TripPurpose" AS ENUM ('AIRPORT', 'MEDICAL', 'ERRANDS', 'OTHER');

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_routeId_fkey";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "distanceFareFcfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "distanceMeters" INTEGER,
ADD COLUMN     "dropoffLat" DOUBLE PRECISION,
ADD COLUMN     "dropoffLng" DOUBLE PRECISION,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "isImmediate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickupLat" DOUBLE PRECISION,
ADD COLUMN     "pickupLng" DOUBLE PRECISION,
ADD COLUMN     "pricingMode" "PricingMode" NOT NULL DEFAULT 'FLAT',
ADD COLUMN     "timeFareFcfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tollFcfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tripPurpose" "TripPurpose" NOT NULL DEFAULT 'OTHER',
ALTER COLUMN "routeId" DROP NOT NULL,
ALTER COLUMN "direction" DROP NOT NULL,
ALTER COLUMN "scheduledAt" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;
