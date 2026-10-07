// src/payments/payments.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider.interface';
import { PaydunyaProvider } from './providers/paydunya.provider';

/** Choisit le fournisseur selon PAYMENT_AGGREGATOR (Wave en direct viendra ici). */
function createPaymentProvider(config: ConfigService): PaymentProvider {
  const aggregator = (config.get<string>('PAYMENT_AGGREGATOR') || 'PAYDUNYA')
    .trim()
    .toUpperCase();

  switch (aggregator) {
    case 'PAYDUNYA':
      return new PaydunyaProvider(config);
    default:
      throw new Error(`PAYMENT_AGGREGATOR inconnu : "${aggregator}" (valeurs gérées : PAYDUNYA).`);
  }
}

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: createPaymentProvider,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
