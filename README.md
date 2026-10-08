# Téranga Mobility — API & console opérateur

Plateforme de réservation de **transport porte-à-porte adapté** au Sénégal :
transport médical non urgent, PMR (personnes à mobilité réduite), seniors et
VIP aéroport, en desserte de l'**AIBD** (Dakar, Thiès, Touba, Mbour, Saly).

> *« Téranga Mobility » est un nom de travail — libre à toi de le renommer.*

Ce dépôt contient l'API (NestJS) et la **console opérateur** (une page HTML
servie par l'API) : saisie des réservations pendant l'appel, calcul du prix,
affectation des chauffeurs et paiement par lien. Le site client (PWA) et, en
Phase 2, l'application mobile + le suivi GPS temps réel viendront s'y ajouter.

---

## Stack

| Couche      | Choix                                                        |
|-------------|--------------------------------------------------------------|
| Langage     | TypeScript                                                   |
| API         | NestJS 10                                                    |
| Base        | PostgreSQL (Neon) + Prisma ORM                               |
| Validation  | class-validator (DTO)                                        |
| Cartes      | Google Maps (géocodage, itinéraires, péage)                  |
| Paiement    | PayDunya (mode test) derrière l'interface `PaymentProvider` ; Wave Bulk Pay *(à brancher)* |
| Connexion   | Sessions opaques en base (cookie `HttpOnly`), mots de passe argon2id |
| Interface   | Console opérateur en HTML/JS (`public/`), servie sur `/`     |

---

## Démarrage

Prérequis : Node 20+, une base PostgreSQL.

```bash
cp .env.example .env          # puis renseigne DATABASE_URL, GOOGLE_MAPS_API_KEY, clés PayDunya
npm install
npm run prisma:generate       # génère le client Prisma (accès réseau requis)
npm run prisma:migrate        # crée les tables (commande interactive)
npm run prisma:seed           # charge axes, tarifs et comptes de démo (sans mot de passe)
npm run user:create           # crée le premier admin (interactif, dans un vrai terminal)
npm run start:dev             # API : http://localhost:3000/api — console : http://localhost:3000/
```

La console demande une connexion : voir « Connexion » plus bas.

En production : `npm run build` puis `npm run start:prod` (le build sort dans
`dist/src/`).

Tester la tarification, sans base de données :

```bash
npm run test:pricing
```

> Note : `prisma generate` télécharge un moteur natif depuis
> `binaries.prisma.sh` — prévois un accès réseau ouvert au premier lancement.

---

## Console opérateur

Ouvre `http://localhost:3000/` : la page `public/console-operateur.html` est
servie par l'API et appelle celle-ci en adresse relative (`/api`).

- **Connexion** : e-mail + mot de passe. L'écran s'affiche par-dessus la page :
  si la session expire pendant une saisie, rien n'est perdu. Boutons « Mot de
  passe » et « Se déconnecter » dans la barre du haut.
- **Rafraîchissement automatique** de la liste des courses toutes les 20 s
  (« Mis à jour à… »). Il maintient aussi la session ouverte tant que la console
  l'est : un opérateur en service n'est jamais déconnecté pour inactivité.
- **Nouvelle réservation** : passager, trajet libre (prix calculé depuis les deux
  adresses via Google Maps, péage compris) ou prix fixe, horaire, accessibilité.
- **Courses à venir** : file de dispatch et affectation d'un chauffeur.
- **Paiement** : « Lien de paiement » par course (affichage, copie, envoi par
  WhatsApp au proche ou, à défaut, au passager), badge **Payé**, et
  « Vérifier le paiement » si la notification n'est pas arrivée.
- **Une course non payée ne part pas** : le chauffeur peut être affecté à l'avance,
  mais la course affiche « En attente de paiement, départ bloqué » et l'API refuse
  le passage à `EN_ROUTE` tant qu'elle n'est pas payée.
- **Paiement reçu autrement** (responsables et admins) : confirme que l'argent est
  reçu par la société (note obligatoire, référence facultative) et débloque la
  course. L'**historique des paiements** de chaque course montre tout, annulations
  et remboursements compris. Un **admin** peut annuler une confirmation (motif
  obligatoire) ou marquer un remboursement.
- **« À régler »** (responsables et admins) : les doubles paiements PayDunya à
  rembourser, avec un compteur rouge.
- **Flotte** : ajout d'un chauffeur avec son véhicule.

---

## Connexion (authentification)

- **Qui** : le personnel, par e-mail + mot de passe, avec trois rôles :
  - `OPERATOR` : réservations, affectation, liens de paiement, vérification d'un paiement ;
  - `MANAGER` (responsable des opérations) : tout l'OPERATOR, plus la confirmation
    manuelle d'un paiement et le panneau « À régler » ;
  - `ADMIN` : tout, plus l'annulation d'une confirmation, le remboursement (et, plus
    tard, la correction de prix, les tarifs et les comptes).

  Les rôles `CLIENT` et `DRIVER` existent mais n'ont accès à aucune route du personnel.
