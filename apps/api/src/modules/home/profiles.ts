// Accueil par profil (lot 43, prototype DA v2 `s-home`) : les blocs propres à chaque profil de `GET /me/home`. Lecture
// seule des tables existantes (candidatures, billets, fiche pro, besoins des prestataires du lot 46, média du lot 45,
// passeport du lot 49). Aucune position de personne n'en sort : « les passionnés du coin » sont comptés par département.
import {
  type ArrivalSlot,
  distanceKm,
  type EventCard,
  type HomeLocation,
  type HomeMedia,
  type HomeNearbyMission,
  type HomeNextAccess,
  type HomeNextTicket,
  type HomeOrganizer,
  type HomePro,
  type HomeProvider,
  type MyApplication,
  seasonDates,
  seasonYear,
} from "@orasso/shared";
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  eventNeeds,
  eventPressSettings,
  events,
  mediaContents,
  mediaProfiles,
  mediaSavedEvents,
  passportStamps,
  proDailyStats,
  proDiscountUses,
  proFollows,
  profiles,
  proProfiles,
  providerProfiles,
  seasons,
  structures,
} from "../../db/schema";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { arrivalsOf } from "../events/arrivals";
import { eventPhotoUrl, eventPosterUrl } from "../events/card";
import { canSeeEvent } from "../invitations/access";
import { missionsService } from "../providers/missions";
import { ticketsService } from "../tickets/service";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Rayon des « événements près de l'atelier » d'un pro. */
const PRO_EVENTS_RADIUS_KM = 60;

type EventExtras = {
  organizer: HomeOrganizer | null;
  posterUrl: string | null;
  photoUrl: string | null;
  arrivals: ReturnType<typeof arrivalsOf>;
  location: HomeLocation;
};

/** Organisateur, affiche et créneaux d'arrivée de plusieurs événements, en une requête. */
export async function eventExtras(eventIds: readonly string[]): Promise<Map<string, EventExtras>> {
  const out = new Map<string, EventExtras>();
  if (!eventIds.length) return out;
  const rows = await db
    .select({ e: events, s: structures })
    .from(events)
    .innerJoin(structures, eq(structures.id, events.structureId))
    .where(inArray(events.id, [...eventIds]));
  for (const { e, s } of rows) {
    out.set(e.id, {
      organizer: { name: s.name, logoUrl: storage.url(s.logoKey), verified: s.verification === "verified" },
      posterUrl: eventPosterUrl(e),
      photoUrl: eventPhotoUrl(e),
      arrivals: arrivalsOf(e),
      location: { lat: e.lat, lng: e.lng, addressLine: e.addressLine, city: e.city },
    });
  }
  return out;
}

/** La candidature à mettre en tête de l'Accueil de l'exposant, avec l'arrivée, l'organisateur et l'affiche. */
export async function enrichNextAccess(app: MyApplication | null): Promise<HomeNextAccess | null> {
  if (!app) return null;
  const extra = (await eventExtras([app.event.id])).get(app.event.id);
  return {
    ...app,
    arrival: extra?.arrivals.exhibitors ?? app.arrival ?? null,
    organizer: extra?.organizer ?? null,
    posterUrl: extra?.posterUrl ?? null,
    photoUrl: extra?.photoUrl ?? null,
    location: extra?.location ?? null,
  };
}

/** Visiteur : le premier billet valable d'un événement qui n'est pas fini. */
export async function nextTicketOf(v: Viewer): Promise<HomeNextTicket | null> {
  const t = now();
  const mine = await ticketsService.mine(v);
  const next = mine.find((x) => x.status === "valid" && new Date(x.event.endsAt) > t);
  if (!next) return null;
  const [e] = await db.select({ id: events.id }).from(events).where(eq(events.slug, next.event.slug)).limit(1);
  const extra = e ? (await eventExtras([e.id])).get(e.id) : undefined;
  const arrival: ArrivalSlot | null = extra?.arrivals.public ?? null;
  return {
    id: next.id,
    name: next.name,
    priceCents: next.priceCents,
    event: {
      slug: next.event.slug,
      title: next.event.title,
      startsAt: next.event.startsAt,
      endsAt: next.event.endsAt,
      city: next.event.city,
    },
    arrival,
    organizer: extra?.organizer ?? null,
    posterUrl: extra?.posterUrl ?? null,
    photoUrl: extra?.photoUrl ?? null,
    location: extra?.location ?? null,
  };
}

/** Tampons de la saison en cours (lot 49). */
export async function stampsThisSeason(v: Viewer): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(passportStamps)
    .innerJoin(seasons, eq(seasons.id, passportStamps.seasonId))
    .where(and(eq(passportStamps.userId, v.user.id), eq(seasons.startsOn, seasonDates(seasonYear(now())).startsOn)));
  return row?.n ?? 0;
}

