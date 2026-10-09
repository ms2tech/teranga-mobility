// src/tariffs/tariffs.service.ts
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma, ServiceType, TariffVersion } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { coded } from '../common/coded';
import { businessConfig } from '../config/business.config';
import { ComputeParams, TariffValues, computeQuote } from '../pricing/compute-quote';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTariffDto } from './dto/create-tariff.dto';
import { TARIFF_BOUNDS, TARIFF_KEYS } from './tariff-bounds';

/** Auteur d'une version : le nom seulement. */
const TARIFF_PEOPLE = { createdBy: { select: { fullName: true } } } satisfies Prisma.TariffVersionInclude;
export type TariffVersionWithAuthor = Prisma.TariffVersionGetPayload<{ include: typeof TARIFF_PEOPLE }>;

/**
 * Trajets types de l'aperçu « avant / après ». La durée est fixée pour chacun (même valeur
 * avant et après, indépendante de la vitesse moyenne) : seule la différence de tarif compte.
 */
type SampleParams = Omit<ComputeParams, 'mode' | 'serviceType'> & { serviceType?: ServiceType };

const SAMPLE_TRIPS: Array<{ label: string; params: SampleParams }> = [
  { label: 'Court trajet : 1 km, 4 min', params: { distanceMeters: 1_000, durationSeconds: 240 } },
  { label: '5 km, 12 min', params: { distanceMeters: 5_000, durationSeconds: 720 } },
  { label: '10 km, 22 min', params: { distanceMeters: 10_000, durationSeconds: 1_320 } },
  { label: '25 km, 45 min', params: { distanceMeters: 25_000, durationSeconds: 2_700 } },
  { label: '10 km, 22 min, avec péage autoroute', params: { distanceMeters: 10_000, durationSeconds: 1_320, viaToll: true } },
  {
    label: '10 km, 22 min, véhicule adapté PMR et accompagnement',
    params: { distanceMeters: 10_000, durationSeconds: 1_320, needsWheelchairVehicle: true, withAccompaniment: true },
  },
  { label: '25 km, 45 min, service VIP aéroport', params: { distanceMeters: 25_000, durationSeconds: 2_700, serviceType: 'VIP_AIRPORT' } },
];

export interface PreviewAmounts {
  totalFcfa: number;
  commissionFcfa: number;
  driverPayoutFcfa: number;
}

/**
 * Barème des trajets libres, en base et par version. Une version n'est jamais modifiée :
 * changer les tarifs crée la suivante (motif et auteur). Seules les NOUVELLES réservations
 * utilisent la nouvelle version ; le prix d'une réservation existante reste figé.
 */