- **Comment** : un jeton de session aléatoire, porté par un cookie `tm_session`
  (`HttpOnly`, `SameSite=Lax`, `Secure` en production). Seul son hash SHA-256 est
  stocké en base (table `Session`). Une déconnexion, un compte désactivé ou un
  changement de mot de passe coupent l'accès tout de suite.
- **Durée** : 12 h d'inactivité (`SESSION_IDLE_HOURS`), 7 jours au plus
  (`SESSION_MAX_DAYS`). La console ouverte prolonge la session. À l'expiration,
  l'écran de connexion s'ouvre par-dessus la page sans rien perdre de la saisie.
- **Mots de passe** : argon2id, 10 caractères minimum.
- **Tout est protégé par défaut.** Sans mention contraire, une route exige une
  session `ADMIN`, `MANAGER` ou `OPERATOR` (garde global `AuthGuard`). Une route publique doit
  porter `@Public()`, une route d'un autre rôle `@Roles(...)`. Seules sont
  publiques : `POST /api/auth/login`, `POST /api/auth/logout`, l'IPN PayDunya
  (`POST /api/payments/paydunya/ipn`, protégé par son hash puis reconfirmé auprès de
  PayDunya) et les fichiers de `public/` (la page ne contient aucune donnée).
- **Jamais de verrouillage automatique** : un opérateur ne doit pas être bloqué
  (transport médical). Seule une limitation par IP freine la connexion : 10
  tentatives par minute, qui se relâche d'elle-même. Les échecs sont loggés (e-mail
  masqué, IP). Seul l'admin verrouille un compte, à la main : voir plus bas.
- **Derrière ngrok ou un hébergeur**, renseigner `TRUST_PROXY` (nombre de proxys de
  confiance, ex. `1`) : sans cela, la limitation voit l'adresse du proxy pour tout
  le monde. À laisser vide quand l'API est exposée en direct.

### Gérer les comptes : `npm run user:create`

Script interactif, à lancer dans un vrai terminal (PowerShell, Windows Terminal ;
sous Git Bash, préfixer par `winpty`). Le mot de passe est saisi masqué, jamais
en argument ni dans un fichier.

- **Créer** un compte `ADMIN`, `MANAGER` ou `OPERATOR` (e-mail, nom, téléphone, rôle). Si le
  téléphone est celui d'un compte du seed sans e-mail (ex. « Admin Téranga »), le
  script propose de le reprendre au lieu de créer un doublon.
- **Réinitialiser le mot de passe** d'un compte existant (ses sessions ouvertes
  sont fermées). Option « changement obligatoire à la prochaine connexion » :
  l'opérateur doit alors choisir son mot de passe avant d'accéder à la console.
- **Désactiver / réactiver** un compte : c'est le verrouillage manuel. Un compte
  désactivé ne peut plus se connecter et ses sessions sont refusées aussitôt.

L'API s'utilise aussi hors navigateur : se connecter d'abord, puis réutiliser le
cookie.

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" -d '{"email":"…","password":"…"}'
curl -b cookies.txt http://localhost:3000/api/bookings/upcoming
```

---

## Paiement (PayDunya)

1. L'opérateur clique sur « Lien de paiement » : l'API crée un `Payment` et une
   facture PayDunya, puis renvoie le lien.
2. Le client paie ; PayDunya notifie l'API (IPN) sur
   `POST /api/payments/paydunya/ipn`.
3. L'API vérifie le hash, **reconfirme toujours le statut auprès de PayDunya**,
   puis passe `Payment.status` et `Booking.paymentStatus` à `PAID`. Le statut de
   la réservation (`Booking.status`) n'est jamais modifié par un paiement.

Une réservation peut avoir plusieurs tentatives de paiement. Configuration :
`PAYMENT_AGGREGATOR`, `PAYDUNYA_MODE` (`test` ou `live`), `PAYDUNYA_MASTER_KEY`,
`PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_TOKEN`, `PAYDUNYA_STORE_NAME` et
`PAYDUNYA_IPN_URL` — **cette URL doit inclure le préfixe `/api`**
(ex. `https://<domaine>/api/payments/paydunya/ipn`).

### Paiement reçu autrement (confirmation manuelle)

Quand le client paie sans passer par le lien (espèces au bureau, Wave ou Orange
Money envoyé à notre numéro, virement…), un **responsable ou un admin** confirme que
l'argent est reçu : `POST /api/payments/bookings/:bookingId/manual`.

