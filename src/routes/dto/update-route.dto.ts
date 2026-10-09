// src/routes/dto/update-route.dto.ts
import { Transform } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { trim } from '../../common/trim';
import { RouteValuesDto } from './route-values.dto';

/**
 * Modification des prix et de la durée d'un corridor (ADMIN) : toutes les valeurs, la
 * version du corridor sur laquelle l'admin s'est appuyé (409 si elle a changé) et le motif.
 */
export class UpdateRouteDto extends RouteValuesDto {
  @IsInt() @Min(1) basedOnVersion!: number;

  @Transform(trim) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
