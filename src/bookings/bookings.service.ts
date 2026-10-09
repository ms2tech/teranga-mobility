import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Booking, BookingStatus, MobilityNeed, Prisma } from '@prisma/client';
import { AuthUser, MANAGER_ROLES } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { generateBookingReference } from '../common/reference';
import { coded } from '../common/coded';
import { PAYMENT_PEOPLE } from '../payments/payment.include';
import { STATUS_LABEL } from './booking-status';
import { BEFORE_DEPARTURE, WAIVER_PEOPLE } from './departure-waivers.service';
import { DRIVER_CHANGE_PEOPLE } from './driver-changes.service';

const ACTIVE_STATUSES: BookingStatus[] = [
  'PENDING', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS',
];

// Transitions permises par PATCH /bookings/:id/status. ASSIGNED ne s'obtient que par
// l'affectation (PATCH /bookings/:id/assign). COMPLETED, CANCELLED et NO_SHOW sont des
// états finaux : pas de réouverture, on crée une nouvelle réservation.
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  ASSIGNED: ['EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'],
  EN_ROUTE: ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

// Une course non payée ne part pas (carburant et temps) : le chauffeur peut être
// affecté à l'avance, mais le départ (EN_ROUTE, ou IN_PROGRESS depuis un état d'avant
// le départ) exige un chauffeur affecté ET une course payée OU une dérogation de départ
// active (MANAGER, ADMIN). COMPLETED, NO_SHOW et CANCELLED enregistrent ce qui s'est
// passé et ne sont jamais bloqués.
const DEPARTURE_STATUSES: BookingStatus[] = ['EN_ROUTE', 'IN_PROGRESS'];

