import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { VehicleType } from '@prisma/client';

export class CreateVehicleDto {
  @IsString() registration!: string;
  @IsEnum(VehicleType) type!: VehicleType;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() @Min(1) seats?: number;
  @IsOptional() @IsBoolean() wheelchairAccessible?: boolean;
  @IsOptional() @IsBoolean() hasAirConditioning?: boolean;
  @IsOptional() @IsString() driverId?: string;
}
