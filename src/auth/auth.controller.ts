// src/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { authConfig } from '../config/auth.config';
import { AuthService } from './auth.service';
import {
  AllowPendingPasswordChange,
  CurrentUser,
  Public,
  Roles,
} from './auth.decorators';
import { ALL_ROLES, AuthenticatedRequest, AuthUser } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  private get cookieOptions() {
    return {
      httpOnly: true, // le jeton n'est jamais lisible par JavaScript
      sameSite: 'lax' as const,
      secure: this.config.secureCookie,
      path: '/',
    };
  }

  /**
   * Connexion du personnel. Limitée par IP (10 essais par minute, sans blocage
   * prolongé : la limite se relâche d'elle-même). Derrière ngrok ou un hébergeur,
   * activer TRUST_PROXY pour que la limite voie la vraie adresse du client.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    const { token, user } = await this.auth.login(dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.cookie(this.config.cookieName, token, {
      ...this.cookieOptions,
      maxAge: this.config.maxMs,
    });
    return { user };
  }

  /** Publique et sans erreur possible : elle doit aussi nettoyer un cookie périmé. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token: unknown = req.cookies?.[this.config.cookieName];
    if (typeof token === 'string' && token) await this.auth.logout(token);
    res.clearCookie(this.config.cookieName, this.cookieOptions);
  }

  /** Qui suis-je ? Sert aussi de « battement » pour garder la session ouverte. */
  @Get('me')
  @Roles(...ALL_ROLES)
  @AllowPendingPasswordChange()
  me(@CurrentUser() user: AuthUser): { user: AuthUser } {
    return { user };
  }

  @Post('change-password')
  @HttpCode(204)
  @Roles(...ALL_ROLES)
  @AllowPendingPasswordChange()
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.auth.changePassword(
      user,
      req.sessionId as string,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
