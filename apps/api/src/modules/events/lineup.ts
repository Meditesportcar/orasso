// Le plateau d'un événement (lot R4b, maquette R4 validée par Damien le 24/10/2026 ; règles : `rules/lineup.ts`).
// `GET /events/:id/lineup` : les voitures retenues avant la fin de l'événement, seulement les entrées pointées ensuite
// (les absents jamais montrés, même en nombre), et les pros sur place (prestataires retenus, médias accrédités).
// Vie privée : jamais d'heure, de zone, de créneau, de plaque ni de département ; jamais d'identifiant de compte ; un
// visiteur sans compte ne reçoit ni pseudo ni identifiant de véhicule. Chaque vignette est construite champ par champ
// (liste blanche), jamais par copie d'une ligne de la base.
import {
  type EventLineup,
  type Grade,
  LINEUP_PREVIEW_PHOTOS,
  type LineupCar,
  type LineupPreview,
  type LineupPro,
  type LineupQuery,
  lineupLabels,
  lineupPhase,
  proVisibility,
  providerTypeLabel,
  shownDiscount,
  type VendorTypeCode,
} from "@orasso/shared";
import { and, asc, desc, eq, exists, gt, inArray, isNull, lte, ne, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  categories,
  checkins,
  events,
  mediaProfiles,
  profiles,
  vehicleCategories,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { discountsByPro } from "../pros/explore";
import { loadProviders } from "../providers/serializers";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";

/** Compte en règle : ni supprimé, ni banni, ni suspendu (un compte suspendu sort du plateau). */
const accountOk = (t: Date) =>
  and(
    isNull(profiles.deletedAt),
    isNull(profiles.bannedAt),
    or(isNull(profiles.suspendedUntil), lte(profiles.suspendedUntil, t)),
  );

/** Entrée pointée (scan, pointage, express) de la candidature. */
const checkedIn = () =>
  exists(db.select({ one: sql`1` }).from(checkins).where(eq(checkins.applicationId, applications.id)));

/** Voitures du plateau : candidature de véhicule retenue, véhicule actif (un véhicule archivé n'est plus montré). */
const carBase = (t: Date) =>
  and(
    eq(applications.kind, "vehicle"),
    eq(applications.status, "accepted"),
    eq(vehicles.status, "active"),
    accountOk(t),
  ) as SQL;

/** Événement dont le plateau se montre : publié et non privé. Brouillon, privé, annulé ou supprimé : rien. */
async function visibleEvent(id: string) {
  const e = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!e || e.status !== "published" || e.admission === "invite_only") throw notFound("Plateau introuvable");
  return e;
}

const firstAt = sql`min(coalesce(${applications.decidedAt}, ${applications.createdAt}))`;

