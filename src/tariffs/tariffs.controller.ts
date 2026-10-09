// src/tariffs/tariffs.controller.ts
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ADMIN_ROLES, AuthUser } from '../auth/auth.types';
import { CreateTariffDto } from './dto/create-tariff.dto';
import { TariffValuesDto } from './dto/tariff-values.dto';
import { TARIFF_BOUNDS } from './tariff-bounds';
import { TariffsService } from './tariffs.service';

/** Tarifs des trajets libres : réservés aux administrateurs. */
@Controller('tariffs')
@Roles(...ADMIN_ROLES)
export class TariffsController {
  constructor(private readonly tariffs: TariffsService) {}

  /** Version courante, avec les bornes de chaque champ (pour la console). */
  @Get('current')
  async current() {
    return { ...(await this.tariffs.currentWithAuthor()), bounds: TARIFF_BOUNDS };
  }

  /** Toutes les versions, de la plus récente à la plus ancienne. */
  @Get('history')
  history() {
    return this.tariffs.history();
  }

  /** Aperçu avant / après sur des trajets types. Ne crée rien. */
  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: TariffValuesDto) {
    return this.tariffs.preview(dto);
  }

  /** Nouvelle version du barème (motif obligatoire). S'applique aux nouvelles réservations seulement. */
  @Post()
  create(@Body() dto: CreateTariffDto, @CurrentUser() user: AuthUser) {
    return this.tariffs.create(dto, user);
  }
}
