import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Driver, DriverStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crée le compte (User role DRIVER) + le profil chauffeur, en une transaction. */
  async create(dto: CreateDriverDto): Promise<Driver> {
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
        include: { user: true, vehicles: true },
      });
    });
  }

  findAll(): Promise<Driver[]> {
    return this.prisma.driver.findMany({
      include: { user: true, vehicles: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Chauffeurs actifs avec leurs véhicules (pour l'affectation des courses). */
  findAssignable(): Promise<Driver[]> {
    return this.prisma.driver.findMany({
      where: { status: DriverStatus.ACTIVE, vehicles: { some: { isActive: true } } },
      include: { user: true, vehicles: { where: { isActive: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: DriverStatus): Promise<Driver> {
    const exists = await this.prisma.driver.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Chauffeur introuvable: ${id}`);
    return this.prisma.driver.update({ where: { id }, data: { status } });
  }
}
