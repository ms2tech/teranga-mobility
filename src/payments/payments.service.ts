// src/payments/payments.service.ts
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Payment, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Génère un lien de paiement pour une réservation (une nouvelle tentative à chaque appel). */
  async createPaymentLink(
    bookingId: string,
  ): Promise<{ paymentId: string; paymentUrl: string }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException(`Réservation introuvable : ${bookingId}`);
    }
    if (booking.status === 'CANCELLED') {
      throw new BadRequestException(
        'Réservation annulée : impossible de générer un lien de paiement.',
      );
    }
    if (booking.paymentStatus === 'PAID') {
      throw new ConflictException('Cette réservation est déjà payée.');
    }

    // Le Payment est créé avant la facture : son id part dans les custom_data.
    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        amountFcfa: booking.totalPriceFcfa,
        provider: this.provider.name,
        status: 'PENDING',
      },
    });

    let invoice: { token: string; paymentUrl: string };
    try {
      invoice = await this.provider.createInvoice({
        amountFcfa: payment.amountFcfa,
        description: `Téranga Mobility — réservation ${booking.reference}`,
        bookingReference: booking.reference,
        paymentId: payment.id,
      });
    } catch (err) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      throw err;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: invoice.token, paymentUrl: invoice.paymentUrl },
    });
    return { paymentId: payment.id, paymentUrl: invoice.paymentUrl };
  }

  /** Vérification manuelle (si l'IPN n'est pas arrivé). */
  async checkPayment(id: string): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Paiement introuvable : ${id}`);
    }
    if (!payment.providerRef) {
      throw new BadRequestException(
        "Ce paiement n'a pas de facture côté fournisseur.",
      );
    }
    return (await this.syncFromProvider(payment.providerRef)) ?? payment;
  }

  /**
   * Aligne le Payment (et Booking.paymentStatus) sur l'état réel chez
   * l'agrégateur. Utilisé par l'IPN et par la vérification manuelle.
   * Idempotent. Ne touche jamais à Booking.status.
   * Retourne null si le token ne correspond à aucun paiement.
   */
  async syncFromProvider(token: string): Promise<Payment | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerRef: token },
    });
    if (!payment) return null;
    if (payment.status === 'PAID' || payment.status === 'REFUNDED') return payment;

    const result = await this.provider.confirm(token);
    if (result.status === 'PENDING' || result.status === payment.status) {
      return payment;
    }
    // Un lien abandonné (CANCELLED) ne reprend vie que s'il est réellement payé.
    if (payment.status === 'CANCELLED' && result.status !== 'PAID') return payment;

    const data: Prisma.PaymentUpdateManyMutationInput = {
      status: result.status,
      receiptUrl: result.receiptUrl,
      method: result.method,
      paidAt: result.status === 'PAID' ? new Date() : undefined,
    };

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Le filtre sur le statut protège des synchronisations simultanées
      // (IPN rejoué + vérification manuelle) : une seule applique le changement.
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } },
        data,
      });

      if (count > 0 && result.status === 'PAID') {
        // Le premier paiement valide gagne. Si la course est déjà payée (par une
        // confirmation manuelle, par exemple) ou si elle a été annulée, cet argent est
        // bien arrivé mais n'est pas appliqué à la course : il est signalé (isDuplicate)
        // et à rembourser par un admin (panneau « À régler »).
        const applied = await tx.booking.updateMany({
          where: { id: payment.bookingId, paymentStatus: { not: 'PAID' }, status: { not: 'CANCELLED' } },
          data: { paymentStatus: 'PAID', paymentMethod: result.method },
        });
        if (applied.count === 0) {
          await tx.payment.update({ where: { id: payment.id }, data: { isDuplicate: true } });
          this.logger.warn(
            `Paiement PayDunya non appliqué : le paiement ${payment.id} (${payment.amountFcfa} FCFA) est arrivé alors que la course ${payment.bookingId} était déjà payée ou annulée. À rembourser.`,
          );
        }
      }
      return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    });
  }
}
