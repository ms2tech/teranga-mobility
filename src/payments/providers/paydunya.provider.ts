// src/payments/providers/paydunya.provider.ts
import { BadGatewayException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import {
  ConfirmResult,
  CreateInvoiceInput,
  CreateInvoiceResult,
  PaymentProvider,
  ProviderPaymentStatus,
} from '../payment-provider.interface';

// Documentation : https://developers.paydunya.com/doc/FR/http_json
const BASE_URLS = {
  test: 'https://app.paydunya.com/sandbox-api/v1',
  live: 'https://app.paydunya.com/api/v1',
} as const;

const REQUEST_TIMEOUT_MS = 15_000;

/** Chemins des champs d'un objet (ex. "invoice.token"), sans aucune valeur. */
function fieldPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return prefix ? [prefix] : [];
  return entries.flatMap(([key, child]) =>
    fieldPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

export class PaydunyaProvider implements PaymentProvider {
  readonly name = 'PAYDUNYA';
  private readonly logger = new Logger(PaydunyaProvider.name);

  // Les valeurs sont lues à chaque appel (et non au démarrage) pour que
  // l'application démarre même si PayDunya n'est pas encore configuré.
  constructor(private readonly config: ConfigService) {}

  async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const ipnUrl = this.config.get<string>('PAYDUNYA_IPN_URL')?.trim();

    const json = await this.call('POST', '/checkout-invoice/create', {
      invoice: {
        total_amount: input.amountFcfa,
        description: input.description,
      },
      store: { name: this.config.getOrThrow<string>('PAYDUNYA_STORE_NAME') },
      custom_data: {
        paymentId: input.paymentId,
        bookingReference: input.bookingReference,
      },
      // Sans callback_url, c'est l'IPN configuré dans le tableau de bord PayDunya qui s'applique.
      ...(ipnUrl ? { actions: { callback_url: ipnUrl } } : {}),
    });

    // Succès : response_text = lien de paiement, token = token de facture.
    const { token, response_text: paymentUrl } = json;
    if (typeof token !== 'string' || typeof paymentUrl !== 'string') {
      this.logger.error('Réponse de création de facture PayDunya inattendue.');
      throw new BadGatewayException('PayDunya : réponse inattendue.');
    }
    return { token, paymentUrl };
  }

  async confirm(token: string): Promise<ConfirmResult> {
    const json = await this.call(
      'GET',
      `/checkout-invoice/confirm/${encodeURIComponent(token)}`,
    );

    // Le hash (SHA-512 de la clé maître) ne doit ni être loggé ni être conservé.
    const raw: Record<string, unknown> = { ...json };
    delete raw.hash;
    if (this.mode === 'test') {
      this.logger.log(`Confirmation brute (hash retiré) : ${JSON.stringify(raw)}`);
    } else {
      // En production, jamais de valeurs (données client) : seulement les noms de champs.
      this.logger.log(`Confirmation, champs reçus : ${fieldPaths(raw).join(', ')}`);
    }

    const receiptUrl =
      typeof json.receipt_url === 'string' && json.receipt_url
        ? json.receipt_url
        : undefined;

    // `method` n'est pas renseigné : ni la doc ni la réponse du sandbox ne
    // contiennent de champ « moyen de paiement ». À chercher parmi les noms de
    // champs loggés lors du premier paiement en mode live.
    return { status: this.mapStatus(json.status), receiptUrl, raw };
  }

  /**
   * data.hash = SHA-512 (hex) de la clé maître. Ce hash est identique à chaque
   * notification : il prouve l'origine mais pas l'authenticité du contenu, d'où
   * la confirmation obligatoire auprès de PayDunya après réception.
   */
  isAuthenticNotification(body: unknown): boolean {
    const data = (body as { data?: unknown } | null | undefined)?.data;
    const received = (data as { hash?: unknown } | null | undefined)?.hash;
    if (typeof received !== 'string') return false;

    const expected = createHash('sha512')
      .update(this.secret('PAYDUNYA_MASTER_KEY'))
      .digest('hex');
    const a = Buffer.from(received.toLowerCase());
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private mapStatus(status: unknown): ProviderPaymentStatus {
    if (status === 'completed') return 'PAID';
    if (status === 'cancelled' || status === 'failed') return 'FAILED';
    return 'PENDING';
  }

  private get mode(): 'test' | 'live' {
    const mode = this.config
      .getOrThrow<string>('PAYDUNYA_MODE')
      .trim()
      .toLowerCase();
    if (mode !== 'test' && mode !== 'live') {
      throw new Error(`PAYDUNYA_MODE invalide : "${mode}" (attendu : test ou live).`);
    }
    return mode;
  }

  private secret(key: string): string {
    const value = this.config.getOrThrow<string>(key).trim();
    if (!value) throw new Error(`${key} est vide.`);
    return value;
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URLS[this.mode]}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'PAYDUNYA-MASTER-KEY': this.secret('PAYDUNYA_MASTER_KEY'),
          'PAYDUNYA-PRIVATE-KEY': this.secret('PAYDUNYA_PRIVATE_KEY'),
          'PAYDUNYA-TOKEN': this.secret('PAYDUNYA_TOKEN'),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`PayDunya injoignable (${method} ${path}) : ${(err as Error).message}`);
      throw new BadGatewayException('PayDunya est injoignable.');
    }

    let json: Record<string, unknown>;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      this.logger.error(`Réponse PayDunya non JSON (${method} ${path}, HTTP ${res.status}).`);
      throw new BadGatewayException('PayDunya : réponse illisible.');
    }

    if (!res.ok || json.response_code !== '00') {
      const text = typeof json.response_text === 'string' ? json.response_text : 'erreur inconnue';
      this.logger.error(
        `PayDunya ${method} ${path} refusé : HTTP ${res.status}, code ${String(json.response_code)}, ${text}`,
      );
      throw new BadGatewayException(`PayDunya : ${text}`);
    }
    return json;
  }
}
