// Lot 25 : événement privé « Soirée partenaires » (MéditeSportCar, sur invitation) et trois invitations, créées par les
// vrais services : Kenji_66 avec sa voiture (acceptée : retenu, QR), Nina_34 (en attente, Accès et Boîte > Demandes),
// une adresse sans compte (lien par e-mail, transport journal). Priorité et avant-première des hauts grades sur
// « Expo Rivesaltes ». Idempotent : rien si l'événement existe déjà.
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { invitationsService } from "../../src/modules/invitations/service";
import { createEvent, DAY, now, parisAt } from "./helpers";

const SLUG = "soiree-partenaires-2026";

async function viewer(pseudo: string, secondFactor: string | null = null): Promise<Viewer | null> {
  const profile = await db.query.profiles.findFirst({
    where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}`,
  });
  if (!profile) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor } } : null;
}

export async function seedInvitations() {
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (!structure) return;
  await db
    .update(t.events)
    .set({ highGradePriority: true, highGradePreviewHours: 48, highGradeMin: "circuit" })
    .where(eq(t.events.slug, "expo-rivesaltes-2026"));
  if (await db.query.events.findFirst({ where: eq(t.events.slug, SLUG) })) {
    console.log("Invitations : « Soirée partenaires » déjà présente.");
    return;
  }
  // Organisateur connecté avec sa double authentification (comme une session réelle de l'espace organisateur).
  const [damien, kenji] = await Promise.all([viewer("Damien_66", "totp"), viewer("Kenji_66")]);
  if (!damien || !kenji) {
    console.log("Invitations : comptes de démonstration absents, rien ajouté.");
    return;
  }
  const event = await createEvent(structure.id, damien.user.id, {
    title: "Soirée partenaires",
    slug: SLUG,
    format: "night",
    description: "Soirée privée des partenaires et des fidèles de MéditeSportCar, sur invitation seulement.",
    startsAt: parisAt(12, 19),
    endsAt: parisAt(12, 23),
    addressLine: "Domaine de Rombeau",
    postalCode: "66600",
    city: "Rivesaltes",
    department: "66",
    lat: 42.772,
    lng: 2.889,
    capacity: 25,
    admission: "invite_only",
    admittedVehicleTypes: ["car"],
    registrationsOpenAt: new Date(now.getTime() - 2 * DAY),
    rulesText: "Soirée privée : invitation nominative, véhicule inscrit seulement.",
  });
  const [car] = await db
    .select({ id: t.vehicles.id })
    .from(t.vehicles)
    .where(
      and(eq(t.vehicles.ownerId, kenji.user.id), eq(t.vehicles.status, "active"), eq(t.vehicles.vehicleType, "car")),
    )
    .orderBy(t.vehicles.createdAt)
    .limit(1);
  await invitationsService.create(damien, event.id, {
    pseudos: ["Nina_34"],
    vehicleIds: car ? [car.id] : [],
    emails: ["invite-partenaire@orasso.local"],
    message: "Merci pour votre soutien cette saison : on vous attend pour la soirée des partenaires.",
  });
  const mine = await invitationsService.mine(kenji);
  const forKenji = mine.find((i) => i.event.id === event.id);
  if (forKenji) await invitationsService.accept(kenji, forKenji.id, {});
  console.log("Invitations : « Soirée partenaires » (privée), Kenji retenu, Nina en attente, une adresse e-mail.");
}
