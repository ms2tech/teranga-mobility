import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Booking, BookingStatus, MobilityNeed, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { generateBookingReference } from '../common/reference';
import { PAYMENT_PEOPLE } from '../payments/payment.include';

const ACTIVE_STATUSES: BookingStatus[] = [
  'PENDING', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS',
];

// Une course non payée ne part pas (carburant et temps) : le chauffeur peut être
// affecté à l'avance, mais le départ est refusé tant que la course n'est pas payée.
// Seuls EN_ROUTE et IN_PROGRESS, depuis un état d'avant le départ, sont bloqués :
// COMPLETED, NO_SHOW et CANCELLED enregistrent ce qui s'est passé et ne le sont jamais,
// et une course déjà partie n'est pas bloquée si son paiement est annulé ensuite.
const DEPARTURE_STATUSES: BookingStatus[] = ['EN_ROUTE', 'IN_PROGRESS'];
const BEFORE_DEPARTURE_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'ASSIGNED'];

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Crée une réservation : trajet libre (au compteur) OU corridor à prix fixe.
   * Gère le passager (existant ou créé à la volée), le moment (immédiat ou
   * planifié), fige le tarif + la répartition commission/chauffeur, et applique
   * la cohérence fauteuil roulant -> véhicule adapté.
   */
  async create(dto: CreateBookingDto, createdById?: string): Promise<Booking> {
    if (!dto.clientId && !dto.newClient) {
      throw new BadRequestException(
        'Préciser un clientId existant ou les informations newClient.',
      );
    }

    // Moment : immédiat OU planifié (date obligatoire si planifié)
    const isImmediate = dto.isImmediate ?? false;
    if (!isImmediate && !dto.scheduledAt) {
      throw new BadRequestException(
        'Indiquer scheduledAt pour une course planifiée, ou isImmediate=true.',
      );
    }
    const scheduledAt = isImmediate
      ? new Date()
      : new Date(dto.scheduledAt as string);

    // Tarification : prix fixe, corridor (routeId) ou compteur (distanceMeters)
    if (!dto.routeId && !dto.fixedPriceFcfa && (dto.distanceMeters == null || dto.distanceMeters <= 0)) {
      throw new BadRequestException(
        'Préciser un prix fixe, un routeId (corridor) ou une distanceMeters (trajet libre).',
      );
    }

    // Cohérence métier : fauteuil roulant impose un véhicule adapté
    const needsWheelchairVehicle =
      dto.needsWheelchairVehicle ||
      dto.mobilityNeed === MobilityNeed.WHEELCHAIR ||
      dto.newClient?.mobilityNeed === MobilityNeed.WHEELCHAIR ||
      false;

    const quote = await this.pricing.quote({
      routeId: dto.routeId,
      fixedPriceFcfa: dto.fixedPriceFcfa,
      distanceMeters: dto.distanceMeters,
      durationSeconds: dto.durationSeconds,
      serviceType: dto.serviceType,
      needsWheelchairVehicle,
      withAccompaniment: dto.withAccompaniment,
      accompanimentFeeFcfa: dto.accompanimentFeeFcfa,
      viaToll: dto.viaToll,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let clientId = dto.clientId;
      if (!clientId && dto.newClient) {
        const client = await tx.client.create({
          data: {
            fullName: dto.newClient.fullName,
            phone: dto.newClient.phone,
            email: dto.newClient.email,
            mobilityNeed: dto.newClient.mobilityNeed ?? MobilityNeed.NONE,
            notes: dto.newClient.notes,
          },
        });
        clientId = client.id;
      } else {
        const exists = await tx.client.findUnique({ where: { id: clientId } });
        if (!exists) throw new NotFoundException(`Client introuvable: ${clientId}`);
      }

      const data: Prisma.BookingCreateInput = {
        reference: generateBookingReference(),
        client: { connect: { id: clientId } },
        bookedByName: dto.bookedByName,
        bookedByPhone: dto.bookedByPhone,
        channel: dto.channel ?? 'PHONE',
        tripPurpose: dto.tripPurpose ?? 'OTHER',
        ...(dto.routeId ? { route: { connect: { id: dto.routeId } } } : {}),
        direction: dto.direction,
        pickupAddress: dto.pickupAddress,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        dropoffAddress: dto.dropoffAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        distanceMeters: quote.distanceMeters,
        durationSeconds: quote.durationSeconds,
        isImmediate,
        scheduledAt,
        flightNumber: dto.flightNumber,
        flightTime: dto.flightTime ? new Date(dto.flightTime) : undefined,
        passengersCount: dto.passengersCount ?? 1,
        serviceType: dto.serviceType,
        mobilityNeed: dto.mobilityNeed ?? dto.newClient?.mobilityNeed ?? MobilityNeed.NONE,
        needsWheelchairVehicle,
        withAccompaniment: dto.withAccompaniment ?? false,
        status: BookingStatus.PENDING,
        pricingMode: quote.pricingMode,
        baseFareFcfa: quote.baseFareFcfa,
        distanceFareFcfa: quote.distanceFareFcfa,
        timeFareFcfa: quote.timeFareFcfa,
        tollFcfa: quote.tollFcfa,
        pmrSurchargeFcfa: quote.pmrSurchargeFcfa,
        accompanimentFcfa: quote.accompanimentFcfa,
        vipSurchargeFcfa: quote.vipSurchargeFcfa,
        totalPriceFcfa: quote.totalPriceFcfa,
        commissionRate: quote.commissionRate,
        commissionFcfa: quote.commissionFcfa,
        driverPayoutFcfa: quote.driverPayoutFcfa,
        notes: dto.notes,
        ...(createdById ? { createdBy: { connect: { id: createdById } } } : {}),
      };

      return tx.booking.create({ data });
    });
  }

  findOne(id: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({
      where: { id },
      include: { client: true, route: true, driver: true, vehicle: true },
    });
  }

  /** File de dispatch : courses actives, immédiates d'abord puis par heure. */
  findUpcoming(status?: BookingStatus): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      where: status ? { status } : { status: { in: ACTIVE_STATUSES } },
      orderBy: [{ isImmediate: 'desc' }, { scheduledAt: 'asc' }],
      include: {
        client: true,
        route: true,
        driver: { include: { user: true } },
        // Tous les paiements de la course (la console en tire le lien en attente,
        // le paiement reçu, les doubles paiements et l'historique)
        payments: { orderBy: { createdAt: 'desc' }, include: PAYMENT_PEOPLE },
      },
    });
  }

  /** Affecte un chauffeur + un véhicule, passe la course en ASSIGNED. */
  async assign(id: string, driverId: string, vehicleId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(`Réservation introuvable: ${id}`);

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException(`Chauffeur introuvable: ${driverId}`);

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException(`Véhicule introuvable: ${vehicleId}`);

    if (vehicle.driverId !== driverId) {
      throw new BadRequestException("Ce véhicule n'appartient pas à ce chauffeur.");
    }

    if (booking.needsWheelchairVehicle && !vehicle.wheelchairAccessible) {
      throw new BadRequestException(
        'Cette course nécessite un véhicule adapté au fauteuil roulant.',
      );
    }

    return this.prisma.booking.update({
      where: { id },
      data: {
        driver: { connect: { id: driverId } },
        vehicle: { connect: { id: vehicleId } },
        status: BookingStatus.ASSIGNED,
      },
    });
  }

  /** Transition d'état avec horodatage automatique. */
  async updateStatus(id: string, status: BookingStatus): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(`Réservation introuvable: ${id}`);

    if (
      DEPARTURE_STATUSES.includes(status) &&
      BEFORE_DEPARTURE_STATUSES.includes(booking.status) &&
      booking.paymentStatus !== 'PAID'
    ) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PAYMENT_REQUIRED',
        message:
          'Course non payée : départ bloqué. Le paiement doit être reçu (lien PayDunya) ou confirmé par un responsable.',
        error: 'Conflict',
      });
    }

    const stamps: Partial<Record<BookingStatus, Prisma.BookingUpdateInput>> = {
      COMPLETED: { completedAt: new Date() },
      CANCELLED: { cancelledAt: new Date() },
    };
    return this.prisma.booking.update({
      where: { id },
      data: { status, ...(stamps[status] ?? {}) },
    });
  }
}