async function lineupPros(eventId: string, viewer: Viewer | null, t: Date): Promise<LineupPro[]> {
  const providerRows = await db
    .select({ providerId: applications.providerProfileId, accredited: applications.accreditedMedia })
    .from(applications)
    .innerJoin(profiles, eq(profiles.userId, applications.userId))
    .where(
      and(
        eq(applications.eventId, eventId),
        eq(applications.kind, "provider"),
        eq(applications.status, "accepted"),
        accountOk(t),
      ),
    )
    .orderBy(asc(applications.decidedAt), asc(applications.createdAt));
  const providers = await loadProviders(providerRows.flatMap((r) => (r.providerId ? [r.providerId] : [])));
  // Remise Orasso pour le grade de l'appelant (fiche pro publiée ; fiche de base : remises masquées) ; visiteur : aucune.
  const showDiscounts = viewer !== null && !proVisibility(null, null, t).hidden.discounts;
  const proIds = [...providers.values()].flatMap((p) => (p.proProfileId && p.proSlug ? [p.proProfileId] : []));
  const discounts = showDiscounts ? await discountsByPro(proIds) : new Map();
  const grade = viewer?.profile.grade as Grade | undefined;
  const out: LineupPro[] = [];
  const seen = new Set<string>();
  for (const r of providerRows) {
    const p = r.providerId ? providers.get(r.providerId) : undefined;
    if (!p || p.deletedAt || seen.has(p.id)) continue;
    seen.add(p.id);
    const d = grade && p.proProfileId && p.proSlug ? shownDiscount(discounts.get(p.proProfileId) ?? {}, grade) : null;
    out.push({
      id: p.id,
      kind: "provider",
      name: p.name,
      job: providerTypeLabel(p.type as VendorTypeCode, p.customType),
      logoUrl: storage.url(p.photos[0]?.storageKey ?? null),
      officialMedia: r.accredited,
      discount: d,
    });
  }
  const medias = await db
    .select({ id: mediaProfiles.id, name: mediaProfiles.name, logoKey: mediaProfiles.logoKey })
    .from(applications)
    .innerJoin(mediaProfiles, eq(mediaProfiles.id, applications.mediaProfileId))
    .innerJoin(profiles, eq(profiles.userId, applications.userId))
    .where(
      and(
        eq(applications.eventId, eventId),
        eq(applications.kind, "media"),
        eq(applications.status, "accepted"),
        isNull(mediaProfiles.deletedAt),
        accountOk(t),
      ),
    )
    .orderBy(asc(applications.decidedAt), asc(applications.createdAt));
  for (const m of medias) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({
      id: m.id,
      kind: "media",
      name: m.name,
      job: lineupLabels.mediaJob,
      logoUrl: storage.url(m.logoKey),
      officialMedia: true,
      discount: null,
    });
  }
  return out;
}

