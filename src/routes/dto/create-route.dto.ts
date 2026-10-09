// src/routes/dto/create-route.dto.ts
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../common/trim';
import { ROUTE_CODE_PATTERN } from '../route-bounds';
import { RouteValuesDto } from './route-values.dto';

/** Nouveau corridor (ADMIN) : identité, prix, durée, et motif de la création. */
export class CreateRouteDto extends RouteValuesDto {
  /** Identifiant stable du corridor : il ne change jamais après la création. */
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(ROUTE_CODE_PATTERN, { message: 'Code : lettres majuscules et chiffres, séparés par des tirets (ex. THS-TBA).' })
  code!: string;

  @Transform(trim) @IsString() @MinLength(3) @MaxLength(80) label!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(60) city!: string;

  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
