/**
 * Contrôle des données sensibles (`npm run test:sensitive`) : aucune réponse de l'API ne doit contenir
 * passwordHash (ni tokenHash, ni d'autre champ sensible d'un compte). Trois niveaux :
 *  1. le filet de sécurité global (SensitiveFieldsInterceptor) retire bien ces champs, à toute profondeur ;
 *  2. les `select` partagés (common/safe-selects.ts) ne demandent aucun champ sensible ;
 *  3. le code source ne contient aucune lecture « complète » d'un compte, d'un chauffeur ou d'un passager
 *     destinée à une réponse (`user: true`, `driver: true`, `include: { user … }`, `…By: true`, etc.).
 * Pas de base de données ni de serveur : s'exécute en une seconde.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CLIENT_SUMMARY, DRIVER_SUMMARY, PERSON_NAME, ROUTE_SUMMARY, VEHICLE_FIELDS, VEHICLE_ON_BOOKING,
} from './safe-selects';
import { SENSITIVE_KEYS, scrubSensitive } from './sensitive-fields.interceptor';

let passed = 0, failed = 0;
const test = (name: string, fn: () => void): void => {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.error(`❌ ${name}\n   ${(e as Error).message.split('\n').join('\n   ')}`); failed++; }
};

// ── 1. Le filet de sécurité ────────────────────────────────────────────────────
test('filet : retire passwordHash et tokenHash à toute profondeur (objets, tableaux imbriqués)', () => {
  const when = new Date('2026-10-09T10:00:00Z');
  const res: any = {
    id: 'b1', createdAt: when,
    driver: { id: 'd1', user: { fullName: 'A', passwordHash: '$argon2id$secret' } },
    payments: [{ id: 'p1', confirmedBy: { fullName: 'B', passwordHash: 'x' } }, { id: 'p2' }],
    session: { tokenHash: 'abc', list: [[{ passwordHash: 'deep' }]] },
  };
  const found = scrubSensitive(res);
  assert.deepEqual(found.sort(), [
    '$.driver.user.passwordHash', '$.payments[0].confirmedBy.passwordHash', '$.session.list[0][0].passwordHash', '$.session.tokenHash',
  ].sort());
  assert.ok(!JSON.stringify(res).includes('passwordHash') && !JSON.stringify(res).includes('tokenHash') && !JSON.stringify(res).includes('secret'));
});
test('filet : ne touche ni aux autres champs, ni aux dates, ni aux valeurs simples', () => {
  const when = new Date('2026-10-09T10:00:00Z');
  const res: any = { id: 'b1', createdAt: when, n: 0, ok: false, nothing: null, list: [1, 'a', null], driver: { user: { fullName: 'A' } } };
  const copy = JSON.parse(JSON.stringify(res));
  assert.deepEqual(scrubSensitive(res), []);
  assert.deepEqual(JSON.parse(JSON.stringify(res)), copy);
  assert.equal(res.createdAt, when);
  for (const v of [null, undefined, 3, 'texte', true, when]) assert.deepEqual(scrubSensitive(v), []);
});
test('filet : un champ nommé comme une clé sensible est retiré même quand il est vide ou nul', () => {
  const res: any = { user: { passwordHash: null, fullName: 'Chauffeur' } };
  assert.deepEqual(scrubSensitive(res), ['$.user.passwordHash']);
  assert.ok(!('passwordHash' in res.user));
});
test('filet : les clés sensibles couvrent au moins passwordHash et tokenHash', () => {
  assert.ok(SENSITIVE_KEYS.includes('passwordHash') && SENSITIVE_KEYS.includes('tokenHash'));
});

// ── 2. Les select partagés ─────────────────────────────────────────────────────
// Tout champ de compte ou de chauffeur qui n'a pas à s'afficher : un select partagé qui le demanderait échoue ici.
const FORBIDDEN_FIELDS = [
  'passwordHash', 'tokenHash', 'email', 'phone', 'lastLoginAt', 'mustChangePassword', 'role', 'userId',
  'payoutWavePhone', 'commissionRate', 'notes', 'mobilityNeed',
];
const keysOf = (obj: unknown, out: string[] = []): string[] => {
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) { out.push(k); keysOf(v, out); }
  return out;
};
test('select partagés : PERSON_NAME ne montre que le nom', () => {
  assert.deepEqual(PERSON_NAME, { select: { fullName: true } });
});
test('select partagés : le résumé d\'un chauffeur n\'a ni compte, ni e-mail, ni téléphone, ni reversement, ni commission', () => {
  const bad = keysOf(DRIVER_SUMMARY).filter((k) => FORBIDDEN_FIELDS.includes(k));
  assert.deepEqual(bad, [], `champs interdits dans DRIVER_SUMMARY : ${bad.join(', ')}`);
});
test('select partagés : véhicule, passager et corridor ne demandent aucun champ de compte ni de reversement', () => {
  // (le téléphone du passager est volontairement dans CLIENT_SUMMARY : c'est celui du passager, pas d'un compte)
  for (const [name, sel] of Object.entries({ VEHICLE_FIELDS, VEHICLE_ON_BOOKING, CLIENT_SUMMARY, ROUTE_SUMMARY })) {
    const bad = keysOf(sel).filter((k) => FORBIDDEN_FIELDS.includes(k) && !(name === 'CLIENT_SUMMARY' && k === 'phone'));
    assert.deepEqual(bad, [], `champs interdits dans ${name} : ${bad.join(', ')}`);
  }
});

// ── 3. Le code source ──────────────────────────────────────────────────────────
const SRC = path.resolve(process.cwd(), 'src');
function sources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
const RISKY: Array<[RegExp, string]> = [
  [/\buser\s*:\s*true\b/, '`user: true` renvoie le compte complet (passwordHash, e-mail…)'],
  [/\buser\s*:\s*\{\s*include\b/, '`user: { include … }` renvoie le compte complet'],
  [/\b\w+By\s*:\s*true\b/, '`…By: true` renvoie le compte complet de l\'auteur : utiliser PERSON_NAME'],
  [/\b\w+By\s*:\s*\{\s*include\b/, '`…By: { include … }` renvoie le compte complet de l\'auteur : utiliser PERSON_NAME'],
  [/\bdriver\s*:\s*true\b/, '`driver: true` renvoie le chauffeur complet (numéro de reversement, commission) : utiliser DRIVER_SUMMARY'],
  [/\bdriver\s*:\s*\{\s*include\b/, '`driver: { include … }` renvoie le chauffeur complet : utiliser DRIVER_SUMMARY'],
  [/\bclient\s*:\s*true\b/, '`client: true` renvoie le passager complet (notes médicales, e-mail) : utiliser CLIENT_SUMMARY'],
  [/\bclient\s*:\s*\{\s*include\b/, '`client: { include … }` renvoie le passager complet : utiliser CLIENT_SUMMARY'],
];
// passwordHash et tokenHash ne se lisent qu'à l'authentification (src/auth/) ; ailleurs, seul le filet les nomme.
const SECRET_ALLOWED = (file: string): boolean => /[\\/]src[\\/](auth|common)[\\/]/.test(file);
test('code source : aucune lecture complète d\'un compte, d\'un chauffeur ou d\'un passager destinée à une réponse', () => {
  const problems: string[] = [];
  for (const file of sources(SRC)) {
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const [re, why] of RISKY) if (re.test(line)) problems.push(`${path.relative(process.cwd(), file)}:${i + 1} — ${why}`);
    });
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});
test('code source : passwordHash et tokenHash ne sont nommés que par l\'authentification et le filet de sécurité', () => {
  const problems: string[] = [];
  for (const file of sources(SRC)) {
    if (SECRET_ALLOWED(file)) continue;
    stripComments(fs.readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
      if (/\b(passwordHash|tokenHash)\b/.test(line)) problems.push(`${path.relative(process.cwd(), file)}:${i + 1}`);
    });
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});
test('code source : le filet de sécurité est branché globalement (APP_INTERCEPTOR dans AppModule)', () => {
  const app = fs.readFileSync(path.join(SRC, 'app.module.ts'), 'utf8');
  assert.ok(/APP_INTERCEPTOR/.test(app) && /SensitiveFieldsInterceptor/.test(app));
});

console.log(`\n${passed}/${passed + failed} contrôles réussis.`);
process.exit(failed === 0 ? 0 : 1);
