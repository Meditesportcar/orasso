// Lot R7j : un souvenir pour essayer le bloc « Souvenirs » de l'Accueil, la carte du Fil et la page du souvenir avec
// Damien_66 : « Rassemblement de la Côte Vermeille », un événement de MéditeSportCar tenu il y a exactement un an, jour pour
// jour (heure de Paris), où Damien_66 était retenu avec sa voiture, entré et tamponné. Chaque passage du seed remet les dates
// à « il y a un an aujourd'hui » : le jour où l'on lance le seed, le souvenir est là. Autre jour, avec l'horloge simulée
// (`pnpm dev:clock`), on peut aussi avancer jusqu'à l'anniversaire d'un tampon du seed. Seulement l'événement, sa candidature,
// son entrée et son tampon : rien d'autre n'est touché. Idempotent.
import { addDays, fromWallTime, wallTime } from "@orasso/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import type { EventRow } from "../../src/modules/events/repo";
import { apply, createEvent, DAY, HOUR, now } from "./helpers";
import { stamp } from "./passport";
import { seedPosters } from "./posters";

const SLUG = "rassemblement-cote-vermeille-2025";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

/** Le même jour et le même mois, il y a un an, à cette heure de Paris (le 29 février devient le 28). */
function oneYearAgoAt(hour: number): Date {
  const n = wallTime(now);
  const day = n.month === 2 && n.day === 29 ? 28 : n.day;
  return fromWallTime({ year: n.year - 1, month: n.month, day, hour, minute: 0 });
}

/** Voiture active de la personne dont une photo est montrable (plaque floutée, « aucune plaque », non immatriculée). */
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
  return car ?? null;
}

export async function seedMemories() {
  const damien = await byPseudo("Damien_66");
  const msc = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (!damien || !msc) return;
  const startsAt = oneYearAgoAt(10);
  const endsAt = oneYearAgoAt(17);
  const enteredAt = new Date(startsAt.getTime() + 45 * 60_000);

  let event: EventRow | undefined = await db.query.events.findFirst({ where: eq(t.events.slug, SLUG) });
  if (!event) {
    event = await createEvent(msc.id, damien.userId, {
      title: "Rassemblement de la Côte Vermeille",
      slug: SLUG,
      format: "gathering",
      startsAt,
      endsAt,
      addressLine: "Front de mer",
      postalCode: "66650",
      city: "Banyuls-sur-Mer",
      department: "66",
      lat: 42.4838,
      lng: 3.1287,
      capacity: 80,
      publishedAt: new Date(startsAt.getTime() - 40 * DAY),
      registrationsOpenAt: new Date(startsAt.getTime() - 35 * DAY),
      settledAt: new Date(endsAt.getTime() + 2 * DAY),
    });
    console.log("Souvenirs : « Rassemblement de la Côte Vermeille » créé (il y a un an, jour pour jour).");
  } else if (Math.abs(event.startsAt.getTime() - startsAt.getTime()) > HOUR) {
    // Un autre jour : les dates suivent « il y a un an aujourd'hui » (le tampon et l'entrée aussi, plus bas).
    const [row] = await db
      .update(t.events)
      .set({
        startsAt,
        endsAt,
        publishedAt: new Date(startsAt.getTime() - 40 * DAY),
        registrationsOpenAt: new Date(startsAt.getTime() - 35 * DAY),
        settledAt: new Date(endsAt.getTime() + 2 * DAY),
      })
      .where(eq(t.events.id, event.id))
      .returning();
    if (row) event = row;
    console.log("Souvenirs : dates du « Rassemblement de la Côte Vermeille » remises à il y a un an.");
  }

  // Candidature retenue avec une voiture montrable (sinon le souvenir retombe sur l'affiche), et entrée.
  const car = await showableCar(damien.userId);
  if (car) {
    const mine = await db.query.applications.findFirst({
      where: and(eq(t.applications.eventId, event.id), eq(t.applications.userId, damien.userId)),
    });
    const app =
      mine ??
      (await apply(event, { id: car.id, ownerId: damien.userId }, "accepted", {
        decidedBy: damien.userId,
        createdAt: addDaysMs(startsAt, -20),
      }));
    await db
      .insert(t.checkins)
      .values({ applicationId: app.id, eventId: event.id, method: "scan", checkedInAt: enteredAt })
      .onConflictDoUpdate({ target: t.checkins.applicationId, set: { checkedInAt: enteredAt } });
    await stamp(damien.userId, event, "participation", enteredAt, app.id);
  } else {
    await stamp(damien.userId, event, "participation", enteredAt);
  }
  // Le tampon suit « il y a un an aujourd'hui » à chaque passage (la ligne est unique par personne, événement, genre).
  await db
    .update(t.passportStamps)
    .set({ stampedAt: enteredAt })
    .where(
      and(
        eq(t.passportStamps.userId, damien.userId),
        eq(t.passportStamps.eventId, event.id),
        eq(t.passportStamps.kind, "participation"),
      ),
    );
  // Affiche et photo du seul événement du souvenir : repasser sur tous les événements rendrait son affiche au brouillon
  // « Expo de printemps », que le seed de la casquette Organisateur (lot 52) a volontairement vidée (R7-V).
  await seedPosters([event.id]);
}

const addDaysMs = (d: Date, days: number) => {
  const w = addDays(wallTime(d), days);
  return fromWallTime({ ...w, hour: 12, minute: 0 });
};
