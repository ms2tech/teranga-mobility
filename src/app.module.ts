import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PricingModule } from './pricing/pricing.module';
import { RoutesModule } from './routes/routes.module';
import { BookingsModule } from './bookings/bookings.module';
import { DriversModule } from './drivers/drivers.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { PaymentsModule } from './payments/payments.module';
import { businessConfig } from './config/business.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [businessConfig] }),
    PrismaModule,
    PricingModule,
    RoutesModule,
    BookingsModule,
    DriversModule,
    VehiclesModule,
    PaymentsModule,
  ],
})
export class AppModule {}
