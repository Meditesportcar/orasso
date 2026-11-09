// Seed du 08/11 : un événement EN DIRECT pour essayer le « live » côté passionné avec Damien_66 (demande de Damien :
// « un event actif sur plusieurs jours où Damien_66 est inscrit et validé, participe et est déjà sur place »).
// « Rassemblement du Lydia » (Roues Libres 66, organisatrice Sarah_66 : Damien n'y a aucune casquette et le vit en
// passionné), au pied du Lydia, au Barcarès : 4 jours, commencé la veille, fini dans deux jours, 9 h – 23 h.
// Tout passe par les vrais services, l'horloge simulée remontant le temps (`deps.clock`) : création en brouillon, jours,
// candidatures, tri (retenues, liste d'attente), QR, verrouillage, consignes, annonces, scans du staff (tampons du
// passeport compris), prix du public, crew. Damien_66 est retenu et entré aujourd'hui ; il n'a pas encore voté.
// Idempotent, et toujours en cours : rien si l'événement l'est déjà ; fini (ou pas encore commencé), il est supprimé
// proprement (avec ce qu'il a laissé : notifications, points, tâches, messages et sortie du crew) puis recréé aux bonnes
// dates. Il ne touche à rien d'autre, sauf à la première création : Damien rejoint « Roussillon Drift » et suit
// Kenji, Léa, Julie et Théo s'il ne le faisait pas (pour « Qui y va » et le crew ; jamais retiré ensuite).
import { randomUUID } from "node:crypto";
import { lockAt, type ScanBatchItem } from "@orasso/shared";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { startJobs } from "../../src/jobs";
import { deps, systemClock } from "../../src/lib/deps";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { storage } from "../../src/lib/storage";
import { withTx } from "../../src/lib/tx";
import { accessService } from "../../src/modules/access/service";
import { applicationsService } from "../../src/modules/applications/service";
import { audiencePrizeService } from "../../src/modules/audience-prize/service";
import { checkinsService } from "../../src/modules/checkins/service";
import { announcementsService } from "../../src/modules/communication/announcements";
import { crewOutingsService } from "../../src/modules/crews/outings";
import { crewsService } from "../../src/modules/crews/service";
import { eventInvitesService } from "../../src/modules/event-invites/service";
import { arrivalColumns } from "../../src/modules/events/arrivals";
import { scheduleEventJobs } from "../../src/modules/events/jobs";
import { POSTER_PHOTO_PREFIX, posterColumns, posterService } from "../../src/modules/events/poster/service";
import type { EventRow } from "../../src/modules/events/repo";
import { eventsService } from "../../src/modules/events/service";
import { messagingService } from "../../src/modules/messaging/service";
import { pointsService } from "../../src/modules/points/service";
import { presenceService } from "../../src/modules/presence/service";
import { ticketsService } from "../../src/modules/tickets/service";
import { vehiclesService } from "../../src/modules/vehicles/service";
import { createEvent, DAY, parisAt } from "./helpers";
import { demoEventPhotos, reviewedNoPlateCar } from "./photos";

const SLUG = "rassemblement-du-lydia";
const TITLE = "Rassemblement du Lydia";
const MINUTE = 60_000;
/** Messages et sortie du crew posés par ce seed : retirés avec l'événement, reconnus à leur texte. */
const CREW_MESSAGES = [
  "On est au Lydia, rangée JDM juste à côté du food truck. Damien, passe nous voir !",
  "J'ai déjà voté pour le prix du public, je ne dis pas pour qui. À vous !",
];
const CREW_OUTING = "Photo du crew devant le Lydia";

