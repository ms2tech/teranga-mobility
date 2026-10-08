// prisma/create-user.ts
/**
 * Gestion des comptes du personnel de la console : `npm run user:create`.
 *   - créer un compte (ADMIN, MANAGER ou OPERATOR), ou reprendre un compte existant du
 *     seed à partir de son téléphone ;
 *   - réinitialiser le mot de passe d'un compte existant ;
 *   - désactiver / réactiver un compte : c'est le SEUL verrouillage, manuel,
 *     décidé par l'admin. Aucun verrouillage automatique n'existe, volontairement.
 *
 * Script interactif, à lancer dans un vrai terminal. Le mot de passe est saisi
 * masqué : jamais en argument, jamais affiché, jamais écrit dans un fichier.
 */
import { Prisma, PrismaClient, User } from '@prisma/client';
import { hashPassword, passwordProblem } from '../src/auth/password';

type StaffRole = 'ADMIN' | 'MANAGER' | 'OPERATOR';
const STAFF_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'OPERATOR'];

// ── Accès aux données (exportées pour être testées) ─────────────────────

export function findUserByEmail(prisma: PrismaClient, email: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } },
  });
}

export function findUserByPhone(prisma: PrismaClient, phone: string): Promise<User | null> {
  const typed = phone.trim();
  return prisma.user.findFirst({
    where: { phone: { in: [typed, typed.replace(/\s+/g, '')] } },
  });
}

export interface SaveStaffInput {
  email: string;
  fullName: string;
  phone: string;
  role: StaffRole;
  password: string;
  mustChangePassword: boolean;
  /** Compte existant à reprendre (ex. « Admin Téranga » du seed) au lieu d'en créer un. */
  claimUserId?: string;
}

export async function saveStaffUser(prisma: PrismaClient, input: SaveStaffInput): Promise<User> {
  const problem = passwordProblem(input.password);
  if (problem) throw new Error(problem);
  if (!STAFF_ROLES.includes(input.role)) throw new Error('Rôle invalide : ADMIN, MANAGER ou OPERATOR.');

  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  try {
    if (input.claimUserId) {
      return await prisma.user.update({
        where: { id: input.claimUserId },
        data: { email, passwordHash, mustChangePassword: input.mustChangePassword, isActive: true },
      });
    }
    return await prisma.user.create({
      data: {
        email,
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        role: input.role,
        passwordHash,
        mustChangePassword: input.mustChangePassword,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new Error('Cet e-mail ou ce téléphone est déjà utilisé par un autre compte.');
    }
    throw e;
  }
}

/** Nouveau mot de passe ; les sessions ouvertes du compte sont fermées. */
export async function resetPassword(
  prisma: PrismaClient,
  userId: string,
  password: string,
  mustChangePassword: boolean,
): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword },
  });
  await prisma.session.deleteMany({ where: { userId } });
}

/** Verrouillage manuel : un compte désactivé ne peut plus se connecter, ses sessions sont fermées. */
export async function setActive(prisma: PrismaClient, userId: string, active: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { isActive: active } });
  if (!active) await prisma.session.deleteMany({ where: { userId } });
}

// ── Saisie au clavier ────────────────────────────────────────────────────

export interface InputState {
  buffer: string;
  inEscape: boolean;
}
export type InputEvent = 'none' | 'enter' | 'abort';

/** Traite une salve de caractères tapés (fonction pure, testable sans terminal). */
export function applyInput(
  state: InputState,
  chunk: string,
): { state: InputState; event: InputEvent; typed: string; erased: number } {
  let { buffer, inEscape } = state;
  let typed = '';
  let erased = 0;
  for (const ch of chunk) {
    if (inEscape) {
      // Séquence d'échappement (flèches, etc.) : ignorée jusqu'à sa lettre finale.
      if (/[A-Za-z~]/.test(ch)) inEscape = false;
      continue;
    }
    if (ch === '\u0003') return { state: { buffer, inEscape }, event: 'abort', typed, erased };
    if (ch === '\r' || ch === '\n') return { state: { buffer, inEscape }, event: 'enter', typed, erased };
    if (ch === '\u001b') { inEscape = true; continue; }
    if (ch === '\u0008' || ch === '\u007f') {
      if (buffer.length > 0) { buffer = buffer.slice(0, -1); erased++; }
      continue;
    }
    if (ch < ' ') continue;
    buffer += ch;
    typed += ch;
  }
  return { state: { buffer, inEscape }, event: 'none', typed, erased };
}

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let state: InputState = { buffer: '', inEscape: false };
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const done = (fn: () => void) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      fn();
    };
    const onData = (chunk: string) => {
      const r = applyInput(state, chunk);
      state = r.state;
      if (!hidden) {
        if (r.erased) process.stdout.write('\b \b'.repeat(r.erased));
        if (r.typed) process.stdout.write(r.typed);
      }
      if (r.event === 'abort') done(() => reject(new Error('Interrompu.')));
      else if (r.event === 'enter') done(() => resolve(state.buffer));
    };
    stdin.on('data', onData);
  });
}

