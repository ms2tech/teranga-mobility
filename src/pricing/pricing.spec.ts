/**
 * Test du moteur de tarification hybride (`npm run test:pricing`).
 * Importe la VRAIE fonction computeQuote : elle est pure, le barème lui est passé en
 * paramètre (en production, c'est une version de la table TariffVersion).
 */
import assert from 'node:assert/strict';
import { ComputeParams, TariffInput, computeQuote } from './compute-quote';

const tariff: TariffInput = {
  commissionRate: 0.18,
  defaultAccompanimentFeeFcfa: 7500,
  pmrVehicleSurchargeRate: 0.2,
  vipSurchargeRate: 0.15,
  meterBaseFareFcfa: 1000,
  meterPerKmFcfa: 350,
  meterPerMinuteFcfa: 50,
  meterMinimumFareFcfa: 2000,
  estimatedAvgSpeedKmh: 30,
  autorouteTollFcfa: 1500,
};
const q = (p: Partial<ComputeParams>, t: TariffInput = tariff) =>
  computeQuote({ serviceType: 'SENIOR', ...p } as ComputeParams, t);

const cases: Array<{ name: string; out: any; expect: Record<string, number> }> = [
  {
    name: 'FLAT — corridor Dakar',
    out: q({ mode: 'FLAT', corridorFareFcfa: 22000, routeLabel: 'Dakar <-> AIBD' }),
    expect: { fareCoreFcfa: 22000, totalPriceFcfa: 22000, commissionFcfa: 4000, driverPayoutFcfa: 18000 },
  },
  {
    name: 'METERED — 10 km',
    out: q({ mode: 'METERED', distanceMeters: 10000 }),
    expect: { fareCoreFcfa: 5500, totalPriceFcfa: 5500, commissionFcfa: 1000, driverPayoutFcfa: 4500 },
  },
  {
    name: 'METERED — 1 km (minimum)',
    out: q({ mode: 'METERED', distanceMeters: 1000 }),
    expect: { fareCoreFcfa: 2000, totalPriceFcfa: 2000, commissionFcfa: 400, driverPayoutFcfa: 1600 },
  },
  {
    name: 'METERED — 10 km + péage (non commissionné)',
    out: q({ mode: 'METERED', distanceMeters: 10000, viaToll: true }),
    // fareCore 5500 + péage 1500 = 7000 ; commission = 18% de 5500 = 990 -> 1000 ; chauffeur = 7000 - 1000 = 6000
    expect: { tollFcfa: 1500, totalPriceFcfa: 7000, commissionFcfa: 1000, driverPayoutFcfa: 6000 },
  },
  {
    name: 'METERED — 10 km + PMR + accompagnement',
    out: q({ mode: 'METERED', distanceMeters: 10000, needsWheelchairVehicle: true, withAccompaniment: true }),
    expect: { fareCoreFcfa: 5500, pmrSurchargeFcfa: 1100, accompanimentFcfa: 7500, totalPriceFcfa: 14100, commissionFcfa: 2600, driverPayoutFcfa: 11500 },
  },

  // ── Le barème reçu est bien celui qui s'applique (une autre version, un autre prix) ──
  {
    name: 'Barème modifié — 10 km à 500 FCFA/km',
    // 1000 + 5000 (500 x 10) + 1000 (20 min à 50) = 7000 ; commission 18 % de 7000 = 1260 -> 1300
    out: q({ mode: 'METERED', distanceMeters: 10000 }, { ...tariff, meterPerKmFcfa: 500 }),
    expect: { distanceFareFcfa: 5000, totalPriceFcfa: 7000, commissionFcfa: 1300, driverPayoutFcfa: 5700 },
  },
  {
    name: 'Barème modifié — commission 25 %',
    // total 5500 ; commission 25 % = 1375 -> 1400
    out: q({ mode: 'METERED', distanceMeters: 10000 }, { ...tariff, commissionRate: 0.25 }),
    expect: { totalPriceFcfa: 5500, commissionFcfa: 1400, driverPayoutFcfa: 4100 },
  },
  {
    name: 'Barème modifié — minimum de course 3000 (1 km)',
    // 1 km : 1000 + 350 + 100 = 1450 < 3000 -> 3000 ; commission 18 % = 540 -> 600
    out: q({ mode: 'METERED', distanceMeters: 1000 }, { ...tariff, meterMinimumFareFcfa: 3000 }),
    expect: { fareCoreFcfa: 3000, totalPriceFcfa: 3000, commissionFcfa: 600, driverPayoutFcfa: 2400 },
  },
  {
    name: 'Barème modifié — vitesse moyenne 60 km/h (durée estimée : 10 min)',
    // 10 km à 60 km/h = 10 min = 500 ; 1000 + 3500 + 500 = 5000 ; commission 18 % = 900
    out: q({ mode: 'METERED', distanceMeters: 10000 }, { ...tariff, estimatedAvgSpeedKmh: 60 }),
    expect: { durationSeconds: 600, timeFareFcfa: 500, totalPriceFcfa: 5000, commissionFcfa: 900, driverPayoutFcfa: 4100 },
  },
  {
    name: 'Barème modifié — majorations, accompagnement et péage',
    // 5500 + péage 2000 + PMR 30 % (1650 -> 1700) + VIP 10 % (550 -> 600) + accompagnement 5000 = 14800
    out: q(
      { mode: 'METERED', distanceMeters: 10000, viaToll: true, needsWheelchairVehicle: true, withAccompaniment: true, serviceType: 'VIP_AIRPORT' },
      { ...tariff, autorouteTollFcfa: 2000, pmrVehicleSurchargeRate: 0.3, vipSurchargeRate: 0.1, defaultAccompanimentFeeFcfa: 5000 },
    ),
    expect: { tollFcfa: 2000, pmrSurchargeFcfa: 1700, vipSurchargeFcfa: 600, accompanimentFcfa: 5000, totalPriceFcfa: 14800 },
  },
  {
    name: 'Prix fixe (forfait) — la commission suit le barème, pas de majoration',
    out: q({ mode: 'FLAT', corridorFareFcfa: 10000, allInclusive: true, needsWheelchairVehicle: true }, { ...tariff, commissionRate: 0.2 }),
    expect: { totalPriceFcfa: 10000, pmrSurchargeFcfa: 0, commissionFcfa: 2000, driverPayoutFcfa: 8000 },
  },
  {
    name: 'Version du barème indiquée dans le devis',
    out: q({ mode: 'METERED', distanceMeters: 10000 }, { ...tariff, id: 'tv_3', version: 3 }),
    expect: { tariffVersion: 3 },
  },
];

let passed = 0;
for (const c of cases) {
  try {
    for (const [k, v] of Object.entries(c.expect)) {
      assert.equal((c.out as any)[k], v, `${c.name} -> ${k} attendu ${v}, obtenu ${(c.out as any)[k]}`);
    }
    console.log(`✅ ${c.name}  (total=${c.out.totalPriceFcfa}, commission=${c.out.commissionFcfa}, chauffeur=${c.out.driverPayoutFcfa})`);
    passed++;
  } catch (e) {
    console.error(`❌ ${(e as Error).message}`);
  }
}
console.log(`\n${passed}/${cases.length} tests réussis.`);
process.exit(passed === cases.length ? 0 : 1);
