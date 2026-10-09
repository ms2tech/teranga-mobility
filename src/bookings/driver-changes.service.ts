// src/bookings/driver-changes.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Booking, BookingStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { coded } from '../common/coded';
import { PERSON_NAME } from '../common/safe-selects';
import { PrismaService } from '../prisma/prisma.service';
import { STATUS_LABEL } from './booking-status';
import { ChangeDriverDto } from './dto/change-driver.dto';

/** Seules les courses en route ou en cours changent de chauffeur ainsi (avant le départ : l'affectation). */
export const ON_THE_ROAD: BookingStatus[] = ['EN_ROUTE', 'IN_PROGRESS'];

/** Noms et immatriculations seulement (jamais le compte complet du chauffeur). */
export const DRIVER_CHANGE_PEOPLE = {
  fromDriver: { select: { user: PERSON_NAME } },
  toDriver: { select: { user: PERSON_NAME } },
  fromVehicle: { select: { registration: true, model: true } },
  toVehicle: { select: { registration: true, model: true } },
  changedBy: PERSON_NAME,
} satisfies Prisma.DriverChangeInclude;

/**
 * Changement de chauffeur (et de véhicule) d'une course en route ou en cours : panne,
 * incident. Tout le personnel peut le faire, avec un motif obligatoire. Chaque changement
 * ajoute une ligne DriverChange (jamais modifiée) : ancien et nouveau chauffeur et véhicule,
 * motif, auteur, date, statut de la course à ce moment-là. La course garde son statut, son
 * paiement et son prix (le prix est figé). Le partage de la part chauffeur entre l'ancien et
 * le nouveau chauffeur n'est pas décidé : ce sera au lot des reversements.
 */
@Injectable()
export class DriverChangesService {
  private readonly logger = new Logger(DriverChangesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async change(bookingId: string, dto: ChangeDriverDto, user: AuthUser): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException(`Réservation introuvable : ${bookingId}`);

    if (!ON_THE_ROAD.includes(booking.status)) {
      throw coded(
        409,
        'DRIVER_CHANGE_NOT_ALLOWED',
        ['PENDING', 'CONFIRMED', 'ASSIGNED'].includes(booking.status)
          ? "La course n'est pas encore partie : utilisez l'affectation (« Affecter un chauffeur »)."
          : `La course est ${STATUS_LABEL[booking.status]} : son chauffeur ne peut plus changer.`,
      );
    }

    const driver = await this.prisma.driver.findUnique({ where: { id: dto.driverId } });
    if (!driver) throw new NotFoundException(`Chauffeur introuvable : ${dto.driverId}`);
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException(`Véhicule introuvable : ${dto.vehicleId}`);

    if (vehicle.driverId !== dto.driverId) {
      throw new BadRequestException("Ce véhicule n'appartient pas à ce chauffeur.");
    }
    if (!vehicle.isActive) throw new BadRequestException("Ce véhicule n'est pas actif.");
    // Le même chauffeur peut changer de véhicule (panne du véhicule) même s'il n'est plus « actif » ;
    // un autre chauffeur, lui, doit l'être.
    if (dto.driverId !== booking.driverId && driver.status !== 'ACTIVE') {
      throw new BadRequestException("Ce chauffeur n'est pas actif.");
    }
    // Un passager en fauteuil roulant ne monte que dans un véhicule adapté, aussi après un changement.
    if (booking.needsWheelchairVehicle && !vehicle.wheelchairAccessible) {
      throw coded(400, 'WHEELCHAIR_VEHICLE_REQUIRED', 'Cette course nécessite un véhicule adapté au fauteuil roulant.');
    }
    if (dto.driverId === booking.driverId && dto.vehicleId === booking.vehicleId) {
      throw coded(400, 'NO_CHANGE', 'Aucun changement : ce chauffeur et ce véhicule sont déjà ceux de la course.');
    }

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Mise à jour conditionnelle sur l'état lu : si la course vient d'être terminée, de changer de
      // statut ou de chauffeur, on n'écrase rien et on n'écrit pas d'historique.
      const { count } = await tx.booking.updateMany({
        where: { id: bookingId, status: booking.status, driverId: booking.driverId, vehicleId: booking.vehicleId },
        data: { driverId: dto.driverId, vehicleId: dto.vehicleId },
      });
      if (count === 0) {
        throw coded(409, 'COURSE_CHANGED', "La course vient de changer (statut ou chauffeur) : rechargez la liste et recommencez.");
      }
      await tx.driverChange.create({
        data: {
          bookingId,
          bookingStatus: booking.status,
          fromDriverId: booking.driverId,
          fromVehicleId: booking.vehicleId,
          toDriverId: dto.driverId,
          toVehicleId: dto.vehicleId,
          reason: dto.reason,
          changedById: user.id,
        },
      });
      return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    });

    this.logger.log(`Chauffeur changé — course ${booking.reference} (${STATUS_LABEL[booking.status]}) — ${user.role} ${user.id}`);
    return updated;
  }
}
