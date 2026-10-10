import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ServiceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MapsService } from '../maps/maps.service';
import { TariffsService } from '../tariffs/tariffs.service';
import { Quote, computeQuote } from './compute-quote';
import { assertCorridorBookingAllowed } from './corridor-guard';

export type { PriceLine, Quote, ComputeParams } from './compute-quote';

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

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapsService,
    private readonly tariffs: TariffsService,
  ) {}

  /** Devis à partir d'un corridor (FLAT) ou d'une distance (METERED), avec la version courante du barème. */
  async quote(input: QuoteInput): Promise<Quote> {
    // Les corridors ne servent pas à réserver (jusqu'à « bien après le lancement ») : voir corridor-guard.ts.
    assertCorridorBookingAllowed(input.routeId);
    const tariff = await this.tariffs.current();

    // Prix fixe saisi par l'opérateur : forfait tout compris (priorité)
    if (input.fixedPriceFcfa != null && input.fixedPriceFcfa > 0) {
      return computeQuote(
        {
          mode: 'FLAT',
          corridorFareFcfa: input.fixedPriceFcfa,
          allInclusive: true,
          serviceType: input.serviceType,
        },
        tariff,
      );
    }
    if (input.routeId) {
      const route = await this.prisma.route.findUnique({ where: { id: input.routeId } });
      if (!route || !route.isActive) {
        throw new NotFoundException(`Corridor introuvable ou inactif: ${input.routeId}`);
      }
      return computeQuote(
        {
          mode: 'FLAT',
          corridorFareFcfa: route.basePriceFcfa,
          routeId: route.id,
          routeLabel: route.label,
          serviceType: input.serviceType,
          needsWheelchairVehicle: input.needsWheelchairVehicle,
          withAccompaniment: input.withAccompaniment,
          accompanimentFeeFcfa: input.accompanimentFeeFcfa,
          viaToll: input.viaToll,
        },
        tariff,
      );
    }
    if (input.distanceMeters == null || input.distanceMeters <= 0) {
      throw new BadRequestException(
        'Préciser une distanceMeters (trajet libre) ou un fixedPriceFcfa (prix fixe saisi par l\'opérateur).',
      );
    }
    return computeQuote(
      {
        mode: 'METERED',
        distanceMeters: input.distanceMeters,
        durationSeconds: input.durationSeconds,
        serviceType: input.serviceType,
        needsWheelchairVehicle: input.needsWheelchairVehicle,
        withAccompaniment: input.withAccompaniment,
        accompanimentFeeFcfa: input.accompanimentFeeFcfa,
        viaToll: input.viaToll,
      },
      tariff,
    );
  }

  /** Mesure les adresses (carte) puis calcule le devis au compteur. */
  async estimate(input: EstimateInput): Promise<Estimate> {
    const m = await this.maps.measureTrip(input.pickupAddress, input.dropoffAddress);
    const viaToll = input.viaToll ?? m.tollPresent;
    const tariff = await this.tariffs.current();
    const quote = computeQuote(
      {
        mode: 'METERED',
        distanceMeters: m.distanceMeters,
        durationSeconds: m.durationSeconds,
        serviceType: input.serviceType,
        needsWheelchairVehicle: input.needsWheelchairVehicle,
        withAccompaniment: input.withAccompaniment,
        accompanimentFeeFcfa: input.accompanimentFeeFcfa,
        viaToll,
      },
      tariff,
    );
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
}
