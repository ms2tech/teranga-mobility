// src/auth/dto/change-password.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password';

export class ChangePasswordDto {
  @IsString() @IsNotEmpty() @MaxLength(PASSWORD_MAX_LENGTH) currentPassword!: string;
  // La longueur minimale est contrôlée par le service (message en français).
  @IsString() @IsNotEmpty() @MaxLength(PASSWORD_MAX_LENGTH) newPassword!: string;
}
