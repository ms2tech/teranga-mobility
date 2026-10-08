// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Module({
  // Limitation par IP, appliquée uniquement à la route de connexion (voir AuthController).
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    // Garde global : toutes les routes sont protégées par défaut.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
