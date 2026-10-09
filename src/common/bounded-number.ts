// src/common/bounded-number.ts
import { applyDecorators } from '@nestjs/common';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

/** Bornes d'un champ numérique saisi par un admin (tarifs, prix des corridors). */
export interface NumberBound {
  /** Nom affiché dans les messages et dans la console. */
  label: string;
  /** 'fraction' : un taux stocké en fraction (0.18 = 18 %), affiché en pourcentage. */
  unit: 'FCFA' | 'FCFA/km' | 'FCFA/min' | 'km/h' | 'min' | 'fraction';
  /** true : nombre entier ; false : nombre à virgule (avec `maxDecimals` décimales). */
  integer: boolean;
  maxDecimals: number;
  min: number;
  max: number;
}

const show = (v: number, unit: NumberBound['unit']): string =>
  unit === 'fraction' ? `${+(v * 100).toFixed(2)} %` : `${v.toLocaleString('fr-FR')} ${unit}`;

/**
 * Décorateur de DTO : type + bornes d'un champ numérique, avec des messages en français.
 * Les bornes attrapent une faute de frappe (350 devenu 35 000), elles ne fixent pas les prix.
 */
export function BoundedNumber(b: NumberBound): PropertyDecorator {
  const range = `${b.label} : entre ${show(b.min, b.unit)} et ${show(b.max, b.unit)}.`;
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
