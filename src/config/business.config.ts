import { registerAs } from '@nestjs/config';

/**
 * Règles métier centralisées (modifiables via variables d'environnement,
 * sans toucher au code). Les prix fixes des corridors vivent en base
 * (table Route) ; ici, les taux transverses et le barème au compteur.
 */
export const businessConfig = registerAs('business', () => ({
  // Commission prélevée sur la course (modèle chauffeurs partenaires)
  commissionRate: parseFloat(process.env.COMMISSION_RATE ?? '0.18'),
  // Frais d'accompagnement par défaut (FCFA)
  defaultAccompanimentFeeFcfa: parseInt(
    process.env.DEFAULT_ACCOMPANIMENT_FEE_FCFA ?? '7500',
    10,
  ),
  // Majoration véhicule adapté fauteuil roulant (+20 %)
  pmrVehicleSurchargeRate: parseFloat(
    process.env.PMR_VEHICLE_SURCHARGE_RATE ?? '0.20',
  ),
  // Majoration service VIP aéroport
  vipSurchargeRate: parseFloat(process.env.VIP_SURCHARGE_RATE ?? '0.15'),

  // ── Barème au compteur (trajets libres) ──────────────────────────
  // Prise en charge (montant de départ, FCFA)
  meterBaseFareFcfa: parseInt(process.env.METER_BASE_FARE_FCFA ?? '1000', 10),
  // Prix par kilomètre (FCFA)
  meterPerKmFcfa: parseInt(process.env.METER_PER_KM_FCFA ?? '350', 10),
  // Prix par minute (FCFA)
  meterPerMinuteFcfa: parseInt(process.env.METER_PER_MINUTE_FCFA ?? '50', 10),
  // Minimum de course (FCFA)
  meterMinimumFareFcfa: parseInt(process.env.METER_MINIMUM_FARE_FCFA ?? '2000', 10),
  // Vitesse moyenne estimée (km/h) — sert à estimer la durée tant que la
  // carte n'est pas branchée (l'opérateur ne saisit que la distance).
  estimatedAvgSpeedKmh: parseFloat(process.env.ESTIMATED_AVG_SPEED_KMH ?? '30'),

  // Péage de l'autoroute Dakar–Diamniadio–AIBD (FCFA, à ajuster selon le
  // tarif officiel). Appliqué quand le trajet emprunte l'autoroute.
  autorouteTollFcfa: parseInt(process.env.AUTOROUTE_TOLL_FCFA ?? '1500', 10),
}));

export type BusinessConfig = ReturnType<typeof businessConfig>;
