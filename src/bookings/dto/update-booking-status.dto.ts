// src/bookings/dto/update-booking-status.dto.ts
import { IsEnum } from 'class-validator';
import { BookingStatus } from '@prisma/client';

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus) status!: BookingStatus;
}
