// src/auth/password.ts
import * as argon2 from 'argon2';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Hash argon2id (chaîne complète avec ses paramètres : on pourra les durcir plus tard). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false; // hash illisible : jamais d'exception vers l'appelant
  }
}

/** Le hash a-t-il été produit avec des paramètres plus faibles que les actuels ? */
export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash);
  } catch {
    return false;
  }
}

// Compte inconnu : on calcule quand même un hash pour que la durée de réponse
// ne révèle pas si l'e-mail existe.
let dummyHash: Promise<string> | undefined;
export async function burnVerify(password: string): Promise<false> {
  dummyHash ??= hashPassword('mot-de-passe-factice-pour-egaliser-le-temps');
  await verifyPassword(await dummyHash, password);
  return false;
}

/** Message d'erreur en français si le mot de passe est refusé, sinon null. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`;
  }
  return null;
}
