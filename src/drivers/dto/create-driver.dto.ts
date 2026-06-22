import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateDriverDto {
  @IsString() fullName!: string;
  @IsString() phone!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() firstAidCertified?: boolean;
  @IsOptional() @IsString() payoutWavePhone?: string;
  // Taux de commission spécifique (sinon valeur globale)
  @IsOptional() @IsNumber() @Min(0) @Max(1) commissionRate?: number;
}
