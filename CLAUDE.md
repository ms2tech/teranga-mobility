# Téranga Mobility

Plateforme de réservation de transport adapté porte-à-porte au Sénégal (seniors, PMR, trajets médicaux non urgents). Zones : Dakar, Thiès, Touba, Mbour, Saly, AIBD.

## Stack
- NestJS + TypeScript + Prisma + PostgreSQL (Neon)
- Google Maps API : géocodage, itinéraires, péages, calcul automatique du prix
- Paiement : PayDunya (mode test) ; IPN testé via ngrok (domaine fixe, port 3000)
- Environnement : Windows

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
