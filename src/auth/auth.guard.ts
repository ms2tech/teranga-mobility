// src/auth/auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { authConfig } from '../config/auth.config';
import {
  ALLOW_PENDING_PASSWORD_KEY,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from './auth.decorators';
import { AuthenticatedRequest, STAFF_ROLES } from './auth.types';
import { SessionService } from './session.service';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Garde global : TOUTE route exige une session valide, sauf @Public().
 * Sans @Roles, la route est réservée au personnel (ADMIN, OPERATOR) : un futur
 * compte CLIENT ou DRIVER n'atteindra jamais une route d'opérateur par accident.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = req.cookies?.[this.config.cookieName];
    const session =
      typeof token === 'string' && token ? await this.sessions.authenticate(token) : null;
    if (!session) throw new UnauthorizedException('Connexion requise.');

    this.assertSameOrigin(req);
    req.user = session.user;
    req.sessionId = session.sessionId;

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_KEY,
      targets,
    );
    if (session.user.mustChangePassword && !allowPending) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Tu dois changer ton mot de passe avant de continuer.',
        error: 'Forbidden',
      });
    }

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets) ?? STAFF_ROLES;
    if (!roles.includes(session.user.role)) throw new ForbiddenException('Accès refusé.');
    return true;
  }

  /**
   * Protection CSRF des sessions par cookie : une requête d'écriture dont
   * l'en-tête Origin vient d'un autre site est refusée. Sans en-tête Origin
   * (outils en ligne de commande, même origine sans en-tête), elle passe.
   */
  private assertSameOrigin(req: AuthenticatedRequest): void {
    if (!UNSAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      /* origine illisible : refusée ci-dessous */
    }
    if (host !== req.headers.host) throw new ForbiddenException('Origine non autorisée.');
  }
}
