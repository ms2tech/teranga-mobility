import { Injectable } from '@nestjs/common';
import { Route } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive(): Promise<Route[]> {
    return this.prisma.route.findMany({
      where: { isActive: true },
      orderBy: { city: 'asc' },
    });
  }
}