/** Pro : remises et vues de la semaine, événements proches avec leurs clients, passionnés du coin, derniers scans. */
export async function proBlock(v: Viewer): Promise<HomePro | null> {
  const t = now();
  const pro = await db.query.proProfiles.findFirst({
    where: and(eq(proProfiles.ownerUserId, v.user.id), isNull(proProfiles.deletedAt)),
  });
  if (!pro) return null;
  const weekAgo = new Date(t.getTime() - WEEK);
  const dayAgo = weekAgo.toISOString().slice(0, 10);

  const [uses, views, scans, favoritedBy, fans, upcoming] = await Promise.all([
    db
      .select({ n: count() })
      .from(proDiscountUses)
      .where(and(eq(proDiscountUses.proId, pro.id), gte(proDiscountUses.usedAt, weekAgo))),
    db
      .select({ n: sql<number>`coalesce(sum(${proDailyStats.views}), 0)::int` })
      .from(proDailyStats)
      .where(and(eq(proDailyStats.proId, pro.id), gte(proDailyStats.day, dayAgo))),
    db
      .select()
      .from(proDiscountUses)
      .where(eq(proDiscountUses.proId, pro.id))
      .orderBy(desc(proDiscountUses.usedAt))
      .limit(5),
    db
      .select({ n: count() })
      .from(proFollows)
      .where(and(eq(proFollows.proId, pro.id), eq(proFollows.favorite, true))),
    pro.department
      ? db
          .select({ n: count() })
          .from(profiles)
          .where(
            and(
              sql`${pro.department} = any(${profiles.departments})`,
              isNull(profiles.deletedAt),
              sql`${profiles.userId} <> ${v.user.id}`,
            ),
          )
      : Promise.resolve([{ n: 0 }]),
    db
      .select({ e: events })
      .from(events)
      .where(and(eq(events.status, "published"), gt(events.endsAt, t)))
      .orderBy(asc(events.startsAt))
      .limit(60),
  ]);

  // Événements près de l'atelier : par distance quand la fiche et l'événement ont des coordonnées, sinon même département.
  const candidates = upcoming
    .map((r) => r.e)
    .filter((e) => {
      if (pro.lat !== null && pro.lng !== null && e.lat !== null && e.lng !== null) {
        return distanceKm({ lat: pro.lat, lng: pro.lng }, { lat: e.lat, lng: e.lng }) <= PRO_EVENTS_RADIUS_KM;
      }
      return pro.department !== null && e.department === pro.department;
    });
  // Événement privé sur invitation : seuls ses ayants droit le voient (titre, affiche et photo comprises).
  const near: typeof candidates = [];
  for (const e of candidates) {
    if (near.length === 3) break;
    if (await canSeeEvent(e, v)) near.push(e);
  }
  const going = near.length
    ? await db
        .select({ eventId: applications.eventId, n: sql<number>`count(distinct ${applications.userId})::int` })
        .from(applications)
        .innerJoin(proFollows, and(eq(proFollows.userId, applications.userId), eq(proFollows.proId, pro.id)))
        .where(
          and(
            inArray(
              applications.eventId,
              near.map((e) => e.id),
            ),
            eq(applications.status, "accepted"),
          ),
        )
        .groupBy(applications.eventId)
    : [];
  const goingBy = new Map(going.map((g) => [g.eventId, g.n]));

  return {
    slug: pro.slug,
    name: pro.name,
    discountsThisWeek: uses[0]?.n ?? 0,
    profileViews: views[0]?.n ?? 0,
    nearbyEventsWithClients: near.map((e) => ({
      event: {
        id: e.id,
        slug: e.slug,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        city: e.city,
        posterUrl: eventPosterUrl(e),
        photoUrl: eventPhotoUrl(e),
      } satisfies Pick<EventCard, "id" | "slug" | "title" | "startsAt" | "city" | "posterUrl" | "photoUrl">,
      clientsGoing: goingBy.get(e.id) ?? 0,
    })),
    fansNearby: fans[0]?.n ?? 0,
    favoritedBy: favoritedBy[0]?.n ?? 0,
    lastScans: scans.map((s) => ({ grade: s.grade, percent: s.percent, usedAt: s.usedAt.toISOString() })),
  };
}

