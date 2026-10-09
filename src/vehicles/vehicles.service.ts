import { Injectable, ConflictException } from '@nestjs/common';
import { Vehicle, Prisma } from '@prisma/client';
import { DRIVER_SUMMARY, VEHICLE_FIELDS } from '../common/safe-selects';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    const taken = await this.prisma.vehicle.findUnique({
      where: { registration: dto.registration },
    });
    if (taken) {
      throw new ConflictException(
        `Cette immatriculation existe déjà: ${dto.registration}`,
      );
    }
    const data: Prisma.VehicleCreateInput = {
      registration: dto.registration,
      type: dto.type,
      model: dto.model,
      seats: dto.seats ?? 4,
      wheelchairAccessible: dto.wheelchairAccessible ?? false,
      hasAirConditioning: dto.hasAirConditioning ?? true,
      ...(dto.driverId ? { driver: { connect: { id: dto.driverId } } } : {}),
    };
    return this.prisma.vehicle.create({ data });
  }

  /** Véhicules actifs, avec le résumé de leur chauffeur (jamais son compte : voir common/safe-selects.ts). */
  findAll() {
    return this.prisma.vehicle.findMany({
      where: { isActive: true },
      select: { ...VEHICLE_FIELDS, driver: { select: DRIVER_SUMMARY } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
