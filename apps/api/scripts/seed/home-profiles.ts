// Lot 43 : de quoi essayer l'Accueil par profil (`GET /me/home?persona=`). Paul (visiteur, sans véhicule) a un billet
// gratuit pour « Cars & Coffee de la Plage » (avec un créneau d'arrivée du public) ; le garage du port (pro) a des
// remises utilisées et des vues cette semaine, des abonnés (dont Kenji en garage favori) et Léa. Le reste vient des
// seeds des lots précédents (Kenji retenu à la Nocturne avec son créneau, Sofia et son emplacement B2, Léo accrédité).
// Sorties de Kenji : une candidature en liste d'attente (3e), une place libérée à accepter, et une mission staff chez Club
// Audois Passion (un ticket par statut). Idempotent : chaque morceau vérifie ce qui existe.
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { AppError } from "../../src/lib/errors";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { arrivalColumns } from "../../src/modules/events/arrivals";
import { ticketsService } from "../../src/modules/tickets/service";
import { apply, DAY, HOUR, now } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

async function viewer(pseudo: string): Promise<Viewer | null> {
  const profile = await byPseudo(pseudo);
  if (!profile) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor: null } } : null;
}

export async function seedHomeProfiles() {
  const notes: string[] = [];

  // --- Billet de Paul + créneau d'arrivée du public ------------------------------------------------------------------
  const cc = await db.query.events.findFirst({ where: eq(t.events.slug, "cars-and-coffee-plage") });
  const paul = await viewer("Paul_Photo");
  if (cc && !cc.arrivalPublicFrom) {
    await db
      .update(t.events)
      .set(arrivalColumns({ exhibitors: null, public: { from: "09:00", to: null, strict: false, note: null } }))
      .where(eq(t.events.id, cc.id));
  }
  if (cc && paul) {
    const has = await db.query.tickets.findFirst({
      where: and(eq(t.tickets.eventId, cc.id), eq(t.tickets.userId, paul.user.id)),
    });
    if (!has) {
      try {
        await ticketsService.reserve(paul, cc.id, 1);
        notes.push("billet de Paul au Cars & Coffee de la Plage");
      } catch (e) {
        if (!(e instanceof AppError) || e.status !== 409) throw e;
      }
    }
  }

  // --- Garage du port : remises, vues, abonnés ------------------------------------------------------------------------
  const garage = await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, "garage-du-port") });
  if (garage) {
    const used = await db.query.proDiscountUses.findFirst({ where: eq(t.proDiscountUses.proId, garage.id) });
    if (!used) {
      await db.insert(t.proDiscountUses).values([
        { proId: garage.id, grade: "route", percent: 10, usedAt: new Date(now.getTime() - 0.2 * DAY) },
        { proId: garage.id, grade: "circuit", percent: 15, usedAt: new Date(now.getTime() - 1 * DAY) },
        { proId: garage.id, grade: "route", percent: 10, usedAt: new Date(now.getTime() - 2 * DAY) },
        { proId: garage.id, grade: "route", percent: 10, usedAt: new Date(now.getTime() - 4 * DAY) },
      ]);
      notes.push("4 remises utilisées");
    }
    const stats = await db.query.proDailyStats.findFirst({ where: eq(t.proDailyStats.proId, garage.id) });
    if (!stats) {
      await db.insert(t.proDailyStats).values(
        [0, 1, 2, 3, 4, 5].map((back) => ({
          proId: garage.id,
          day: new Date(now.getTime() - back * DAY).toISOString().slice(0, 10),
          views: 18 + back * 3,
          calls: 2,
          routes: 1,
        })),
      );
      notes.push("vues de la semaine");
    }
    for (const pseudo of ["Lea_11", "Nina_34"]) {
      const p = await byPseudo(pseudo);
      if (!p) continue;
      await db
        .insert(t.proFollows)
        .values({ proId: garage.id, userId: p.userId })
        .onConflictDoNothing({ target: [t.proFollows.proId, t.proFollows.userId] });
    }
  }
  // --- Sorties de Kenji : liste d'attente, place libérée, mission staff ---------------------------------------------
  const kenji = await byPseudo("Kenji_66");
  const msc = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (kenji && msc) {
    const mine = await db.query.applications.findMany({ where: eq(t.applications.userId, kenji.userId) });
    if (!mine.some((a) => a.status === "waitlisted" || a.status === "offered")) {
      const taken = new Set(mine.map((a) => a.eventId));
      const free = (
        await db
          .select()
          .from(t.events)
          .where(and(eq(t.events.structureId, msc.id), eq(t.events.status, "published"), gt(t.events.endsAt, now)))
          .orderBy(asc(t.events.startsAt))
      ).filter((e) => !taken.has(e.id));
      const cars = await db.query.vehicles.findMany({ where: eq(t.vehicles.ownerId, kenji.userId) });
      const decidedBy = msc.createdBy ?? kenji.userId;
      const [wait, offer] = [free[0], free[1]];
      if (wait && cars[0]) {
        await apply(wait, { id: cars[0].id, ownerId: kenji.userId }, "waitlisted", {
          decidedBy,
          rank: 3,
          createdAt: new Date(now.getTime() - 3 * DAY),
        });
        notes.push("Kenji en liste d'attente (3e)");
      }
      if (offer && cars[0]) {
        await apply(offer, { id: cars[0].id, ownerId: kenji.userId }, "offered", {
          decidedBy,
          createdAt: new Date(now.getTime() - 4 * DAY + HOUR),
        });
        notes.push("place libérée offerte à Kenji");
      }
    }
    const club = await db.query.structures.findFirst({ where: eq(t.structures.slug, "club-audois-passion") });
    if (club) {
      const before = await db.query.structureMembers.findFirst({
        where: and(eq(t.structureMembers.structureId, club.id), eq(t.structureMembers.userId, kenji.userId)),
      });
      if (!before) {
        await db.insert(t.structureMembers).values({
          structureId: club.id,
          userId: kenji.userId,
          role: "staff",
          staffRoles: ["scan"],
          status: "active",
          joinedAt: new Date(),
        });
        notes.push("Kenji staff chez Club Audois Passion");
      }
    }
  }
  console.log(`Accueil par profil : ${notes.length ? notes.join(", ") : "rien à ajouter"}.`);
}
