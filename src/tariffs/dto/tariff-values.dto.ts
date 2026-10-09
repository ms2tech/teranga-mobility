// src/tariffs/dto/tariff-values.dto.ts
import { TariffValues } from '../../pricing/compute-quote';
import { TariffField } from '../tariff-bounds';

/** Les dix paramètres d'une version du barème, chacun avec ses bornes (voir tariff-bounds.ts). */
export class TariffValuesDto implements TariffValues {
  @TariffField('meterBaseFareFcfa') meterBaseFareFcfa!: number;
  @TariffField('meterPerKmFcfa') meterPerKmFcfa!: number;
  @TariffField('meterPerMinuteFcfa') meterPerMinuteFcfa!: number;
  @TariffField('meterMinimumFareFcfa') meterMinimumFareFcfa!: number;
  @TariffField('estimatedAvgSpeedKmh') estimatedAvgSpeedKmh!: number;
  @TariffField('autorouteTollFcfa') autorouteTollFcfa!: number;
  @TariffField('pmrVehicleSurchargeRate') pmrVehicleSurchargeRate!: number;
  @TariffField('vipSurchargeRate') vipSurchargeRate!: number;
  @TariffField('defaultAccompanimentFeeFcfa') defaultAccompanimentFeeFcfa!: number;
  @TariffField('commissionRate') commissionRate!: number;
}
