// src/tariffs/dto/create-tariff.dto.ts
import { Transform } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { trim } from '../../common/trim';
import { TariffValuesDto } from './tariff-values.dto';

/**
 * Nouvelle version du barème : TOUS les paramètres (pas de modification partielle), plus
 * la version sur laquelle l'admin s'est appuyé et le motif du changement.
 */
export class CreateTariffDto extends TariffValuesDto {
  /** Version courante telle que l'admin la voyait : si elle a changé entre-temps, 409. */
  @IsInt() @Min(1) basedOnVersion!: number;

  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
