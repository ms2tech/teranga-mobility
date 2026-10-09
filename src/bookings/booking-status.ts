// src/bookings/booking-status.ts
import { BookingStatus } from '@prisma/client';

/** Libellé d'un statut de course, en minuscules, pour les messages d'erreur. */
export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'en attente', CONFIRMED: 'confirmée', ASSIGNED: 'affectée', EN_ROUTE: 'en route',
  IN_PROGRESS: 'en cours', COMPLETED: 'terminée', CANCELLED: 'annulée', NO_SHOW: 'client absent',
};
