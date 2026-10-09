// src/common/safe-selects.ts
import { Prisma } from '@prisma/client';

/**
 * Ce que l'API montre des personnes et des véhicules dans ses réponses.
 *
 * RÈGLE : une réponse ne contient JAMAIS un compte (User) complet. Un chauffeur, l'auteur d'un
 * changement, etc. ne s'affichent que par leur NOM : jamais passwordHash, e-mail, téléphone de
 * connexion, dates de connexion, ni numéro de reversement ou taux de commission d'un chauffeur.
 * Toute lecture destinée à une réponse passe par un `select` explicite de ce fichier (ou par un
 * `select: { fullName: true }` pour un auteur) : pas de `include: { user: true }`, pas de
 * `driver: true`. Le test `npm run test:sensitive` le contrôle, et un filet de sécurité global
 * (SensitiveFieldsInterceptor) retire passwordHash / tokenHash de toute réponse.
 */

/** Un compte vu par les autres : son nom, rien d'autre. */
export const PERSON_NAME = { select: { fullName: true } } satisfies { select: Prisma.UserSelect };

/** Chauffeur : identité affichable et statut (pas de reversement, pas de commission, pas de compte). */
export const DRIVER_SUMMARY = {
  id: true,
  status: true,
  firstAidCertified: true,
  user: PERSON_NAME,
} satisfies Prisma.DriverSelect;

/** Véhicule : tous ses champs (aucun n'est sensible). */
export const VEHICLE_FIELDS = {
  id: true,
  registration: true,
  type: true,
  model: true,
  seats: true,
  wheelchairAccessible: true,
  hasAirConditioning: true,
  isActive: true,
  driverId: true,
} satisfies Prisma.VehicleSelect;

/** Véhicule d'une course dans la file : de quoi l'identifier. */
export const VEHICLE_ON_BOOKING = { id: true, registration: true, model: true, type: true } satisfies Prisma.VehicleSelect;

/** Passager d'une course : nom et téléphone (pour l'appeler et lui envoyer le lien). Pas de notes médicales ni d'e-mail. */
export const CLIENT_SUMMARY = { id: true, fullName: true, phone: true } satisfies Prisma.ClientSelect;

/** Corridor lié à une course. */
export const ROUTE_SUMMARY = { id: true, code: true, label: true } satisfies Prisma.RouteSelect;

export type DriverSummary = Prisma.DriverGetPayload<{ select: typeof DRIVER_SUMMARY }>;
export type DriverWithVehicles = Prisma.DriverGetPayload<{
  select: typeof DRIVER_SUMMARY & { vehicles: { select: typeof VEHICLE_FIELDS } };
}>;