/** Participants : entrée hier, aujourd'hui (fraction de la journée écoulée), ou pas encore arrivé ; zone ; tri. */
type Plan = {
  pseudo: string;
  zone: "JDM" | "ALL" | "LIB";
  /** Heure d'entrée la veille (h, min), relue aujourd'hui (fraction) ou non. */
  yesterday?: [number, number];
  today?: number;
  waitlist?: boolean;
};
const PLAN: Plan[] = [
  { pseudo: "Kenji_66", zone: "JDM", yesterday: [9, 12], today: 0.15 },
  { pseudo: "Lea_11", zone: "JDM", yesterday: [9, 18], today: 0.18 },
  { pseudo: "Nina_34", zone: "JDM", yesterday: [10, 4] },
  { pseudo: "Julie_66", zone: "JDM", yesterday: [11, 41], today: 0.3 },
  { pseudo: "Theo_66", zone: "JDM", today: 0.22 },
  { pseudo: "Marc_66", zone: "ALL", today: 0.45 },
  { pseudo: "Pilote_001", zone: "LIB", yesterday: [9, 35], today: 0.1 },
  { pseudo: "Pilote_002", zone: "ALL", yesterday: [9, 51] },
  { pseudo: "Pilote_003", zone: "LIB", yesterday: [14, 26], today: 0.4 },
  { pseudo: "Pilote_006", zone: "ALL", today: 0.55 },
  { pseudo: "Pilote_007", zone: "LIB" },
  { pseudo: "Pilote_008", zone: "ALL" },
  { pseudo: "Pilote_009", zone: "LIB" },
  { pseudo: "Pilote_010", zone: "LIB", waitlist: true },
  { pseudo: "Pilote_011", zone: "ALL", waitlist: true },
];
/** Damien_66 : entré aujourd'hui, en dernier (à cette fraction de la journée écoulée). */
const DAMIEN_TODAY = 0.85;
/** Prix du public : qui vote pour qui (Damien_66 n'a pas voté). */
const VOTES: [string, string][] = [
  ["Kenji_66", "Pilote_002"],
  ["Lea_11", "Kenji_66"],
  ["Nina_34", "Kenji_66"],
  ["Julie_66", "Pilote_002"],
  ["Theo_66", "Kenji_66"],
  ["Marc_66", "Pilote_002"],
  ["Pilote_001", "Lea_11"],
  ["Pilote_002", "Lea_11"],
  ["Pilote_003", "Pilote_002"],
];

