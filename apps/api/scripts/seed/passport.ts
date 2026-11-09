// Lot 49 : passeport, prix du public, récap (prototype DA v2 `s-passport`, `s-vote`, `s-recap`).
// Kenji (kenji@orasso.local) : 9 tampons sur la saison, dont 1 rare « première sortie » (prototype « 9 tampons · 1 rare »,
// deux pages). « Béziers Night » (passée, déjà réglée par le seed des missions) : les véhicules du seed y sont pointés,
// 64 votants, Kenji 4e ; résultats figés (top 10), le gagnant a son prix (points, tampon rare, compteur du véhicule).
// Les points de participation de ces pointages ajoutés après coup ne sont pas réécrits (le barème du seed reste celui
// des lots précédents). Idempotent : rien n'est refait si « Rasso de printemps » (sortie la plus ancienne) existe.
import {
  isRare,
  POINTS,
  type StampKind,
  seasonDates,
  seasonYear,
  stampInk,
  stampSeed,
  stampShape,
} from "@orasso/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { withTx } from "../../src/lib/tx";
import type { EventRow } from "../../src/modules/events/repo";
import { pointsService } from "../../src/modules/points/service";
import { ensureAllCategories } from "../../src/modules/votes/context";
import { votesSettle } from "../../src/modules/votes/settle";
import { createEvent, DAY, HOUR, now, parisAt } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });
const bySlug = (slug: string) => db.query.events.findFirst({ where: eq(t.events.slug, slug) });

async function seasonId(date: Date) {
  const d = seasonDates(seasonYear(date));
  await db.insert(t.seasons).values(d).onConflictDoNothing();
  const row = await db.query.seasons.findFirst({ where: eq(t.seasons.startsOn, d.startsOn) });
  if (!row) throw new Error("saison");
  return row.id;
}

/** Tampon posé directement (sans notification : ce sont des souvenirs, pas des nouveautés). */
export async function stamp(
  userId: string,
  event: EventRow,
  kind: StampKind,
  at: Date,
  applicationId: string | null = null,
) {
  await db
    .insert(t.passportStamps)
    .values({
      userId,
      eventId: event.id,
      seasonId: await seasonId(event.startsAt),
      kind,
      shape: stampShape(event.format),
      ink: stampInk(event.department),
      seed: stampSeed(userId, event.id, kind),
      rare: isRare(kind),
      applicationId,
      stampedAt: at,
    })
    .onConflictDoNothing();
}

/** Candidature retenue (reprise si elle existe) et entrée sur l'événement. */
async function enterWith(event: EventRow, vehicle: { id: string; ownerId: string }, at: Date, decidedBy: string) {
  let app = await db.query.applications.findFirst({
    where: and(eq(t.applications.eventId, event.id), eq(t.applications.vehicleId, vehicle.id)),
  });
  if (!app) {
    [app] = await db
      .insert(t.applications)
      .values({
        eventId: event.id,
        userId: vehicle.ownerId,
        vehicleId: vehicle.id,
        status: "accepted",
        rulesAcceptedAt: new Date(event.startsAt.getTime() - 20 * DAY),
        followStructure: false,
        decidedAt: new Date(event.startsAt.getTime() - 15 * DAY),
        decidedBy,
        createdAt: new Date(event.startsAt.getTime() - 20 * DAY),
      })
      .returning();
  }
  if (!app) throw new Error("candidature");
  await db
    .insert(t.checkins)
    .values({ applicationId: app.id, eventId: event.id, method: "scan", checkedInAt: at })
    .onConflictDoNothing();
  const entry = await db.query.checkins.findFirst({ where: eq(t.checkins.applicationId, app.id) });
  return { applicationId: app.id, checkedInAt: entry?.checkedInAt ?? at };
}

/**
 * « Plus belle japonaise » à Béziers Night : vote à thème clos (origine JP, ouvert à 22 h pour 90 minutes), 12 voix données
 * par des exposants d'autres origines, la Supra de Kenji devant. Le règlement (résultats, trophées, points) se fait avec
 * celui de « Toutes catégories », par le vrai service.
 */
