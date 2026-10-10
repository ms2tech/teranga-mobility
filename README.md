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

Tests conservés, sans base de données ni serveur (quelques secondes) :

```bash
npm test                  # tarification + données sensibles + interface
npm run test:pricing      # moteur de tarification (12 cas)
npm run test:sensitive    # aucune réponse ne doit contenir passwordHash (voir « Données sensibles »)
npm run test:console      # règles d'interface de la console (20 contrôles, voir « Console opérateur »)
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
- **Mise en page** : la colonne « Courses à venir » est l'espace de travail principal. Le
  formulaire garde une largeur fixe (≈ 460 px) et la file prend tout le reste, jusqu'à 1800 px
  de large en tout (1366 px : file ≈ 840 px ; 1920 px : file ≈ 1270 px). Quand la file dépasse
  900 px, chaque carte passe sur deux colonnes (course et affectation à gauche, paiement à
  droite). En-tête de la file : le titre, « Mis à jour à… » dessous, et les boutons
  (« À régler », « + Flotte », « Actualiser ») à droite, qui passent sur une ligne à part quand
  la place manque, sans jamais déborder. **Un seul panneau ouvert à la fois** parmi « À régler »
  et « Flotte » : ouvrir l'un ferme l'autre.
- **Nouvelle réservation** : passager, trajet libre (prix calculé depuis les deux
  adresses via Google Maps, péage compris) ou prix fixe, horaire, accessibilité.
  Le **motif du déplacement** n'a pas de valeur par défaut : le choix est obligatoire.
  Une course **planifiée** ne peut pas être datée dans le passé : le sélecteur grise les dates
  passées, la console refuse l'envoi avec un message clair et le serveur répond
  `400 SCHEDULED_IN_PAST` (marge de 5 minutes : « 14:00 » validé à 14:03 passe encore).
- **Courses à venir** : file de dispatch et affectation d'un chauffeur (possible
  tant que la course n'est pas partie). Une course sans chauffeur porte le statut
  **« À AFFECTER »** (et non « En attente », qui prêtait à confusion avec un paiement en attente).
  Une course **planifiée dont l'heure est dépassée sans être partie** (à affecter, confirmée ou
  affectée) est signalée **« En retard · 3 h02 »** (pastille rouge, trait rouge à gauche de la
  carte) et **remonte en haut de la liste**, la plus en retard d'abord. Une course « dès que
  possible » n'a pas d'heure : elle n'est jamais en retard. Rien ne se fait tout seul : l'opérateur
  affecte, reprogramme (annuler puis réserver à nouveau) ou annule.
- **Boutons de statut** sur chaque course, avec des verbes : **Passer en route** (chauffeur
  affecté obligatoire), **Terminer la course**, **Client absent…**, **Changer de chauffeur…**.
  Seuls les boutons permis par l'état de la course sont proposés ; Terminée, Annulée et
  Client absent sont définitifs. **« Terminer la course » n'apparaît qu'une fois la course
  partie** (en route ou en cours) : terminer une course jamais partie n'a pas de sens au
  quotidien. Le serveur, lui, accepte toujours la transition `ASSIGNED → COMPLETED`.
  **Une seule action principale** est mise en avant selon l'état (contour marqué ou fond plein) :
  « Affecter un chauffeur » pour une course à affecter, « Créer le lien de paiement » pour une
  course affectée non payée, « Passer en route » quand elle est payée, « Terminer la course »
  quand elle est en route. **« Annuler la course… »** est un petit lien discret, à gauche sous
  les actions de la carte, sans ligne ni bande dédiée (motif obligatoire).
- **Changer de chauffeur…** (tout le personnel) sur une course **en route** ou **en cours** :
  panne, incident. Choix du nouveau chauffeur et de son véhicule, motif obligatoire.
  La course garde son statut, son paiement et son prix ; l'historique des changements
  s'affiche sur la carte de la course.
- **Paiement** : « Créer le lien de paiement » par course, puis **« Copier le lien »** (le lien
  complet va dans le presse-papiers, il n'est jamais affiché en entier sur la carte) et
  **« Envoyer par WhatsApp »** (au proche ou, à défaut, au passager), badge **Payé**
  (« Paiement reçu ✓ · PayDunya », sans seconde ligne qui répète le moyen), et
  « Vérifier le paiement » si la notification n'est pas arrivée. Les boutons de la zone
  paiement (« Autoriser le départ… », « Créer le lien de paiement », « Paiement reçu
  autrement… »…) se placent **côte à côte** et ne passent à la ligne que si la place manque.
- **Une course non payée ne part pas** : le chauffeur peut être affecté à l'avance,
  mais la course affiche « En attente de paiement, départ bloqué » et l'API refuse
  le passage à `EN_ROUTE` tant qu'elle n'est pas payée, sauf **dérogation de départ**.
- **Dérogation de départ** (responsables et admins) : « Autoriser le départ… » avec un
  motif obligatoire (10 caractères minimum). La course reste **non payée** ; la
  dérogation (auteur, date, motif) est conservée. « Retirer la dérogation… » (motif)
  est possible tant que la course n'est pas partie.
- **Paiement reçu autrement** (responsables et admins) : confirme que l'argent est
  reçu par la société (note obligatoire, référence facultative) et débloque la
  course. L'**historique des paiements** de chaque course montre tout, annulations
  et remboursements compris. Un **admin** peut annuler une confirmation (motif
  obligatoire) ou marquer un remboursement.
- **« À régler »** (responsables et admins), avec un compteur rouge :
  - **À encaisser** : les courses non payées dont le départ a été autorisé par
    dérogation, et les courses terminées non payées (signalées « sans dérogation »).
    Elles y restent jusqu'au paiement (lien ou « Paiement reçu autrement… »).
  - **À rembourser** : les doubles paiements PayDunya et l'argent reçu pour une course
    **annulée**. Rien n'est remboursé automatiquement : un admin marque le
    remboursement une fois fait à la main.
  - Les textes d'explication du panneau sont en petit et discrets (plus petits que les courses).
- **Tarifs** (admins, bouton dans la barre du haut ; fenêtre fermable par le **✕** en haut à
  droite) : tous les paramètres des trajets libres, aperçu avant / après, motif obligatoire,
  historique des versions (voir « Tarifs des trajets libres »), et section « Corridors à prix
  fixe », **repliée par défaut** et marquée « Non utilisés pour les réservations pour
  l'instant » : créer, modifier les prix, désactiver ou réactiver un corridor, consulter son
  historique (voir « Corridors à prix fixe »). Les noms s'affichent avec **↔** (« Dakar ↔ AIBD »).
- **Flotte** : ajout d'un chauffeur avec son véhicule.
- **Boutons qui ouvrent un panneau** (« À régler », « + Flotte », « Affecter un chauffeur ») :
  quand le panneau est ouvert, le bouton est **en fond plein** (couleur différente), son icône
  devient **✕** (fermer) et son infobulle dit « Fermer le panneau… » ; il porte `aria-pressed`.
  Le panneau a un **titre** clair et un bouton **« Fermer »**, qui rend le focus au bouton. Les
  choix exclusifs (Trajet libre / Prix fixe, Dès que possible / Planifier) portent aussi
  `aria-pressed`. Même règle pour tout futur bouton de ce type (contrôlée par `npm run test:console`,
  qui vérifie aussi la mise en page, l'exclusivité des panneaux, les verbes des boutons, « À affecter »,
  l'absence du lien PayDunya sur les cartes, les corridors repliés, le ✕ de Tarifs et le motif sans
  valeur par défaut).

---

## Connexion (authentification)

- **Qui** : le personnel, par e-mail + mot de passe, avec trois rôles :
  - `OPERATOR` : réservations, affectation, changement de chauffeur en route, liens de
    paiement, vérification d'un paiement ;
  - `MANAGER` (responsable des opérations) : tout l'OPERATOR, plus la confirmation
    manuelle d'un paiement, la dérogation de départ, l'annulation d'une course déjà
    payée et le panneau « À régler » ;
  - `ADMIN` : tout, plus l'annulation d'une confirmation, le remboursement et les
    tarifs des trajets libres et les corridors (et, plus tard, les comptes).

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

### Données sensibles : jamais dans une réponse de l'API

**Aucune réponse de l'API ne contient `passwordHash`, ni aucun autre champ sensible d'un
compte** (e-mail, téléphone de connexion, dates de connexion, état du mot de passe), ni le
numéro de reversement ou le taux de commission d'un chauffeur, ni les notes médicales ou
l'e-mail d'un passager. Une personne n'apparaît dans une réponse que par son **nom**
(l'auteur d'une confirmation, d'une dérogation, d'un changement de chauffeur, d'une
version de tarif…), le chauffeur par `id`, statut, secourisme et nom, le passager par
`id`, nom et téléphone (pour l'appeler). Seules exceptions, sur le compte de l'appelant
lui-même : `POST /api/auth/login` et `GET /api/auth/me` (id, nom, e-mail, rôle, mot de
passe à changer), jamais de hash.

Comment c'est garanti, en trois couches :
1. **`select` explicites** : toute lecture destinée à une réponse passe par les sélections
   partagées de `src/common/safe-selects.ts` (`PERSON_NAME`, `DRIVER_SUMMARY`,
   `CLIENT_SUMMARY`…). Pas de `include: { user: true }`, pas de `driver: true`.
2. **Filet de sécurité global** (`SensitiveFieldsInterceptor`) : si une requête laissait quand
   même passer un `passwordHash` ou un `tokenHash`, il est retiré de la réponse et l'erreur
   est journalisée (« Champ sensible retiré d'une réponse… ») pour être corrigée à la source.
3. **Contrôle automatique** : `npm run test:sensitive` vérifie le filet, les sélections
   partagées et le code source (il échoue si quelqu'un écrit `user: true`, `driver: true`,
   `…By: true`, `client: true`, ou nomme `passwordHash` hors de l'authentification).
   Pour une nouvelle route, relire ce principe : ne sélectionner que les champs nécessaires.

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
avec `409` et le code `PAYMENT_REQUIRED`, **sauf dérogation active**. `COMPLETED`,
`NO_SHOW` et `CANCELLED` ne sont jamais bloqués : ils enregistrent ce qui s'est passé.

### Dérogation de départ

Pour faire partir une course non payée (client de confiance, convention avec un
hôpital, sortie d'hôpital…), un **responsable ou un admin** l'autorise :
`POST /api/bookings/:id/departure-waiver` avec un `reason` (10 à 500 caractères).

- **La course reste non payée** (`paymentStatus` inchangé) : l'argent n'est pas
  « reçu », donc les comptes et les reversements au chauffeur ne sont pas faussés.
- Table `DepartureWaiver` : motif, auteur, date, et, si elle est retirée, auteur,
  date et motif du retrait. Rien n'est effacé. Une seule dérogation active par course ;
  impossible sur une course déjà payée ou déjà partie.
- `POST /api/bookings/:id/departure-waiver/revoke` (`reason`) la retire, tant que la
  course n'est pas partie : le départ est de nouveau bloqué.
- `GET /api/bookings/to-collect` (responsables, admins) liste les courses « à encaisser ».

### Statuts d'une course

`PATCH /api/bookings/:id/status` (`status`, et `reason` pour l'annulation) suit une table
de transitions côté serveur ; une transition interdite répond `409 INVALID_TRANSITION`.

| De            | Vers permis                                          |
|---------------|------------------------------------------------------|
| `PENDING`     | `CONFIRMED`, `CANCELLED`                             |
| `CONFIRMED`   | `CANCELLED`                                          |
| `ASSIGNED`    | `EN_ROUTE`, `IN_PROGRESS`, `COMPLETED`, `NO_SHOW`, `CANCELLED` |
| `EN_ROUTE`    | `IN_PROGRESS`, `COMPLETED`, `NO_SHOW`, `CANCELLED`   |
| `IN_PROGRESS` | `COMPLETED`                                          |
| autres        | aucune (`COMPLETED`, `CANCELLED`, `NO_SHOW` sont définitifs) |

- `ASSIGNED` ne s'obtient que par l'affectation (`PATCH /api/bookings/:id/assign`), qui
  est refusée dès que la course est partie ou terminée (`409`). Pour une course déjà
  partie, le chauffeur change par `POST /api/bookings/:id/driver-change` (voir plus bas).
- `EN_ROUTE` et `IN_PROGRESS` exigent un chauffeur affecté (`400 DRIVER_REQUIRED`).
- **Annulation** : motif obligatoire (5 caractères minimum, `400 REASON_REQUIRED`),
  conservé avec l'auteur et la date. Une course **non payée** peut être annulée par
  tout le personnel ; une course **déjà payée** seulement par un responsable ou un
  admin (`403 CANCEL_PAID_FORBIDDEN`).
- **L'argent n'est jamais touché automatiquement.** Annuler une course payée ne rembourse
  rien : le paiement apparaît dans « À rembourser » (remboursement intégral par défaut,
  frais d'annulation plus tard) jusqu'à ce qu'un admin enregistre le remboursement. Les
  liens PayDunya en attente sont abandonnés ; un lien payé après l'annulation est
  enregistré `PAID` avec `isDuplicate`, à rembourser aussi.
- **Client absent** (`NO_SHOW`) : le paiement est conservé, sans frais pour l'instant.

### Changement de chauffeur en route

`POST /api/bookings/:id/driver-change` (`driverId`, `vehicleId`, `reason`) : **tout le
personnel**, sur une course `EN_ROUTE` ou `IN_PROGRESS` seulement (avant le départ,
l'affectation suffit ; une course terminée, annulée ou « client absent » ne change plus :
`409 DRIVER_CHANGE_NOT_ALLOWED`).

- **Motif obligatoire** (5 caractères minimum : « panne » suffit en pleine urgence).
- **La course garde son statut, son paiement et son prix** (règle du prix figé) : seuls le
  chauffeur et le véhicule changent. Aucun champ de statut, de prix ou de paiement n'est
  accepté.
- **Véhicule adapté** : si la course exige un véhicule adapté au fauteuil roulant, le nouveau
  véhicule doit l'être aussi (`400 WHEELCHAIR_VEHICLE_REQUIRED`).
- Le véhicule doit appartenir au nouveau chauffeur et être actif ; un **autre** chauffeur doit
  être actif. Le **même** chauffeur peut changer de véhicule (panne du véhicule), même s'il
  n'est plus « actif ». Rien à changer : `400 NO_CHANGE`.
- **Historique** (table `DriverChange`, jamais modifiée ni supprimée) : ancien et nouveau
  chauffeur, ancien et nouveau véhicule, motif, auteur, date, et **statut de la course à ce
  moment-là**. Fourni avec la course (`GET /api/bookings/upcoming` et `/:id`, noms et
  immatriculations seulement) et affiché dans la console.
- **Deux changements en même temps** : la mise à jour est conditionnelle sur l'état lu ; une
  course terminée entre-temps n'est pas modifiée (`409 COURSE_CHANGED`), et chaque succès
  laisse exactement une ligne d'historique.
- **Part du chauffeur** : le partage de `driverPayoutFcfa` entre l'ancien et le nouveau
  chauffeur **n'est pas décidé** ; il le sera au lot des reversements. Ce lot n'enregistre
  que l'historique.

---

## Modèle métier (l'essentiel)

- **Course planifiée, pas du « Uber »** : trajets réservés à l'avance (vol,
  rendez-vous médical), souvent **par un proche via la centrale**.
- **Client sans compte** : une réservation peut créer le passager à la volée.
- **Tarif figé à la réservation** : corridor à prix fixe, prix fixe négocié ou
  compteur (prise en charge + km + minutes), plus péage et majorations
  (véhicule adapté PMR **+20 %**, accompagnement, VIP), puis répartition
  **commission plateforme / part chauffeur** (modèle partenaire Phase 1).
  **Règle permanente : le prix d'une course est figé à la réservation et ne change
  jamais après l'accord du client.** Si le trajet change vraiment, on annule la
  réservation et on en crée une nouvelle. Un changement de tarif ne touche que les
  réservations créées ensuite ; chaque réservation garde la version du barème avec
  laquelle son prix a été calculé (`Booking.tariffVersionId`).
- **Garde-fou accessibilité** : une course fauteuil roulant ne peut être
  affectée qu'à un véhicule adapté, et un véhicule ne peut être affecté qu'à
  son propre chauffeur.

### Corridors à prix fixe (en base, table `Route`)

> **Décision d'origine : le prix d'une réservation vient toujours des adresses (trajet
> libre) ou d'un prix fixe saisi par l'opérateur.** Le site public n'utilisera que le trajet
> libre. La gestion des corridors reste en place, mais **ils ne servent pas à réserver** :
> ni la console ni le futur site ne proposent de réserver sur un corridor, et **l'API
> refuse `routeId`**, à la création d'une réservation comme au devis
> (`400 CORRIDOR_BOOKING_DISABLED`, message : « Réserver sur un corridor n'est pas possible
> pour le moment… Retirez routeId »). Les utiliser pour réserver (console et site public)
> viendra bien après le lancement : il suffira alors de passer `CORRIDOR_BOOKING_ENABLED` à
> `true` dans `src/pricing/corridor-guard.ts` et d'ajouter l'usage dans les interfaces.

Un corridor est un trajet à prix fixe : ville ↔ AIBD, ou ville ↔ ville (par exemple
Thiès ↔ Touba). Les cinq axes AIBD du seed sont les valeurs de **départ** :

| Axe            | Standard (FCFA) | Fourchette          |
|----------------|-----------------|---------------------|
| Dakar ↔ AIBD   | 22 000          | 20 000 – 25 000     |
| Thiès ↔ AIBD   | 17 500          | 15 000 – 20 000     |
| Touba ↔ AIBD   | 40 000          | 35 000 – 45 000     |
| Mbour ↔ AIBD   | 15 000          | 12 000 – 18 000     |
| Saly ↔ AIBD    | 18 000 *(à valider)* | 15 000 – 20 000 |

- **Un ADMIN les gère depuis la console** (bouton « Tarifs », section « Corridors à prix
  fixe ») : créer un corridor, modifier le prix de base, le minimum, le maximum et la durée
  estimée, désactiver ou réactiver. **Motif obligatoire** (10 caractères minimum) à chaque
  changement.
- **Jamais de suppression** : des réservations y font référence. On désactive (`isActive`) :
  un corridor désactivé n'est plus proposé (`GET /api/routes`, devis et réservations
  refusés) mais les réservations existantes le gardent, avec leur prix. On peut le
  réactiver. Son code reste réservé.
- **Historique** (table `RouteChange`, jamais modifiée) : pour chaque changement, le type
  (création, modification, désactivation, réactivation), la version, l'auteur, la date, le
  motif, et les **anciennes et nouvelles valeurs**. Visible dans la console (« Historique »
  de chaque corridor).
- **Les prix déjà calculés restent figés** : le prix d'une réservation est copié dans la
  réservation à sa création. Un changement de prix ne touche que les réservations créées
  ensuite. Comme aucune réservation ne se fait sur un corridor, modifier un prix de corridor
  ne change le prix d'aucune réservation, ni existante ni à venir : les réservations déjà
  liées à un corridor (anciennes) gardent leur prix.
- **Deux admins en même temps** : chaque corridor a une `version` ; la requête indique celle
  sur laquelle elle s'appuie, sinon `409 ROUTE_VERSION_STALE`.
- **Le code, le nom et la ville ne changent pas** après la création (le code est
  l'identifiant stable). Le prix de base doit rester entre le minimum et le maximum.
- **Bornes** (elles attrapent une faute de frappe, elles ne fixent pas les prix) :

  | Champ                      | Minimum | Maximum |
  |----------------------------|---------|---------|
  | Prix de base               | 1 000   | 300 000 FCFA |
  | Prix minimum indicatif     | 1 000   | 300 000 FCFA |
  | Prix maximum indicatif     | 1 000   | 300 000 FCFA |
  | Durée estimée              | 5       | 720 min |

  Code : lettres majuscules, chiffres et tirets (3 à 20 caractères, ex. `THS-TBA`).
- **Le seed ne modifie plus les corridors** : `npm run prisma:seed` crée les axes absents et
  laisse les autres intacts. Les prix modifiés par un admin ne sont jamais écrasés.

### Tarifs des trajets libres (en base, par version)

Les dix paramètres du barème vivent dans la table `TariffVersion` : prise en charge, prix
au kilomètre, prix à la minute, minimum de course, vitesse moyenne estimée, péage
autoroute, majoration PMR, majoration VIP, accompagnement, commission.

- **Un ADMIN les modifie depuis la console** (bouton « Tarifs ») : valeurs, **aperçu avant /
  après** sur des trajets types (1, 5, 10, 25 km, péage, PMR, VIP), puis **motif
  obligatoire** (10 caractères minimum). Chaque enregistrement crée une **nouvelle version**,
  avec son auteur et sa date ; une version n'est jamais modifiée ni supprimée, et
  l'historique (avec les différences d'une version à l'autre) est affiché dans le panneau.
- **Effet immédiat, mais seulement sur les nouvelles réservations.** Les prix déjà calculés
  restent figés. Pas de date d'application programmée.
- **Valeurs de départ** : au premier démarrage, la version 1 est créée depuis les variables
  du `.env` (`COMMISSION_RATE`, `METER_PER_KM_FCFA`…). **Ensuite le `.env` n'a plus aucun
  effet sur les prix** : tout passe par la console.
- **Bornes par champ** (elles attrapent une faute de frappe, elles ne fixent pas les prix ;
  les taux sont des fractions, 0,18 = 18 %) :

  | Paramètre                   | Minimum | Maximum  |
  |-----------------------------|---------|----------|
  | Prise en charge             | 0       | 10 000 FCFA |
  | Prix au kilomètre           | 50      | 5 000 FCFA/km |
  | Prix à la minute            | 0       | 1 000 FCFA/min |
  | Minimum de course           | 500     | 50 000 FCFA |
  | Vitesse moyenne estimée     | 10      | 120 km/h (1 décimale) |
  | Péage autoroute             | 0       | 10 000 FCFA |
  | Majoration véhicule PMR     | 0 %     | 50 % |
  | Majoration service VIP      | 0 %     | 50 % |
  | Accompagnement              | 0       | 50 000 FCFA |
  | Commission                  | 5 %     | 40 % |

  Les montants en FCFA sont des entiers, les taux ont 4 décimales au plus. Le minimum de
  course ne peut pas être inférieur à la prise en charge.
- **Deux admins en même temps** : la requête indique la version sur laquelle elle s'appuie ;
  si elle a changé entre-temps, `409 TARIFF_VERSION_STALE` et la console se recharge.
- **Garde-fou à la création d'une course** : la console envoie le prix affiché
  (`expectedTotalFcfa`). Si le prix recalculé diffère (tarifs changés depuis le devis),
  la réservation est refusée (`409 TARIFF_CHANGED`, avec le prix actuel) : l'opérateur
  recalcule le devis et confirme le nouveau prix avec le client. Le champ est facultatif
  pour les autres clients de l'API.

---

## API

| Méthode | Endpoint                                  | Rôle                                         |
|---------|-------------------------------------------|----------------------------------------------|
| `GET`   | `/api/routes`                             | Corridors actifs                             |
| `GET`   | `/api/routes/admin`                       | Tous les corridors (désactivés compris) et les bornes (**ADMIN**) |
| `GET`   | `/api/routes/:id/history`                 | Historique d'un corridor (**ADMIN**)         |
| `POST`  | `/api/routes`                             | Nouveau corridor : code, nom, ville, prix, durée, motif (**ADMIN**) |
| `PATCH` | `/api/routes/:id`                         | Nouveaux prix et durée, `basedOnVersion`, motif (**ADMIN**) |
| `POST`  | `/api/routes/:id/deactivate`              | Désactiver un corridor, `basedOnVersion`, motif (**ADMIN**) |
| `POST`  | `/api/routes/:id/reactivate`              | Réactiver un corridor, `basedOnVersion`, motif (**ADMIN**) |
| `POST`  | `/api/pricing/quote`                      | Devis instantané (détail ligne à ligne) ; `routeId` refusé (400 `CORRIDOR_BOOKING_DISABLED`) |
| `POST`  | `/api/pricing/estimate`                   | Devis à partir de deux adresses (Google Maps)|
| `POST`  | `/api/bookings`                           | Créer une réservation (trajet libre ou prix fixe ; `routeId` refusé : 400 `CORRIDOR_BOOKING_DISABLED` ; `expectedTotalFcfa` facultatif : 409 `TARIFF_CHANGED` si le prix a changé ; course planifiée dans le passé, au-delà de 5 min : 400 `SCHEDULED_IN_PAST`) |
| `GET`   | `/api/bookings/upcoming`                  | File des courses à venir (avec tous leurs paiements) |
| `GET`   | `/api/bookings/:id`                       | Détail d'une réservation                     |
| `GET`   | `/api/bookings/to-collect`                | Courses à encaisser (**MANAGER, ADMIN**)     |
| `PATCH` | `/api/bookings/:id/assign`                | Affecter chauffeur + véhicule (avant le départ) |
| `PATCH` | `/api/bookings/:id/status`                | Changer le statut (transitions contrôlées ; `EN_ROUTE` refusé si non payée sans dérogation ; motif pour annuler) |
| `POST`  | `/api/bookings/:id/driver-change`         | Changer le chauffeur et le véhicule d'une course en route ou en cours (personnel, motif) |
| `POST`  | `/api/bookings/:id/departure-waiver`      | Autoriser le départ d'une course non payée (**MANAGER, ADMIN**, motif) |
| `POST`  | `/api/bookings/:id/departure-waiver/revoke` | Retirer la dérogation (**MANAGER, ADMIN**, motif) |
| `GET`   | `/api/drivers`                            | Chauffeurs (`?assignable=true` : affectables)|
| `POST`  | `/api/drivers`                            | Créer un chauffeur                           |
| `PATCH` | `/api/drivers/:id/status`                 | Changer le statut d'un chauffeur             |
| `GET`   | `/api/vehicles`                           | Véhicules actifs                             |
| `POST`  | `/api/vehicles`                           | Créer un véhicule                            |
| `POST`  | `/api/payments/bookings/:bookingId/link`  | Générer un lien de paiement                  |
| `POST`  | `/api/payments/:id/check`                 | Vérifier un paiement auprès de PayDunya      |
| `GET`   | `/api/payments/bookings/:bookingId`       | Historique complet des paiements d'une course |
| `POST`  | `/api/payments/bookings/:bookingId/manual`| Confirmer un paiement reçu autrement (**MANAGER, ADMIN**) |
| `GET`   | `/api/payments/to-refund`                 | Doubles paiements et paiements de courses annulées à rembourser (**MANAGER, ADMIN**) |
| `POST`  | `/api/payments/:id/void`                  | Annuler une confirmation manuelle (**ADMIN**, motif) |
| `POST`  | `/api/payments/:id/refund`                | Marquer un remboursement (**ADMIN**, motif et référence) |
| `GET`   | `/api/tariffs/current`                    | Version courante du barème, avec les bornes (**ADMIN**) |
| `GET`   | `/api/tariffs/history`                    | Toutes les versions du barème (**ADMIN**)    |
| `POST`  | `/api/tariffs/preview`                    | Aperçu avant / après sur des trajets types, sans rien créer (**ADMIN**) |
| `POST`  | `/api/tariffs`                            | Nouvelle version du barème : les dix valeurs, `basedOnVersion`, motif (**ADMIN**) |
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
  -d '{ "distanceMeters": 10000, "durationSeconds": 1200, "serviceType": "PMR",
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
  config/business.config   valeurs INITIALES du barème (env, lues une fois pour la version 1)
  config/auth.config       durées de session, nom du cookie (env)
  auth/                    connexion : garde global, sessions, mots de passe (argon2id)
  common/                  références de réservation, erreurs à code (coded.ts), sélections
                           sûres (safe-selects.ts), filet « données sensibles » (intercepteur) et son test
  pricing/                 moteur de tarification (compute-quote.ts : fonction pure ; service, controller, DTO, test)
  tariffs/                 barème en base : versions, bornes, aperçu, historique (ADMIN)
  maps/                    Google Maps : géocodage, itinéraire, péage
  routes/                  corridors à prix fixe : liste, création, prix, désactivation, historique (ADMIN)
  bookings/                réservations (service + controller + DTO), dérogations de départ,
                           changements de chauffeur en route
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
- [x] Dérogation de départ, boutons de statut dans la console (En route, Terminée,
      Client absent, Annulée), « À encaisser » et « À rembourser »
- [x] Tarifs des trajets libres en base, modifiables par un admin (motif, historique,
      aperçu avant / après, prix déjà calculés figés, garde-fou `expectedTotalFcfa`)
- [x] Corridors à prix fixe gérés par un admin (création ville ↔ ville comprise, prix,
      désactivation, motif, historique ; le seed ne les écrase plus)
- [x] Changement de chauffeur en route (panne, incident), avec motif et historique
- [x] Aucune donnée sensible dans les réponses de l'API (passwordHash, comptes, reversement des
      chauffeurs) : sélections sûres, filet global, contrôle `npm run test:sensitive`
- [ ] Frais d'annulation (aujourd'hui : remboursement intégral)
- [ ] Site et domaine, passage de PayDunya en mode live (URL IPN du vrai serveur)

**Fondation**
- [x] Module chauffeurs & véhicules (création, liste, statut)
- [x] Intégration paiement PayDunya en mode test : lien, IPN, vérification manuelle
- [ ] Reversements chauffeurs via **Wave Bulk Pay** (table `DriverPayout`), dont le partage de
      la part d'une course dont le chauffeur a changé en route (à décider)
- [ ] Notifications SMS de confirmation (clients sans smartphone)

**Ensuite**
- [x] Console opérateur — saisie des réservations téléphoniques
- [ ] Site de réservation client (PWA), paiement avant validation (trajet libre seulement)
- [ ] **Bien après le lancement** : réserver sur un corridor (console et site public)
- [ ] Géolocalisation temps réel (WebSocket gateway NestJS) — suivi chauffeur

**Phase 2 (marché validé)**
- [ ] Applications mobiles
- [ ] Flotte propre adaptée PMR
