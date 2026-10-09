// src/bookings/departure-waivers.service.ts
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, DepartureWaiver, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PAYMENT_PEOPLE } from '../payments/payment.include';
import { PrismaService } from '../prisma/prisma.service';

/** États d'avant le départ : seuls ceux-là peuvent recevoir ou perdre une dérogation. */
export const BEFORE_DEPARTURE: BookingStatus[] = ['PENDING', 'CONFIRMED', 'ASSIGNED'];

/** Noms de ceux qui ont accordé ou retiré une dérogation. */
export const WAIVER_PEOPLE = {
  grantedBy: { select: { fullName: true } },
  revokedBy: { select: { fullName: true } },
} satisfies Prisma.DepartureWaiverInclude;

/**
 * Dérogation de départ (MANAGER, ADMIN) : autorise le départ d'une course NON payée,
 * avec un motif obligatoire. La course reste non payée : elle reste « à encaisser »
 * jusqu'au paiement. Les lignes ne sont jamais effacées (un retrait ajoute revoked*).
 */
@Injectable()
export class DepartureWaiversService {
  private readonly logger = new Logger(DepartureWaiversService.name);

  constructor(private readonly prisma: PrismaService) {}

  async grant(bookingId: string, reason: string, user: AuthUser): Promise<DepartureWaiver> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException(`Réservation introuvable : ${bookingId}`);
    if (!BEFORE_DEPARTURE.includes(booking.status)) {
      throw new ConflictException('Une dérogation ne se donne que pour une course qui n\'est pas encore partie.');
    }
    if (booking.paymentStatus === 'PAID') {
      throw new ConflictException('Cette course est déjà payée : aucune dérogation n\'est nécessaire.');
    }

    const waiver = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verrou : deux responsables qui accordent en même temps ne créent qu'une dérogation.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'waiver:' + bookingId}))`;
      const fresh = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (!BEFORE_DEPARTURE.includes(fresh.status) || fresh.paymentStatus === 'PAID') {
        throw new ConflictException('La course vient de changer d\'état : dérogation inutile.');
      }
      const active = await tx.departureWaiver.count({ where: { bookingId, revokedAt: null } });
      if (active > 0) throw new ConflictException('Cette course a déjà une dérogation de départ active.');
      return tx.departureWaiver.create({ data: { bookingId, reason, grantedById: user.id } });
    });

    this.logger.log(`Dérogation de départ accordée — course ${booking.reference} — ${user.role} ${user.id}`);
    return waiver;
  }

  /** Retire la dérogation active, tant que la course n'est pas partie. */
  async revoke(bookingId: string, reason: string, user: AuthUser): Promise<DepartureWaiver> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException(`Réservation introuvable : ${bookingId}`);
    if (!BEFORE_DEPARTURE.includes(booking.status)) {
      throw new ConflictException('La course est déjà partie ou terminée : la dérogation ne peut plus être retirée.');
    }

    const revoked = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const active = await tx.departureWaiver.findFirst({ where: { bookingId, revokedAt: null } });
      if (!active) throw new NotFoundException('Cette course n\'a pas de dérogation de départ active.');
      const { count } = await tx.departureWaiver.updateMany({
        where: { id: active.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedById: user.id, revokeReason: reason },
      });
      if (count === 0) throw new ConflictException('Cette dérogation vient déjà d\'être retirée.');
      return tx.departureWaiver.findUniqueOrThrow({ where: { id: active.id } });
    });

    this.logger.log(`Dérogation de départ retirée — course ${booking.reference} — ${user.role} ${user.id}`);
    return revoked;
  }

  /**
   * Courses « à encaisser » (panneau « À régler », MANAGER et ADMIN) : non payées, ni
   * annulées ni « client absent », et soit avec une dérogation active, soit terminées
   * sans dérogation (départ hors règle : c'est de l'argent dû, à signaler).
   * Le panneau a ses propres données : une course terminée n'est plus dans la file active.
   */
  listToCollect() {
    return this.prisma.booking.findMany({
      where: {
        paymentStatus: 'PENDING',
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [{ departureWaivers: { some: { revokedAt: null } } }, { status: 'COMPLETED' }],
      },
      orderBy: [{ completedAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      select: {
        id: true,
        reference: true,
        status: true,
        paymentStatus: true,
        totalPriceFcfa: true,
        isImmediate: true,
        scheduledAt: true,
        completedAt: true,
        pickupAddress: true,
        dropoffAddress: true,
        bookedByName: true,
        bookedByPhone: true,
        client: { select: { fullName: true, phone: true } },
        payments: { orderBy: { createdAt: 'desc' }, include: PAYMENT_PEOPLE },
        departureWaivers: { orderBy: { grantedAt: 'desc' }, include: WAIVER_PEOPLE },
      },
    });
  }
}
