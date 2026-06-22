import { Body, Controller, Post } from '@nestjs/common';
import { PricingService, Quote, Estimate } from './pricing.service';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { EstimateRequestDto } from './dto/estimate-request.dto';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  /** Devis (corridor à prix fixe, ou compteur si distanceMeters fourni). */
  @Post('quote')
  quote(@Body() dto: QuoteRequestDto): Promise<Quote> {
    return this.pricing.quote(dto);
  }

  /** Devis à partir des adresses : la carte mesure distance + durée + péage. */
  @Post('estimate')
  estimate(@Body() dto: EstimateRequestDto): Promise<Estimate> {
    return this.pricing.estimate(dto);
  }
}
