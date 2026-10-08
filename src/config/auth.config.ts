// src/config/auth.config.ts
import { registerAs } from '@nestjs/config';

/**
 * Réglages d'authentification, modifiables via .env sans toucher au code.
 * Aucune clé secrète ici : les jetons de session sont aléatoires et seul leur
 * hash est stocké, il n'y a donc rien à signer.
 */
export const authConfig = registerAs('auth', () => ({
  cookieName: 'tm_session',
  // Inactivité maximale avant expiration. La console prolonge la session tant
  // qu'elle est ouverte : un opérateur en service n'est jamais déconnecté.
  idleMs: parseFloat(process.env.SESSION_IDLE_HOURS ?? '12') * 3_600_000,
  // Durée de vie maximale d'une session, quoi qu'il arrive.
  maxMs: parseFloat(process.env.SESSION_MAX_DAYS ?? '7') * 86_400_000,
  // Cookie « Secure » (HTTPS uniquement) : en production seulement.
  secureCookie: process.env.NODE_ENV === 'production',
}));

export type AuthConfig = ReturnType<typeof authConfig>;
