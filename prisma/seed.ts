import { PrismaClient, UserRole, VehicleType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Axes desservis et tarifs de référence (FCFA).
 * NB : Saly n'avait pas de prix indiqué — estimation à valider.
 */
const ROUTES = [
  { code: 'DKR-AIBD', city: 'Dakar', label: 'Dakar <-> AIBD', basePriceFcfa: 22000, priceMinFcfa: 20000, priceMaxFcfa: 25000, estimatedDurationMin: 75 },
  { code: 'THS-AIBD', city: 'Thiès', label: 'Thiès <-> AIBD', basePriceFcfa: 17500, priceMinFcfa: 15000, priceMaxFcfa: 20000, estimatedDurationMin: 60 },
  { code: 'TBA-AIBD', city: 'Touba', label: 'Touba <-> AIBD', basePriceFcfa: 40000, priceMinFcfa: 35000, priceMaxFcfa: 45000, estimatedDurationMin: 150 },
  { code: 'MBR-AIBD', city: 'Mbour', label: 'Mbour <-> AIBD', basePriceFcfa: 15000, priceMinFcfa: 12000, priceMaxFcfa: 18000, estimatedDurationMin: 45 },
  { code: 'SLY-AIBD', city: 'Saly', label: 'Saly <-> AIBD', basePriceFcfa: 18000, priceMinFcfa: 15000, priceMaxFcfa: 20000, estimatedDurationMin: 50 },
];

async function main(): Promise<void> {
  for (const r of ROUTES) {
    await prisma.route.upsert({ where: { code: r.code }, update: r, create: r });
  }
  console.log(`✅ ${ROUTES.length} axes créés/à jour`);

  const admin = await prisma.user.upsert({
    where: { phone: '+221770000001' },
    update: {},
    create: { phone: '+221770000001', fullName: 'Admin Téranga', role: UserRole.ADMIN },
  });
  await prisma.user.upsert({
    where: { phone: '+221770000002' },
    update: {},
    create: { phone: '+221770000002', fullName: 'Opérateur Centrale', role: UserRole.OPERATOR },
  });

  const driverUser = await prisma.user.upsert({
    where: { phone: '+221770000010' },
    update: {},
    create: { phone: '+221770000010', fullName: 'Moussa Diop', role: UserRole.DRIVER },
  });
  const driver = await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: {},
    create: { userId: driverUser.id, status: 'ACTIVE', firstAidCertified: true, payoutWavePhone: '+221770000010' },
  });
  await prisma.vehicle.upsert({
    where: { registration: 'DK-1234-AB' },
    update: {},
    create: { registration: 'DK-1234-AB', type: VehicleType.MINIVAN, model: 'Toyota HiAce (adapté PMR)', seats: 6, wheelchairAccessible: true, hasAirConditioning: true, driverId: driver.id },
  });

  console.log(`✅ Personnel + 1 chauffeur partenaire (admin: ${admin.fullName})`);
  console.log('🎉 Seed terminé.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