@Injectable()
export class TariffsService implements OnModuleInit {
  private readonly logger = new Logger(TariffsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(businessConfig.KEY) private readonly env: ConfigType<typeof businessConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.current();
    } catch (err) {
      // Ne bloque pas le démarrage : current() réessaiera au premier devis.
      this.logger.error(`Version initiale du barème non créée : ${(err as Error).message}`);
    }
  }

  /**
   * Version courante (la plus haute). Si la table est vide (premier démarrage), crée la
   * version 1 depuis les valeurs du .env : c'est la seule fois où le .env est lu pour les tarifs.
   */
  async current(): Promise<TariffVersion> {
    const latest = await this.prisma.tariffVersion.findFirst({ orderBy: { version: 'desc' } });
    if (latest) return latest;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'tariff-version'}))`;
      const again = await tx.tariffVersion.findFirst({ orderBy: { version: 'desc' } });
      if (again) return again;

      const initial = this.valuesFromEnv();
      const outOfBounds = TARIFF_KEYS.filter((k) => initial[k] < TARIFF_BOUNDS[k].min || initial[k] > TARIFF_BOUNDS[k].max);
      if (outOfBounds.length > 0) {
        this.logger.warn(`Valeurs du .env hors des bornes habituelles : ${outOfBounds.join(', ')} (reprises telles quelles).`);
      }
      const created = await tx.tariffVersion.create({
        data: { version: 1, ...initial, reason: 'Valeurs initiales reprises du fichier .env' },
      });
      this.logger.log('Barème : version 1 créée depuis le .env. Le .env ne pilote plus les tarifs.');
      return created;
    });
  }

  /** Versions, de la plus récente à la plus ancienne (ADMIN). */
  history(limit = 100): Promise<TariffVersionWithAuthor[]> {
    return this.prisma.tariffVersion.findMany({
      orderBy: { version: 'desc' },
      take: limit,
      include: TARIFF_PEOPLE,
    });
  }

  async currentWithAuthor(): Promise<TariffVersionWithAuthor> {
    const { version } = await this.current();
    return this.prisma.tariffVersion.findUniqueOrThrow({ where: { version }, include: TARIFF_PEOPLE });
  }

  /** Nouvelle version (ADMIN). Refuse si les tarifs ont changé entre-temps ou s'il n'y a aucun changement. */
  async create(dto: CreateTariffDto, user: AuthUser): Promise<TariffVersionWithAuthor> {
    const values = this.pickValues(dto);
    this.checkCoherence(values);
    await this.current(); // garantit l'existence de la version 1

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verrou : deux admins qui enregistrent en même temps ne créent pas deux versions identiques.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'tariff-version'}))`;
      const latest = await tx.tariffVersion.findFirstOrThrow({ orderBy: { version: 'desc' } });
      if (latest.version !== dto.basedOnVersion) {
        throw coded(
          409,
          'TARIFF_VERSION_STALE',
          `Les tarifs ont été modifiés entre-temps (version ${latest.version}). Rechargez le panneau avant de recommencer.`,
          { currentVersion: latest.version },
        );
      }
      if (TARIFF_KEYS.every((k) => latest[k] === values[k])) {
        throw coded(400, 'NO_CHANGE', 'Aucun changement : ces valeurs sont déjà celles de la version courante.');
      }
      return tx.tariffVersion.create({
        data: { version: latest.version + 1, ...values, reason: dto.reason, createdById: user.id },
        include: TARIFF_PEOPLE,
      });
    });

    this.logger.log(`Barème : version ${created.version} créée — ${user.role} ${user.id}`);
    return created;
  }

  /** Aperçu avant / après sur des trajets types, calculé par le vrai moteur. Ne crée rien. */
  async preview(proposed: TariffValues) {
    const values = this.pickValues(proposed);
    this.checkCoherence(values);
    const current = await this.current();

    const amountsFor = (tariff: TariffValues, p: SampleParams): PreviewAmounts => {
      const q = computeQuote({ mode: 'METERED', serviceType: 'SENIOR', ...p }, tariff);
      return { totalFcfa: q.totalPriceFcfa, commissionFcfa: q.commissionFcfa, driverPayoutFcfa: q.driverPayoutFcfa };
    };

    return {
      basedOnVersion: current.version,
      trips: SAMPLE_TRIPS.map((t) => ({
        label: t.label,
        current: amountsFor(current, t.params),
        proposed: amountsFor(values, t.params),
      })),
    };
  }

  private pickValues(src: TariffValues): TariffValues {
    return Object.fromEntries(TARIFF_KEYS.map((k) => [k, src[k]])) as unknown as TariffValues;
  }

  /** Règle qui lie deux champs : un minimum de course inférieur à la prise en charge n'aurait pas de sens. */
  private checkCoherence(v: TariffValues): void {
    if (v.meterMinimumFareFcfa < v.meterBaseFareFcfa) {
      throw coded(
        400,
        'INCOHERENT_TARIFF',
        `Le minimum de course (${v.meterMinimumFareFcfa} FCFA) ne peut pas être inférieur à la prise en charge (${v.meterBaseFareFcfa} FCFA).`,
      );
    }
  }

  private valuesFromEnv(): TariffValues {
    const e = this.env;
    return {
      meterBaseFareFcfa: e.meterBaseFareFcfa,
      meterPerKmFcfa: e.meterPerKmFcfa,
      meterPerMinuteFcfa: e.meterPerMinuteFcfa,
      meterMinimumFareFcfa: e.meterMinimumFareFcfa,
      estimatedAvgSpeedKmh: e.estimatedAvgSpeedKmh,
      autorouteTollFcfa: e.autorouteTollFcfa,
      pmrVehicleSurchargeRate: e.pmrVehicleSurchargeRate,
      vipSurchargeRate: e.vipSurchargeRate,
      defaultAccompanimentFeeFcfa: e.defaultAccompanimentFeeFcfa,
      commissionRate: e.commissionRate,
    };
  }
}
