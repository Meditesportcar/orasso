// Lot 26 : « Salon de printemps » (MéditeSportCar) sur trois jours, accès au choix (tout l'événement ou un jour),
// 100 places par jour, créé et rempli par les vrais services : candidatures mixtes (tout l'événement, jour 1, jour 2,
// jour 3, un même véhicule sur deux jours), retenues et en attente. Idempotent : rien si l'événement existe déjà.
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { startJobs } from "../../src/jobs";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { applicationsService } from "../../src/modules/applications/service";
import { eventsService } from "../../src/modules/events/service";
import { createEvent, DAY, now, parisAt } from "./helpers";

const SLUG = "salon-de-printemps-2027";

async function viewer(pseudo: string, secondFactor: string | null = null): Promise<Viewer | null> {
  const profile = await db.query.profiles.findFirst({
    where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}`,
  });
  if (!profile) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor } } : null;
}

async function carOf(userId: string) {
  const [car] = await db
    .select({ id: t.vehicles.id })
    .from(t.vehicles)
    .innerJoin(t.vehiclePhotos, eq(t.vehiclePhotos.vehicleId, t.vehicles.id))
    .where(and(eq(t.vehicles.ownerId, userId), eq(t.vehicles.status, "active"), eq(t.vehicles.vehicleType, "car")))
    .orderBy(t.vehicles.createdAt)
    .limit(1);
  return car?.id ?? null;
}

const dateOf = (d: Date) => d.toISOString().slice(0, 10);

export async function seedMultiDay() {
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (!structure) return;
  if (await db.query.events.findFirst({ where: eq(t.events.slug, SLUG) })) {
    console.log("Plusieurs jours : « Salon de printemps » déjà présent.");
    return;
  }
  const damien = await viewer("Damien_66", "totp");
  if (!damien) {
    console.log("Plusieurs jours : comptes de démonstration absents, rien ajouté.");
    return;
  }
  const event = await createEvent(structure.id, damien.user.id, {
    title: "Salon de printemps",
    slug: SLUG,
    format: "show",
    description: "Trois jours d'exposition au parc des expositions : venez un jour, ou les trois.",
    startsAt: parisAt(30, 9),
    endsAt: parisAt(30, 18),
    addressLine: "Parc des expositions",
    postalCode: "66000",
    city: "Perpignan",
    department: "66",
    lat: 42.698,
    lng: 2.875,
    capacity: 100,
    admission: "filtered",
    admittedVehicleTypes: ["car", "moto"],
    maxVehiclesPerUser: 2,
    registrationsOpenAt: new Date(now.getTime() - 3 * DAY),
  });
  // Les dates du calendrier (heure de Paris) des trois jours : J+30, J+31, J+32.
  const days = [30, 31, 32].map((n) => dateOf(new Date(parisAt(n, 12).getTime())));
  // Tâches planifiées (verrouillage, rappels par jour, règlement) comme une vraie modification : pg-boss sans traitement.
  const boss = await startJobs({ work: false });
  try {
    await fill(damien, event.id, days);
  } finally {
    await boss.stop({ graceful: true });
  }
}

async function fill(damien: Viewer, eventId: string, days: string[]) {
  const saved = await eventsService.setDays(damien, eventId, {
    dayAccess: "both",
    days: days.map((date) => ({ date, startTime: "09:00", endTime: "18:00", capacity: 100 })),
  });
  const [d1, d2, d3] = saved.days;
  if (!d1 || !d2 || !d3) return;

  // Candidatures mixtes : tout l'événement, un jour, un même véhicule sur deux jours.
  const plan: [string, (string | null)[]][] = [
    ["Kenji_66", [null]],
    ["Lea_11", [d1.id]],
    ["Nina_34", [d2.id, d3.id]],
    ["Pilote_001", [d1.id]],
    ["Pilote_002", [d3.id]],
    ["Pilote_003", [null]],
  ];
  let accepted = 0;
  let pending = 0;
  for (const [pseudo, dayIds] of plan) {
    const v = await viewer(pseudo);
    const car = v ? await carOf(v.user.id) : null;
    if (!v || !car) continue;
    for (const [i, eventDayId] of dayIds.entries()) {
      try {
        const [app] = await applicationsService.apply(v, eventId, {
          vehicleIds: [car],
          rulesAccepted: true,
          followStructure: false,
          newsletterOptIn: false,
          companions: 0,
          message: null,
          eventDayId,
        });
        if (!app) continue;
        // Une sur deux retenue (la première de chacun), les autres attendent le tri.
        if (i === 0 && pseudo !== "Pilote_003") {
          await applicationsService.decide(damien, eventId, app.id, {
            decision: "accept",
            sendReasons: true,
            note: null,
          });
          accepted++;
        } else pending++;
      } catch (error) {
        console.log(`Plusieurs jours : ${pseudo} non inscrit (${(error as Error).message}).`);
      }
    }
  }
  console.log(
    `Plusieurs jours : « Salon de printemps » (${days.join(", ")}, au choix, 100 places par jour), ${accepted} retenues, ${pending} à trier.`,
  );
}
