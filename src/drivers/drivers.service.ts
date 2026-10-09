import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DriverStatus, Prisma, UserRole } from '@prisma/client';
import { DRIVER_SUMMARY, DriverSummary, DriverWithVehicles, VEHICLE_FIELDS } from '../common/safe-selects';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';

// Les réponses ne montrent d'un chauffeur que son résumé (voir common/safe-selects.ts) : jamais son
// compte complet, son numéro de reversement ni son taux de commission.
const WITH_VEHICLES = { ...DRIVER_SUMMARY, vehicles: { select: VEHICLE_FIELDS } } satisfies Prisma.DriverSelect;

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crée le compte (User role DRIVER) + le profil chauffeur, en une transaction. */
  async create(dto: CreateDriverDto): Promise<DriverWithVehicles> {
    const taken = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (taken) {
      throw new ConflictException(`Ce numéro est déjà utilisé: ${dto.phone}`);
    }
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email,
          role: UserRole.DRIVER,
        },
      });
      return tx.driver.create({
        data: {
          userId: user.id,
          status: DriverStatus.ACTIVE,
          firstAidCertified: dto.firstAidCertified ?? false,
          payoutWavePhone: dto.payoutWavePhone ?? dto.phone,
          commissionRate: dto.commissionRate,
        },
        select: WITH_VEHICLES,
      });
    });
  }

  findAll(): Promise<DriverWithVehicles[]> {
    return this.prisma.driver.findMany({
      select: WITH_VEHICLES,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Chauffeurs actifs avec leurs véhicules (pour l'affectation des courses). */
  findAssignable(): Promise<DriverWithVehicles[]> {
    return this.prisma.driver.findMany({
      where: { status: DriverStatus.ACTIVE, vehicles: { some: { isActive: true } } },
      select: { ...DRIVER_SUMMARY, vehicles: { where: { isActive: true }, select: VEHICLE_FIELDS } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: DriverStatus): Promise<DriverSummary> {
    const exists = await this.prisma.driver.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Chauffeur introuvable: ${id}`);
    return this.prisma.driver.update({ where: { id }, data: { status }, select: DRIVER_SUMMARY });
  }
}
