import {
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Booking, BookingStatus } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AssignBookingDto } from './dto/assign-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { PricingModule } from '../pricing/pricing.module';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

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

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
  ): Promise<Booking> {
    return this.bookings.updateStatus(id, dto.status);
  }
}

@Module({
  imports: [PricingModule],
  providers: [BookingsService],
  controllers: [BookingsController],
  exports: [BookingsService],
})
export class BookingsModule {}
