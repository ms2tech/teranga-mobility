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
import { PricingModule } from '../pricing/pricing.module';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  create(@Body() dto: CreateBookingDto): Promise<Booking> {
    return this.bookings.create(dto);
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
    @Body() body: { driverId: string; vehicleId: string },
  ): Promise<Booking> {
    return this.bookings.assign(id, body.driverId, body.vehicleId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: BookingStatus },
  ): Promise<Booking> {
    return this.bookings.updateStatus(id, body.status);
  }
}

@Module({
  imports: [PricingModule],
  providers: [BookingsService],
  controllers: [BookingsController],
  exports: [BookingsService],
})
export class BookingsModule {}
