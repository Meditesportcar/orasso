// Lot 24 : rôle boutique et demande de staff de démonstration, créés par les vrais services.
// « Salon Argelès » : boutique activée, billets gratuits ouverts ; « Boutique_66 » (boutique@orasso.local) est staff
// de MéditeSportCar avec le seul rôle `shop` ; Kenji et Léa ont chacun deux billets gratuits (QR `OB1`) ; la demande de
// staff de Pilote_001 attend la réponse de Damien (Staff du site, Boîte de l'organisateur). Idempotent.
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { staffRequestsService } from "../../src/modules/staff/requests";
import { ticketsService } from "../../src/modules/tickets/service";
import { staffAccount } from "./day-j";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

async function viewer(pseudo: string): Promise<Viewer | null> {
  const profile = await byPseudo(pseudo);
  if (!profile) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor: null } } : null;
}

export async function seedStaff(hash: string) {
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  const salon = await db.query.events.findFirst({ where: eq(t.events.slug, "salon-argeles") });
  if (!structure || !salon) {
    console.log("Staff boutique : Salon Argelès absent, rien ajouté.");
    return;
  }

  // Boutique activée et billets gratuits ouverts sur le Salon.
  await db
    .update(t.events)
    .set({ shopEnabled: true, publicAccess: "free_reservation", ticketsEnabled: true })
    .where(eq(t.events.id, salon.id));
  await db
    .insert(t.ticketTypes)
    .values({ eventId: salon.id, name: "Entrée visiteur", capacity: 200, priceCents: 0 })
    .onConflictDoNothing();

  // Un staff qui n'a que le rôle boutique.
  const boutique = await staffAccount(hash, "Boutique_66", "boutique@orasso.local", "Louis", "Camps");
  await db
    .insert(t.structureMembers)
    .values({
      structureId: structure.id,
      userId: boutique.id,
      role: "staff",
      staffRoles: ["shop"],
      status: "active",
      joinedAt: new Date(),
    })
    .onConflictDoNothing();

  // Billets gratuits du public (QR de billet signés par les vrais services).
  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.tickets)
    .where(eq(t.tickets.eventId, salon.id));
  let tickets = 0;
  if ((existing?.n ?? 0) === 0) {
    for (const pseudo of ["Kenji_66", "Lea_11"]) {
      const v = await viewer(pseudo);
      if (!v) continue;
      const mine = await ticketsService.reserve(v, salon.id, 2);
      tickets += mine.length;
    }
  }

  // Une demande pour devenir staff, en attente de la réponse de Damien.
  const pilote = await viewer("Pilote_001");
  let request = false;
  if (pilote) {
    const known = await db.query.structureMembers.findFirst({
      where: and(eq(t.structureMembers.structureId, structure.id), eq(t.structureMembers.userId, pilote.user.id)),
    });
    if (!known) {
      await staffRequestsService.request(pilote, structure.id, "Dispo les week-ends, j'ai déjà tenu une entrée.");
      request = true;
    }
  }
  console.log(
    `Staff boutique : Salon Argelès (boutique activée, ${tickets} billets gratuits), Boutique_66 (rôle boutique)${request ? ", demande de staff de Pilote_001 en attente" : ""}.`,
  );
}
