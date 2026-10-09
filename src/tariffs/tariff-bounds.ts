// src/tariffs/tariff-bounds.ts
import { BoundedNumber, NumberBound } from '../common/bounded-number';
import { TariffValues } from '../pricing/compute-quote';

export type TariffBound = NumberBound;

/**
 * Bornes raisonnables de chaque paramètre : elles ne servent pas à fixer les prix mais à
 * attraper une faute de frappe (350 devenu 35 000, 18 % devenu 180 %). Les taux sont des
 * fractions (0.18 = 18 %). Source unique : le DTO, la console et les tests les lisent ici.
 */
export const TARIFF_BOUNDS: Record<keyof TariffValues, TariffBound> = {
  meterBaseFareFcfa: { label: 'Prise en charge', unit: 'FCFA', integer: true, maxDecimals: 0, min: 0, max: 10_000 },
  meterPerKmFcfa: { label: 'Prix au kilomètre', unit: 'FCFA/km', integer: true, maxDecimals: 0, min: 50, max: 5_000 },
  meterPerMinuteFcfa: { label: 'Prix à la minute', unit: 'FCFA/min', integer: true, maxDecimals: 0, min: 0, max: 1_000 },
  meterMinimumFareFcfa: { label: 'Minimum de course', unit: 'FCFA', integer: true, maxDecimals: 0, min: 500, max: 50_000 },
  estimatedAvgSpeedKmh: { label: 'Vitesse moyenne estimée', unit: 'km/h', integer: false, maxDecimals: 1, min: 10, max: 120 },
  autorouteTollFcfa: { label: 'Péage autoroute', unit: 'FCFA', integer: true, maxDecimals: 0, min: 0, max: 10_000 },
  pmrVehicleSurchargeRate: { label: 'Majoration véhicule adapté PMR', unit: 'fraction', integer: false, maxDecimals: 4, min: 0, max: 0.5 },
  vipSurchargeRate: { label: 'Majoration service VIP', unit: 'fraction', integer: false, maxDecimals: 4, min: 0, max: 0.5 },
  defaultAccompanimentFeeFcfa: { label: 'Accompagnement', unit: 'FCFA', integer: true, maxDecimals: 0, min: 0, max: 50_000 },
  commissionRate: { label: 'Commission', unit: 'fraction', integer: false, maxDecimals: 4, min: 0.05, max: 0.4 },
};

export const TARIFF_KEYS = Object.keys(TARIFF_BOUNDS) as Array<keyof TariffValues>;

/** Décorateur de DTO : type + bornes d'un paramètre du barème, avec des messages en français. */
export const TariffField = (key: keyof TariffValues): PropertyDecorator => BoundedNumber(TARIFF_BOUNDS[key]);
