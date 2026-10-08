# Téranga Mobility

Plateforme de réservation de transport adapté porte-à-porte au Sénégal (seniors, PMR, trajets médicaux non urgents). Zones : Dakar, Thiès, Touba, Mbour, Saly, AIBD.

## Stack
- NestJS + TypeScript + Prisma + PostgreSQL (Neon)
- Google Maps API : géocodage, itinéraires, péages, calcul automatique du prix
- Paiement : PayDunya (mode test) ; IPN testé via ngrok (domaine fixe, port 3000)
- Environnement : Windows

## Carte du projet
- `src/` : API NestJS, préfixe global `/api`, validation globale des DTO (`whitelist` + `forbidNonWhitelisted`). Un dossier par module :
  - `prisma/` : PrismaService (module global). `config/business.config.ts` : règles tarifaires lues dans `.env`. `config/auth.config.ts` : durées de session et nom du cookie.
  - `auth/` : connexion. `AuthGuard` global (toute route exige une session ADMIN ou OPERATOR, sauf `@Public()` ; `@Roles(...)` pour un autre rôle), `SessionService` (sessions en base), `AuthService` (login, logout, changement de mot de passe), `password.ts` (argon2id), décorateurs `@Public`, `@Roles`, `@CurrentUser`.
  - `pricing/` : moteur de tarification (devis, estimation depuis deux adresses). `maps/` : Google Maps (géocodage, itinéraire, péage).
  - `routes/` : corridors vers l'AIBD. `bookings/` : réservations (création, file à venir, affectation, statut).
  - `drivers/`, `vehicles/` : flotte.
  - `payments/` : interface `PaymentProvider`, fournisseur PayDunya (`providers/paydunya.provider.ts`), service et contrôleur (lien, `/check`, IPN). Un autre agrégateur s'ajoute via `PAYMENT_AGGREGATOR`.
  - Les contrôleurs de `bookings`, `drivers`, `vehicles` et `routes` sont définis dans leur fichier `*.module.ts`.
- `prisma/` : `schema.prisma`, `migrations/`, `seed.ts` (5 axes, comptes de démo sans mot de passe, un chauffeur avec un minivan PMR), `create-user.ts` (`npm run user:create` : créer un compte du personnel, réinitialiser un mot de passe, désactiver / réactiver un compte).
- `public/console-operateur.html` : console opérateur, un seul fichier HTML/JS sans build. Servie sur `/` par l'API (`useStaticAssets` dans `src/main.ts`) et appelle l'API en adresse relative `/api` : l'ouvrir en double-clic ne fonctionne plus, il faut passer par le serveur.
- `README.md` : démarrage, API, structure. `.env.example` : liste des variables (valeurs vides ou d'exemple).

## État actuel
- Paiement PayDunya en mode test, fonctionnel de bout en bout : lien de paiement, IPN automatique via ngrok, vérification manuelle `POST /api/payments/:id/check`, idempotence testée (IPN rejoué sans effet).
- `Payment.method` reste `null` : la réponse de confirmation de PayDunya ne contient aucun champ « moyen de paiement ». En attente de leur réponse sur ce champ. En mode live, le log « Confirmation, champs reçus » liste les noms de champs (sans valeurs) pour le repérer au premier paiement.
- Console opérateur : saisie des réservations (trajet libre / prix fixe), file des courses, affectation de chauffeur, ajout de flotte, et paiement par course : lien affiché et copiable, envoi par WhatsApp (au téléphone du proche, sinon à celui du passager), badge « Payé », « Vérifier le paiement ». Champ « Téléphone du proche » (`bookedByPhone`). Toutes les données affichées sont échappées ; seuls les liens https sont rendus.
- Validation : DTO sur `PATCH /bookings/:id/status`, `/assign` et `PATCH /drivers/:id/status` (400 au lieu de 500). `assign` vérifie que le chauffeur existe et possède le véhicule.
- Authentification du personnel en place (ADMIN, OPERATOR) : e-mail + mot de passe, sessions opaques en base portées par un cookie `HttpOnly`, mots de passe argon2id, limitation par IP sur `login` (10 essais/min), échecs de connexion loggés. Seules routes publiques : `POST /api/auth/login`, `POST /api/auth/logout`, l'IPN PayDunya et les fichiers de `public/`. `createdById` d'une réservation vient de la session (plus du corps de la requête). CORS retiré (console même origine).
- La console demande une connexion (écran par-dessus la page, saisie conservée si la session expire), rafraîchit la liste des courses toutes les 20 s et maintient ainsi la session ouverte ; changement de mot de passe (obligatoire pour un mot de passe temporaire).
- Tests : seulement `npm run test:pricing`. Pas de tests automatisés conservés pour le paiement, l'auth ni la console (l'auth a été vérifiée par un script jetable, 82 contrôles + test navigateur).

