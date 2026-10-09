-- CreateTable
CREATE TABLE "DriverChange" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingStatus" "BookingStatus" NOT NULL,
    "fromDriverId" TEXT,
    "fromVehicleId" TEXT,
    "toDriverId" TEXT NOT NULL,
    "toVehicleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverChange_bookingId_idx" ON "DriverChange"("bookingId");

-- AddForeignKey
ALTER TABLE "DriverChange" ADD CONSTRAINT "DriverChange_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverChange" ADD CONSTRAINT "DriverChange_fromDriverId_fkey" FOREIGN KEY ("fromDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverChange" ADD CONSTRAINT "DriverChange_fromVehicleId_fkey" FOREIGN KEY ("fromVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverChange" ADD CONSTRAINT "DriverChange_toDriverId_fkey" FOREIGN KEY ("toDriverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverChange" ADD CONSTRAINT "DriverChange_toVehicleId_fkey" FOREIGN KEY ("toVehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverChange" ADD CONSTRAINT "DriverChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

