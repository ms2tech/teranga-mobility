// src/payments/dto/void-payment.dto.ts
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/trim';

export class VoidPaymentDto {
  /** Motif obligatoire : il est conservé avec le nom de l'admin dans l'historique. */
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
