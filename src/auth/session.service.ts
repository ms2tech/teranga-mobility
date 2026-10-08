// src/auth/session.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { authConfig } from '../config/auth.config';
import { AuthUser, ClientContext } from './auth.types';

// La session n'est prolongée en base qu'une fois par minute au plus : une
// console qui interroge l'API toutes les 20 s ne génère pas une écriture à chaque fois.
const SLIDE_EVERY_MS = 60_000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  /** Crée une session et renvoie le jeton en clair (seul son hash est stocké). */
  async create(userId: string, ctx: ClientContext): Promise<{ token: string }> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + Math.min(this.config.idleMs, this.config.maxMs)),
        ip: ctx.ip?.slice(0, 64),
        userAgent: ctx.userAgent?.slice(0, 300),
      },
    });
    // Ménage opportuniste des sessions expirées (colonne indexée).
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
    return { token };
  }

  /**
   * Session valide -> utilisateur ; sinon null. Une session est valide si elle
   * n'a pas dépassé son inactivité maximale, ni sa durée de vie maximale, et si
   * le compte est actif (un compte désactivé coupe l'accès immédiatement).
   */
  async authenticate(token: string): Promise<{ sessionId: string; user: AuthUser } | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, role: true, isActive: true, mustChangePassword: true },
        },
      },
    });
    if (!session) return null;

    const now = Date.now();
    const hardLimit = session.createdAt.getTime() + this.config.maxMs;
    if (session.expiresAt.getTime() <= now || hardLimit <= now || !session.user.isActive) {
      return null;
    }

    if (now - session.lastSeenAt.getTime() > SLIDE_EVERY_MS) {
      await this.prisma.session
        .update({
          where: { id: session.id },
          data: {
            lastSeenAt: new Date(now),
            expiresAt: new Date(Math.min(now + this.config.idleMs, hardLimit)),
          },
        })
        .catch(() => undefined); // course avec une déconnexion : sans gravité
    }

    const { isActive: _isActive, ...user } = session.user;
    return { sessionId: session.id, user };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  /** Ferme toutes les sessions d'un utilisateur (sauf éventuellement la courante). */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  }
}
