// src/bookings/dto/assign-booking.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignBookingDto {
  @IsString() @IsNotEmpty() driverId!: string;
  @IsString() @IsNotEmpty() vehicleId!: string;
}
