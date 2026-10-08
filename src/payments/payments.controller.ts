// src/payments/payments.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Payment } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { ManualPaymentsService } from './manual-payments.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider.interface';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { ADMIN_ROLES, AuthUser, MANAGER_ROLES } from '../auth/auth.types';
import { ManualPaymentDto } from './dto/manual-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { VoidPaymentDto } from './dto/void-payment.dto';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly manual: ManualPaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Historique complet des paiements d'une course (annulés et remboursés compris). */
  @Get('bookings/:bookingId')
  history(@Param('bookingId') bookingId: string) {
    return this.manual.history(bookingId);
  }

  /** Confirmation manuelle « Autre » : l'argent est reçu (MANAGER, ADMIN). Débloque le départ. */
  @Post('bookings/:bookingId/manual')
  @Roles(...MANAGER_ROLES)
  confirmManually(
    @Param('bookingId') bookingId: string,
    @Body() dto: ManualPaymentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Payment> {
    return this.manual.confirm(bookingId, dto, user);
  }

  /** Panneau « À régler » : doubles paiements à rembourser (MANAGER, ADMIN). */
  @Get('to-refund')
  @Roles(...MANAGER_ROLES)
  toRefund() {
    return this.manual.listToRefund();
  }

  /** Annule une confirmation manuelle, avec motif, sans effacer l'historique (ADMIN). */
  @Post(':id/void')
  @HttpCode(200)
  @Roles(...ADMIN_ROLES)
  voidConfirmation(
    @Param('id') id: string,
    @Body() dto: VoidPaymentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Payment> {
    return this.manual.voidConfirmation(id, dto.reason, user);
  }

  /** Marque un paiement comme remboursé (fait à la main), avec motif et référence (ADMIN). */
  @Post(':id/refund')
  @HttpCode(200)
  @Roles(...ADMIN_ROLES)
  refund(
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Payment> {
    return this.manual.refund(id, dto, user);
  }

  /** L'opérateur génère un lien de paiement pour une réservation. */
  @Post('bookings/:bookingId/link')
  createLink(
    @Param('bookingId') bookingId: string,
  ): Promise<{ paymentId: string; paymentUrl: string }> {
    return this.payments.createPaymentLink(bookingId);
  }

  /** Vérification manuelle auprès de PayDunya (utile si l'IPN n'arrive pas). */
  @Post(':id/check')
  @HttpCode(200)
  check(@Param('id') id: string): Promise<Payment> {
    return this.payments.checkPayment(id);
  }

  /**
   * IPN PayDunya. Les données arrivent sous `data`, en form-urlencoded
   * (data[hash], data[invoice][token]…) ou en JSON : Nest les parse dans
   * les deux cas vers le même objet imbriqué.
   */
  @Public() // appelée par PayDunya, sans session : le hash est vérifié puis le statut reconfirmé
  @Post('paydunya/ipn')
  @HttpCode(200)
  async paydunyaIpn(@Body() body: unknown): Promise<{ received: true }> {
    if (!this.provider.isAuthenticNotification(body)) {
      throw new UnauthorizedException();
    }

    const token = invoiceToken(body);
    if (!token) {
      this.logger.warn('IPN PayDunya reçu sans token de facture.');
      return { received: true };
    }

    // Le statut n'est jamais lu dans l'IPN : syncFromProvider le redemande à PayDunya.
    const payment = await this.payments.syncFromProvider(token);
    if (!payment) {
      this.logger.warn(`IPN PayDunya : token de facture inconnu (${token}).`);
    }
    return { received: true };
  }
}

function invoiceToken(body: unknown): string | undefined {
  const data = (body as { data?: unknown } | null | undefined)?.data;
  const invoice = (data as { invoice?: unknown } | null | undefined)?.invoice;
  const token = (invoice as { token?: unknown } | null | undefined)?.token;
  return typeof token === 'string' && token ? token : undefined;
}
