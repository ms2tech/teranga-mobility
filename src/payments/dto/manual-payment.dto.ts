// src/payments/dto/manual-payment.dto.ts
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/trim';

/**
 * Confirmation manuelle « Autre » : l'argent est reçu par la société. Il n'y a
 * ni montant (toujours égal au total de la course) ni moyen à choisir.
 */
export class ManualPaymentDto {
  /** Obligatoire : comment l'argent a été reçu. */
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) note!: string;

  /** Facultative (n° de transaction, de reçu…) ; unique si elle est renseignée. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) reference?: string;

  /** Date de réception (jamais dans le futur) ; par défaut : maintenant. */
  @IsOptional() @IsDateString() receivedAt?: string;
}
