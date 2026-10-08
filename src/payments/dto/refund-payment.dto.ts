// src/payments/dto/refund-payment.dto.ts
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/trim';

/** Remboursement fait à la main, hors application : on y enregistre le motif et la référence. */
export class RefundPaymentDto {
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
  /** Référence du remboursement (n° de transaction PayDunya ou Wave, n° de reçu…). */
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(120) reference!: string;
}
