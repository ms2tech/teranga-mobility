// src/payments/payment.include.ts
import { Prisma } from '@prisma/client';

/** Noms des personnes liées à un paiement (qui a confirmé, annulé, remboursé), pour la console. */
export const PAYMENT_PEOPLE = {
  confirmedBy: { select: { fullName: true } },
  voidedBy: { select: { fullName: true } },
  refundedBy: { select: { fullName: true } },
} satisfies Prisma.PaymentInclude;
