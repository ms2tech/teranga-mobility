/**
 * Test du moteur de tarification hybride (`npm run test:pricing`).
 * Importe la VRAIE méthode computeQuote via une instance de PricingService.
 */
import assert from 'node:assert/strict';
import { PricingService, ComputeParams } from './pricing.service';

const config = {
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
// (prisma, maps, config) — computeQuote est pur, les deux premiers sont factices.
const service = new PricingService(null as any, null as any, config as any);
const q = (p: Partial<ComputeParams>) =>
  service.computeQuote({ serviceType: 'SENIOR', ...p } as ComputeParams);

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
