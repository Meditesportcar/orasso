// Les souvenirs (lot R7j, ARCHITECTURE-R7 § 2.9, maquette R7.10) : « il y a un an, tu étais à… ».
// Un souvenir est calculé, jamais stocké : les tampons `participation` / `visit` de la personne dont le jour local (Paris) est
// celui d'aujourd'hui il y a 1, 2, 3… ans (règle pure `rules/memories.ts`). Il ne sert qu'à la personne concernée : chaque
// lecture part de son identifiant (jamais d'un identifiant reçu), et la page d'un souvenir répond 404 à qui n'a pas le tampon.
// La photo suit la règle du plateau : une photo de MA voiture à cet événement, plaque floutée ou « aucune plaque » confirmée
// (`maskedPhoto`), sinon l'affiche. La tâche `memories.daily` prévient à 10 h, au plus une fois par personne et par jour.
import {
  BUSINESS_TIMEZONE,
  type MemoryDetail,
  type MemoryItem,
  maskedPhoto,
  memoryCanCreate,
  memoryDayKeys,
  memoryDayStamp,
  memoryDeliverAt,
  memoryLabels,
  memoryStampKinds,
  memoryYearsAgo,
  memoryYearsSince,
  shouldDeliver,
} from "@orasso/shared";
import { and, eq, exists, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  checkins,
  events,
  notifications,
  passportStamps,
  profiles,
  tickets,
  vehicles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import { storage } from "../../lib/storage";
import { type Executor, withTx } from "../../lib/tx";
import { eventPosterUrl } from "../events/card";
import { notificationsService } from "../notifications/service";
import { serialize as serializeStamp } from "../passport/service";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";

type Hit = {
  stamp: typeof passportStamps.$inferSelect;
  stampId: string;
  kind: (typeof memoryStampKinds)[number];
  stampedAt: Date;
  event: typeof events.$inferSelect;
};

/** Compte en règle : ni supprimé, ni banni, ni suspendu. */
const accountOk = (t: Date) =>
  and(
    isNull(profiles.deletedAt),
    isNull(profiles.bannedAt),
    or(isNull(profiles.suspendedUntil), lte(profiles.suspendedUntil, t)),
  );

/** « MM-JJ » du jour local d'un tampon, lu par la base (préfiltre : `memoryYearsAgo` tranche ensuite). */
const stampDayKey = sql<string>`to_char(${passportStamps.stampedAt} at time zone ${BUSINESS_TIMEZONE}, 'MM-DD')`;

/** Un tampon par événement : la participation d'abord, puis la visite. */
function pickOne(hits: Hit[]): Hit[] {
  const byEvent = new Map<string, Hit>();
  for (const h of hits) {
    const kept = byEvent.get(h.event.id);
    if (!kept || (kept.kind === "visit" && h.kind === "participation")) byEvent.set(h.event.id, h);
  }
  return [...byEvent.values()];
}

const toHits = (rows: { s: typeof passportStamps.$inferSelect; e: typeof events.$inferSelect }[]): Hit[] =>
  pickOne(
    rows.map((r) => ({
      stamp: r.s,
      stampId: r.s.id,
      kind: r.s.kind as Hit["kind"],
      stampedAt: r.s.stampedAt,
      event: r.e,
    })),
  );

/** Les tampons de souvenir de la personne dont le jour local est celui de `at`, avec leur nombre d'années. */
async function hitsToday(ex: Executor, userId: string, at: Date): Promise<(Hit & { years: number })[]> {
  const rows = await ex
    .select({ s: passportStamps, e: events })
    .from(passportStamps)
    .innerJoin(events, eq(events.id, passportStamps.eventId))
    .where(
      and(
        eq(passportStamps.userId, userId),
        inArray(passportStamps.kind, [...memoryStampKinds]),
        eq(events.status, "published"),
        ne(events.admission, "invite_only"),
        inArray(stampDayKey, memoryDayKeys(at)),
      ),
    );
  return toHits(rows).flatMap((h) => {
    const years = memoryYearsAgo(h.stampedAt, at);
    return years === null ? [] : [{ ...h, years }];
  });
}

/**
 * Photo de ma voiture à l'événement, par événement : ma candidature de véhicule retenue, mon véhicule encore à moi et actif
 * (un véhicule archivé ou cédé n'est plus montré, comme sur le plateau), une photo montrable seulement (`maskedPhoto`).
 */
async function carsOf(ex: Executor, userId: string, eventIds: string[]) {
  const out = new Map<string, { photoUrl: string | null; label: string | null; vehicleId: string }>();
  if (!eventIds.length) return out;
  const apps = await ex
    .select({ eventId: applications.eventId, vehicleId: applications.vehicleId })
    .from(applications)
    .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.kind, "vehicle"),
        eq(applications.status, "accepted"),
        inArray(applications.eventId, eventIds),
        eq(vehicles.ownerId, userId),
        eq(vehicles.status, "active"),
      ),
    )
    .orderBy(applications.decidedAt, applications.createdAt);
  const firstByEvent = new Map<string, string>();
  for (const a of apps) if (a.vehicleId && !firstByEvent.has(a.eventId)) firstByEvent.set(a.eventId, a.vehicleId);
  const full = new Map(
    (await vehiclesRepo.findFullByIds([...new Set(firstByEvent.values())], ex)).map((v) => [v.id, v]),
  );
  for (const [eventId, vehicleId] of firstByEvent) {
    const v = full.get(vehicleId);
    if (!v) continue;
    const photo = maskedPhoto(v.photos, v.unregistered);
    // Sans photo montrable, pas de photo (l'affiche prend le relais) ; le nom de la voiture, lui, reste dit.
    out.set(eventId, { photoUrl: storage.url(photo?.storageKey ?? null), label: vehicleLabel(v), vehicleId });
  }
  return out;
}

