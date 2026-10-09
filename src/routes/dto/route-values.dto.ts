// src/routes/dto/route-values.dto.ts
import { RouteField } from '../route-bounds';

/** Prix et durée d'un corridor, avec leurs bornes (voir route-bounds.ts). */
export class RouteValuesDto {
  @RouteField('basePriceFcfa') basePriceFcfa!: number;
  @RouteField('priceMinFcfa') priceMinFcfa!: number;
  @RouteField('priceMaxFcfa') priceMaxFcfa!: number;
  @RouteField('estimatedDurationMin') estimatedDurationMin!: number;
}
