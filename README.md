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
| Interface   | Console opérateur en HTML/JS (`public/`), servie sur `/`     |

---

## Démarrage

Prérequis : Node 20+, une base PostgreSQL.

```bash
cp .env.example .env          # puis renseigne DATABASE_URL, GOOGLE_MAPS_API_KEY, clés PayDunya
npm install
npm run prisma:generate       # génère le client Prisma (accès réseau requis)
npm run prisma:migrate        # crée les tables (commande interactive)
npm run prisma:seed           # charge axes, tarifs et comptes de démo
npm run start:dev             # API : http://localhost:3000/api — console : http://localhost:3000/
```

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

- **Nouvelle réservation** : passager, trajet libre (prix calculé depuis les deux
  adresses via Google Maps, péage compris) ou prix fixe, horaire, accessibilité.
- **Courses à venir** : file de dispatch et affectation d'un chauffeur.
- **Paiement** : « Lien de paiement » par course (affichage, copie, envoi par
  WhatsApp au proche ou, à défaut, au passager), badge **Payé**, et
  « Vérifier le paiement » si la notification n'est pas arrivée.
- **Flotte** : ajout d'un chauffeur avec son véhicule.

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
| `GET`   | `/api/bookings/upcoming`                  | File des courses à venir (avec dernier paiement) |
| `GET`   | `/api/bookings/:id`                       | Détail d'une réservation                     |
| `PATCH` | `/api/bookings/:id/assign`                | Affecter chauffeur + véhicule                |
| `PATCH` | `/api/bookings/:id/status`                | Changer le statut                            |
| `GET`   | `/api/drivers`                            | Chauffeurs (`?assignable=true` : affectables)|
| `POST`  | `/api/drivers`                            | Créer un chauffeur                           |
| `PATCH` | `/api/drivers/:id/status`                 | Changer le statut d'un chauffeur             |
| `GET`   | `/api/vehicles`                           | Véhicules actifs                             |
| `POST`  | `/api/vehicles`                           | Créer un véhicule                            |
| `POST`  | `/api/payments/bookings/:bookingId/link`  | Générer un lien de paiement                  |
| `POST`  | `/api/payments/:id/check`                 | Vérifier un paiement auprès de PayDunya      |
| `POST`  | `/api/payments/paydunya/ipn`              | Notification de paiement (appelée par PayDunya) |

> L'API n'a pas encore d'authentification : ne l'expose pas publiquement tant
> qu'elle n'est pas en place.

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
  common/reference.ts      génération de références de réservation
  pricing/                 moteur de tarification (service + controller + DTO + test)
  maps/                    Google Maps : géocodage, itinéraire, péage
  routes/                  axes desservis
  bookings/                réservations (service + controller + DTO)
  drivers/                 chauffeurs (création, liste, statut)
  vehicles/                véhicules
  payments/                paiement : interface PaymentProvider, fournisseur PayDunya, IPN
prisma/
  schema.prisma            modèle de données
  migrations/              historique des migrations
  seed.ts                  axes, tarifs, comptes de démo
```

---

## Prochaines étapes

**Avant la production**
- [ ] Authentification (JWT) + rôles (admin / opérateur / chauffeur)
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
