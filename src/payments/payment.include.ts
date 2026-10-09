// src/payments/payment.include.ts
import { Prisma } from '@prisma/client';
import { PERSON_NAME } from '../common/safe-selects';

/** Noms des personnes liées à un paiement (qui a confirmé, annulé, remboursé), pour la console. */
export const PAYMENT_PEOPLE = {
  confirmedBy: PERSON_NAME,
  voidedBy: PERSON_NAME,
  refundedBy: PERSON_NAME,
} satisfies Prisma.PaymentInclude;