/**
 * Numéro de ma voiture sur le plateau de l'événement (ordre d'acceptation, comme le plateau) et nombre de voitures du
 * plateau. Le plateau d'un événement fini ne garde que les entrées pointées ; une voiture absente du plateau n'a pas de numéro.
 */
async function plateauRanks(
  ex: Executor,
  eventIds: string[],
  mine: Map<string, string>,
  at: Date,
): Promise<Map<string, { rank: number; total: number }>> {
  const out = new Map<string, { rank: number; total: number }>();
  if (!eventIds.length) return out;
  const rows = await ex
    .select({
      eventId: applications.eventId,
      vehicleId: vehicles.id,
      at: sql<number>`extract(epoch from min(coalesce(${applications.decidedAt}, ${applications.createdAt})))::float8`,
    })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
    .innerJoin(profiles, eq(profiles.userId, applications.userId))
    .where(
      and(
        inArray(applications.eventId, eventIds),
        eq(applications.kind, "vehicle"),
        eq(applications.status, "accepted"),
        eq(vehicles.status, "active"),
        accountOk(at),
        or(
          sql`${events.endsAt} > ${at}`,
          exists(ex.select({ one: sql`1` }).from(checkins).where(eq(checkins.applicationId, applications.id))),
        ),
      ),
    )
    .groupBy(applications.eventId, vehicles.id);
  const byEvent = new Map<string, { vehicleId: string; at: number }[]>();
  for (const r of rows)
    byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), { vehicleId: r.vehicleId, at: r.at }]);
  for (const [eventId, list] of byEvent) {
    const mineId = mine.get(eventId);
    if (!mineId) continue;
    list.sort((a, b) => a.at - b.at || (a.vehicleId < b.vehicleId ? -1 : 1));
    const index = list.findIndex((v) => v.vehicleId === mineId);
    if (index >= 0) out.set(eventId, { rank: index + 1, total: list.length });
  }
  return out;
}

