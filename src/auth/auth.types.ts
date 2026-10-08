// src/auth/auth.types.ts
import { Request } from 'express';
import { UserRole } from '@prisma/client';

/** Rôles autorisés par défaut sur toute route : le personnel de la console. */
export const STAFF_ROLES: UserRole[] = ['ADMIN', 'OPERATOR'];
export const ALL_ROLES: UserRole[] = ['ADMIN', 'OPERATOR', 'DRIVER', 'CLIENT'];

/** L'utilisateur connecté, sans aucune donnée secrète (jamais de passwordHash). */
export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface ClientContext {
  ip?: string;
  userAgent?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}
