// src/pricing/corridor-guard.ts
import { coded } from '../common/coded';

/**
 * Réserver sur un corridor est REFUSÉ jusqu'à « bien après le lancement » (décision de Moussa) :
 * le prix d'une réservation vient toujours des adresses (trajet libre) ou d'un prix fixe saisi par
 * l'opérateur. Les corridors se gèrent (prix, désactivation, historique) mais ne servent pas à
 * réserver, ni dans la console ni sur le site public.
 *
 * Pour le réactiver un jour : passer cette constante à true, ajouter l'usage dans la console et le
 * site public, puis mettre à jour CLAUDE.md, le README et les tests (corridor-check, tarifs).
 */
export const CORRIDOR_BOOKING_ENABLED = false;

export const CORRIDOR_BOOKING_DISABLED_MESSAGE =
  "Réserver sur un corridor n'est pas possible pour le moment : le prix d'une réservation vient des adresses " +
  "(trajet libre : distanceMeters) ou d'un prix fixe saisi par l'opérateur (fixedPriceFcfa). Retirez routeId.";

/** Refuse (400 CORRIDOR_BOOKING_DISABLED) toute création de réservation ou tout devis qui porte un routeId. */
export function assertCorridorBookingAllowed(routeId: string | null | undefined): void {
  if (!CORRIDOR_BOOKING_ENABLED && routeId) {
    throw coded(400, 'CORRIDOR_BOOKING_DISABLED', CORRIDOR_BOOKING_DISABLED_MESSAGE);
  }
}