const CANCEL_REASON_MIN = 5;

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

    // Garde-fou : le client a accepté un prix précis. Si les tarifs ont changé depuis le
    // devis de l'opérateur, on ne crée pas la course à un autre prix sans qu'il le sache.
    if (dto.expectedTotalFcfa != null && dto.expectedTotalFcfa !== quote.totalPriceFcfa) {
      throw coded(
        409,
        'TARIFF_CHANGED',
        `Le prix a changé depuis le devis : ${quote.totalPriceFcfa} FCFA au lieu de ${dto.expectedTotalFcfa} FCFA. Recalculez le devis, puis confirmez le nouveau prix avec le client.`,
        { expectedTotalFcfa: dto.expectedTotalFcfa, currentTotalFcfa: quote.totalPriceFcfa },
      );
    }

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
        ...(quote.tariffVersionId ? { tariffVersion: { connect: { id: quote.tariffVersionId } } } : {}),
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
      include: {
        client: true, route: true, driver: true, vehicle: true,
        driverChanges: { orderBy: { changedAt: 'desc' }, include: DRIVER_CHANGE_PEOPLE },
      },
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
        vehicle: { select: { id: true, registration: true, model: true, type: true } },
        // Tous les paiements de la course (la console en tire le lien en attente,
        // le paiement reçu, les doubles paiements et l'historique)
        payments: { orderBy: { createdAt: 'desc' }, include: PAYMENT_PEOPLE },
        // Dérogations de départ (active ou retirées) : bandeau « départ autorisé sans paiement »
        departureWaivers: { orderBy: { grantedAt: 'desc' }, include: WAIVER_PEOPLE },
        // Changements de chauffeur en cours de route (panne, incident) : historique de la carte
        driverChanges: { orderBy: { changedAt: 'desc' }, include: DRIVER_CHANGE_PEOPLE },
      },
    });
  }

  /** Affecte un chauffeur + un véhicule, passe la course en ASSIGNED. */
  async assign(id: string, driverId: string, vehicleId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(`Réservation introuvable: ${id}`);
    // Une course partie ou terminée ne se réaffecte pas (et une course finale ne ressuscite pas).
    if (!BEFORE_DEPARTURE.includes(booking.status)) {
      throw coded(409, 'INVALID_TRANSITION', `Affectation impossible : la course est ${STATUS_LABEL[booking.status]}.`);
    }

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

    // Mise à jour conditionnelle : si la course vient de partir ou d'être annulée, on n'écrase rien.
    const { count } = await this.prisma.booking.updateMany({
      where: { id, status: { in: BEFORE_DEPARTURE } },
      data: { driverId, vehicleId, status: BookingStatus.ASSIGNED },
    });
    if (count === 0) {
      throw coded(409, 'INVALID_TRANSITION', "La course vient de changer d'état : affectation refusée.");
    }
    return this.prisma.booking.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Transition d'état (table TRANSITIONS), avec horodatage automatique.
   * - EN_ROUTE / IN_PROGRESS : chauffeur affecté obligatoire ; depuis un état d'avant le
   *   départ, la course doit être payée OU avoir une dérogation de départ active.
   * - CANCELLED : motif obligatoire ; une course PAYÉE ne peut être annulée que par un
   *   MANAGER ou un ADMIN (l'annulation crée un remboursement à faire, qui reste un
   *   acte explicite d'un admin : les paiements ne sont jamais touchés automatiquement).
   * - États finaux : COMPLETED, CANCELLED, NO_SHOW.
   */
  async updateStatus(id: string, status: BookingStatus, user: AuthUser, reason?: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(`Réservation introuvable: ${id}`);

    if (!TRANSITIONS[booking.status].includes(status)) {
      throw coded(409, 'INVALID_TRANSITION',
        `Transition impossible : la course est ${STATUS_LABEL[booking.status]}, elle ne peut pas passer à « ${STATUS_LABEL[status]} ».`);
    }

    const motif = reason?.trim();
    if (status === 'CANCELLED') {
      if (!motif || motif.length < CANCEL_REASON_MIN) {
        throw coded(400, 'REASON_REQUIRED', `Motif d'annulation obligatoire (${CANCEL_REASON_MIN} caractères minimum).`);
      }
      if (booking.paymentStatus === 'PAID' && !MANAGER_ROLES.includes(user.role)) {
        throw coded(403, 'CANCEL_PAID_FORBIDDEN',
          'Cette course est payée : seul un responsable ou un admin peut l\'annuler (un remboursement sera à faire).');
      }
    }

    if (DEPARTURE_STATUSES.includes(status)) {
      if (!booking.driverId) {
        throw coded(400, 'DRIVER_REQUIRED', 'Affecter un chauffeur avant le départ.');
      }
      if (BEFORE_DEPARTURE.includes(booking.status) && booking.paymentStatus !== 'PAID') {
        const waived = await this.prisma.departureWaiver.count({ where: { bookingId: id, revokedAt: null } });
        if (waived === 0) {
          throw coded(409, 'PAYMENT_REQUIRED',
            'Course non payée : départ bloqué. Le paiement doit être reçu (lien PayDunya), confirmé ou le départ autorisé par un responsable.');
        }
      }
    }

    const now = new Date();
    const data: Prisma.BookingUpdateManyMutationInput & { cancelledById?: string } = { status };
    if (status === 'COMPLETED') data.completedAt = now;
    if (status === 'CANCELLED') Object.assign(data, { cancelledAt: now, cancelReason: motif, cancelledById: user.id });

    // Mise à jour conditionnelle : un double clic ou deux opérateurs ne passent qu'une fois.
    const allowedFrom = (Object.keys(TRANSITIONS) as BookingStatus[]).filter((s) => TRANSITIONS[s].includes(status));
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.booking.updateMany({ where: { id, status: { in: allowedFrom } }, data });
      if (count === 0) {
        throw coded(409, 'INVALID_TRANSITION', "La course vient de changer d'état : action refusée.");
      }
      if (status === 'CANCELLED') {
        // Les liens PayDunya en attente sont abandonnés chez nous. S'ils sont payés ensuite,
        // l'IPN enregistre l'argent comme « reçu pour une course annulée », à rembourser.
        await tx.payment.updateMany({
          where: { bookingId: id, source: 'GATEWAY', status: 'PENDING' },
          data: { status: 'CANCELLED', note: 'Course annulée' },
        });
      }
    });
    return this.prisma.booking.findUniqueOrThrow({ where: { id } });
  }
}
