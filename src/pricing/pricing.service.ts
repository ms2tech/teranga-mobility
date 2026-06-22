import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ServiceType, Route, PricingMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MapsService } from '../maps/maps.service';
import { businessConfig } from '../config/business.config';

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
}

// Devis avec mesure réelle (adresses) en plus du tarif.
export interface Estimate extends Quote {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupFormatted?: string;
  dropoffFormatted?: string;
  tollPresent: boolean;
}

export interface QuoteInput {
  routeId?: string;
  fixedPriceFcfa?: number; // prix fixe saisi par l'opérateur (forfait tout compris)
  distanceMeters?: number;
  durationSeconds?: number;
  serviceType: ServiceType;
  needsWheelchairVehicle?: boolean;
  withAccompaniment?: boolean;
  accompanimentFeeFcfa?: number;
  viaToll?: boolean;
}

export interface EstimateInput {
  pickupAddress: string;
  dropoffAddress: string;
  serviceType: ServiceType;
  needsWheelchairVehicle?: boolean;
  withAccompaniment?: boolean;
  accompanimentFeeFcfa?: number;
  viaToll?: boolean; // si absent, on suit la détection de Google
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

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapsService,
    @Inject(businessConfig.KEY)
    private readonly config: ConfigType<typeof businessConfig>,
  ) {}

  private roundFcfa(amount: number): number {
    return Math.ceil(amount / 100) * 100;
  }

  /** Devis à partir d'un corridor (FLAT) ou d'une distance (METERED). */
  async quote(input: QuoteInput): Promise<Quote> {
    // Prix fixe saisi par l'opérateur : forfait tout compris (priorité)
    if (input.fixedPriceFcfa != null && input.fixedPriceFcfa > 0) {
      return this.computeQuote({
        mode: 'FLAT',
        corridorFareFcfa: input.fixedPriceFcfa,
        allInclusive: true,
        serviceType: input.serviceType,
      });
    }
    if (input.routeId) {
      const route = await this.prisma.route.findUnique({ where: { id: input.routeId } });
      if (!route || !route.isActive) {
        throw new NotFoundException(`Corridor introuvable ou inactif: ${input.routeId}`);
      }
      return this.computeQuote({
        mode: 'FLAT',
        corridorFareFcfa: route.basePriceFcfa,
        routeId: route.id,
        routeLabel: route.label,
        serviceType: input.serviceType,
        needsWheelchairVehicle: input.needsWheelchairVehicle,
        withAccompaniment: input.withAccompaniment,
        accompanimentFeeFcfa: input.accompanimentFeeFcfa,
        viaToll: input.viaToll,
      });
    }
    if (input.distanceMeters == null || input.distanceMeters <= 0) {
      throw new BadRequestException(
        'Préciser un routeId (corridor) ou une distanceMeters (trajet libre).',
      );
    }
    return this.computeQuote({
      mode: 'METERED',
      distanceMeters: input.distanceMeters,
      durationSeconds: input.durationSeconds,
      serviceType: input.serviceType,
      needsWheelchairVehicle: input.needsWheelchairVehicle,
      withAccompaniment: input.withAccompaniment,
      accompanimentFeeFcfa: input.accompanimentFeeFcfa,
      viaToll: input.viaToll,
    });
  }

  /** Mesure les adresses (carte) puis calcule le devis au compteur. */
  async estimate(input: EstimateInput): Promise<Estimate> {
    const m = await this.maps.measureTrip(input.pickupAddress, input.dropoffAddress);
    const viaToll = input.viaToll ?? m.tollPresent;
    const quote = this.computeQuote({
      mode: 'METERED',
      distanceMeters: m.distanceMeters,
      durationSeconds: m.durationSeconds,
      serviceType: input.serviceType,
      needsWheelchairVehicle: input.needsWheelchairVehicle,
      withAccompaniment: input.withAccompaniment,
      accompanimentFeeFcfa: input.accompanimentFeeFcfa,
      viaToll,
    });
    return {
      ...quote,
      pickupLat: m.pickup.lat,
      pickupLng: m.pickup.lng,
      dropoffLat: m.dropoff.lat,
      dropoffLng: m.dropoff.lng,
      pickupFormatted: m.pickup.formattedAddress,
      dropoffFormatted: m.dropoff.formattedAddress,
      tollPresent: m.tollPresent,
    };
  }

  private estimateDurationSeconds(distanceMeters: number): number {
    const km = distanceMeters / 1000;
    return Math.round((km / this.config.estimatedAvgSpeedKmh) * 3600);
  }

  /** Fonction PURE de tarification (FLAT/METERED) + péage + majorations + commission. */
  computeQuote(p: ComputeParams): Quote {
    const c = this.config;
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
      durationSeconds = p.durationSeconds ?? this.estimateDurationSeconds(distanceMeters);
      const km = distanceMeters / 1000;
      const min = durationSeconds / 60;
      baseFareFcfa = c.meterBaseFareFcfa;
      distanceFareFcfa = this.roundFcfa(c.meterPerKmFcfa * km);
      timeFareFcfa = this.roundFcfa(c.meterPerMinuteFcfa * min);
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
      pmrSurchargeFcfa = this.roundFcfa(fareCoreFcfa * c.pmrVehicleSurchargeRate);
      breakdown.push({ label: `Véhicule adapté PMR (+${Math.round(c.pmrVehicleSurchargeRate * 100)} %)`, amountFcfa: pmrSurchargeFcfa });
    }

    let vipSurchargeFcfa = 0;
    if (!p.allInclusive && p.serviceType === 'VIP_AIRPORT' && c.vipSurchargeRate > 0) {
      vipSurchargeFcfa = this.roundFcfa(fareCoreFcfa * c.vipSurchargeRate);
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
    const commissionFcfa = this.roundFcfa((totalPriceFcfa - tollFcfa) * commissionRate);
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
    };
  }
}
