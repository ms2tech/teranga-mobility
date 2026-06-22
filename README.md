# Téranga Mobility — Backend (API)

Plateforme de réservation de **transport porte-à-porte adapté** au Sénégal :
transport médical non urgent, PMR (personnes à mobilité réduite), seniors et
VIP aéroport, en desserte de l'**AIBD** (Dakar, Thiès, Touba, Mbour, Saly).

> *« Téranga Mobility » est un nom de travail — libre à toi de le renommer.*

Fondation technique : modèle de données, API de réservation et moteur de
tarification. Socle pour la console opérateur, le site client (PWA) et, en
Phase 2, l'application mobile + le suivi GPS temps réel (WebSocket gateways).

---

## Stack

| Couche      | Choix                                            |
|-------------|--------------------------------------------------|
| Langage     | TypeScript                                       |
| API         | NestJS 10                                        |
| Base        | PostgreSQL + Prisma ORM                          |
| Validation  | class-validator (DTO)                            |
| Paiement    | Agrégateur (PayDunya/SenePay) + Wave Bulk Pay *(à brancher)* |

NestJS s'appuie sur TypeScript (décorateurs + injection de dépendances par
type) : le couple est cohérent et sans bricolage. Son support natif des
WebSocket gateways prépare le terrain pour le suivi GPS temps réel.

---

## Démarrage

Prérequis : Node 20+, une base PostgreSQL.

```bash
cp .env.example .env          # puis renseigne DATABASE_URL
npm install
npm run prisma:generate       # génère le client Prisma (accès réseau requis)
npm run prisma:migrate        # crée les tables
npm run prisma:seed           # charge axes, tarifs et comptes de démo
npm run start:dev             # API sur http://localhost:3000/api
```

Tester la tarification, sans base de données :

```bash
npm run test:pricing
```

> Note : `prisma generate` télécharge un moteur natif depuis
> `binaries.prisma.sh` — prévois un accès réseau ouvert au premier lancement.

---

## Modèle métier (l'essentiel)

- **Course planifiée, pas du « Uber »** : trajets réservés à l'avance (vol,
  rendez-vous médical), souvent **par un proche via la centrale**.
- **Client sans compte** : une réservation peut créer le passager à la volée.
- **Tarif figé à la réservation** : prix de base par axe + majorations
  (véhicule adapté PMR **+20 %**, accompagnement, VIP), puis répartition
  **commission plateforme / part chauffeur** (modèle partenaire Phase 1).
- **Garde-fou accessibilité** : une course fauteuil roulant ne peut être
  affectée qu'à un véhicule adapté.

### Tarifs de référence (modifiables en base)

| Axe            | Standard (FCFA) | Fourchette          |
|----------------|-----------------|---------------------|
| Dakar ↔ AIBD   | 22 000          | 20 000 – 25 000     |
| Thiès ↔ AIBD   | 17 500          | 15 000 – 20 000     |
| Touba ↔ AIBD   | 40 000          | 35 000 – 45 000     |
| Mbour ↔ AIBD   | 15 000          | 12 000 – 18 000     |
| Saly ↔ AIBD    | 18 000 *(à valider)* | 15 000 – 20 000 |

Commission (18 %), accompagnement (7 500), majoration PMR (20 %) et VIP (15 %)
pilotés par variables d'environnement — modifiables sans redéploiement.

---

## API (v0)

| Méthode | Endpoint                  | Rôle                                    |
|---------|---------------------------|-----------------------------------------|
| `GET`   | `/api/routes`             | Axes desservis                          |
| `POST`  | `/api/pricing/quote`      | Devis instantané (détail ligne à ligne) |
| `POST`  | `/api/bookings`           | Créer une réservation                   |
| `GET`   | `/api/bookings/upcoming`  | File des courses à venir (centrale)     |
| `GET`   | `/api/bookings/:id`       | Détail d'une réservation                |
| `PATCH` | `/api/bookings/:id/assign`| Affecter chauffeur + véhicule           |
| `PATCH` | `/api/bookings/:id/status`| Changer le statut                       |

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
src/
  main.ts                  point d'entrée (bootstrap NestJS)
  app.module.ts            module racine
  prisma/                  PrismaService (connexion) + module global
  config/business.config   règles tarifaires (env)
  common/reference.ts      génération de références de réservation
  pricing/                 moteur de tarification (service + controller + DTO + test)
  routes/                  axes desservis
  bookings/                réservations (service + controller + DTO)
prisma/
  schema.prisma            modèle de données
  seed.ts                  axes, tarifs, comptes de démo
```

---

## Prochaines étapes

**Maintenant (fondation, suite)**
- [ ] Authentification (JWT) + rôles (admin / opérateur / chauffeur)
- [ ] Module chauffeurs & véhicules (CRUD, validation des partenaires)
- [ ] Intégration paiement : encaissement via agrégateur + webhook
- [ ] Reversements chauffeurs via **Wave Bulk Pay** (table `DriverPayout`)
- [ ] Notifications SMS de confirmation (clients sans smartphone)

**Ensuite**
- [ ] Console opérateur — saisie des réservations téléphoniques
- [ ] Site de réservation client (PWA)
- [ ] Géolocalisation temps réel (WebSocket gateway NestJS) — suivi chauffeur

**Phase 2 (marché validé)**
- [ ] Applications mobiles
- [ ] Flotte propre adaptée PMR