/** Événements (parmi `eventIds`) dont le récap est ouvert à la personne : fini, et pointée (véhicule) ou billet contrôlé. */
async function recapsOf(ex: Executor, userId: string, eventIds: string[], at: Date): Promise<Set<string>> {
  if (!eventIds.length) return new Set();
  const entered = await ex
    .selectDistinct({ id: checkins.eventId })
    .from(checkins)
    .innerJoin(applications, eq(applications.id, checkins.applicationId))
    .where(and(inArray(checkins.eventId, eventIds), eq(applications.userId, userId), eq(applications.kind, "vehicle")));
  const scanned = await ex
    .selectDistinct({ id: tickets.eventId })
    .from(tickets)
    .where(and(inArray(tickets.eventId, eventIds), eq(tickets.userId, userId), isNotNull(tickets.usedAt)));
  const ended = await ex
    .select({ id: events.id })
    .from(events)
    .where(and(inArray(events.id, eventIds), eq(events.status, "published"), lte(events.endsAt, at)));
  const was = new Set([...entered, ...scanned].map((r) => r.id));
  return new Set(ended.filter((e) => was.has(e.id)).map((e) => e.id));
}

async function toItems(ex: Executor, userId: string, hits: (Hit & { years: number })[], at: Date) {
  const ids = hits.map((h) => h.event.id);
  const [cars, recaps] = await Promise.all([carsOf(ex, userId, ids), recapsOf(ex, userId, ids, at)]);
  const ranks = await plateauRanks(ex, ids, new Map([...cars].map(([id, c]) => [id, c.vehicleId])), at);
  const items = hits.map(
    (h): MemoryItem => ({
      eventId: h.event.id,
      slug: h.event.slug,
      title: h.event.title,
      city: h.event.city,
      startsAt: h.event.startsAt.toISOString(),
      yearsAgo: h.years,
      posterUrl: eventPosterUrl(h.event),
      photoUrl: cars.get(h.event.id)?.photoUrl ?? null,
      stampId: h.stampId,
      stamp: serializeStamp(h.stamp, h.event),
      car: (() => {
        const car = cars.get(h.event.id);
        const rank = ranks.get(h.event.id);
        return car?.label && rank ? { label: car.label, ...rank } : null;
      })(),
      recapAvailable: recaps.has(h.event.id),
    }),
  );
  return { items, labels: new Map(ids.map((id) => [id, cars.get(id)?.label ?? null])) };
}

/** Les souvenirs du jour : le plus récent d'abord (1 an avant 2 ans), puis par titre : l'ordre est le même partout. */
const byRecency = (a: MemoryItem, b: MemoryItem) => a.yearsAgo - b.yearsAgo || a.title.localeCompare(b.title, "fr");