async function confirm(question: string, defaultYes: boolean): Promise<boolean> {
  const answer = (await ask(`${question} ${defaultYes ? '[O/n]' : '[o/N]'} `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'o' || answer === 'oui' || answer === 'y' || answer === 'yes';
}

async function askNewPassword(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const first = await ask('Nouveau mot de passe (saisie masquée) : ', true);
    const problem = passwordProblem(first);
    if (problem) { console.log(`  ${problem}`); continue; }
    const second = await ask('Confirmer le mot de passe : ', true);
    if (first !== second) { console.log('  Les deux saisies diffèrent.'); continue; }
    return first;
  }
  throw new Error('Trop d\'essais : mot de passe non défini.');
}

// ── Parcours interactif ──────────────────────────────────────────────────

async function manageExisting(prisma: PrismaClient, user: User): Promise<void> {
  if (!STAFF_ROLES.includes(user.role as StaffRole)) {
    throw new Error(`Ce compte (${user.role}) n'est pas un compte du personnel : rien à faire ici.`);
  }
  console.log(`\nCompte existant : ${user.fullName} — ${user.role} — ${user.isActive ? 'actif' : 'DÉSACTIVÉ'}`);
  console.log(`Dernière connexion : ${user.lastLoginAt ? user.lastLoginAt.toLocaleString('fr-FR') : 'jamais'}\n`);
  console.log('  1) Réinitialiser le mot de passe');
  console.log(user.isActive
    ? '  2) Désactiver le compte (verrouillage manuel)'
    : '  2) Réactiver le compte');
  const choice = (await ask('\nChoix (autre touche : quitter) : ')).trim();

  if (choice === '1') {
    const password = await askNewPassword();
    const mustChange = await confirm('Forcer le changement du mot de passe à la prochaine connexion ?', true);
    await resetPassword(prisma, user.id, password, mustChange);
    console.log('\n✓ Mot de passe réinitialisé. Les sessions ouvertes de ce compte sont fermées.');
  } else if (choice === '2') {
    const next = !user.isActive;
    const verb = next ? 'Réactiver' : 'Désactiver';
    if (!(await confirm(`${verb} le compte de ${user.fullName} ?`, false))) return;
    await setActive(prisma, user.id, next);
    console.log(next
      ? '\n✓ Compte réactivé.'
      : '\n✓ Compte désactivé : connexion impossible, sessions fermées.');
  }
}

async function createNew(prisma: PrismaClient, email: string): Promise<void> {
  console.log('\nAucun compte avec cet e-mail : création d\'un compte du personnel.\n');
  const phone = (await ask('Téléphone (ex. +221 77 000 00 00) : ')).trim();
  if (!phone) throw new Error('Le téléphone est obligatoire.');

  let claim: User | null = null;
  const sameP = await findUserByPhone(prisma, phone);
  let fullName = '';
  let role: StaffRole;
  if (sameP) {
    if (sameP.email) throw new Error('Ce téléphone appartient déjà à un compte avec un autre e-mail.');
    if (!STAFF_ROLES.includes(sameP.role as StaffRole)) {
      throw new Error(`Ce téléphone appartient à un compte ${sameP.role} : impossible de le reprendre.`);
    }
    if (!(await confirm(`Un compte existe déjà avec ce téléphone : ${sameP.fullName} (${sameP.role}). Y associer cet e-mail ?`, false))) {
      throw new Error('Abandon : téléphone déjà utilisé.');
    }
    claim = sameP;
    fullName = sameP.fullName;
    role = sameP.role as StaffRole;
  } else {
    fullName = (await ask('Nom complet : ')).trim();
    if (!fullName) throw new Error('Le nom est obligatoire.');
    const r = (await ask('Rôle [ADMIN/MANAGER/OPERATOR] : ')).trim().toUpperCase();
    if (!STAFF_ROLES.includes(r as StaffRole)) throw new Error('Rôle invalide : ADMIN, MANAGER ou OPERATOR.');
    role = r as StaffRole;
  }

  const password = await askNewPassword();
  const mustChange = await confirm('Forcer le changement du mot de passe à la première connexion ?', true);
  const saved = await saveStaffUser(prisma, {
    email, fullName, phone, role, password, mustChangePassword: mustChange, claimUserId: claim?.id,
  });
  console.log(`\n✓ ${claim ? 'Compte repris' : 'Compte créé'} : ${saved.fullName} — ${saved.role} — ${saved.email}`);
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Ce script est interactif : lancez-le dans un terminal (PowerShell, Windows Terminal), pas dans un tube ni un script.');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    console.log('\nGestion des comptes du personnel — Téranga Mobility');
    const email = (await ask('\nE-mail du compte : ')).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('E-mail invalide.');
    const existing = await findUserByEmail(prisma, email);
    if (existing) await manageExisting(prisma, existing);
    else await createNew(prisma, email);
  } catch (e) {
    console.error(`\n✗ ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
