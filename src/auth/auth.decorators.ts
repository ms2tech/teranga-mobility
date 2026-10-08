// src/auth/auth.decorators.ts
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest, AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
export const ALLOW_PENDING_PASSWORD_KEY = 'auth:allowPendingPassword';

/**
 * Route ouverte sans connexion. À utiliser avec parcimonie : par défaut, toute
 * route exige une session de personnel (ADMIN ou OPERATOR).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Rôles autorisés sur la route (remplace le défaut ADMIN + OPERATOR). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Reste accessible tant que le mot de passe temporaire n'a pas été changé. */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

/** L'utilisateur de la session en cours (rempli par AuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user as AuthUser,
);
