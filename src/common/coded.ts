// src/common/coded.ts
import { HttpException } from '@nestjs/common';

const ERROR_NAME: Record<number, string> = { 400: 'Bad Request', 403: 'Forbidden', 409: 'Conflict' };

/**
 * Erreur 4xx avec un code que la console sait afficher (PAYMENT_REQUIRED, DRIVER_REQUIRED,
 * TARIFF_CHANGED…). `extra` ajoute des champs au corps de la réponse (ex. le nouveau prix).
 */
export function coded(
  statusCode: 400 | 403 | 409,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): HttpException {
  return new HttpException(
    { statusCode, code, message, error: ERROR_NAME[statusCode], ...extra },
    statusCode,
  );
}
