// Lot 27 : après l'événement et badge de structure. Le bilan de « Nocturne de rentrée » (réglée au lot 06, bilan écrit
// par le règlement), deux notes internes de MéditeSportCar sur des participants, une structure dont le badge expire
// dans 5 jours (rappels d'un mois et d'une semaine déjà envoyés) et une structure suspendue faute de renouvellement.
// Idempotent : rien n'est recréé s'il existe déjà.
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { computeReport } from "../../src/modules/after-event/report";
import { createAccount, DAY, now } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

async function structureFor(
  hash: string,
  s: { slug: string; name: string; city: string; owner: string },
  extra: Partial<typeof t.structures.$inferInsert>,
) {
  if (await db.query.structures.findFirst({ where: eq(t.structures.slug, s.slug) })) return false;
  const owner = await createAccount(hash, {
    pseudo: s.owner,
    email: `${s.owner.toLowerCase()}@orasso.local`,
    departments: ["66"],
  });
  const [structure] = await db
    .insert(t.structures)
    .values({
      slug: s.slug,
      kind: "association",
      name: s.name,
      description: "Structure de démonstration du lot 27 (badge).",
      city: s.city,
      department: "66",
      departments: ["66"],
      verification: "verified",
      verifiedAt: new Date(now.getTime() - 360 * DAY),
      inviteToken: randomBytes(12).toString("base64url"),
      createdBy: owner.id,
      ...extra,
    })
    .returning();
  if (!structure) throw new Error("structure");
  await db
    .insert(t.structureMembers)
    .values({ structureId: structure.id, userId: owner.id, role: "owner", status: "active", joinedAt: now });
  return true;
}

export async function seedAfterEvent(hash: string) {
  const nocturne = await db.query.events.findFirst({ where: eq(t.events.slug, "nocturne-de-rentree") });
  const damien = await byPseudo("Damien_66");
  if (nocturne && damien) {
    // Bilan : écrit par le règlement ; calculé ici pour une base seedée avant le lot 27.
    const [existing] = await db.select().from(t.eventReports).where(eq(t.eventReports.eventId, nocturne.id));
    if (!existing) {
      await db
        .insert(t.eventReports)
        .values({ eventId: nocturne.id, generatedAt: now, data: await computeReport(db, nocturne) })
        .onConflictDoNothing();
    }
    // Deux notes internes de MéditeSportCar sur des participants de la Nocturne.
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.structureNotes)
      .where(eq(t.structureNotes.structureId, nocturne.structureId));
    if (n === 0) {
      const people = await db
        .select({ userId: t.applications.userId })
        .from(t.applications)
        .where(and(eq(t.applications.eventId, nocturne.id), eq(t.applications.status, "accepted")))
        .limit(2);
      const bodies = [
        "Super participant, à réinviter pour la prochaine édition.",
        "Départ trop vif en sortant : 1er avertissement oral.",
      ];
      for (const [i, p] of people.entries()) {
        await db.insert(t.structureNotes).values({
          structureId: nocturne.structureId,
          subjectUserId: p.userId,
          eventId: nocturne.id,
          body: bodies[i] ?? bodies[0] ?? "",
          authorId: damien.userId,
        });
      }
    }
  }

  // Badge qui expire dans 5 jours : rappels du mois et de la semaine déjà partis (la veille arrivera à la tâche de 09:00).
  const expiring = await structureFor(
    hash,
    { slug: "ecurie-du-canigou", name: "Écurie du Canigou", city: "Prades", owner: "Pres_Canigou" },
    {
      badgeExpiresAt: new Date(now.getTime() + 5 * DAY),
      badgeRemindedAt: {
        "30": new Date(now.getTime() - 25 * DAY).toISOString(),
        "7": new Date(now.getTime() - 1 * DAY).toISOString(),
      },
    },
  );
  // Structure suspendue faute de renouvellement : rien n'est supprimé, l'équipe peut lever la suspension.
  const suspended = await structureFor(
    hash,
    { slug: "tramontane-auto", name: "Tramontane Auto Club", city: "Elne", owner: "Pres_Tramontane" },
    {
      verification: "suspended",
      suspendedReason: "badge_expired",
      suspendedAt: new Date(now.getTime() - 3 * DAY),
      badgeExpiresAt: new Date(now.getTime() - 3 * DAY),
      badgeRemindedAt: {
        "30": new Date(now.getTime() - 33 * DAY).toISOString(),
        "7": new Date(now.getTime() - 10 * DAY).toISOString(),
        "1": new Date(now.getTime() - 4 * DAY).toISOString(),
      },
    },
  );
  console.log(
    `Après l'événement : bilan de « Nocturne de rentrée », notes internes${expiring ? ", Écurie du Canigou (badge dans 5 jours)" : ""}${suspended ? ", Tramontane Auto Club (suspendue)" : ""}.`,
  );
}