## Décisions d'architecture
- Lancement en mode réservation (pas de dispatch temps réel) ; GPS en Phase 2
- Prix calculé depuis les adresses réelles via Google Maps
- Console opérateur : « Trajet libre » (adresse → prix avec péages) et « Prix fixe » (montant négocié tout compris, solution de repli pour les adresses non géocodables)
- Paramètres tarifaires dans .env, modifiables sans toucher au code
- Console opérateur = canal flexible (cash ou lien de paiement envoyé à un proche) ; le paiement avant validation concerne uniquement le futur site client
- Un paiement confirmé met à jour Booking.paymentStatus, pas le statut de la réservation
- Authentification : sessions opaques en base (pas de JWT : révocation immédiate, jeton jamais lisible par JavaScript, rien à signer) ; le même jeton servira aux applications mobiles via `Authorization: Bearer`. Tout est refusé par défaut : une nouvelle route est réservée au personnel tant qu'elle ne porte pas `@Public()` ou `@Roles(...)`.
- **Jamais de verrouillage automatique de compte.** Un opérateur ne doit jamais être bloqué (transport médical). Seul l'admin verrouille, à la main, en désactivant le compte (`isActive=false` via `npm run user:create`). Les abus sont freinés par la seule limitation par IP, qui se relâche d'elle-même.
- La session d'un opérateur n'expire jamais pour inactivité tant que la console est ouverte (rafraîchissement automatique) ; au pire, après 7 jours, un écran de connexion s'ouvre par-dessus la page sans rien faire perdre.

## Façon de travailler
- Avancer étape par étape et expliquer chaque changement
- Confirmer les décisions avec Moussa avant de construire dessus
- Appliquer les changements multi-fichiers en un seul lot cohérent
- Chaque nouveau fichier de code commence par un commentaire indiquant son chemin, ex. `// src/payments/payments.service.ts`
- Après toute modification de schema.prisma : npx prisma generate, puis migration

