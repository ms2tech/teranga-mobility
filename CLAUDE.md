# Téranga Mobility

Plateforme de réservation de transport adapté porte-à-porte au Sénégal (seniors, PMR, trajets médicaux non urgents). Zones : Dakar, Thiès, Touba, Mbour, Saly, AIBD.

## Stack
- NestJS + TypeScript + Prisma + PostgreSQL (Neon)
- Google Maps API : géocodage, itinéraires, péages, calcul automatique du prix
- Paiement : PayDunya (mode test) ; IPN testé via ngrok (domaine fixe, port 3000)
- Environnement : Windows

## Carte du projet
- `src/` : API NestJS, préfixe global `/api`, validation globale des DTO (`whitelist` + `forbidNonWhitelisted`). Un dossier par module :
  - `prisma/` : PrismaService (module global). `config/business.config.ts` : règles tarifaires lues dans `.env`.
  - `pricing/` : moteur de tarification (devis, estimation depuis deux adresses). `maps/` : Google Maps (géocodage, itinéraire, péage).
  - `routes/` : corridors vers l'AIBD. `bookings/` : réservations (création, file à venir, affectation, statut).
  - `drivers/`, `vehicles/` : flotte.
  - `payments/` : interface `PaymentProvider`, fournisseur PayDunya (`providers/paydunya.provider.ts`), service et contrôleur (lien, `/check`, IPN). Un autre agrégateur s'ajoute via `PAYMENT_AGGREGATOR`.
  - Les contrôleurs de `bookings`, `drivers`, `vehicles` et `routes` sont définis dans leur fichier `*.module.ts`.
- `prisma/` : `schema.prisma`, `migrations/`, `seed.ts` (5 axes, comptes de démo, un chauffeur avec un minivan PMR).
- `public/console-operateur.html` : console opérateur, un seul fichier HTML/JS sans build. Servie sur `/` par l'API (`useStaticAssets` dans `src/main.ts`) et appelle l'API en adresse relative `/api` : l'ouvrir en double-clic ne fonctionne plus, il faut passer par le serveur.
- `README.md` : démarrage, API, structure. `.env.example` : liste des variables (valeurs vides ou d'exemple).

## État actuel
- Paiement PayDunya en mode test, fonctionnel de bout en bout : lien de paiement, IPN automatique via ngrok, vérification manuelle `POST /api/payments/:id/check`, idempotence testée (IPN rejoué sans effet).
- `Payment.method` reste `null` : la réponse de confirmation de PayDunya ne contient aucun champ « moyen de paiement ». En attente de leur réponse sur ce champ. En mode live, le log « Confirmation, champs reçus » liste les noms de champs (sans valeurs) pour le repérer au premier paiement.
- Console opérateur : saisie des réservations (trajet libre / prix fixe), file des courses, affectation de chauffeur, ajout de flotte, et paiement par course : lien affiché et copiable, envoi par WhatsApp (au téléphone du proche, sinon à celui du passager), badge « Payé », « Vérifier le paiement ». Champ « Téléphone du proche » (`bookedByPhone`). Toutes les données affichées sont échappées ; seuls les liens https sont rendus.
- Validation : DTO sur `PATCH /bookings/:id/status`, `/assign` et `PATCH /drivers/:id/status` (400 au lieu de 500). `assign` vérifie que le chauffeur existe et possède le véhicule.
- Tests : seulement `npm run test:pricing`. Pas de tests automatisés pour le paiement ni la console.
- Aucune authentification : toute l'API est ouverte (`User.passwordHash` existe mais n'est pas utilisé).

## Décisions d'architecture
- Lancement en mode réservation (pas de dispatch temps réel) ; GPS en Phase 2
- Prix calculé depuis les adresses réelles via Google Maps
- Console opérateur : « Trajet libre » (adresse → prix avec péages) et « Prix fixe » (montant négocié tout compris, solution de repli pour les adresses non géocodables)
- Paramètres tarifaires dans .env, modifiables sans toucher au code
- Console opérateur = canal flexible (cash ou lien de paiement envoyé à un proche) ; le paiement avant validation concerne uniquement le futur site client
- Un paiement confirmé met à jour Booking.paymentStatus, pas le statut de la réservation

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
- **ngrok expose toute l'API**, sans authentification : ne le laisser tourner que pendant les tests d'IPN.

## À faire avant la production
- Authentification des opérateurs (prochain lot).
- Site et domaine Téranga Mobility.
- Passage de PayDunya en live : clés live, `PAYDUNYA_MODE=live`, `PAYDUNYA_IPN_URL` pointant vers le vrai serveur (avec `/api`).
- ngrok seulement pendant les tests.
- `start:prod` corrigé (`node dist/src/main`) : à valider sur le vrai serveur.

## Plus tard
- Phase 2, GPS : WebSocket NestJS ; la position du chauffeur est partagée avec le client 30 minutes avant la prise en charge.
- Site client en libre-service : prix calculé depuis l'adresse, paiement avant validation.
- Interface admin des tarifs (aujourd'hui : `.env` et table `Route`).
- Reversements chauffeurs (Wave Bulk Pay) et SMS de confirmation : voir README.
