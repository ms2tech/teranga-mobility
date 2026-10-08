import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BookingChannel,
  MobilityNeed,
  ServiceType,
  TripDirection,
  TripPurpose,
} from '@prisma/client';

export class NewClientDto {
  @IsString() fullName!: string;
  @IsString() phone!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsEnum(MobilityNeed) mobilityNeed?: MobilityNeed;
  @IsOptional() @IsString() notes?: string;
}

export class CreateBookingDto {
  // Passager : client existant OU création à la volée
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @ValidateNested() @Type(() => NewClientDto) newClient?: NewClientDto;

  // Qui réserve (souvent un proche)
  @IsOptional() @IsString() bookedByName?: string;
  @IsOptional() @IsString() bookedByPhone?: string;
  @IsOptional() @IsEnum(BookingChannel) channel?: BookingChannel;

  // Motif du trajet
  @IsOptional() @IsEnum(TripPurpose) tripPurpose?: TripPurpose;

  // Trajet libre : adresses quelconques. Corridor à prix fixe : routeId (facultatif).
  @IsOptional() @IsString() routeId?: string;
  @IsOptional() @IsInt() @Min(1) fixedPriceFcfa?: number;
  @IsOptional() @IsEnum(TripDirection) direction?: TripDirection;
  @IsString() pickupAddress!: string;
  @IsOptional() @IsNumber() pickupLat?: number;
  @IsOptional() @IsNumber() pickupLng?: number;
  @IsString() dropoffAddress!: string;
  @IsOptional() @IsNumber() dropoffLat?: number;
  @IsOptional() @IsNumber() dropoffLng?: number;

  // Mesure du trajet (pour la tarification au compteur)
  @IsOptional() @IsInt() @Min(1) distanceMeters?: number;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @IsOptional() @IsBoolean() viaToll?: boolean;

  // Quand : immédiat ou planifié
  @IsOptional() @IsBoolean() isImmediate?: boolean;
  @IsOptional() @IsDateString() scheduledAt?: string;

  @IsOptional() @IsString() flightNumber?: string;
  @IsOptional() @IsDateString() flightTime?: string;
  @IsOptional() @IsInt() @Min(1) passengersCount?: number;

  // Service & accessibilité
  @IsEnum(ServiceType) serviceType!: ServiceType;
  @IsOptional() @IsEnum(MobilityNeed) mobilityNeed?: MobilityNeed;
  @IsOptional() @IsBoolean() needsWheelchairVehicle?: boolean;
  @IsOptional() @IsBoolean() withAccompaniment?: boolean;
  @IsOptional() @IsInt() @Min(0) accompanimentFeeFcfa?: number;

  @IsOptional() @IsString() notes?: string;
  // createdById n'existe plus ici : l'auteur de la réservation est l'utilisateur
  // de la session (il ne doit pas pouvoir être falsifié depuis le corps de la requête).
}
