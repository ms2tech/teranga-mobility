import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post } from '@nestjs/common';
import { Route } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ADMIN_ROLES, AuthUser } from '../auth/auth.types';
import { CreateRouteDto } from './dto/create-route.dto';
import { RouteStateDto } from './dto/route-state.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { ROUTE_BOUNDS } from './route-bounds';
import { RoutesService } from './routes.service';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  /** Corridors actifs (axes AIBD, ville à ville…). */
  @Get()
  findAll(): Promise<Route[]> {
    return this.routes.findAllActive();
  }

  /** Tous les corridors, désactivés compris, avec les bornes des champs (ADMIN). */
  @Get('admin')
  @Roles(...ADMIN_ROLES)
  async admin() {
    return { routes: await this.routes.findAllForAdmin(), bounds: ROUTE_BOUNDS };
  }

  /** Historique d'un corridor : auteur, date, motif, anciennes et nouvelles valeurs (ADMIN). */
  @Get(':id/history')
  @Roles(...ADMIN_ROLES)
  history(@Param('id') id: string) {
    return this.routes.history(id);
  }

  /** Nouveau corridor, avec motif (ADMIN). */
  @Post()
  @Roles(...ADMIN_ROLES)
  create(@Body() dto: CreateRouteDto, @CurrentUser() user: AuthUser): Promise<Route> {
    return this.routes.create(dto, user);
  }

  /** Nouveaux prix et durée d'un corridor, avec motif (ADMIN). Ne touche pas aux réservations existantes. */
  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateRouteDto, @CurrentUser() user: AuthUser): Promise<Route> {
    return this.routes.update(id, dto, user);
  }

  /** Désactive un corridor (jamais de suppression), avec motif (ADMIN). */
  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles(...ADMIN_ROLES)
  deactivate(@Param('id') id: string, @Body() dto: RouteStateDto, @CurrentUser() user: AuthUser): Promise<Route> {
    return this.routes.setActive(id, false, dto, user);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Roles(...ADMIN_ROLES)
  reactivate(@Param('id') id: string, @Body() dto: RouteStateDto, @CurrentUser() user: AuthUser): Promise<Route> {
    return this.routes.setActive(id, true, dto, user);
  }
}

@Module({
  providers: [RoutesService],
  controllers: [RoutesController],
  exports: [RoutesService],
})
export class RoutesModule {}
