import { Controller, Get, Module } from '@nestjs/common';
import { Route } from '@prisma/client';
import { RoutesService } from './routes.service';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  /** Axes desservis (Dakar, Thiès, Touba, Mbour, Saly <-> AIBD). */
  @Get()
  findAll(): Promise<Route[]> {
    return this.routes.findAllActive();
  }
}

@Module({
  providers: [RoutesService],
  controllers: [RoutesController],
  exports: [RoutesService],
})
export class RoutesModule {}
