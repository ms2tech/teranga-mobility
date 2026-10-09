// src/bookings/dto/update-booking-status.dto.ts
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BookingStatus } from '@prisma/client';
import { trim } from '../../common/trim';

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus) status!: BookingStatus;

  /** Motif : obligatoire pour une annulation (CANCELLED), contrôlé par le service. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) reason?: string;
}