async function seedJapaneseVote(
  event: EventRow,
  entered: { applicationId: string; checkedInAt: Date; ownerId: string; vehicleId: string }[],
  kenjiApplicationId: string,
) {
  const country = await db
    .select({ vehicleId: t.vehicles.id, country: t.vehicleMakes.country })
    .from(t.vehicles)
    .innerJoin(t.vehicleMakes, eq(t.vehicleMakes.id, t.vehicles.makeId))
    .where(
      inArray(
        t.vehicles.id,
        entered.map((e) => e.vehicleId),
      ),
    );
  const isJp = new Set(country.filter((c) => c.country === "JP").map((c) => c.vehicleId));
  const jp = entered.filter((e) => isJp.has(e.vehicleId));
  const others = entered.filter((e) => !isJp.has(e.vehicleId));
  const kenji = jp.find((e) => e.applicationId === kenjiApplicationId);
  const rest = jp.filter((e) => e.applicationId !== kenjiApplicationId);
  if (!kenji || rest.length < 3 || others.length < 12) {
    console.log("Passeport : pas assez de japonaises pour le vote à thème (ignoré).");
    return null;
  }
  const opensAt = new Date(event.startsAt.getTime() + 2 * HOUR);
  const closesAt = new Date(Math.min(opensAt.getTime() + 90 * 60_000, event.endsAt.getTime()));
  const [vote] = await db
    .insert(t.eventVotes)
    .values({
      eventId: event.id,
      title: "Plus belle japonaise",
      kind: "theme",
      candidateMode: "origins",
      candidateFilter: { countries: ["JP"] },
      openMode: "at",
      opensAt,
      durationMinutes: 90,
      openedAt: opensAt,
      closesAt,
      closedAt: closesAt,
      rareStamp: false,
      position: 1,
    })
    .returning();
  if (!vote) return null;
  // Cible de chacune des 12 voix : la Supra de Kenji 5, puis 3, 2, 1, 1.
  const targets = [
    ...Array(5).fill(kenji),
    ...Array(3).fill(rest[0]),
    ...Array(2).fill(rest[1]),
    rest[2],
    rest[3] ?? rest[0],
  ] as typeof entered;
  await db.insert(t.audienceVotes).values(
    others.slice(0, 12).map((voter, i) => {
      const at = new Date(opensAt.getTime() + (i + 1) * 4 * 60_000);
      return {
        eventId: event.id,
        voteId: vote.id,
        voterUserId: voter.ownerId,
        applicationId: (targets[i] as (typeof entered)[number]).applicationId,
        createdAt: at,
        updatedAt: at,
      };
    }),
  );
  return vote;
}

