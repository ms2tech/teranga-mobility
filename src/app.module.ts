import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PricingModule } from './pricing/pricing.module';
import { RoutesModule } from './routes/routes.module';
import { BookingsModule } from './bookings/bookings.module';
import { DriversModule } from './drivers/drivers.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { PaymentsModule } from './payments/payments.module';
import { AuthModule } from './auth/auth.module';
import { businessConfig } from './config/business.config';
import { authConfig } from './config/auth.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [businessConfig, authConfig] }),
    PrismaModule,
    AuthModule,
    PricingModule,
    RoutesModule,
    BookingsModule,
    DriversModule,
    VehiclesModule,
    PaymentsModule,
  ],
})
export class AppModule {}
