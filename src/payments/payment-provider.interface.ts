// src/payments/payment-provider.interface.ts
import { PaymentMethod } from '@prisma/client';

/** Jeton d'injection : le fournisseur actif est choisi via PAYMENT_AGGREGATOR. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreateInvoiceInput {
  amountFcfa: number;
  description: string;
  bookingReference: string;
  paymentId: string;
}

export interface CreateInvoiceResult {
  /** Identifiant de la facture côté agrégateur (stocké dans Payment.providerRef). */
  token: string;
  /** Lien de paiement à envoyer au client. */
  paymentUrl: string;
}

export type ProviderPaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface ConfirmResult {
  status: ProviderPaymentStatus;
  receiptUrl?: string;
  /** Moyen de paiement réellement utilisé, s'il est connu. */
  method?: PaymentMethod;
  /** Réponse brute de l'agrégateur (jamais de clés ni de hash). */
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  /** Nom stocké dans Payment.provider, ex. "PAYDUNYA". */
  readonly name: string;

  createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult>;

  /** Interroge directement l'agrégateur : seule source de vérité du statut. */
  confirm(token: string): Promise<ConfirmResult>;

  /** Vérifie l'origine d'une notification (IPN) à partir du corps reçu. */
  isAuthenticNotification(body: unknown): boolean;
}
