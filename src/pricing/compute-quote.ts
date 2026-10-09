// src/pricing/compute-quote.ts
import { PricingMode, ServiceType } from '@prisma/client';

export interface PriceLine {
  label: string;
  amountFcfa: number;
}

export interface Quote {
  pricingMode: PricingMode;
  routeId?: string;
  routeLabel?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  serviceType: ServiceType;
  breakdown: PriceLine[];
  baseFareFcfa: number;
  distanceFareFcfa: number;
  timeFareFcfa: number;
  tollFcfa: number;
  fareCoreFcfa: number;
  pmrSurchargeFcfa: number;
  accompanimentFcfa: number;
  vipSurchargeFcfa: number;
  totalPriceFcfa: number;
  commissionRate: number;
  commissionFcfa: number;
  driverPayoutFcfa: number;
  // Version du barème utilisée (absente quand le calcul ne vient pas d'une version en base).
  tariffVersionId?: string;
  tariffVersion?: number;
}

export interface ComputeParams {
  mode: 'FLAT' | 'METERED';
  corridorFareFcfa?: number;
  allInclusive?: boolean; // prix fixe forfaitaire : pas de majoration ni péage
  routeId?: string;
  routeLabel?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  serviceType: ServiceType;
  needsWheelchairVehicle?: boolean;
  withAccompaniment?: boolean;
  accompanimentFeeFcfa?: number;
  viaToll?: boolean;
}

/** Les dix paramètres d'une version du barème (voir TariffVersion). */
export interface TariffValues {
  meterBaseFareFcfa: number;
  meterPerKmFcfa: number;
  meterPerMinuteFcfa: number;
  meterMinimumFareFcfa: number;
  estimatedAvgSpeedKmh: number;
  autorouteTollFcfa: number;
  pmrVehicleSurchargeRate: number;
  vipSurchargeRate: number;
  defaultAccompanimentFeeFcfa: number;
  commissionRate: number;
}

/** Barème à appliquer : les paramètres, et (si ça vient de la base) l'identité de la version. */
export type TariffInput = TariffValues & { id?: string; version?: number };

export function roundFcfa(amount: number): number {
  return Math.ceil(amount / 100) * 100;
}

/** Durée estimée d'un trajet quand la carte ne la fournit pas. */
export function estimateDurationSeconds(distanceMeters: number, avgSpeedKmh: number): number {
  return Math.round((distanceMeters / 1000 / avgSpeedKmh) * 3600);
}

/**
 * Fonction PURE de tarification (FLAT/METERED) + péage + majorations + commission, selon
 * le barème reçu. Ne lit ni la base ni le .env : le prix d'une réservation vient d'une
 * version précise du barème, et il est figé dans la réservation.
 */
export function computeQuote(p: ComputeParams, tariff: TariffInput): Quote {
  const c = tariff;
  const breakdown: PriceLine[] = [];
  let baseFareFcfa = 0, distanceFareFcfa = 0, timeFareFcfa = 0, fareCoreFcfa = 0;
  let distanceMeters: number | undefined;
  let durationSeconds: number | undefined;

  if (p.mode === 'FLAT') {
    fareCoreFcfa = p.corridorFareFcfa ?? 0;
    baseFareFcfa = fareCoreFcfa;
    breakdown.push({
      label: p.allInclusive ? 'Prix fixe (forfait)' : `Corridor ${p.routeLabel ?? ''}`.trim(),
      amountFcfa: fareCoreFcfa,
    });
  } else {
    distanceMeters = p.distanceMeters ?? 0;
    durationSeconds = p.durationSeconds ?? estimateDurationSeconds(distanceMeters, c.estimatedAvgSpeedKmh);
    const km = distanceMeters / 1000;
    const min = durationSeconds / 60;
    baseFareFcfa = c.meterBaseFareFcfa;
    distanceFareFcfa = roundFcfa(c.meterPerKmFcfa * km);
    timeFareFcfa = roundFcfa(c.meterPerMinuteFcfa * min);
    const subtotal = baseFareFcfa + distanceFareFcfa + timeFareFcfa;
    breakdown.push({ label: 'Prise en charge', amountFcfa: baseFareFcfa });
    breakdown.push({ label: `Distance (${km.toFixed(1)} km)`, amountFcfa: distanceFareFcfa });
    breakdown.push({ label: `Durée (${Math.round(min)} min)`, amountFcfa: timeFareFcfa });
    if (subtotal < c.meterMinimumFareFcfa) {
      breakdown.push({ label: 'Minimum de course', amountFcfa: c.meterMinimumFareFcfa - subtotal });
      fareCoreFcfa = c.meterMinimumFareFcfa;
    } else {
      fareCoreFcfa = subtotal;
    }
  }

  // Péage (répercuté tel quel, non commissionné)
  let tollFcfa = 0;
  if (!p.allInclusive && p.viaToll) {
    tollFcfa = c.autorouteTollFcfa;
    breakdown.push({ label: 'Péage autoroute', amountFcfa: tollFcfa });
  }

  let pmrSurchargeFcfa = 0;
  if (!p.allInclusive && p.needsWheelchairVehicle) {
    pmrSurchargeFcfa = roundFcfa(fareCoreFcfa * c.pmrVehicleSurchargeRate);
    breakdown.push({ label: `Véhicule adapté PMR (+${Math.round(c.pmrVehicleSurchargeRate * 100)} %)`, amountFcfa: pmrSurchargeFcfa });
  }

  let vipSurchargeFcfa = 0;
  if (!p.allInclusive && p.serviceType === 'VIP_AIRPORT' && c.vipSurchargeRate > 0) {
    vipSurchargeFcfa = roundFcfa(fareCoreFcfa * c.vipSurchargeRate);
    breakdown.push({ label: `Service VIP (+${Math.round(c.vipSurchargeRate * 100)} %)`, amountFcfa: vipSurchargeFcfa });
  }

  let accompanimentFcfa = 0;
  if (!p.allInclusive && p.withAccompaniment) {
    accompanimentFcfa = p.accompanimentFeeFcfa ?? c.defaultAccompanimentFeeFcfa;
    breakdown.push({ label: 'Accompagnement', amountFcfa: accompanimentFcfa });
  }

  const totalPriceFcfa = fareCoreFcfa + tollFcfa + pmrSurchargeFcfa + vipSurchargeFcfa + accompanimentFcfa;
  const commissionRate = c.commissionRate;
  // La commission ne porte pas sur le péage (reversé intégralement au chauffeur)
  const commissionFcfa = roundFcfa((totalPriceFcfa - tollFcfa) * commissionRate);
  const driverPayoutFcfa = totalPriceFcfa - commissionFcfa;

  return {
    pricingMode: p.mode as PricingMode,
    routeId: p.routeId,
    routeLabel: p.routeLabel,
    distanceMeters,
    durationSeconds,
    serviceType: p.serviceType,
    breakdown,
    baseFareFcfa,
    distanceFareFcfa,
    timeFareFcfa,
    tollFcfa,
    fareCoreFcfa,
    pmrSurchargeFcfa,
    accompanimentFcfa,
    vipSurchargeFcfa,
    totalPriceFcfa,
    commissionRate,
    commissionFcfa,
    driverPayoutFcfa,
    tariffVersionId: tariff.id,
    tariffVersion: tariff.version,
  };
}
