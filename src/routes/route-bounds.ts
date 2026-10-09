// src/routes/route-bounds.ts
import { BoundedNumber, NumberBound } from '../common/bounded-number';

export type RouteNumberKey = 'basePriceFcfa' | 'priceMinFcfa' | 'priceMaxFcfa' | 'estimatedDurationMin';

/**
 * Bornes des prix et de la durée d'un corridor : elles attrapent une faute de frappe
 * (22 000 devenu 220 000), elles ne fixent pas les prix. Le prix de base doit en plus
 * rester dans la fourchette indicative [minimum, maximum] (contrôlé par RoutesService).
 * Source unique : le DTO, la console et les tests.
 */
export const ROUTE_BOUNDS: Record<RouteNumberKey, NumberBound> = {
  basePriceFcfa: { label: 'Prix de base', unit: 'FCFA', integer: true, maxDecimals: 0, min: 1_000, max: 300_000 },
  priceMinFcfa: { label: 'Prix minimum', unit: 'FCFA', integer: true, maxDecimals: 0, min: 1_000, max: 300_000 },
  priceMaxFcfa: { label: 'Prix maximum', unit: 'FCFA', integer: true, maxDecimals: 0, min: 1_000, max: 300_000 },
  estimatedDurationMin: { label: 'Durée estimée', unit: 'min', integer: true, maxDecimals: 0, min: 5, max: 720 },
};

/** Forme d'un code de corridor : lettres majuscules et chiffres, séparés par des tirets (ex. THS-TBA). */
export const ROUTE_CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

export const RouteField = (key: RouteNumberKey): PropertyDecorator => BoundedNumber(ROUTE_BOUNDS[key]);
