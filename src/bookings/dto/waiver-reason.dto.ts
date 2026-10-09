// src/bookings/dto/waiver-reason.dto.ts
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/trim';

/** Motif obligatoire d'une dérogation de départ, ou de son retrait. */
export class WaiverReasonDto {
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
