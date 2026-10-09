import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Booking, BookingStatus, DepartureWaiver } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { DepartureWaiversService } from './departure-waivers.service';
import { DriverChangesService } from './driver-changes.service';
import { ChangeDriverDto } from './dto/change-driver.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AssignBookingDto } from './dto/assign-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { WaiverReasonDto } from './dto/waiver-reason.dto';
import { PricingModule } from '../pricing/pricing.module';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser, MANAGER_ROLES } from '../auth/auth.types';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly waivers: DepartureWaiversService,
    private readonly driverChanges: DriverChangesService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Booking> {
    return this.bookings.create(dto, user.id);
  }

  @Get('upcoming')
  upcoming(@Query('status') status?: BookingStatus): Promise<Booking[]> {
    return this.bookings.findUpcoming(status);
  }

  /** Panneau « À régler » : courses à encaisser (dérogation active, ou terminées sans dérogation). */
  @Get('to-collect')
  @Roles(...MANAGER_ROLES)
  toCollect() {
    return this.waivers.listToCollect();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Booking> {
    const booking = await this.bookings.findOne(id);
    if (!booking) throw new NotFoundException(`Réservation introuvable: ${id}`);
    return booking;
  }

  @Patch(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignBookingDto,
  ): Promise<Booking> {
    return this.bookings.assign(id, dto.driverId, dto.vehicleId);
  }

  /** En route, Terminée, Client absent, Annulée (avec motif) : voir BookingsService.updateStatus. */
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Booking> {
    return this.bookings.updateStatus(id, dto.status, user, dto.reason);
  }

  /**
   * Change le chauffeur (et le véhicule) d'une course EN ROUTE ou EN COURS : panne, incident.
   * Tout le personnel, motif obligatoire. Statut, paiement et prix de la course ne changent pas.
   */
  @Post(':id/driver-change')
  @HttpCode(200)
  changeDriver(
    @Param('id') id: string,
    @Body() dto: ChangeDriverDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Booking> {
    return this.driverChanges.change(id, dto, user);
  }

  /** Autorise le départ d'une course non payée, avec motif (MANAGER, ADMIN). */
  @Post(':id/departure-waiver')
  @Roles(...MANAGER_ROLES)
  grantWaiver(
    @Param('id') id: string,
    @Body() dto: WaiverReasonDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DepartureWaiver> {
    return this.waivers.grant(id, dto.reason, user);
  }

  /** Retire la dérogation active, tant que la course n'est pas partie (MANAGER, ADMIN). */
  @Post(':id/departure-waiver/revoke')
  @HttpCode(200)
  @Roles(...MANAGER_ROLES)
  revokeWaiver(
    @Param('id') id: string,
    @Body() dto: WaiverReasonDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DepartureWaiver> {
    return this.waivers.revoke(id, dto.reason, user);
  }
}

@Module({
  imports: [PricingModule],
  providers: [BookingsService, DepartureWaiversService, DriverChangesService],
  controllers: [BookingsController],
  exports: [BookingsService],
})
export class BookingsModule {}
