// src/common/sensitive-fields.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Champs qu'aucune réponse de l'API ne doit contenir, sous aucune forme : le hash d'un mot de passe
 * et le hash d'un jeton de session. Ce sont des secrets de base de données, jamais des données à afficher.
 */
export const SENSITIVE_KEYS: readonly string[] = ['passwordHash', 'tokenHash'];

const MAX_DEPTH = 25;

/**
 * Retire en place les champs sensibles de `value` (objets et tableaux, à toute profondeur) et
 * renvoie le chemin de chacun de ceux qui ont été trouvés dans `found`. Les dates et les valeurs
 * simples ne sont pas touchées.
 */
export function scrubSensitive(value: unknown, found: string[] = [], path = '$', depth = 0): string[] {
  if (value === null || typeof value !== 'object' || value instanceof Date || depth > MAX_DEPTH) return found;
  if (Array.isArray(value)) {
    value.forEach((item, i) => scrubSensitive(item, found, `${path}[${i}]`, depth + 1));
    return found;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEYS.includes(key)) {
      found.push(`${path}.${key}`);
      delete obj[key];
    } else {
      scrubSensitive(obj[key], found, `${path}.${key}`, depth + 1);
    }
  }
  return found;
}

/**
 * Filet de sécurité GLOBAL, en plus des `select` explicites (common/safe-selects.ts) : si une
 * requête laissait passer un passwordHash ou un tokenHash, il est retiré de la réponse et
 * l'erreur est journalisée pour être corrigée à la source. Il ne remplace pas les `select`.
 */
@Injectable()
export class SensitiveFieldsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SensitiveFieldsInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        const found = scrubSensitive(data);
        if (found.length > 0) {
          const req = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string }>();
          this.logger.error(
            `Champ sensible retiré d'une réponse (${found.join(', ')}) — ${req.method} ${(req.originalUrl ?? '').split('?')[0]}. ` +
              'À corriger dans la requête : ne sélectionner que les champs nécessaires (common/safe-selects.ts).',
          );
        }
        return data;
      }),
    );
  }
}
