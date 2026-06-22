import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ServiceType } from '@prisma/client';

/** Devis à partir des adresses (la carte mesure distance + durée). */
export class EstimateRequestDto {
  @IsString() pickupAddress!: string;
  @IsString() dropoffAddress!: string;
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsOptional() @IsBoolean() needsWheelchairVehicle?: boolean;
  @IsOptional() @IsBoolean() withAccompaniment?: boolean;
  @IsOptional() @IsInt() @Min(0) accompanimentFeeFcfa?: number;
  @IsOptional() @IsBoolean() viaToll?: boolean;
}
