import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { MapsModule } from '../maps/maps.module';
import { TariffsModule } from '../tariffs/tariffs.module';

@Module({
  imports: [MapsModule, TariffsModule],
  providers: [PricingService],
  controllers: [PricingController],
  exports: [PricingService],
})
export class PricingModule {}
