// src/payments/manual-payments.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Payment, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ManualPaymentDto } from './dto/manual-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { PAYMENT_PEOPLE } from './payment.include';

/**
 * Paiements reçus « autrement » que par PayDunya, et corrections.
 * Principe : une ligne Payment n'est jamais modifiée dans son montant ni supprimée.
 * Une erreur se corrige par une annulation ou un remboursement (motif + auteur),
 * et l'historique reste complet. Aucun chauffeur n'encaisse : l'argent est toujours
 * reçu par la société.
 */
@Injectable()
export class ManualPaymentsService {
  private readonly logger = new Logger(ManualPaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Confirme que l'argent d'une course est reçu (MANAGER, ADMIN). Le montant est
   * toujours le total de la course. Débloque le départ de la course.
   */
  async confirm(bookingId: string, dto: ManualPaymentDto, user: AuthUser): Promise<Payment> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException(`Réservation introuvable : ${bookingId}`);
    if (booking.status === 'CANCELLED') {
      throw new BadRequestException('Réservation annulée : impossible de confirmer un paiement.');
    }
    if (booking.paymentStatus === 'PAID') {
      throw new ConflictException('Cette réservation est déjà payée.');
    }

    const reference = dto.reference?.trim() || undefined;
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (receivedAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('La date de réception ne peut pas être dans le futur.');
    }

    const payment = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (reference) {
        // Verrou : deux confirmations simultanées avec la même référence ne passent pas toutes les deux.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payment-ref:' + reference.toLowerCase()}))`;
        const clash = await tx.payment.findFirst({
          where: { reference: { equals: reference, mode: 'insensitive' }, status: { not: 'CANCELLED' } },
          include: { booking: { select: { reference: true } } },
        });
        if (clash) {
          throw new ConflictException(`Cette référence est déjà utilisée sur la course ${clash.booking.reference}.`);
        }
      }

      // Le premier gagne : mise à jour conditionnelle de la course (double clic, deux responsables…).
      const applied = await tx.booking.updateMany({
        where: { id: bookingId, paymentStatus: { not: 'PAID' }, status: { not: 'CANCELLED' } },
        data: { paymentStatus: 'PAID', paymentMethod: 'OTHER' },
      });
      if (applied.count === 0) {
        throw new ConflictException("Cette réservation vient d'être payée ou annulée.");
      }
      const fresh = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });

      const created = await tx.payment.create({
        data: {
          bookingId,
          amountFcfa: fresh.totalPriceFcfa,
          method: 'OTHER',
          source: 'MANUAL',
          status: 'PAID',
          paidAt: receivedAt,
          reference: reference ?? null,
          note: dto.note,
          confirmedById: user.id,
          confirmedAt: new Date(),
        },
      });

      // Les liens PayDunya encore en attente sont abandonnés chez nous. PayDunya ne
      // permet pas de les annuler : s'ils sont payés plus tard, l'IPN les enregistrera
      // comme double paiement à rembourser (voir PaymentsService.syncFromProvider).
      await tx.payment.updateMany({
        where: { bookingId, source: 'GATEWAY', status: 'PENDING' },
        data: { status: 'CANCELLED', note: `Remplacé par une confirmation manuelle (${created.id})` },
      });
      return created;
    });

    this.logger.log(`Paiement manuel confirmé — course ${booking.reference} — ${user.role} ${user.id}`);
    return payment;
  }

  /**
   * Annule une confirmation manuelle (ADMIN, motif obligatoire). La ligne est
   * conservée avec son annulation ; la course redevient non payée s'il n'existe
   * pas d'autre paiement valide. Un paiement PayDunya ne s'annule pas : il se rembourse.
   */
  async voidConfirmation(paymentId: string, reason: string, user: AuthUser): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`Paiement introuvable : ${paymentId}`);
    if (payment.source !== 'MANUAL') {
      throw new BadRequestException("Un paiement PayDunya ne s'annule pas : il se rembourse.");
    }
    if (payment.status !== 'PAID') {
      throw new ConflictException('Seule une confirmation en cours (payée) peut être annulée.');
    }

    const voided = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PAID' },
        data: { status: 'CANCELLED', voidedById: user.id, voidedAt: new Date(), voidReason: reason },
      });
      if (count === 0) throw new ConflictException('Cette confirmation vient déjà d\'être annulée.');
      await this.recomputeBooking(tx, payment.bookingId);
      return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    });

    this.logger.log(`Confirmation manuelle annulée — paiement ${paymentId} — ${user.role} ${user.id}`);
    return voided;
  }

  /**
   * Marque un paiement comme remboursé (ADMIN), après remboursement fait à la main.
   * Pour un double paiement, la course n'est pas touchée ; pour le paiement qui
   * avait payé la course, elle passe à « remboursée ».
   */
  async refund(paymentId: string, dto: RefundPaymentDto, user: AuthUser): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException(`Paiement introuvable : ${paymentId}`);
    if (payment.status !== 'PAID') {
      throw new ConflictException('Seul un paiement reçu (payé) peut être remboursé.');
    }

    const refunded = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PAID' },
        data: {
          status: 'REFUNDED',
          refundedById: user.id,
          refundedAt: new Date(),
          refundReason: dto.reason,
          refundReference: dto.reference,
        },
      });
      if (count === 0) throw new ConflictException('Ce paiement vient déjà d\'être remboursé.');
      if (!payment.isDuplicate) await this.recomputeBooking(tx, payment.bookingId);
      return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    });

    this.logger.log(`Paiement remboursé — paiement ${paymentId} — ${user.role} ${user.id}`);
    return refunded;
  }

  /**
   * « À rembourser » du panneau « À régler » : les doubles paiements, et les paiements
   * reçus pour une course ANNULÉE (annulation d'une course payée, ou lien payé après
   * l'annulation). Rien n'est remboursé automatiquement : c'est un acte explicite d'un admin.
   */
  listToRefund() {
    return this.prisma.payment.findMany({
      where: { status: 'PAID', OR: [{ isDuplicate: true }, { booking: { status: 'CANCELLED' } }] },
      orderBy: { paidAt: 'asc' },
      select: {
        id: true,
        amountFcfa: true,
        paidAt: true,
        provider: true,
        providerRef: true,
        receiptUrl: true,
        isDuplicate: true,
        source: true,
        booking: {
          select: {
            id: true,
            reference: true,
            status: true,
            cancelReason: true,
            client: { select: { fullName: true, phone: true } },
          },
        },
      },
    });
  }

  /** Historique complet des paiements d'une course (annulés et remboursés compris). */
  async history(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } });
    if (!booking) throw new NotFoundException(`Réservation introuvable : ${bookingId}`);
    return this.prisma.payment.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
      include: PAYMENT_PEOPLE,
    });
  }

  /**
   * Recalcule l'état de paiement de la course à partir de ses paiements : payée s'il
   * reste un paiement valide (hors doublon), remboursée si le dernier a été remboursé,
   * sinon non payée. Ne touche jamais à Booking.status.
   */
  private async recomputeBooking(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    const valid = await tx.payment.findFirst({
      where: { bookingId, status: 'PAID', isDuplicate: false },
      orderBy: { paidAt: 'desc' },
    });
    if (valid) {
      await tx.booking.update({
        where: { id: bookingId },
        data: { paymentStatus: 'PAID', paymentMethod: valid.method },
      });
      return;
    }
    const refunded = await tx.payment.findFirst({
      where: { bookingId, status: 'REFUNDED', isDuplicate: false },
    });
    await tx.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: refunded ? 'REFUNDED' : 'PENDING', paymentMethod: null },
    });
  }
}
