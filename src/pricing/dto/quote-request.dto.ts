import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ServiceType } from '@prisma/client';

/**
 * Devis : `fixedPriceFcfa` -> prix fixe saisi par l'opérateur ; sinon `distanceMeters` -> compteur.
 * `routeId` (corridor) est REFUSÉ pour le moment (400 CORRIDOR_BOOKING_DISABLED, voir
 * pricing/corridor-guard.ts) : le champ reste déclaré pour renvoyer ce message clair.
 */
export class QuoteRequestDto {
  @IsOptional() @IsString() routeId?: string;
  @IsOptional() @IsInt() @Min(1) fixedPriceFcfa?: number;
  @IsOptional() @IsInt() @Min(1) distanceMeters?: number;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsOptional() @IsBoolean() needsWheelchairVehicle?: boolean;
  @IsOptional() @IsBoolean() withAccompaniment?: boolean;
  @IsOptional() @IsInt() @Min(0) accompanimentFeeFcfa?: number;
  @IsOptional() @IsBoolean() viaToll?: boolean;
}