- **Une seule option, « Autre »** (`method=OTHER`, `source=MANUAL`) : une **note**
  obligatoire dit comment l'argent a été reçu, une **référence** est facultative
  (unique si elle est renseignée, parmi les paiements non annulés), la date de
  réception ne peut pas être dans le futur.
- **Le montant est toujours le total de la course** : pas de paiement partiel, rien à
  saisir. La course passe à `PAID` (jamais de changement de `Booking.status`) et son
  départ est débloqué.
- **Qui a confirmé et quand** sont enregistrés. Les liens PayDunya encore en attente
  sont abandonnés chez nous (`CANCELLED`) : PayDunya ne permet pas de les annuler.
- **Les chauffeurs n'encaissent jamais.** Tout l'argent est reçu par la société, qui
  reverse ensuite au chauffeur sa part (`driverPayoutFcfa`).

**Corrections, sans jamais effacer l'historique** : une ligne `Payment` n'est ni
modifiée ni supprimée (aucune route `DELETE`).
- `POST /api/payments/:id/void` (**admin**, motif obligatoire) annule une
  confirmation manuelle ; la course redevient non payée. Corriger = annuler, puis
  confirmer de nouveau (nouvelle ligne). Un paiement PayDunya ne s'annule pas : il se
  rembourse.
- `POST /api/payments/:id/refund` (**admin**, motif et référence obligatoires) marque
  un remboursement fait à la main, hors application.

**Double paiement** : si un lien PayDunya est payé alors que la course est déjà payée,
l'IPN enregistre l'argent reçu (`PAID` avec `isDuplicate`) sans toucher à la course.
Le panneau « À régler » (`GET /api/payments/to-refund`) le liste jusqu'à ce qu'un admin
le marque remboursé. Le premier paiement valide gagne, même en cas de confirmations ou
d'IPN simultanés.

**Départ bloqué** : `PATCH /api/bookings/:id/status` refuse `EN_ROUTE` (et
`IN_PROGRESS` depuis un état d'avant le départ) tant que la course n'est pas payée,
avec `409` et le code `PAYMENT_REQUIRED`. `COMPLETED`, `NO_SHOW` et `CANCELLED` ne sont
jamais bloqués : ils enregistrent ce qui s'est passé.

---

## Modèle métier (l'essentiel)

- **Course planifiée, pas du « Uber »** : trajets réservés à l'avance (vol,
  rendez-vous médical), souvent **par un proche via la centrale**.
- **Client sans compte** : une réservation peut créer le passager à la volée.
- **Tarif figé à la réservation** : corridor à prix fixe, prix fixe négocié ou
  compteur (prise en charge + km + minutes), plus péage et majorations
  (véhicule adapté PMR **+20 %**, accompagnement, VIP), puis répartition
  **commission plateforme / part chauffeur** (modèle partenaire Phase 1).
- **Garde-fou accessibilité** : une course fauteuil roulant ne peut être
  affectée qu'à un véhicule adapté, et un véhicule ne peut être affecté qu'à
  son propre chauffeur.

### Tarifs de référence (modifiables en base)

| Axe            | Standard (FCFA) | Fourchette          |
|----------------|-----------------|---------------------|
| Dakar ↔ AIBD   | 22 000          | 20 000 – 25 000     |
| Thiès ↔ AIBD   | 17 500          | 15 000 – 20 000     |
| Touba ↔ AIBD   | 40 000          | 35 000 – 45 000     |
| Mbour ↔ AIBD   | 15 000          | 12 000 – 18 000     |
| Saly ↔ AIBD    | 18 000 *(à valider)* | 15 000 – 20 000 |

Commission (18 %), accompagnement (7 500), majoration PMR (20 %), majoration VIP
(15 %), barème au compteur et péage autoroute sont pilotés par variables
d'environnement — modifiables sans toucher au code.

---

## API