/** Prestataire : sa prochaine mission (retenue d'abord, sinon en cours) et les missions proches de son métier. */
export async function providerBlock(v: Viewer): Promise<HomeProvider | null> {
  const t = now();
  const profile = await db.query.providerProfiles.findFirst({
    where: and(eq(providerProfiles.userId, v.user.id), isNull(providerProfiles.deletedAt)),
  });
  if (!profile) return null;
  const rows = await db
    .select({ a: applications, e: events, need: eventNeeds })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .leftJoin(eventNeeds, eq(eventNeeds.id, applications.needId))
    .where(
      and(
        eq(applications.providerProfileId, profile.id),
        inArray(applications.status, ["accepted", "pending", "waitlisted", "offered"]),
        gt(events.endsAt, t),
      ),
    )
    .orderBy(asc(events.startsAt));
  const best = rows.find((r) => r.a.status === "accepted") ?? rows[0];
  let nextMission: HomeProvider["nextMission"] = null;
  if (best) {
    const extra = (await eventExtras([best.e.id])).get(best.e.id);
    nextMission = {
      applicationId: best.a.id,
      status: best.a.status as "accepted" | "pending" | "waitlisted" | "offered",
      event: {
        id: best.e.id,
        slug: best.e.slug,
        title: best.e.title,
        startsAt: best.e.startsAt.toISOString(),
        endsAt: best.e.endsAt.toISOString(),
        city: best.e.city,
      },
      trade: best.need?.trade ?? profile.type ?? null,
      spotLabel: best.a.spotLabel,
      installAt: best.need?.installAt?.toISOString() ?? null,
      organizerMessage: best.a.spotNote,
      organizer: extra?.organizer ?? null,
      posterUrl: extra?.posterUrl ?? null,
      photoUrl: extra?.photoUrl ?? null,
      location: extra?.location ?? null,
    };
  }
  // Missions proches : celles que la page « Missions » montrerait, sans celles où je suis déjà.
  let nearbyMissions: HomeNearbyMission[] = [];
  try {
    const found = await missionsService.missions(v, {});
    const mine = new Set(rows.map((r) => r.e.id));
    nearbyMissions = found.items
      .filter((m) => !mine.has(m.id))
      .slice(0, 3)
      .map((m) => ({
        slug: m.slug,
        title: m.title,
        startsAt: m.startsAt,
        city: m.city,
        distanceKm: m.distanceKm,
        structureName: m.structureName,
      }));
  } catch {
    nearbyMissions = [];
  }
  return { nextMission, nearbyMissions };
}

/** Média : reportage accrédité (ou demande en cours) le plus proche, consignes de l'organisateur, à couvrir, contenus. */
export async function mediaBlock(v: Viewer): Promise<HomeMedia | null> {
  const t = now();
  const profile = await db.query.mediaProfiles.findFirst({
    where: and(eq(mediaProfiles.userId, v.user.id), isNull(mediaProfiles.deletedAt)),
  });
  if (!profile) return null;
  const rows = await db
    .select({ a: applications, e: events })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .where(
      and(
        eq(applications.mediaProfileId, profile.id),
        inArray(applications.status, ["accepted", "pending", "waitlisted", "offered"]),
        gt(events.endsAt, t),
      ),
    )
    .orderBy(asc(events.startsAt));
  const best = rows.find((r) => r.a.status === "accepted") ?? rows[0];
  let nextReport: HomeMedia["nextReport"] = null;
  if (best) {
    const extra = (await eventExtras([best.e.id])).get(best.e.id);
    const press = await db.query.eventPressSettings.findFirst({ where: eq(eventPressSettings.eventId, best.e.id) });
    // Les consignes ne sortent que pour un média accrédité.
    const briefing =
      best.a.status === "accepted" && press
        ? { zones: press.zones, instructions: press.instructions, contact: press.contact }
        : null;
    nextReport = {
      applicationId: best.a.id,
      status: best.a.status as "accepted" | "pending" | "waitlisted" | "offered",
      event: {
        id: best.e.id,
        slug: best.e.slug,
        title: best.e.title,
        startsAt: best.e.startsAt.toISOString(),
        endsAt: best.e.endsAt.toISOString(),
        city: best.e.city,
      },
      formats: best.a.mediaFormats ?? [],
      briefing,
      organizer: extra?.organizer ?? null,
      posterUrl: extra?.posterUrl ?? null,
      photoUrl: extra?.photoUrl ?? null,
      location: extra?.location ?? null,
    };
  }
  const mine = new Set(rows.map((r) => r.e.id));
  const saved = await db
    .select({ e: events })
    .from(mediaSavedEvents)
    .innerJoin(events, eq(events.id, mediaSavedEvents.eventId))
    .where(and(eq(mediaSavedEvents.mediaProfileId, profile.id), eq(events.status, "published"), gt(events.endsAt, t)))
    .orderBy(asc(events.startsAt))
    .limit(8);
  const contents = await db
    .select({ c: mediaContents, eventTitle: events.title })
    .from(mediaContents)
    .innerJoin(events, eq(events.id, mediaContents.eventId))
    .where(and(eq(mediaContents.mediaProfileId, profile.id), isNull(mediaContents.deletedAt)))
    .orderBy(desc(mediaContents.publishedAt))
    .limit(3);
  return {
    name: profile.name,
    logoUrl: storage.url(profile.logoKey),
    nextReport,
    toCover: saved
      .filter((r) => !mine.has(r.e.id))
      .slice(0, 3)
      .map((r) => ({ slug: r.e.slug, title: r.e.title, startsAt: r.e.startsAt.toISOString(), city: r.e.city })),
    contents: contents.map((r) => ({
      id: r.c.id,
      title: r.c.title,
      eventTitle: r.eventTitle,
      views: r.c.views,
    })),
  };
}
