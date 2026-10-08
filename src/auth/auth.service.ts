// src/auth/auth.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';
import { AuthUser, ClientContext, STAFF_ROLES } from './auth.types';
import {
  burnVerify,
  hashPassword,
  needsRehash,
  passwordProblem,
  verifyPassword,
} from './password';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : `${email.slice(0, 1)}***`;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Connexion du personnel (e-mail + mot de passe).
   * Jamais de verrouillage automatique : un opérateur ne doit pas être bloqué.
   * Seule la limitation par IP (voir AuthController) freine les essais en rafale,
   * et chaque échec est loggé. La réponse est toujours la même, quelle que soit la cause.
   */
  async login(
    email: string,
    password: string,
    ctx: ClientContext,
  ): Promise<{ token: string; user: AuthUser }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
    });

    // Un seul calcul de hash dans tous les cas (temps de réponse constant).
    const passwordOk = user?.passwordHash
      ? await verifyPassword(user.passwordHash, password)
      : await burnVerify(password);

    let failure: string | null = null;
    if (!user || !user.passwordHash) failure = 'compte inconnu ou sans mot de passe';
    else if (!passwordOk) failure = 'mot de passe incorrect';
    else if (!user.isActive) failure = 'compte désactivé';
    else if (!STAFF_ROLES.includes(user.role)) failure = `rôle ${user.role} non autorisé à la console`;

    if (failure || !user) {
      this.logger.warn(
        `Échec de connexion (${failure}) — ${maskEmail(normalized)} — IP ${ctx.ip ?? 'inconnue'}`,
      );
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    if (user.passwordHash && needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { token } = await this.sessions.create(user.id, ctx);
    this.logger.log(`Connexion réussie — ${user.role} ${maskEmail(normalized)} — IP ${ctx.ip ?? 'inconnue'}`);
    return {
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  logout(token: string): Promise<void> {
    return this.sessions.revoke(token);
  }

  /**
   * Changement de mot de passe. « Mot de passe actuel incorrect » est une erreur
   * 400 et non 401 : un 401 ferait croire à la console que la session a expiré.
   */
  async changePassword(
    user: AuthUser,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const row = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!row?.passwordHash || !(await verifyPassword(row.passwordHash, currentPassword))) {
      throw new BadRequestException('Mot de passe actuel incorrect.');
    }
    const problem = passwordProblem(newPassword);
    if (problem) throw new BadRequestException(problem);
    if (newPassword === currentPassword) {
      throw new BadRequestException('Le nouveau mot de passe doit être différent de l\'actuel.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });
    // Les autres appareils sont déconnectés ; la session courante reste ouverte.
    await this.sessions.revokeAllForUser(user.id, currentSessionId);
    this.logger.log(`Mot de passe changé — ${user.role} ${maskEmail(user.email ?? '')}`);
  }
}