| Méthode | Endpoint                                  | Rôle                                         |
|---------|-------------------------------------------|----------------------------------------------|
| `GET`   | `/api/routes`                             | Axes desservis                               |
| `POST`  | `/api/pricing/quote`                      | Devis instantané (détail ligne à ligne)      |
| `POST`  | `/api/pricing/estimate`                   | Devis à partir de deux adresses (Google Maps)|
| `POST`  | `/api/bookings`                           | Créer une réservation                        |
| `GET`   | `/api/bookings/upcoming`                  | File des courses à venir (avec tous leurs paiements) |
| `GET`   | `/api/bookings/:id`                       | Détail d'une réservation                     |
| `PATCH` | `/api/bookings/:id/assign`                | Affecter chauffeur + véhicule                |
| `PATCH` | `/api/bookings/:id/status`                | Changer le statut (`EN_ROUTE` refusé si non payée) |
| `GET`   | `/api/drivers`                            | Chauffeurs (`?assignable=true` : affectables)|
| `POST`  | `/api/drivers`                            | Créer un chauffeur                           |
| `PATCH` | `/api/drivers/:id/status`                 | Changer le statut d'un chauffeur             |
| `GET`   | `/api/vehicles`                           | Véhicules actifs                             |
| `POST`  | `/api/vehicles`                           | Créer un véhicule                            |
| `POST`  | `/api/payments/bookings/:bookingId/link`  | Générer un lien de paiement                  |
| `POST`  | `/api/payments/:id/check`                 | Vérifier un paiement auprès de PayDunya      |
| `GET`   | `/api/payments/bookings/:bookingId`       | Historique complet des paiements d'une course |
| `POST`  | `/api/payments/bookings/:bookingId/manual`| Confirmer un paiement reçu autrement (**MANAGER, ADMIN**) |
| `GET`   | `/api/payments/to-refund`                 | Doubles paiements à rembourser (**MANAGER, ADMIN**) |
| `POST`  | `/api/payments/:id/void`                  | Annuler une confirmation manuelle (**ADMIN**, motif) |
| `POST`  | `/api/payments/:id/refund`                | Marquer un remboursement (**ADMIN**, motif et référence) |
| `POST`  | `/api/payments/paydunya/ipn`              | Notification de paiement (appelée par PayDunya, **publique**) |
| `POST`  | `/api/auth/login`                         | Connexion (**publique**, 10 essais/min par IP) |
| `POST`  | `/api/auth/logout`                        | Déconnexion (**publique**, sans erreur possible) |
| `GET`   | `/api/auth/me`                            | Utilisateur connecté (tout rôle)             |
| `POST`  | `/api/auth/change-password`               | Changer son mot de passe (tout rôle)         |

> Toutes les routes exigent une session `ADMIN`, `MANAGER` ou `OPERATOR`, sauf celles
> marquées **publiques** ; certaines demandent un rôle plus élevé (indiqué). Voir
> « Connexion ».

### Exemple — devis

```bash
curl -X POST http://localhost:3000/api/pricing/quote \
  -H "Content-Type: application/json" \
  -d '{ "routeId": "<id>", "serviceType": "PMR",
        "needsWheelchairVehicle": true, "withAccompaniment": true }'
```

---

## Structure

```
public/
  console-operateur.html   console opérateur (servie sur « / »)
src/
  main.ts                  point d'entrée (préfixe /api, validation, fichiers statiques)
  app.module.ts            module racine
  prisma/                  PrismaService (connexion) + module global
  config/business.config   règles tarifaires (env)
  config/auth.config       durées de session, nom du cookie (env)
  auth/                    connexion : garde global, sessions, mots de passe (argon2id)
  common/reference.ts      génération de références de réservation
  pricing/                 moteur de tarification (service + controller + DTO + test)
  maps/                    Google Maps : géocodage, itinéraire, péage
  routes/                  axes desservis
  bookings/                réservations (service + controller + DTO)
  drivers/                 chauffeurs (création, liste, statut)
  vehicles/                véhicules
  payments/                paiement : interface PaymentProvider, fournisseur PayDunya, IPN,
                           confirmations manuelles, annulations, remboursements
prisma/
  schema.prisma            modèle de données
  migrations/              historique des migrations
  seed.ts                  axes, tarifs, comptes de démo
  create-user.ts           gestion des comptes du personnel (npm run user:create)
```

---

## Prochaines étapes

**Avant la production**
- [x] Authentification du personnel (sessions, rôles ADMIN / MANAGER / OPERATOR)
- [x] Confirmation manuelle des paiements, annulation, remboursement, double paiement,
      départ bloqué tant que la course n'est pas payée
- [ ] Correction du prix d'une course par un admin (avec motif)
- [ ] Modification des tarifs depuis la console par un admin (aujourd'hui dans `.env`)
- [ ] Site et domaine, passage de PayDunya en mode live (URL IPN du vrai serveur)

**Fondation**
- [x] Module chauffeurs & véhicules (création, liste, statut)
- [x] Intégration paiement PayDunya en mode test : lien, IPN, vérification manuelle
- [ ] Reversements chauffeurs via **Wave Bulk Pay** (table `DriverPayout`)
- [ ] Notifications SMS de confirmation (clients sans smartphone)

**Ensuite**
- [x] Console opérateur — saisie des réservations téléphoniques
- [ ] Site de réservation client (PWA), paiement avant validation
- [ ] Géolocalisation temps réel (WebSocket gateway NestJS) — suivi chauffeur

**Phase 2 (marché validé)**
- [ ] Applications mobiles
- [ ] Flotte propre adaptée PMR
