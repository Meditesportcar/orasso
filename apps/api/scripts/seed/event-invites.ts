// Lot R6c (maquettes R6.3 à R6.6) : invitations de démonstration, posées par le vrai service (réseau, notification
// regroupée). Julie_66 puis Théo_66, membres de « Roussillon Drift », invitent Kenji_66 au « Rassemblement de
// Narbonne » : Kenji voit le bandeau « Théo_66 et Julie_66 t'invitent » sur la fiche et l'invitation dans sa Boîte.
// Idempotent : rien si une invitation existe déjà pour cet événement.
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { eventInvitesService } from "../../src/modules/event-invites/service";
import { notificationsService } from "../../src/modules/notifications/service";

async function viewer(pseudo: string): Promise<Viewer | null> {
  const profile = await db.query.profiles.findFirst({
    where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}`,
  });
  if (!profile) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor: null } } : null;
}

export async function seedEventInvites() {
  const event = await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-narbonne") });
  if (!event) {
    console.log("Invitations entre passionnés : « Rassemblement de Narbonne » absent, rien.");
    return;
  }
  const done = await db.query.eventPeerInvitations.findFirst({
    where: eq(t.eventPeerInvitations.eventId, event.id),
  });
  if (done) {
    console.log("Invitations entre passionnés : déjà présentes.");
    return;
  }
  const [kenji, julie, theo] = await Promise.all(["Kenji_66", "Julie_66", "Theo_66"].map(viewer));
  if (!kenji || !julie || !theo) {
    console.log("Invitations entre passionnés : comptes absents, rien.");
    return;
  }
  try {
    await eventInvitesService.invite(julie, event.id, {
      userIds: [kenji.user.id],
      note: "On y va avec le crew, viens avec ta Supra !",
    });
    await eventInvitesService.invite(theo, event.id, { userIds: [kenji.user.id], note: null });
    await notificationsService.flush();
    console.log("Invitations entre passionnés : Julie_66 et Théo_66 invitent Kenji_66 au Rassemblement de Narbonne.");
  } catch (error) {
    // Kenji y va déjà, crew absent… : la démonstration n'est pas indispensable.
    console.log(`Invitations entre passionnés : non posées (${(error as Error).message}).`);
  }
}