export const lineupService = {
  async get(eventId: string, viewer: Viewer | null, q: LineupQuery): Promise<EventLineup> {
    const e = await visibleEvent(eventId);
    const t = now();
    const phase = lineupPhase(e.endsAt, t);
    const base = and(eq(applications.eventId, e.id), carBase(t), phase === "present" ? checkedIn() : undefined) as SQL;
    const byCategory = q.category
      ? inArray(
          vehicles.id,
          db
            .select({ id: vehicleCategories.vehicleId })
            .from(vehicleCategories)
            .innerJoin(categories, eq(categories.id, vehicleCategories.categoryId))
            .where(eq(categories.slug, q.category)),
        )
      : undefined;
    const where = and(base, byCategory);
    const mine = viewer ? sql<boolean>`bool_or(${applications.userId} = ${viewer.user.id})` : sql<boolean>`false`;
    const cursor = q.cursor ?? 0;
    const rows = await db
      .select({ vehicleId: vehicles.id, pseudo: profiles.pseudo, visibility: profiles.visibility, mine })
      .from(applications)
      .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .where(where)
      .groupBy(vehicles.id, profiles.userId)
      // Ma voiture en tête, puis dans l'ordre des acceptations.
      .orderBy(...(viewer ? [desc(mine)] : []), asc(firstAt), asc(vehicles.id))
      .limit(q.limit + 1)
      .offset(cursor);
    const page = rows.slice(0, q.limit);
    const full = new Map((await vehiclesRepo.findFullByIds(page.map((r) => r.vehicleId))).map((v) => [v.id, v]));
    const cars: LineupCar[] = page.flatMap((r) => {
      const v = full.get(r.vehicleId);
      if (!v) return [];
      const shown = {
        photoUrl: storage.url(v.photos[0]?.storageKey ?? null),
        label: vehicleLabel(v),
        makeName: v.make.name,
        modelName: v.model.name,
        generationName: v.generation && !v.generation.isOther ? v.generation.name : null,
      };
      if (!viewer) return [shown];
      return [
        {
          ...shown,
          vehicleId: v.id,
          pseudo: r.pseudo,
          private: !r.mine && r.visibility === "private",
          me: Boolean(r.mine),
        },
      ];
    });
    const countOf = async (w: SQL | undefined) => {
      const [row] = await db
        .select({ n: sql<number>`count(distinct ${vehicles.id})::int` })
        .from(applications)
        .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
        .innerJoin(profiles, eq(profiles.userId, applications.userId))
        .where(w);
      return row?.n ?? 0;
    };
    const total = await countOf(base);
    const filtered = q.category ? await countOf(where) : total;
    const facets = await db
      .select({
        slug: categories.slug,
        label: categories.label,
        count: sql<number>`count(distinct ${vehicles.id})::int`,
      })
      .from(applications)
      .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .innerJoin(vehicleCategories, eq(vehicleCategories.vehicleId, vehicles.id))
      .innerJoin(categories, and(eq(categories.id, vehicleCategories.categoryId), eq(categories.active, true)))
      .where(base)
      .groupBy(categories.id)
      .orderBy(asc(categories.position), asc(categories.label));
    const pros = await lineupPros(e.id, viewer, t);
    return {
      eventId: e.id,
      phase,
      cars,
      pros,
      counts: { cars: total, pros: pros.length },
      filtered,
      categories: facets.map((f) => ({ slug: f.slug, label: f.label, count: f.count })),
      nextCursor: rows.length > q.limit ? cursor + q.limit : null,
    };
  },

  /**
   * La ligne « Le plateau » des tickets de Mes sorties, pour toutes les sorties d'un coup (pas une requête par ticket) :
   * le nombre de voitures et trois mini-photos (d'abord celles des autres, les dernières acceptées).
   */
  async previews(eventIds: string[], viewerId: string): Promise<Map<string, LineupPreview>> {
    const out = new Map<string, LineupPreview>();
    const ids = [...new Set(eventIds)];
    if (!ids.length) return out;
    const t = now();
    const rows = await db
      .select({
        eventId: applications.eventId,
        endsAt: events.endsAt,
        vehicleId: vehicles.id,
        mine: sql<boolean>`bool_or(${applications.userId} = ${viewerId})`,
        at: sql<number>`extract(epoch from ${firstAt})::float8`,
        photoKey: sql<
          string | null
        >`(select ${vehiclePhotos.storageKey} from ${vehiclePhotos} where ${vehiclePhotos.vehicleId} = ${vehicles.id} order by ${vehiclePhotos.position} limit 1)`,
      })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .where(
        and(
          inArray(applications.eventId, ids),
          carBase(t),
          eq(events.status, "published"),
          ne(events.admission, "invite_only"),
          // Même phase que le plateau : après la fin, seulement les entrées pointées.
          or(gt(events.endsAt, t), checkedIn()),
        ),
      )
      .groupBy(applications.eventId, events.endsAt, vehicles.id);
    const byEvent = new Map<string, typeof rows>();
    for (const r of rows) byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
    for (const [eventId, list] of byEvent) {
      const sorted = [...list].sort((a, b) => Number(a.mine) - Number(b.mine) || b.at - a.at);
      out.set(eventId, {
        phase: lineupPhase(list[0]?.endsAt ?? t, t),
        count: list.length,
        photoUrls: sorted
          .flatMap((r) => (r.photoKey ? [storage.url(r.photoKey) ?? ""] : []))
          .filter(Boolean)
          .slice(0, LINEUP_PREVIEW_PHOTOS),
      });
    }
    return out;
  },

  /** Canal `event:{id}:lineup` : toute personne connectée, si le plateau de l'événement se montre. */
  async canSubscribe(channel: string): Promise<boolean> {
    const id = /^event:([0-9a-f-]{36}):lineup$/.exec(channel)?.[1];
    if (!id) return false;
    return visibleEvent(id).then(
      () => true,
      () => false,
    );
  },

  /** Une acceptation, un retrait, une place reprise : l'appli relit le plateau (aucune donnée dans le message). */
  changed(eventId: string) {
    realtime.publish(`event:${eventId}:lineup`, "lineup.changed", { eventId });
  },
};