export const memoriesService = {
  /** Les souvenirs d'aujourd'hui pour cette personne (`at` : l'instant, par défaut l'horloge de l'API). */
  async todayFor(userId: string, at: Date = now(), ex: Executor = db): Promise<MemoryItem[]> {
    const hits = await hitsToday(ex, userId, at);
    if (!hits.length) return [];
    const { items } = await toItems(ex, userId, hits, at);
    return items.sort(byRecency);
  },

  /**
   * La page d'un souvenir : seulement pour qui a un tampon `participation` / `visit` de cet événement, publié, vieux d'au
   * moins un an (avant, ce n'est pas un souvenir). Sinon 404, comme un événement inconnu.
   */
  async detail(userId: string, eventId: string, at: Date = now()): Promise<MemoryDetail> {
    const rows = await db
      .select({ s: passportStamps, e: events })
      .from(passportStamps)
      .innerJoin(events, eq(events.id, passportStamps.eventId))
      .where(
        and(
          eq(passportStamps.userId, userId),
          eq(passportStamps.eventId, eventId),
          inArray(passportStamps.kind, [...memoryStampKinds]),
          eq(events.status, "published"),
          ne(events.admission, "invite_only"),
        ),
      );
    const [hit] = toHits(rows);
    const years = hit ? memoryYearsSince(hit.stampedAt, at) : 0;
    if (!hit || years < 1) throw notFound(memoryLabels.unavailable);
    const { items, labels } = await toItems(db, userId, [{ ...hit, years }], at);
    const item = items[0];
    if (!item) throw notFound(memoryLabels.unavailable);
    return {
      ...item,
      anniversary: memoryYearsAgo(hit.stampedAt, at) !== null,
      vehicleLabel: labels.get(eventId) ?? null,
    };
  },

  /**
   * Tâche `memories.daily` (chaque jour à 9 h, Paris, jamais à 22 h ou après) : une notification `memory` par personne concernée, livrée à 10 h
   * (jamais pendant les heures calmes), pour le souvenir le plus récent du jour (« + 1 autre » s'il y en a d'autres : le
   * bloc de l'Accueil les montre tous). Seulement si la famille « social » n'est pas coupée. Rejouée, elle ne prévient
   * personne deux fois : une personne n'a qu'une notification `memory` par jour local, donc un événement n'en a qu'une par
   * personne et par jour. Rend le nombre de notifications créées.
   */
  async daily(at: Date = now()): Promise<number> {
    // Passé 22 h locales, la livraison tomberait le lendemain (heures calmes), qui n'est plus l'anniversaire : rien.
    if (!memoryCanCreate(at)) return 0;
    const candidates = await db
      .selectDistinct({ userId: passportStamps.userId })
      .from(passportStamps)
      .innerJoin(events, eq(events.id, passportStamps.eventId))
      .innerJoin(profiles, eq(profiles.userId, passportStamps.userId))
      .where(
        and(
          inArray(passportStamps.kind, [...memoryStampKinds]),
          eq(events.status, "published"),
          ne(events.admission, "invite_only"),
          inArray(stampDayKey, memoryDayKeys(at)),
          accountOk(at),
        ),
      );
    const day = memoryDayStamp(at);
    let created = 0;
    for (const { userId } of candidates) {
      try {
        const made = await withTx(async (tx, after) => {
          // Deux passages simultanés (deux workers, rejeu) : verrou par personne, puis relecture de ce qui est déjà parti.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`memory:${userId}`}))`);
          const [profile] = await tx
            .select()
            .from(profiles)
            .where(and(eq(profiles.userId, userId), accountOk(at)));
          if (!profile || !shouldDeliver(profile.notificationPrefs, profile.mutedTypes, "memory")) return false;
          const sent = await tx
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, userId),
                eq(notifications.type, "memory"),
                sql`${notifications.data} ->> 'day' = ${day}`,
              ),
            )
            .limit(1);
          if (sent.length) return false;
          const items = await memoriesService.todayFor(userId, at, tx);
          const first = items[0];
          if (!first) return false;
          const others = items.length - 1;
          const more = others > 0 ? ` (+ ${others} autre${others > 1 ? "s" : ""})` : "";
          const row = await notificationsService.notify(tx, userId, "memory", {
            title: memoryLabels.notificationTitle,
            body: memoryLabels.notificationBody(first.yearsAgo, first.title) + more,
            eventId: first.eventId,
            data: { eventId: first.eventId, day, screen: "memory" },
            link: { label: memoryLabels.see, path: `/app/souvenir/${first.eventId}` },
          });
          // 10 h locales : jamais avant, et jamais avant l'échéance que les heures calmes imposent déjà.
          const target = memoryDeliverAt(at);
          if (row.deliverAfter < target) {
            await tx.update(notifications).set({ deliverAfter: target }).where(eq(notifications.id, row.id));
          }
          after(() => notificationsService.kick());
          return true;
        });
        if (made) created++;
      } catch (error) {
        // Une personne en échec ne bloque pas les autres ; la tâche du lendemain reprend la suivante.
        console.error("Souvenir non notifié :", error);
      }
    }
    return created;
  },
};
