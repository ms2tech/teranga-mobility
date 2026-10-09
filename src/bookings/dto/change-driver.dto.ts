// src/bookings/dto/change-driver.dto.ts
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/trim';

/** Changement de chauffeur et de véhicule d'une course en route ou en cours : motif obligatoire (panne, incident…). */
export class ChangeDriverDto {
  @IsString() driverId!: string;
  @IsString() vehicleId!: string;

  @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