## Pièges connus
- **Préfixe global `/api`** : `PAYDUNYA_IPN_URL` doit se terminer par `/api/payments/paydunya/ipn`. Sans `/api`, PayDunya reçoit un 404. L'URL est figée dans chaque facture à sa création : après correction, générer une nouvelle facture.
- **Filtre réseau Spectrum (Cujo)** : il bloque `ngrok-free.dev` depuis cette machine, donc curl et Node échouent en TLS vers le domaine ngrok. Vérifier l'IPN dans l'inspecteur ngrok (`http://127.0.0.1:4040`), pas avec curl. Les appels de PayDunya vers le tunnel passent normalement.
- **`prisma migrate dev` bloque en mode non interactif** (avertissements à confirmer). Procédure : générer le SQL avec `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` dans `prisma/migrations/<horodatage>_<nom>/migration.sql`, puis `npx prisma migrate deploy`, puis `npx prisma generate`.
- **Le build sort dans `dist/src/`** (le `tsconfig` inclut aussi `prisma/`) : l'entrée est `dist/src/main.js`.
- **`.env` lu au démarrage seulement** : redémarrer l'app après l'avoir modifié, `nest start --watch` ne le surveille pas.
- **ngrok expose toute l'API** : l'authentification protège les données, mais ne le laisser tourner que pendant les tests d'IPN. Derrière ngrok, mettre `TRUST_PROXY=1` dans `.env` (puis redémarrer) : sans cela, la limitation par IP de la connexion voit l'adresse du proxy pour tout le monde. Préférer un nombre de proxys (1) à `true`, qui fait confiance à tous les `X-Forwarded-For`. À laisser vide quand l'API est exposée en direct.
- **Cookie `Secure`** uniquement avec `NODE_ENV=production` (donc HTTPS) ; en développement le cookie est posé sans `Secure`.
- **Hors navigateur** (curl, scripts), l'API demande maintenant de se connecter d'abord (`POST /api/auth/login`, puis réutiliser le cookie). L'IPN PayDunya reste ouverte.
- **`prisma generate` échoue sur Windows tant qu'un serveur tourne** (le moteur `query_engine-windows.dll.node` est verrouillé, erreur EPERM). Arrêter `npm run start:dev` avant `npx prisma generate`, ou terminer à la main : les fichiers JS/TS du client sont déjà régénérés, il ne manque que la copie de `schema.prisma` dans `node_modules/.prisma/client`.
- **`npm run user:create` demande un vrai terminal** (PowerShell, Windows Terminal ; `winpty` sous Git Bash) : il refuse de lire un mot de passe hors terminal. Les comptes du seed n'ont ni e-mail ni mot de passe : les reprendre avec ce script (par leur téléphone).

## À faire avant la production
- Créer les vrais comptes du personnel avec `npm run user:create` (le premier admin d'abord) : tant qu'aucun compte n'a de mot de passe, personne ne peut se connecter à la console.
- Site et domaine Téranga Mobility, en HTTPS (`NODE_ENV=production` pour le cookie `Secure`), avec `TRUST_PROXY` réglé selon l'hébergeur.
- Passage de PayDunya en live : clés live, `PAYDUNYA_MODE=live`, `PAYDUNYA_IPN_URL` pointant vers le vrai serveur (avec `/api`).
- ngrok seulement pendant les tests.
- `start:prod` corrigé (`node dist/src/main`) : à valider sur le vrai serveur.

## Plus tard
- Phase 2, GPS : WebSocket NestJS ; la position du chauffeur est partagée avec le client 30 minutes avant la prise en charge.
- Confirmation manuelle des paiements (prochain lot, après l'authentification) : beaucoup de clients paieront autrement (cash, Wave ou Orange Money envoyé directement à notre numéro, virement). L'opérateur marque un paiement comme reçu, avec le moyen, une référence et son identité (qui a confirmé).
- Site public où les clients réservent et paient eux-mêmes (prix calculé depuis l'adresse, paiement avant validation), soit par lien PayDunya, soit via « nous contacter / payer autrement », confirmé ensuite par un opérateur. Règles à respecter sur ce site :
  - **Le client doit toujours pouvoir nous appeler** : numéro visible sur toutes les pages, appel en un clic (lien `tel:`), contact WhatsApp. Un client qui préfère ou qui n'arrive pas à réserver en ligne appelle : l'opérateur saisit alors la réservation dans la console avec le canal `PHONE`. Le site ne remplace pas la centrale, il s'y ajoute.
  - **Urgences vitales** : le site renvoie vers le SAMU au **1515** (message visible dès l'accueil et dans le parcours de réservation). Téranga Mobility ne fait que du transport adapté non urgent et ne doit jamais être présenté comme un service d'urgence.
- Applications mobiles chauffeur et client (rôles DRIVER et CLIENT), après le site public.
- Interface admin des tarifs (aujourd'hui : `.env` et table `Route`).
- Reversements chauffeurs (Wave Bulk Pay) et SMS de confirmation : voir README.
