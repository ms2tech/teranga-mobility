// src/auth/dto/login.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password';

export class LoginDto {
  @IsString() @IsNotEmpty() @MaxLength(254) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(PASSWORD_MAX_LENGTH) password!: string;
}