export async function seedPassport() {
  const kenji = await byPseudo("Kenji_66");
  const damien = await byPseudo("Damien_66");
  const msc = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (!kenji || !damien || !msc) throw new Error("Base de départ incomplète pour le passeport");
  // Marqueur : la sortie la plus ancienne de Kenji (ses autres tampons peuvent venir des pointages des autres seeds).
  if (await bySlug("rasso-de-printemps-2026")) {
    console.log("Passeport déjà présent (Kenji, Béziers Night).");
    return;
  }
  const supra = await db.query.vehicles.findFirst({
    where: and(eq(t.vehicles.ownerId, kenji.userId), eq(t.vehicles.status, "active")),
    orderBy: [asc(t.vehicles.createdAt)],
  });
  if (!supra) throw new Error("Véhicule de Kenji absent");

  // --- Béziers Night : pointages, votes, résultats ----------------------------------------------------------
  // Cherché par son slug : les seeds du média (lot 45) et des missions (lot 46) l'ont déjà créé.
  const beziers =
    (await bySlug("beziers-night-2026")) ??
    (await createEvent(msc.id, damien.userId, {
      title: "Béziers Night",
      slug: "beziers-night-2026",
      format: "night",
      startsAt: parisAt(-51, 20),
      endsAt: parisAt(-51, 23, 30),
      addressLine: "Allées Paul-Riquet",
      postalCode: "34500",
      city: "Béziers",
      department: "34",
      lat: 43.344,
      lng: 3.2158,
      capacity: 120,
      settledAt: parisAt(-49, 23, 30),
    }));
  // Les véhicules actifs du seed, un par propriétaire (Kenji compris), pointés de 20 h à 21 h 30 environ.
  const fleet = await db
    .selectDistinctOn([t.vehicles.ownerId], { id: t.vehicles.id, ownerId: t.vehicles.ownerId })
    .from(t.vehicles)
    .innerJoin(t.profiles, eq(t.profiles.userId, t.vehicles.ownerId))
    .where(and(eq(t.vehicles.status, "active"), sql`${t.profiles.deletedAt} is null`))
    .orderBy(t.vehicles.ownerId, asc(t.vehicles.createdAt))
    .limit(90);
  const others = fleet.filter((v) => v.ownerId !== kenji.userId).slice(0, 70);
  const entered: { applicationId: string; checkedInAt: Date; ownerId: string; vehicleId: string }[] = [];
  for (const [i, v] of [...others.slice(0, 5), { id: supra.id, ownerId: kenji.userId }, ...others.slice(5)].entries()) {
    const at = new Date(beziers.startsAt.getTime() + i * 75_000);
    entered.push({ ...(await enterWith(beziers, v, at, damien.userId)), ownerId: v.ownerId, vehicleId: v.id });
  }
  const kenjiApp = entered.find((e) => e.ownerId === kenji.userId);
  if (!kenjiApp || entered.length < 10) throw new Error("Pas assez de véhicules pour Béziers Night");
  // 64 voix : 14, 11, 9 pour les trois premiers, 7 pour Kenji (4e), le reste éparpillé (au plus 3 chacun).
  const [first, second, third] = entered.filter((e) => e.ownerId !== kenji.userId);
  if (!first || !second || !third) throw new Error("podium");
  const targets: string[] = [
    ...Array(14).fill(first.applicationId),
    ...Array(11).fill(second.applicationId),
    ...Array(9).fill(third.applicationId),
    ...Array(7).fill(kenjiApp.applicationId),
  ];
  const rest = entered.filter((e) => ![first, second, third, kenjiApp].includes(e));
  for (let i = 0; targets.length < 64; i++)
    targets.push((rest[i % rest.length] as (typeof rest)[number]).applicationId);
  const ownerOf = new Map(entered.map((e) => [e.applicationId, e.ownerId]));
  const voters = entered.map((e) => e.ownerId).slice(0, 64);
  // Personne ne vote pour soi : on échange la cible avec la suivante quand c'est la sienne.
  for (let i = 0; i < voters.length; i++) {
    if (ownerOf.get(targets[i] as string) !== voters[i]) continue;
    const j = targets.findIndex(
      (x, k) => k > i && ownerOf.get(x) !== voters[i] && ownerOf.get(targets[i] as string) !== voters[k],
    );
    const swap = j >= 0 ? j : targets.findIndex((x) => ownerOf.get(x) !== voters[i]);
    [targets[i], targets[swap]] = [targets[swap] as string, targets[i] as string];
  }
  const voteAt = (i: number) => new Date(beziers.startsAt.getTime() + 2 * HOUR + i * 60_000);
  // Lot R7l1 : le prix du public est le vote « Toutes catégories » (ouvert au premier pointage, clos à la fin).
  await ensureAllCategories(db, beziers);
  const allCategories = await db.query.eventVotes.findFirst({
    where: and(eq(t.eventVotes.eventId, beziers.id), eq(t.eventVotes.kind, "all_categories")),
  });
  if (!allCategories) throw new Error("Vote « Toutes catégories » absent");
  await db
    .update(t.eventVotes)
    .set({ openedAt: entered[0]?.checkedInAt ?? beziers.startsAt, closedAt: beziers.endsAt })
    .where(eq(t.eventVotes.id, allCategories.id));
  await db
    .insert(t.audienceVotes)
    .values(
      voters.map((voterUserId, i) => ({
        eventId: beziers.id,
        voteId: allCategories.id,
        voterUserId,
        applicationId: targets[i] as string,
        createdAt: voteAt(i),
        updatedAt: voteAt(i),
      })),
    )
    .onConflictDoNothing();

  // Un vote à thème clos : « Plus belle japonaise » (origine JP), 12 voix, la Supra de Kenji gagne.
  await seedJapaneseVote(beziers, entered, kenjiApp.applicationId);

  // Règlement du jour : chaque pointé a ses points de participation (le récap acquis ne dit pas « +0 point »).
  for (const e of entered) await stamp(e.ownerId, beziers, "participation", e.checkedInAt, e.applicationId);
  await withTx(async (tx) => {
    const season = await pointsService.seasonFor(tx, beziers.settledAt ?? now);
    for (const e of entered) {
      await tx
        .insert(t.pointEntries)
        .values({
          userId: e.ownerId,
          seasonId: season.id,
          kind: "participation",
          points: POINTS.participation,
          eventId: beziers.id,
          applicationId: e.applicationId,
          createdAt: beziers.settledAt ?? now,
        })
        .onConflictDoNothing();
      await pointsService.recompute(tx, e.ownerId);
    }
    // Le vrai règlement des votes : résultats (top 10), trophées, podium 15 / 10 / 5 (meilleur rang par voiture), compteur du
    // véhicule gagnant de « Toutes catégories ». Les notifications partent comme en vrai (le Journal des gagnants).
    const { awardedUserIds, winner } = await votesSettle.settleEvent(tx, beziers, async (entry) => {
      const [row] = await tx
        .insert(t.pointEntries)
        .values({ ...entry, seasonId: season.id, createdAt: beziers.settledAt ?? now })
        .onConflictDoNothing()
        .returning();
      return row ?? null;
    });
    for (const userId of awardedUserIds) await pointsService.recompute(tx, userId);
    const won = winner ? entered.find((e) => e.applicationId === winner.applicationId) : undefined;
    if (won) await stamp(won.ownerId, beziers, "audience_prize", beziers.settledAt ?? now, won.applicationId);
  });

  // --- Les autres sorties de Kenji sur la saison ------------------------------------------------------------
  const archive = async (
    slug: string,
    values: { title: string; format: EventRow["format"]; days: number; hour: number; city: string; dept: string },
  ) =>
    (await bySlug(slug)) ??
    createEvent(msc.id, damien.userId, {
      title: values.title,
      slug,
      format: values.format,
      startsAt: parisAt(-values.days, values.hour),
      endsAt: parisAt(-values.days, values.hour + 4),
      city: values.city,
      department: values.dept,
      addressLine: "Place de la mairie",
      capacity: 60,
      publishedAt: parisAt(-values.days - 40, 12),
      registrationsOpenAt: parisAt(-values.days - 35, 12),
      settledAt: parisAt(-values.days + 2, values.hour + 4),
    });
  const outings: EventRow[] = [
    await archive("rasso-de-printemps-2026", {
      title: "Rasso de printemps",
      format: "gathering",
      days: 190,
      hour: 10,
      city: "Perpignan",
      dept: "66",
    }),
    await archive("expo-du-boulou-2026", {
      title: "Expo du Boulou",
      format: "exhibition",
      days: 160,
      hour: 10,
      city: "Le Boulou",
      dept: "66",
    }),
    await archive("c-et-c-ceret-2026", {
      title: "C&C Céret",
      format: "cars_and_coffee",
      days: 130,
      hour: 9,
      city: "Céret",
      dept: "66",
    }),
  ];
  const narbonne = await bySlug("c-et-c-narbonne-2026");
  if (narbonne) outings.push(narbonne);
  outings.push(
    await archive("salon-de-perpignan-2026", {
      title: "Salon de Perpignan",
      format: "show",
      days: 75,
      hour: 10,
      city: "Perpignan",
      dept: "66",
    }),
    await archive("portes-ouvertes-garage-du-mas-2026", {
      title: "Portes ouvertes du Garage du Mas",
      format: "open_house",
      days: 30,
      hour: 14,
      city: "Elne",
      dept: "66",
    }),
  );
  const rentree = await bySlug("nocturne-de-rentree");
  for (const event of outings) {
    const e = await enterWith(event, supra, new Date(event.startsAt.getTime() + 20 * 60_000), damien.userId);
    await stamp(kenji.userId, event, "participation", e.checkedInAt, e.applicationId);
  }
  await stamp(kenji.userId, beziers, "participation", kenjiApp.checkedInAt, kenjiApp.applicationId);
  if (rentree) {
    const entry = await db
      .select({ applicationId: t.checkins.applicationId, at: t.checkins.checkedInAt })
      .from(t.checkins)
      .innerJoin(t.applications, eq(t.applications.id, t.checkins.applicationId))
      .where(and(eq(t.checkins.eventId, rentree.id), eq(t.applications.userId, kenji.userId)))
      .limit(1);
    const at = entry[0]?.at ?? new Date(rentree.startsAt.getTime() + HOUR);
    await stamp(kenji.userId, rentree, "participation", at, entry[0]?.applicationId ?? null);
  }
  const firstOuting = outings[0] as EventRow;
  // Le règlement de la Nocturne de rentrée (seed du lot 06) a pu lui donner une « première sortie » : sa vraie
  // première sortie est plus ancienne, on la remet à sa place (tampon et notification).
  const misplaced = await db
    .delete(t.passportStamps)
    .where(and(eq(t.passportStamps.userId, kenji.userId), eq(t.passportStamps.kind, "first_outing")))
    .returning({ id: t.passportStamps.id });
  if (misplaced.length) {
    await db.delete(t.notifications).where(
      and(
        eq(t.notifications.userId, kenji.userId),
        eq(t.notifications.type, "stamp_received"),
        inArray(
          sql`${t.notifications.data} ->> 'stampId'`,
          misplaced.map((m) => m.id),
        ),
      ),
    );
  }
  await stamp(kenji.userId, firstOuting, "first_outing", new Date(firstOuting.endsAt.getTime() + 2 * DAY));

  const total = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.passportStamps)
    .where(eq(t.passportStamps.userId, kenji.userId));
  const [voices] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.audienceVotes)
    .where(eq(t.audienceVotes.eventId, beziers.id));
  console.log(
    `Passeport : ${total[0]?.n ?? 0} tampons pour Kenji (1 rare) ; Béziers Night : ${entered.length} véhicules pointés, ${voices?.n ?? 0} voix sur deux votes (« Toutes catégories », « Plus belle japonaise »), podiums réglés, trophée sur la Supra de Kenji.`,
  );
}