async function viewer(pseudo: string, secondFactor: string | null = null): Promise<Viewer | null> {
  const profile = await db.query.profiles.findFirst({
    where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}`,
  });
  if (!profile || profile.deletedAt) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor } } : null;
}

/** Voiture active dont une photo est montrable sur le plateau (plaque floutée ou « aucune plaque visible »). */
async function showableCar(userId: string) {
  const [car] = await db
    .select({ id: t.vehicles.id })
    .from(t.vehicles)
    .where(
      and(
        eq(t.vehicles.ownerId, userId),
        eq(t.vehicles.status, "active"),
        eq(t.vehicles.vehicleType, "car"),
        sql`${t.vehicles.pendingTransferId} is null`,
        sql`exists (select 1 from ${t.vehiclePhotos} p where p.vehicle_id = ${t.vehicles.id}
          and (p.plate_blurred or p.no_plate_confirmed or ${t.vehicles.unregistered}))`,
      ),
    )
    .orderBy(asc(t.vehicles.createdAt))
    .limit(1);
  return car?.id ?? null;
}

let photoNo = 0;
/**
 * Voiture montrable, sinon (anciennes données de dev, photos sans décision de plaque) une photo relue « aucune plaque
 * lisible » ajoutée par le vrai service à sa première voiture active non certifiée (une photo ajoutée ferait perdre la
 * certification). Les photos existantes ne sont jamais touchées. `null` : aucune voiture active, la personne est ignorée.
 */
async function carFor(v: Viewer) {
  const ready = await showableCar(v.user.id);
  if (ready) return ready;
  const [car] = await db
    .select({ id: t.vehicles.id })
    .from(t.vehicles)
    .where(
      and(
        eq(t.vehicles.ownerId, v.user.id),
        eq(t.vehicles.status, "active"),
        eq(t.vehicles.vehicleType, "car"),
        sql`${t.vehicles.pendingTransferId} is null and ${t.vehicles.certifiedAt} is null`,
      ),
    )
    .orderBy(asc(t.vehicles.createdAt))
    .limit(1);
  const photo = car ? await reviewedNoPlateCar(photoNo++) : null;
  if (!car || !photo) return null;
  try {
    const file = new File([new Uint8Array(photo.data)], photo.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" });
    await vehiclesService.addPhoto(v, car.id, file, undefined, true);
    console.log(`En direct : photo sans plaque ajoutée à la voiture de ${v.profile.pseudo}.`);
    return car.id;
  } catch (error) {
    console.log(`En direct : photo non ajoutée pour ${v.profile.pseudo} (${(error as Error).message}).`);
    return null;
  }
}

/** Moins de retenus que cela sur un événement en cours : il a été créé à moitié (photos absentes), il est refait. */
const MIN_ACCEPTED = 8;

/** L'horloge des services à cet instant (le temps du seed remonte jusqu'à maintenant). */
const at = (d: Date) => {
  deps.clock = { now: () => d };
};

export async function seedLiveEvent() {
  const real = new Date();
  const existing = await db.query.events.findFirst({ where: eq(t.events.slug, SLUG) });
  if (existing) {
    // Gardé s'il reste au moins un jour : un déploiement le dernier jour le recrée, pour qu'il soit encore en cours le
    // lendemain (décision du coordinateur, 08/11).
    const keep = existing.endsAt.getTime() - real.getTime() > 24 * 3600 * 1000;
    // Créé à moitié (dev du 08/11 : 2 retenus faute de photos montrables) : supprimé et recréé, par le même chemin
    // qu'un événement fini (plus sûr que de compléter un événement verrouillé et commencé).
    const [accepted] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.applications)
      .where(and(eq(t.applications.eventId, existing.id), eq(t.applications.status, "accepted")));
    const complete = (accepted?.n ?? 0) >= MIN_ACCEPTED;
    if (existing.status === "published" && existing.startsAt <= real && keep && complete) {
      console.log(`En direct : « ${TITLE} » en cours (jusqu'au ${existing.endsAt.toISOString().slice(0, 10)}).`);
      await presenceDemo(existing.id);
      return;
    }
    await teardown(existing);
  }
  const structure =
    (await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") })) ??
    (await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") }));
  const owner = structure
    ? await db.query.structureMembers.findFirst({
        where: and(
          eq(t.structureMembers.structureId, structure.id),
          eq(t.structureMembers.role, "owner"),
          eq(t.structureMembers.status, "active"),
        ),
      })
    : undefined;
  const orgProfile = owner ? await db.query.profiles.findFirst({ where: eq(t.profiles.userId, owner.userId) }) : null;
  const orga = orgProfile ? await viewer(orgProfile.pseudo, "totp") : null;
  const damien = await viewer("Damien_66");
  if (!structure || !orga || !damien) {
    console.log("En direct : structure ou comptes de démonstration absents, rien ajouté.");
    return;
  }
  // Tâches planifiées (verrouillage, règlement) comme une vraie publication : pg-boss sans traitement.
  const boss = await startJobs({ work: false });
  try {
    await build(structure.id, orga, damien, real);
  } finally {
    deps.clock = systemClock;
    await boss.stop({ graceful: true });
  }
}

/**
 * Présence par GPS (lot R7d1) : la zone de présence du Lydia (400 m, si l'organisatrice n'en a pas réglé) et deux
 * visiteurs sans voiture qui ont validé « Je suis sur place » : Pilote_004 avec un billet gratuit, Pilote_005 sans. Par les
 * vrais services (billet, `presenceService.validate`), à l'heure réelle, depuis le pied du Lydia ; la position envoyée
 * n'est gardée nulle part. Idempotent : une personne déjà présente est laissée telle quelle.
 */
async function presenceDemo(eventId: string) {
  const event = await db.query.events.findFirst({ where: eq(t.events.id, eventId) });
  if (!event || event.lat === null || event.lng === null) return;
  if (event.presenceRadiusM === null) {
    await db.update(t.events).set({ presenceRadiusM: 400 }).where(eq(t.events.id, eventId));
  }
  for (const [pseudo, withTicket] of [
    ["Pilote_004", true],
    ["Pilote_005", false],
  ] as const) {
    const v = await viewer(pseudo);
    if (!v) continue;
    const already = await db.query.eventPresences.findFirst({
      where: and(eq(t.eventPresences.eventId, eventId), eq(t.eventPresences.userId, v.user.id)),
      columns: { id: true },
    });
    if (already) continue;
    try {
      if (withTicket) await giveTicket(v, event);
      await presenceService.validate(v, eventId, { lat: event.lat, lng: event.lng, accuracyM: 15 });
      console.log(`En direct : ${pseudo} présent par GPS${withTicket ? " (avec billet)" : " (sans billet)"}.`);
    } catch (error) {
      console.log(`En direct : présence de ${pseudo} non posée (${(error as Error).message}).`);
    }
  }
}

/**
 * Un billet gratuit au visiteur de la démonstration, par le vrai service de réservation. Le Lydia est en entrée libre :
 * la billetterie est ouverte le temps de la réservation, puis l'événement retrouve son accès (le billet reste).
 */
async function giveTicket(v: Viewer, event: EventRow) {
  const has = await db.query.tickets.findFirst({
    where: and(eq(t.tickets.eventId, event.id), eq(t.tickets.userId, v.user.id)),
    columns: { id: true },
  });
  if (has) return;
  const type = await db.query.ticketTypes.findFirst({ where: eq(t.ticketTypes.eventId, event.id) });
  if (!type) {
    await db.insert(t.ticketTypes).values({ eventId: event.id, name: "Entrée visiteur", capacity: 200, priceCents: 0 });
  }
  await db
    .update(t.events)
    .set({ publicAccess: "free_reservation", ticketsEnabled: true })
    .where(eq(t.events.id, event.id));
  try {
    await ticketsService.reserve(v, event.id, 1);
  } finally {
    await db
      .update(t.events)
      .set({ publicAccess: event.publicAccess, ticketsEnabled: event.ticketsEnabled })
      .where(eq(t.events.id, event.id));
  }
}

/** Suppression propre d'un « Rassemblement du Lydia » fini : ce qu'il a laissé hors de ses tables, puis lui. */
async function teardown(e: EventRow) {
  const crew = await db.query.crews.findFirst({ where: eq(t.crews.slug, "roussillon-drift") });
  await withTx(async (tx) => {
    // Points (règlement de J+2) : retirés, puis les totaux recalculés.
    const points = await tx
      .delete(t.pointEntries)
      .where(eq(t.pointEntries.eventId, e.id))
      .returning({ userId: t.pointEntries.userId });
    await tx
      .delete(t.notifications)
      .where(or(eq(t.notifications.eventId, e.id), sql`${t.notifications.data} ->> 'eventId' = ${e.id}`));
    // Prix du public décerné au règlement : le compteur du véhicule gagnant le rend.
    await tx.execute(sql`update ${t.vehicles} v set audience_prizes = greatest(v.audience_prizes - 1, 0)
      from ${t.audiencePrizeResults} r join ${t.applications} a on a.id = r.application_id
      where r.event_id = ${e.id} and r.winner and v.id = a.vehicle_id`);
    await tx.delete(t.crewPosts).where(eq(t.crewPosts.eventId, e.id));
    await tx.delete(t.groupMessages).where(eq(t.groupMessages.eventId, e.id));
    if (crew) {
      await tx
        .delete(t.crewOutings)
        .where(and(eq(t.crewOutings.crewId, crew.id), eq(t.crewOutings.title, CREW_OUTING)));
      const conv = await tx.query.conversations.findFirst({ where: eq(t.conversations.crewId, crew.id) });
      if (conv) {
        const gone = await tx
          .delete(t.messages)
          .where(and(eq(t.messages.conversationId, conv.id), inArray(t.messages.body, CREW_MESSAGES)))
          .returning({ id: t.messages.id });
        if (gone.length) {
          // L'aperçu de la discussion revient au dernier message restant.
          const [last] = await tx
            .select({ body: t.messages.body, createdAt: t.messages.createdAt })
            .from(t.messages)
            .where(eq(t.messages.conversationId, conv.id))
            .orderBy(sql`${t.messages.createdAt} desc`)
            .limit(1);
          await tx
            .update(t.conversations)
            .set({
              messagesCount: sql`greatest(${t.conversations.messagesCount} - ${gone.length}, 0)`,
              lastMessageAt: last?.createdAt ?? null,
              lastMessagePreview: last?.body ? last.body.slice(0, 80) : null,
            })
            .where(eq(t.conversations.id, conv.id));
        }
      }
    }
    // Tâches encore en file (règlement, récap…) : l'événement n'existera plus.
    await tx.execute(sql`delete from pgboss.job where data ->> 'eventId' = ${e.id} and state in ('created', 'retry')`);
    await tx.delete(t.events).where(eq(t.events.id, e.id));
    for (const userId of new Set(points.map((p) => p.userId))) await pointsService.recompute(tx, userId);
  });
  await posterService.removeRenders(e).catch(() => undefined);
  if (e.posterPhotoKey) await storage.remove(e.posterPhotoKey).catch(() => undefined);
  console.log(`En direct : ancien « ${TITLE} » (${e.startsAt.toISOString().slice(0, 10)}) supprimé.`);
}

async function build(structureId: string, orga: Viewer, damien: Viewer, real: Date) {
  // --- Les instants : la veille et aujourd'hui (heure de Paris), jamais après maintenant ---------------------
  const yesterdayAt = (h: number, m: number) => parisAt(-1, h, m);
  const opening = parisAt(0, 9);
  const end = new Date(real.getTime() - 10 * MINUTE);
  // Avant 9 h 50 (seed lancé tôt) : la journée commence à minuit.
  const base = end.getTime() - opening.getTime() > 40 * MINUTE ? opening : parisAt(0, 0, 1);
  const span = Math.max(end.getTime() - base.getTime(), 2 * MINUTE);
  const todayAt = (frac: number) => new Date(Math.min(base.getTime() + frac * span, real.getTime() - MINUTE));

  // --- Création (12 jours avant), jours, publication ------------------------------------------------------
  const created = parisAt(-12, 10);
  at(created);
  const draft = await createEvent(structureId, orga.user.id, {
    title: TITLE,
    slug: SLUG,
    format: "gathering",
    // Bornes des jours (recalculées par `setDays` ci-dessous).
    startsAt: parisAt(-1, 9),
    endsAt: parisAt(2, 23),
    status: "draft",
    publishedAt: null,
    description:
      "Quatre jours au pied du Lydia, le paquebot ensablé du Barcarès : plateau de voitures et de motos sur " +
      "l'esplanade, balade du soir le long de la plage, concours d'élégance et prix du public. Exposants sur " +
      "candidature (JDM, allemandes, et tout ce qui roule avec passion), visiteurs libres et gratuits.",
    addressLine: "Esplanade du Lydia, boulevard du Front de Mer",
    postalCode: "66420",
    city: "Le Barcarès",
    department: "66",
    lat: 42.7881,
    lng: 3.0389,
    capacity: PLAN.filter((p) => !p.waitlist).length + 1,
    admission: "filtered",
    admittedVehicleTypes: ["car", "moto"],
    maxVehiclesPerUser: 1,
    publicAccess: "free",
    registrationsOpenAt: new Date(created.getTime() - 2 * DAY),
    previewHours: 0,
    rulesText:
      "Véhicules propres et en état de rouler. Pas de burn, pas de rupteur, pas de musique forte : la plage est à côté. " +
      "Les exposants restent garés jusqu'à 18 h.",
    instructions:
      "Entrée des exposants par l'avenue du Grand Large, QR prêt à 30 cm du pare-brise.\n" +
      "Une fois garé, on coupe le moteur : la sono est réservée aux annonces.\n" +
      "Barbecues interdits sur le sable ; food truck et buvette près du Lydia.",
    createdAt: created,
    ...arrivalColumns({
      exhibitors: { from: "08:30", to: "10:00", strict: false, note: "Entrée côté plage, avenue du Grand Large." },
      public: { from: "09:30", to: null, strict: false, note: "Parking visiteurs du Lydia, gratuit." },
    }),
  });
  const days = [-1, 0, 1, 2].map((n) => parisAt(n, 12).toISOString().slice(0, 10));
  const capacity = draft.capacity ?? 15;
  await eventsService.setDays(orga, draft.id, {
    dayAccess: "whole",
    days: days.map((date) => ({ date, startTime: "09:00", endTime: "23:00", capacity })),
  });
  const zones = await db
    .insert(t.eventZones)
    .values([
      { eventId: draft.id, code: "JDM", name: "JDM", capacity: 6, position: 1 },
      { eventId: draft.id, code: "ALL", name: "Allemandes", capacity: 5, position: 2 },
      { eventId: draft.id, code: "LIB", name: "Libre", capacity: 6, position: 3 },
    ])
    .returning();
  const zoneId = (code: string) => zones.find((z) => z.code === code)?.id ?? null;
  // Publication (sans prévenir les abonnés de la structure : ce sont des comptes réels sur dev).
  at(new Date(created.getTime() + 20 * MINUTE));
  const [published] = await db
    .update(t.events)
    .set({ status: "published", publishedAt: new Date(created.getTime() + 20 * MINUTE) })
    .where(eq(t.events.id, draft.id))
    .returning();
  if (!published) throw new Error("publication");
  const eventId = published.id;

  // --- Le réseau de Damien : crew « Roussillon Drift » et abonnements (première fois seulement) ---------
  const kenji = await viewer("Kenji_66");
  const crew = await db.query.crews.findFirst({ where: eq(t.crews.slug, "roussillon-drift") });
  if (crew && !crew.deletedAt && kenji) {
    const member = await db.query.crewMembers.findFirst({
      where: and(eq(t.crewMembers.crewId, crew.id), eq(t.crewMembers.userId, damien.user.id)),
    });
    if (!member) {
      try {
        await crewsService.invite(kenji, crew.id, damien.profile.pseudo);
        await crewsService.acceptInvitation(damien, crew.id);
      } catch (error) {
        console.log(`En direct : Damien_66 pas ajouté au crew (${(error as Error).message}).`);
      }
    }
  }
  for (const pseudo of ["Kenji_66", "Lea_11", "Julie_66", "Theo_66"]) {
    const p = await viewer(pseudo);
    if (!p) continue;
    await db
      .insert(t.userFollows)
      .values({
        followerId: damien.user.id,
        followedId: p.user.id,
        status: "accepted",
        createdAt: created,
        acceptedAt: created,
      })
      .onConflictDoNothing();
  }

  // --- Candidatures (J-11 à J-9), invitation de Kenji à Damien, tri (J-7) -----------------------------------
  const people = new Map<string, { v: Viewer; appId: string; plan: Plan | null }>();
  const applyAs = async (v: Viewer, plan: Plan | null, when: Date) => {
    const car = await carFor(v);
    if (!car) return;
    at(when);
    try {
      const [app] = await applicationsService.apply(v, eventId, {
        vehicleIds: [car],
        rulesAccepted: true,
        followStructure: false,
        newsletterOptIn: false,
        companions: 0,
        message: null,
        eventDayId: null,
        arrivalSeen: true,
      });
      if (app) people.set(v.profile.pseudo, { v, appId: app.id, plan });
    } catch (error) {
      console.log(`En direct : ${v.profile.pseudo} non inscrit (${(error as Error).message}).`);
    }
  };
  for (const [i, plan] of PLAN.entries()) {
    const v = await viewer(plan.pseudo);
    if (v) await applyAs(v, plan, parisAt(-11 + Math.floor(i / 6), 9 + ((i * 2) % 12), (i * 17) % 60));
  }
  if (kenji) {
    at(parisAt(-10, 21, 5));
    await eventInvitesService
      .invite(kenji, eventId, {
        userIds: [damien.user.id],
        note: "On se met tous côté JDM au Lydia, viens avec ta voiture !",
      })
      .catch((error) => console.log(`En direct : invitation de Kenji non posée (${(error as Error).message}).`));
  }
  await applyAs(damien, null, parisAt(-9, 8, 42));
  const damienApp = people.get(damien.profile.pseudo);
  if (!damienApp) throw new Error("En direct : candidature de Damien_66 impossible");

  at(parisAt(-7, 20, 30));
  const decide = (appId: string, decision: "accept" | "waitlist", zone: string | null) =>
    applicationsService.decide(orga, eventId, appId, {
      decision,
      sendReasons: true,
      note: null,
      zoneId: decision === "accept" ? zone : null,
    });
  await decide(damienApp.appId, "accept", zoneId("JDM"));
  for (const { appId, plan } of people.values()) {
    if (!plan) continue;
    await decide(appId, plan.waitlist ? "waitlist" : "accept", zoneId(plan.zone));
  }
  // QR des retenues (la décision les émet ; rattrapage s'il en manque).
  const missing = await db
    .select({ id: t.applications.id, eventId: t.applications.eventId, userId: t.applications.userId })
    .from(t.applications)
    .where(
      and(
        eq(t.applications.eventId, eventId),
        eq(t.applications.status, "accepted"),
        sql`not exists (select 1 from ${t.accessPasses} p where p.application_id = ${t.applications.id} and p.revoked_at is null)`,
      ),
    );
  if (missing.length) {
    await withTx(async (tx) => {
      for (const app of missing) await accessService.issue(tx, app);
    });
  }

  // --- Consignes la veille du premier jour, verrouillage à H-2 ---------------------------------------------
  at(parisAt(-2, 18, 5));
  await announcementsService.sendInstructions(orga, eventId, published.instructions);
  at(new Date(lockAt(published).getTime() + MINUTE));
  await applicationsService.lockEvent(eventId);

  // --- Jour J : l'accueil scanne (téléphone de l'organisatrice) ----------------------------------------------
  const [device] =
    (await db
      .select()
      .from(t.devices)
      .where(and(eq(t.devices.userId, orga.user.id), eq(t.devices.name, "Téléphone de l'accueil")))
      .limit(1)) ?? [];
  const scanner =
    device ??
    (
      await db
        .insert(t.devices)
        .values({ userId: orga.user.id, platform: "android", name: "Téléphone de l'accueil", appVersion: "1.0.0" })
        .returning()
    )[0];
  if (!scanner) throw new Error("appareil");
  const passes = new Map(
    (await db.query.accessPasses.findMany({ where: eq(t.accessPasses.eventId, eventId) })).map((p) => [
      p.applicationId,
      p.id,
    ]),
  );
  const scan = async (appId: string, zone: string, when: Date) => {
    const passId = passes.get(appId);
    if (!passId) return;
    at(new Date(when.getTime() + 20_000));
    const item: ScanBatchItem = {
      kind: "scan",
      id: randomUUID(),
      passId,
      rawPayload: null,
      decision: "ok",
      reason: null,
      zoneCode: zone,
      scannedAt: when,
    };
    await checkinsService.receiveBatch(orga, eventId, { deviceId: scanner.id, items: [item] });
  };
  const entries: [Date, string, string][] = [];
  for (const { appId, plan } of people.values()) {
    if (!plan || plan.waitlist) continue;
    if (plan.yesterday) entries.push([yesterdayAt(...plan.yesterday), appId, plan.zone]);
    if (plan.today !== undefined) entries.push([todayAt(plan.today), appId, plan.zone]);
  }
  entries.push([todayAt(DAMIEN_TODAY), damienApp.appId, "JDM"]);
  entries.sort((a, b) => a[0].getTime() - b[0].getTime());

  // Le fil, aux bons moments entre les entrées : bienvenue, changement d'horaire, concours d'élégance.
  const posts: [Date, string, boolean][] = [
    [
      yesterdayAt(8, 40),
      "Bienvenue au Rassemblement du Lydia ! Exposants : entrée par l'avenue du Grand Large. Café offert jusqu'à 10 h au stand de l'association.",
      true,
    ],
    [
      yesterdayAt(18, 50),
      "Changement d'horaire : à cause du vent sur la digue, la balade du soir part à 20 h 30 au lieu de 20 h. Rendez-vous au rond-point du Lydia.",
      false,
    ],
    [
      todayAt(0.05),
      "Concours d'élégance à 15 h devant le Lydia ! Le prix du public est ouvert : vote pour ta voiture préférée dans l'appli, une seule voix, pas pour toi-même.",
      false,
    ],
  ];
  const announced: string[] = [];
  const timeline: [Date, () => Promise<unknown>][] = [
    ...entries.map(([when, appId, zone]) => [when, () => scan(appId, zone, when)] as [Date, () => Promise<unknown>]),
    ...posts.map(
      ([when, body, pinned]) =>
        [
          when,
          () => {
            at(when);
            return announcementsService
              .create(orga, eventId, { body, pinned, notify: true, audience: "public" })
              .then((a) => announced.push(a.id));
          },
        ] as [Date, () => Promise<unknown>],
    ),
  ];
  timeline.sort((a, b) => a[0].getTime() - b[0].getTime());
  for (const [, step] of timeline) await step();

  // --- Prix du public : votes posés (pas celui de Damien) -----------------------------------------------------
  let votes = 0;
  for (const [i, [voter, target]] of VOTES.entries()) {
    const v = people.get(voter);
    const to = people.get(target);
    if (!v || !to) continue;
    at(new Date(Math.min(todayAt(0.6 + i * 0.03).getTime(), real.getTime() - MINUTE)));
    try {
      await audiencePrizeService.vote(v.v, eventId, to.appId);
      votes++;
    } catch (error) {
      console.log(`En direct : vote de ${voter} refusé (${(error as Error).message}).`);
    }
  }

  // --- Le crew en parle : messages dans sa discussion, photo de groupe demain ------------------------------
  if (crew && kenji) {
    const lea = people.get("Lea_11")?.v;
    try {
      const view = await crewsService.viewById(kenji, crew.id);
      if (view.conversationId) {
        at(todayAt(0.5));
        await messagingService.send(kenji, view.conversationId, { clientId: randomUUID(), body: CREW_MESSAGES[0] });
        if (lea) {
          at(todayAt(0.7));
          await messagingService.send(lea, view.conversationId, { clientId: randomUUID(), body: CREW_MESSAGES[1] });
        }
      }
      at(todayAt(0.5));
      const outing = await crewOutingsService.create(kenji, crew.id, {
        title: CREW_OUTING,
        startsAt: parisAt(1, 11),
        place: "Esplanade du Lydia, Le Barcarès",
        lat: 42.7881,
        lng: 3.0389,
        program: "Toutes les voitures du crew alignées devant le Lydia pour la photo, puis grillades au food truck.",
      });
      await crewOutingsService.rsvp(kenji, crew.id, outing.id, "yes");
      if (lea) await crewOutingsService.rsvp(lea, crew.id, outing.id, "yes");
      const theo = people.get("Theo_66")?.v;
      if (theo) await crewOutingsService.rsvp(theo, crew.id, outing.id, "maybe");
    } catch (error) {
      console.log(`En direct : crew non animé (${(error as Error).message}).`);
    }
  }

  // --- La Boîte : ce qui date d'avant aujourd'hui est déjà lu (les notifications portent l'heure du seed) -----
  const earlier = announced.slice(0, -1);
  await db
    .update(t.notifications)
    .set({ readAt: real })
    .where(
      and(
        or(eq(t.notifications.eventId, eventId), sql`${t.notifications.data} ->> 'eventId' = ${eventId}`),
        sql`${t.notifications.readAt} is null`,
        or(
          sql`${t.notifications.type}::text in ('event_invited', 'application_accepted', 'application_waitlisted', 'friend_going_event', 'event_instructions')`,
          earlier.length ? sql`${t.notifications.data} ->> 'announcementId' in ${earlier}` : sql`false`,
        ),
      ),
    );

  // --- Affiche générée et tâches (horloge réelle : seuls le verrouillage et le règlement à J+2 restent) -----
  deps.clock = systemClock;
  const photos = await demoEventPhotos();
  const photo = photos[3 % Math.max(photos.length, 1)];
  let photoKey: string | null = null;
  if (photo) {
    photoKey = `${POSTER_PHOTO_PREFIX}seed-${SLUG}.webp`;
    await storage.put(photoKey, photo.data);
  }
  const [withPoster] = await db
    .update(t.events)
    .set(posterColumns({ photoKey, style: "retro", title: TITLE }))
    .where(eq(t.events.id, eventId))
    .returning();
  if (withPoster) {
    await posterService.regenerate(withPoster);
    await scheduleEventJobs(withPoster);
  }
  // Lot R7d1 : zone de présence et deux présences par GPS (heure réelle).
  await presenceDemo(eventId);

  const counts = await db
    .select({ status: t.applications.status, n: sql<number>`count(*)::int` })
    .from(t.applications)
    .where(eq(t.applications.eventId, eventId))
    .groupBy(t.applications.status);
  const [entered] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.checkins)
    .where(eq(t.checkins.eventId, eventId));
  console.log(
    `En direct : « ${TITLE} » (${days[0]} → ${days[3]}, Roues Libres 66) : ${counts
      .map((c) => `${c.n} ${c.status}`)
      .join(", ")}, ${entered?.n ?? 0} entrés (Damien_66 aujourd'hui), ${votes} votes, ${posts.length} annonces.`,
  );
}
