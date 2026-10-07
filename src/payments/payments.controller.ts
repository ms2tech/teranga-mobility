// src/payments/payments.controller.ts
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Payment } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider.interface';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

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
