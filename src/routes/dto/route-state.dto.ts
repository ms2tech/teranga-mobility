// src/routes/dto/route-state.dto.ts
import { Transform } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { trim } from '../../common/trim';

/** Désactivation ou réactivation d'un corridor (ADMIN) : version sur laquelle on s'appuie, et motif. */
export class RouteStateDto {
  @IsInt() @Min(1) basedOnVersion!: number;

  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
