import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SensitiveFieldsInterceptor } from './common/sensitive-fields.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { PricingModule } from './pricing/pricing.module';
import { TariffsModule } from './tariffs/tariffs.module';
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
    TariffsModule,
    PricingModule,
    RoutesModule,
    BookingsModule,
    DriversModule,
    VehiclesModule,
    PaymentsModule,
  ],
  // Filet de sécurité : aucune réponse ne contient passwordHash ni tokenHash (voir l'intercepteur).
  providers: [{ provide: APP_INTERCEPTOR, useClass: SensitiveFieldsInterceptor }],
})
export class AppModule {}
