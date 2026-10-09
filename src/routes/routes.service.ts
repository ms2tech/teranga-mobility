import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Route, RouteChangeKind } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { coded } from '../common/coded';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { RouteStateDto } from './dto/route-state.dto';
import { UpdateRouteDto } from './dto/update-route.dto';

/** Auteur d'un changement : le nom seulement. */
const CHANGE_PEOPLE = { changedBy: { select: { fullName: true } } } satisfies Prisma.RouteChangeInclude;
export type RouteChangeWithAuthor = Prisma.RouteChangeGetPayload<{ include: typeof CHANGE_PEOPLE }>;

type RouteValues = Pick<Route, 'basePriceFcfa' | 'priceMinFcfa' | 'priceMaxFcfa' | 'estimatedDurationMin'>;

/**
 * Corridors à prix fixe. Seul un ADMIN les crée ou les modifie, avec un motif ; chaque
 * changement ajoute une ligne RouteChange (anciennes et nouvelles valeurs, auteur, date),
 * jamais modifiée. Un corridor n'est jamais supprimé : on le désactive. Les prix des
 * réservations existantes restent figés (ils sont copiés dans la réservation).
 */
@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAllActive(): Promise<Route[]> {
    return this.prisma.route.findMany({
      where: { isActive: true },
      orderBy: { city: 'asc' },
    });
  }

  /** Tous les corridors, désactivés compris (ADMIN). */
  findAllForAdmin(): Promise<Route[]> {
    return this.prisma.route.findMany({ orderBy: [{ isActive: 'desc' }, { city: 'asc' }, { label: 'asc' }] });
  }

  /** Historique d'un corridor, du plus récent au plus ancien (ADMIN). */
  async history(routeId: string): Promise<RouteChangeWithAuthor[]> {
    const route = await this.prisma.route.findUnique({ where: { id: routeId }, select: { id: true } });
    if (!route) throw new NotFoundException(`Corridor introuvable : ${routeId}`);
    return this.prisma.routeChange.findMany({
      where: { routeId },
      orderBy: [{ changedAt: 'desc' }, { version: 'desc' }],
      include: CHANGE_PEOPLE,
    });
  }

  async create(dto: CreateRouteDto, user: AuthUser): Promise<Route> {
    this.checkCoherence(dto);

    const route = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verrou : deux admins qui créent le même code en même temps ne passent pas tous les deux.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'route-code:' + dto.code}))`;
      if (await tx.route.findUnique({ where: { code: dto.code }, select: { id: true } })) {
        throw coded(409, 'ROUTE_CODE_TAKEN', `Le code ${dto.code} existe déjà (un corridor désactivé garde son code : réactivez-le).`);
      }
      const created = await tx.route.create({
        data: {
          code: dto.code, label: dto.label, city: dto.city,
          basePriceFcfa: dto.basePriceFcfa, priceMinFcfa: dto.priceMinFcfa, priceMaxFcfa: dto.priceMaxFcfa,
          estimatedDurationMin: dto.estimatedDurationMin, isActive: true, version: 1,
        },
      });
      await tx.routeChange.create({
        data: {
          routeId: created.id, kind: RouteChangeKind.CREATED, version: 1,
          basePriceFcfa: created.basePriceFcfa, priceMinFcfa: created.priceMinFcfa, priceMaxFcfa: created.priceMaxFcfa,
          estimatedDurationMin: created.estimatedDurationMin, isActive: true,
          reason: dto.reason, changedById: user.id,
        },
      });
      return created;
    });

    this.logger.log(`Corridor ${route.code} créé — ${user.role} ${user.id}`);
    return route;
  }

  /** Nouveaux prix et durée (toutes les valeurs). Refuse une version périmée et l'absence de changement. */
  async update(id: string, dto: UpdateRouteDto, user: AuthUser): Promise<Route> {
    this.checkCoherence(dto);
    const updated = await this.change(id, dto.basedOnVersion, user, dto.reason, (route) => {
      if (
        route.basePriceFcfa === dto.basePriceFcfa && route.priceMinFcfa === dto.priceMinFcfa &&
        route.priceMaxFcfa === dto.priceMaxFcfa && route.estimatedDurationMin === dto.estimatedDurationMin
      ) {
        throw coded(400, 'NO_CHANGE', 'Aucun changement : ces valeurs sont déjà celles du corridor.');
      }
      return { kind: RouteChangeKind.UPDATED, next: { ...dto, isActive: route.isActive } };
    });
    this.logger.log(`Corridor ${updated.code} modifié (version ${updated.version}) — ${user.role} ${user.id}`);
    return updated;
  }

  /** Désactive (jamais de suppression : des réservations y font référence) ou réactive un corridor. */
  async setActive(id: string, active: boolean, dto: RouteStateDto, user: AuthUser): Promise<Route> {
    const updated = await this.change(id, dto.basedOnVersion, user, dto.reason, (route) => {
      if (route.isActive === active) {
        throw coded(409, 'ROUTE_STATE_UNCHANGED', active ? 'Ce corridor est déjà actif.' : 'Ce corridor est déjà désactivé.');
      }
      return { kind: active ? RouteChangeKind.REACTIVATED : RouteChangeKind.DEACTIVATED, next: { ...route, isActive: active } };
    });
    this.logger.log(`Corridor ${updated.code} ${active ? 'réactivé' : 'désactivé'} — ${user.role} ${user.id}`);
    return updated;
  }

  /**
   * Un changement = la ligne du corridor mise à jour (version + 1) ET une ligne d'historique,
   * dans la même transaction, sous verrou. `decide` choisit le type de changement et les
   * nouvelles valeurs (ou refuse).
   */
  private async change(
    id: string,
    basedOnVersion: number,
    user: AuthUser,
    reason: string,
    decide: (route: Route) => { kind: RouteChangeKind; next: RouteValues & { isActive: boolean } },
  ): Promise<Route> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'route:' + id}))`;
      const route = await tx.route.findUnique({ where: { id } });
      if (!route) throw new NotFoundException(`Corridor introuvable : ${id}`);
      if (route.version !== basedOnVersion) {
        throw coded(
          409,
          'ROUTE_VERSION_STALE',
          `Ce corridor a été modifié entre-temps (version ${route.version}). Rechargez la liste avant de recommencer.`,
          { currentVersion: route.version },
        );
      }
      const { kind, next } = decide(route);
      const updated = await tx.route.update({
        where: { id },
        data: {
          basePriceFcfa: next.basePriceFcfa, priceMinFcfa: next.priceMinFcfa, priceMaxFcfa: next.priceMaxFcfa,
          estimatedDurationMin: next.estimatedDurationMin, isActive: next.isActive, version: { increment: 1 },
        },
      });
      await tx.routeChange.create({
        data: {
          routeId: id, kind, version: updated.version,
          oldBasePriceFcfa: route.basePriceFcfa, oldPriceMinFcfa: route.priceMinFcfa, oldPriceMaxFcfa: route.priceMaxFcfa,
          oldEstimatedDurationMin: route.estimatedDurationMin, oldIsActive: route.isActive,
          basePriceFcfa: updated.basePriceFcfa, priceMinFcfa: updated.priceMinFcfa, priceMaxFcfa: updated.priceMaxFcfa,
          estimatedDurationMin: updated.estimatedDurationMin, isActive: updated.isActive,
          reason, changedById: user.id,
        },
      });
      return updated;
    });
  }

  /** Le prix de base reste dans la fourchette indicative, dont les bornes sont ordonnées. */
  private checkCoherence(v: { basePriceFcfa: number; priceMinFcfa: number; priceMaxFcfa: number }): void {
    if (v.priceMinFcfa > v.priceMaxFcfa) {
      throw coded(400, 'INCOHERENT_ROUTE_PRICES', `Le prix minimum (${v.priceMinFcfa} FCFA) ne peut pas dépasser le prix maximum (${v.priceMaxFcfa} FCFA).`);
    }
    if (v.basePriceFcfa < v.priceMinFcfa || v.basePriceFcfa > v.priceMaxFcfa) {
      throw coded(
        400,
        'INCOHERENT_ROUTE_PRICES',
        `Le prix de base (${v.basePriceFcfa} FCFA) doit rester entre le minimum (${v.priceMinFcfa} FCFA) et le maximum (${v.priceMaxFcfa} FCFA).`,
      );
    }
  }
}
