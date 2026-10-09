// src/tariffs/tariff-bounds.ts
import { applyDecorators } from '@nestjs/common';
import { IsInt, IsNumber, Max, Min } from 'class-validator';
import { TariffValues } from '../pricing/compute-quote';

export interface TariffBound {
  /** Nom affiché dans les messages et dans la console. */
  label: string;
  unit: 'FCFA' | 'FCFA/km' | 'FCFA/min' | 'km/h' | 'fraction';
  /** true : nombre entier ; false : nombre à virgule (avec `maxDecimals` décimales). */
  integer: boolean;
  maxDecimals: number;
  min: number;
  max: number;
}

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

const fmt = (v: number, unit: TariffBound['unit']): string =>
  unit === 'fraction' ? `${+(v * 100).toFixed(2)} %` : `${v.toLocaleString('fr-FR')} ${unit}`;

/** Décorateur de DTO : type + bornes d'un paramètre du barème, avec des messages en français. */
export function TariffField(key: keyof TariffValues): PropertyDecorator {
  const b = TARIFF_BOUNDS[key];
  const range = `${b.label} : entre ${fmt(b.min, b.unit)} et ${fmt(b.max, b.unit)}.`;
  return applyDecorators(
    b.integer
      ? IsInt({ message: `${b.label} : un nombre entier est attendu.` })
      : IsNumber({ maxDecimalPlaces: b.maxDecimals, allowNaN: false, allowInfinity: false }, {
          message: `${b.label} : un nombre est attendu (${b.maxDecimals} décimale(s) au plus).`,
        }),
    Min(b.min, { message: range }),
    Max(b.max, { message: range }),
  );
}
